# Certificates folder for https development

The dev server and the Bun SSR host pick up `key.pem` + `cert.pem` from this folder automatically and
serve over HTTPS when both are present. Without them everything still runs, over plain HTTP.

HTTPS matters here because most identity providers refuse to register a plain-`http` `redirect_uri`
for anything but `localhost`.

### Install

```shell
sudo pacman -S mkcert
```

or Ubuntu / WSL

```shell
apt install mkcert
```

### Register

```shell
mkcert -uninstall
mkcert -install
```

### How to generate

```shell
mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 "*.local.dev" ::1
chmod 604 *.pem
```
