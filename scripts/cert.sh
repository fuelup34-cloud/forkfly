#!/bin/sh
# Self-signed certificate so phones allow GPS. Re-run if your computer's IP address changes.
set -e
IP=$(ipconfig getifaddr en0)
mkdir -p .certs
chmod 700 .certs
umask 077
openssl req -x509 -newkey rsa:2048 -nodes -days 90 -subj "/CN=forkfly.local" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$IP" \
  -keyout .certs/key.pem -out .certs/cert.pem 2>/dev/null
echo "Certificate ready for $IP"
