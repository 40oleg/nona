# TLS test fixtures

Keys and certificates for the TLS client tests (`tests/tls.test.ts`, issue
#301). They are test material only: the private keys are public.

- `ca.pem`, `ca-key.pem`: the test CA (ECDSA P-256, `CN=Nona Test CA`).
- `ec-cert.pem`, `ec-key.pem`: a server certificate for `localhost` and
  `127.0.0.1` with an ECDSA P-256 key, signed by the CA.
- `rsa-cert.pem`, `rsa-key.pem`: the same with an RSA-2048 key (the server
  signs the handshake with RSA-PSS).

All certificates are valid for 100 years. They were generated with OpenSSL
3.1 (in Git Bash on Windows, `MSYS_NO_PATHCONV=1` keeps the `-subj` values
intact):

```sh
openssl ecparam -name prime256v1 -genkey -noout -out ca.key
openssl pkcs8 -topk8 -nocrypt -in ca.key -out ca-key.pem
openssl req -x509 -new -key ca-key.pem -sha256 -days 36500 \
    -subj "/CN=Nona Test CA/O=Nona" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" -out ca.pem

openssl ecparam -name prime256v1 -genkey -noout -out ec.key
openssl pkcs8 -topk8 -nocrypt -in ec.key -out ec-key.pem
openssl req -new -key ec-key.pem -subj "/CN=localhost/O=Nona" -out ec.csr
openssl x509 -req -in ec.csr -CA ca.pem -CAkey ca-key.pem -set_serial 0x1001 \
    -days 36500 -sha256 -extfile leaf.ext -out ec-cert.pem

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out rsa-key.pem
openssl req -new -key rsa-key.pem -subj "/CN=localhost/O=Nona" -out rsa.csr
openssl x509 -req -in rsa.csr -CA ca.pem -CAkey ca-key.pem -set_serial 0x1002 \
    -days 36500 -sha256 -extfile leaf.ext -out rsa-cert.pem
```

`leaf.ext` holds the server certificate extensions (`serverAuth`, subject
alternative names `DNS:localhost` and `IP:127.0.0.1`).
