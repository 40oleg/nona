import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { checkServerIdentity, type PeerCertificate } from "node:tls";
import { fileURLToPath } from "node:url";
import { runModulesOnHost } from "./helpers/host.js";

// nona:internal/x509 (issue #301): certificate parsing, issuer and
// signature checks and the host name check, with Node.js as the oracle
// (X509Certificate and tls.checkServerIdentity), plus the operating
// system's trust store. Chain verification against live servers is in
// tests/tls.test.ts. The programs run without GC stress: signature
// verification allocates in its inner loops.

const fixtures = fileURLToPath(
    new URL("../../tests/fixtures/tls/", import.meta.url),
);
const pems: Record<string, string> = {};
for (const name of readdirSync(fixtures + "chain"))
    if (name.endsWith(".pem") && !name.endsWith("-key.pem"))
        pems[name.slice(0, -4)] = readFileSync(
            fixtures + "chain/" + name,
            "utf8",
        );
for (const name of ["ca", "ec-cert", "rsa-cert"])
    pems["old-" + name] = readFileSync(fixtures + name + ".pem", "utf8");
const names = Object.keys(pems).sort();

function run(body: string): string[] {
    const source =
        "import tls from 'node:tls';\n" +
        "import * as x from 'nona:internal/x509';\n" +
        `const pems = ${JSON.stringify(pems)};\n` +
        `const names = ${JSON.stringify(names)};\n` +
        "const der = (name) => x.certificateList(pems[name])[0];\n" +
        body;
    const { native } = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
        gcStress: false,
        oracleSource: "",
    });
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stdout + native.stderr);
    return native.stdout.split("\n").filter((line) => line !== "");
}

test("x509: parsed certificates match Node's X509Certificate", () => {
    const lines = run(String.raw`
for (const name of names) {
  const c = x.peerCertificate([der(name)], 0, false, []);
  const parsed = x.parseCertificate(der(name));
  const subject = Object.entries(c.subject).map(([k, v]) => k + '=' + v).join('\n');
  const issuer = Object.entries(c.issuer).map(([k, v]) => k + '=' + v).join('\n');
  console.log(JSON.stringify([name, subject, issuer, c.subjectaltname, c.ca, c.valid_from, c.valid_to,
    c.serialNumber, c.fingerprint, c.fingerprint256, c.fingerprint512, c.ext_key_usage, c.bits,
    parsed.version, x.keyUsageList(parsed), parsed.pathLen, parsed.criticalUnknown]));
}
`);
    const keyUsage: Record<string, string[] | undefined> = {
        root: ["keyCertSign", "cRLSign"],
        inter: ["keyCertSign", "cRLSign"],
        inter2: ["keyCertSign", "cRLSign"],
        "untrusted-ca": ["keyCertSign", "cRLSign"],
        "old-ca": ["keyCertSign", "cRLSign"],
        "not-ca": ["digitalSignature", "keyCertSign"],
        "self-signed": undefined,
        "old-ec-cert": ["digitalSignature", "keyEncipherment"],
        "old-rsa-cert": ["digitalSignature", "keyEncipherment"],
    };
    const expected = names.map((name) => {
        const cert = new X509Certificate(pems[name]!);
        const details = cert.publicKey.asymmetricKeyDetails!;
        const bits =
            details.modulusLength ??
            { prime256v1: 256, secp384r1: 384 }[details.namedCurve!];
        return JSON.stringify([
            name,
            cert.subject,
            cert.issuer,
            cert.subjectAltName,
            cert.ca,
            cert.validFrom,
            cert.validTo,
            cert.serialNumber,
            cert.fingerprint,
            cert.fingerprint256,
            cert.fingerprint512,
            cert.keyUsage,
            bits,
            3,
            name in keyUsage ? keyUsage[name] : ["digitalSignature"],
            name === "inter" ? 0 : -1,
            name === "critical",
        ]);
    });
    assert.deepEqual(lines, expected);
});

test("x509: issuer and signature checks match X509Certificate.checkIssued and verify", () => {
    const issuers = [
        "root",
        "inter",
        "inter2",
        "not-ca",
        "untrusted-ca",
        "self-signed",
        "old-ca",
    ];
    const lines = run(String.raw`
const issuers = ${JSON.stringify(issuers)};
for (const name of names) {
  const subject = x.parseCertificate(der(name));
  const row = issuers.map((issuerName) => {
    const issuer = x.parseCertificate(der(issuerName));
    return x.issuedBy(subject, issuer) ? (x.signedBy(subject, issuer) ? 'signed' : 'issued') : '-';
  });
  console.log(name, row.join(' '));
}
`);
    const expected = names.map((name) => {
        const subject = new X509Certificate(pems[name]!);
        const row = issuers.map((issuerName) => {
            const issuer = new X509Certificate(pems[issuerName]!);
            if (!subject.checkIssued(issuer)) return "-";
            return subject.verify(issuer.publicKey) ? "signed" : "issued";
        });
        return name + " " + row.join(" ");
    });
    assert.deepEqual(lines, expected);
    // Every algorithm of the fixtures took part: PKCS#1 (SHA-256, SHA-512),
    // RSA-PSS, ECDSA (SHA-256, SHA-384) and a broken signature.
    assert.ok(lines.includes("bad-signature - issued - - - - -"));
});

