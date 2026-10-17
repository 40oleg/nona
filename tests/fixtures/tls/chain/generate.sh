#!/bin/sh
# Regenerates the certificate chains of tests/fixtures/tls/chain (issue #301,
# certificate verification). Needs OpenSSL 3 and Node.js. Run it from this
# directory; in Git Bash on Windows, MSYS_NO_PATHCONV=1 keeps the -subj
# values intact. The private keys are test material only.
set -e
export MSYS_NO_PATHCONV=1
tmp=.generate-tmp
rm -rf "$tmp" && mkdir "$tmp"
trap 'rm -rf "$tmp"' EXIT

ec_key() { # name curve
    openssl ecparam -name "$2" -genkey -noout -out "$tmp/$1.key"
    openssl pkcs8 -topk8 -nocrypt -in "$tmp/$1.key" -out "$1-key.pem"
}
ext() { # name lines...
    name=$1
    shift
    printf '%s\n' "$@" >"$tmp/$name.ext"
}
csr() { # key subject
    openssl req -new -key "$1-key.pem" -subj "$2" -out "$tmp/req.csr"
}
# sign out issuer days extfile [x509 options...]
sign() {
    out=$1 issuer=$2 days=$3 extfile=$4
    shift 4
    serial=$(node -e "console.log('0x' + require('crypto').randomBytes(8).toString('hex'))")
    openssl x509 -req -in "$tmp/req.csr" -CA "$issuer.pem" \
        -CAkey "$issuer-key.pem" -set_serial "$serial" -days "$days" \
        -extfile "$tmp/$extfile.ext" "$@" -out "$out.pem"
}
# sign_dates out issuer start end extfile: a certificate with fixed dates.
sign_dates() {
    rm -rf "$tmp/ca" && mkdir "$tmp/ca" && touch "$tmp/ca/index.txt"
    cat >"$tmp/ca.cnf" <<CNF
[ca]
default_ca = ca_default
[ca_default]
database = $tmp/ca/index.txt
new_certs_dir = $tmp/ca
serial = $tmp/ca/serial
default_md = sha384
policy = policy_any
unique_subject = no
[policy_any]
commonName = supplied
organizationName = optional
CNF
    openssl ca -batch -notext -config "$tmp/ca.cnf" -create_serial \
        -cert "$2.pem" -keyfile "$2-key.pem" -in "$tmp/req.csr" \
        -startdate "$3" -enddate "$4" -extfile "$tmp/$5.ext" -out "$1.pem"
}

ext ca "basicConstraints=critical,CA:TRUE" \
    "keyUsage=critical,keyCertSign,cRLSign" \
    "subjectKeyIdentifier=hash" "authorityKeyIdentifier=keyid"
ext inter "basicConstraints=critical,CA:TRUE,pathlen:0" \
    "keyUsage=critical,keyCertSign,cRLSign" \
    "extendedKeyUsage=serverAuth,clientAuth" \
    "subjectKeyIdentifier=hash" "authorityKeyIdentifier=keyid"
ext notca "basicConstraints=critical,CA:FALSE" \
    "keyUsage=critical,digitalSignature,keyCertSign" \
    "subjectKeyIdentifier=hash" "authorityKeyIdentifier=keyid"
leaf_common="basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid"
ext leaf "$leaf_common" "extendedKeyUsage=serverAuth" \
    "subjectAltName=DNS:localhost,DNS:*.nona.test,IP:127.0.0.1,IP:::1"
ext wronghost "$leaf_common" "extendedKeyUsage=serverAuth" \
    "subjectAltName=DNS:example.com,IP:10.0.0.1"
ext clientonly "$leaf_common" "extendedKeyUsage=clientAuth" \
    "subjectAltName=DNS:localhost,IP:127.0.0.1"
ext critical "$leaf_common" "extendedKeyUsage=serverAuth" \
    "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    "1.3.6.1.4.1.55555.1=critical,DER:05:00"
ext cnonly "$leaf_common" "extendedKeyUsage=serverAuth"

# Trusted root (RSA-2048, PKCS#1 v1.5 SHA-256) and an intermediate (P-384,
# signed with RSA-PSS SHA-256, pathlen 0).
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out root-key.pem
openssl req -x509 -new -key root-key.pem -sha256 -days 36500 \
    -subj "/CN=Nona Test Root/O=Nona" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" -out root.pem
ec_key inter secp384r1
csr inter "/CN=Nona Test Intermediate/O=Nona"
sign inter root 36500 inter -sha256 -sigopt rsa_padding_mode:pss \
    -sigopt rsa_pss_saltlen:32

# Server certificates (one P-256 key), signed by the intermediate with
# ECDSA SHA-384 unless noted.
ec_key leaf prime256v1
csr leaf "/CN=localhost/O=Nona"
sign leaf inter 36500 leaf -sha384
sign_dates expired inter 20200101000000Z 20210101000000Z leaf
sign_dates future inter 21200101000000Z 21210101000000Z leaf
csr leaf "/CN=example.com/O=Nona"
sign wrong-host inter 36500 wronghost -sha384
csr leaf "/CN=localhost/O=Nona"
sign client-only inter 36500 clientonly -sha384
sign critical inter 36500 critical -sha384
sign direct root 36500 leaf -sha512
openssl req -x509 -new -key leaf-key.pem -sha256 -days 36500 \
    -subj "/CN=localhost/O=Nona" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" -out self-signed.pem
csr leaf "/CN=localhost/O=Nona CN only"
sign cn-only inter 36500 cnonly -sha384
# A copy of leaf.pem with one bit of the signature flipped.
node -e "
const fs = require('fs');
const pem = fs.readFileSync('leaf.pem', 'latin1');
const der = Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64');
der[der.length - 1] ^= 1;
fs.writeFileSync('bad-signature.pem', '-----BEGIN CERTIFICATE-----\n' +
  der.toString('base64').replace(/.{64}/g, '\$&\n').replace(/\n?$/, '\n') +
  '-----END CERTIFICATE-----\n');
"

# A CA the tests never trust, and a server certificate it signed.
ec_key untrusted-ca prime256v1
openssl req -x509 -new -key untrusted-ca-key.pem -sha256 -days 36500 \
    -subj "/CN=Nona Untrusted CA/O=Nona" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" -out untrusted-ca.pem
csr leaf "/CN=localhost/O=Nona"
sign untrusted untrusted-ca 36500 leaf -sha256

# A CA below the pathlen 0 intermediate (path length exceeded), and an
# intermediate that is not a CA.
ec_key inter2 prime256v1
csr inter2 "/CN=Nona Test Intermediate 2/O=Nona"
sign inter2 inter 36500 ca -sha384
csr leaf "/CN=localhost/O=Nona"
sign deep inter2 36500 leaf -sha256
ec_key not-ca prime256v1
csr not-ca "/CN=Nona Not A CA/O=Nona"
sign not-ca root 36500 notca -sha256
csr leaf "/CN=localhost/O=Nona"
sign below-not-ca not-ca 36500 leaf -sha256
rm -f ./*.srl