// Certificate objects as getPeerCertificate() returns them, and host names.
const identityCases: [string, Partial<PeerCertificate>][] = [
    ["localhost", { subject: { CN: "localhost" } as any }],
    ["LocalHost.", { subject: { CN: "localhost" } as any }],
    ["a.example.com", { subjectaltname: "DNS:*.example.com" }],
    ["example.com", { subjectaltname: "DNS:*.example.com" }],
    ["a.b.example.com", { subjectaltname: "DNS:*.example.com" }],
    ["foo.com", { subjectaltname: "DNS:*.com" }],
    ["abc.example.com", { subjectaltname: "DNS:a*c.example.com" }],
    ["ac.example.com", { subjectaltname: "DNS:a*c.example.com" }],
    ["abbc.example.com", { subjectaltname: "DNS:a**c.example.com" }],
    ["xn--ab.example.com", { subjectaltname: "DNS:xn--*.example.com" }],
    ["a.xn--p1ai.example", { subjectaltname: "DNS:*.xn--p1ai.example" }],
    ["www.example.com", { subjectaltname: "DNS:WWW.Example.COM." }],
    ["www.example.com", { subjectaltname: "DNS:www..example.com" }],
    ["exämple.com", { subjectaltname: "DNS:exämple.com" }],
    [
        "example.com",
        {
            subject: { CN: "example.com" } as any,
            subjectaltname: "DNS:other.com",
        },
    ],
    [
        "example.com",
        {
            subject: { CN: "example.com" } as any,
            subjectaltname: "email:a@example.com, URI:https://example.com/",
        },
    ],
    ["example.com", { subject: { CN: ["other.com", "example.com"] } as any }],
    ["example.org", { subject: { CN: ["other.com", "example.com"] } as any }],
    ["example.com", { subject: {} as any }],
    ["example.com", {}],
    ["127.0.0.1", { subjectaltname: "IP Address:127.0.0.1" }],
    ["127.0.0.1", { subjectaltname: "DNS:127.0.0.1" }],
    ["127.0.0.1", { subject: { CN: "127.0.0.1" } as any }],
    ["exämple.com", { subjectaltname: "DNS:xn--exmple-cua.com" }],
    [
        "BÜCHER.example.",
        { subjectaltname: "DNS:*.example, DNS:xn--bcher-kva.example" },
    ],
    ["xn--bcher-kva.example", { subject: { CN: "bücher.example" } as any }],
    ["example.com", { subjectaltname: 'DNS:"exa,mple.com", DNS:example.com' }],
    ["exa,mple.com", { subjectaltname: 'DNS:"exa,mple.com"' }],
    ["example.com", { subjectaltname: "URI:http://example.com/" }],
];

// IPv6 literals: Node.js 22 maps the host through url.domainToASCII first,
// which turns them into "" (so they never match); Nona compares them as IP
// addresses, like IPv4 literals, in the canonical form of the error message.
const ipv6Cases: [string, Partial<PeerCertificate>, string | null][] = [
    ["::1", { subjectaltname: "IP Address:0:0:0:0:0:0:0:1" }, null],
    [
        "0:0::1",
        { subjectaltname: "IP Address:0:0:0:0:0:0:0:1, IP Address:10.0.0.1" },
        null,
    ],
    [
        "::2",
        {
            subjectaltname:
                "IP Address:0:0:0:0:0:0:0:1, IP Address:FE80:0:0:0:0:0:0:1, IP Address:0:0:0:0:0:FFFF:A00:1, IP Address:2001:DB8:0:0:1:0:0:1, IP Address:0:0:0:0:0:0:A00:1",
        },
        "IP: ::2 is not in the cert's list: ::1, fe80::1, ::ffff:10.0.0.1, 2001:db8::1:0:0:1, ::10.0.0.1",
    ],
    [
        "::ffff:10.0.0.1",
        { subjectaltname: "IP Address:0:0:0:0:0:FFFF:A00:1" },
        null,
    ],
    [
        "::1",
        { subject: { CN: "::1" } as any, subjectaltname: "DNS:localhost" },
        "IP: ::1 is not in the cert's list: ",
    ],
];

test("x509: tls.checkServerIdentity matches Node's", () => {
    const lines = run(String.raw`
const cases = ${JSON.stringify(identityCases)};
for (const [host, cert] of cases) {
  const error = tls.checkServerIdentity(host, cert);
  console.log(JSON.stringify(error === undefined ? null : [error.code, error.message, error.reason, error.host, error.cert === cert]));
}
`);
    const expected = identityCases.map(([host, cert]) => {
        const error = checkServerIdentity(host, cert as PeerCertificate) as
            | (Error & { code: string; reason: string; host: string })
            | undefined;
        return JSON.stringify(
            error === undefined
                ? null
                : [error.code, error.message, error.reason, error.host, true],
        );
    });
    assert.deepEqual(lines, expected);
});

test("x509: IPv6 literals match IP Address names", () => {
    const lines = run(String.raw`
const cases = ${JSON.stringify(ipv6Cases)};
for (const [host, cert] of cases) {
  const error = tls.checkServerIdentity(host, cert);
  console.log(error === undefined ? 'ok' : error.reason);
}
`);
    assert.deepEqual(
        lines,
        ipv6Cases.map(([, , reason]) => reason ?? "ok"),
    );
});

test("x509: the operating system's trust store loads", () => {
    const lines = run(String.raw`
const roots = tls.rootCertificates;
console.log(Array.isArray(roots), Object.isFrozen(roots), roots === tls.rootCertificates);
let parsed = 0;
for (const pem of roots) {
  if (!/^-----BEGIN CERTIFICATE-----\n(?:[A-Za-z0-9+\/=]{1,64}\n)+-----END CERTIFICATE-----$/.test(pem)) console.log('bad PEM', pem);
  const c = x.parseCertificate(x.certificateList(pem)[0]);
  if (c.notAfter > c.notBefore) parsed++;
}
console.log(roots.length > 0, parsed === roots.length);
`);
    assert.deepEqual(lines, ["true true true", "true true"]);
});
