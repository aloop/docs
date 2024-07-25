---
layout: ../../../layouts/MarkdownLayout.astro
title: "Setting up LLDAP, Lego, and PostgreSQL"
author: "Anthony Loop"
date: "2023-06-22"
tags:
  - linux
  - systemd
  - cli
  - ldap
  - auth
  - postgres
  - certs
  - database
---

## Preparation

Before following any of the steps below, you should setup some things in your environment.

### UMask

Setting your UMask is important for the creation of some of the configuration files and secrets:

```bash frame="none"
# User has read and write, Group has read, Other has no access
umask 027
```

### Update Packages

```bash frame="none"
sudo apt update && sudo apt upgrade
```

## Lego

### Installation

The following script will download a specified version of Lego and install it into `$PATH`.

```bash title="/usr/local/bin/update-lego"
#!/usr/bin/env bash

set -eEuo pipefail

install_dir="/usr/local/bin"

if [ -z "$1" ]; then
    echo "Version not given, must give version in the following format: 1.0.0"
    exit 1
fi

download_base_url="https://github.com/go-acme/lego/releases/download/v${1}"

archive_name="lego_v${1}_linux_amd64.tar.gz"
archive_url="${download_base_url}/${archive_name}"

checksums_name="lego_${1}_checksums.txt"
checksums_url="${download_base_url}/${checksums_name}"

cleanup() {
    rm "${archive_name}" "${checksums_name}" lego
}

# Create and move into a temporary working directory
cd "$(mktemp -d)"

if curl -fsSL "${checksums_url}" --output "${checksums_name}"; then
    if curl -fsSL "${archive_url}" --output "${archive_name}"; then
        if sha256sum --ignore-missing --status -c "${checksums_name}"; then
            tar -xzvf "${archive_name}" lego
            sudo cp "lego" "${install_dir}/"
            sudo chmod +x "${install_dir}/lego"
        else
            echo "Checksum verification failed! Exiting..."
            cleanup
            exit 1
        fi
    else
        echo "Failed to download archive! Exiting..."
        cleanup
        exit 1
    fi
else
    echo "Failed to download checksums! Exiting..."
    cleanup
    exit 1
fi

cleanup
```

Don't forget to make it executable!

```bash frame="none"
sudo chmod +x /usr/local/bin/update-lego
```

After creating the script, install your desired version of Lego by calling the script: `update-lego 4.12.3`

If the install was successful, make sure it is properly installed by running `lego -v`, it should output something like the following:

```
$ lego -v
lego version 4.12.3 linux/amd64
```

### Configuration

This will assume we are obtaining our cert using DNS-01 on Cloudflare with a Cloudflare API token. You will have to adjust these instructions if you are using a different method.

Create the configuration directory structure:

```bash frame="none"
sudo mkdir -p /etc/lego/secrets
```

Create the `config.env` file, making sure to edit in your email and domain:

```bash title="/etc/lego/config.env"
LEGO_EMAIL="your@email.com"
LEGO_DOMAIN="ldap.yourdomain.com"
LEGO_RESOLVER="1.1.1.1"
```

Create a file with your cloudflare token:

```bash title="/etc/lego/secrets/cf_token"
YOUR_CLOUDFLARE_TOKEN_HERE
```

Create a systemd timer unit with `sudo systemctl edit --full --force lego.timer`, customizing the time if you want to:

```ini title="/etc/systemd/system/lego.timer"
[Unit]
Description=Timer for LEGO cert renewals

[Timer]
Persistent=true

# Use a randomly chosen time:
OnCalendar=*-*-* 3:35
# add extra delay, here up to 1 hour:
RandomizedDelaySec=1h

[Install]
WantedBy=timers.target
```

Create the systemd service unit with `sudo systemctl edit --full --force lego.service`:

```ini title="/etc/systemd/system/lego.service"
[Unit]
Description=LLDAP TLS cert renewal using Lego
After=network.target network-online.target
Wants=network.target network-online.target
ConditionEnvironment=LEGO_RESOLVER
ConditionEnvironment=LEGO_EMAIL
ConditionEnvironment=LEGO_DOMAIN

[Service]
Type=oneshot
DynamicUser=true
LockPersonality=yes
WorkingDirectory=/var/lib/lego/
LoadCredential=config.env:/etc/lego/config.env
LoadCredential=cf_token:/etc/lego/secrets/cf_token
Environment="CLOUDFLARE_DNS_API_TOKEN_FILE=%d/cf_token"
EnvironmentFile=%d/config.env
ExecStart=/usr/local/bin/lego --accept-tos --dns.resolvers $LEGO_RESOLVER --path ./ --email $LEGO_EMAIL --dns cloudflare --domains "$LEGO_DOMAIN" renew

UMask=0077

DevicePolicy=closed
MemoryAccounting=yes
MemoryDenyWriteExecute=yes
ProcSubset=pid
RemoveIPC=yes
PrivateTmp=yes
PrivateDevices=yes
PrivateUsers=yes
PrivateMounts=yes
ProtectClock=yes
ProtectHome=yes
ProtectSystem=strict
ProtectKernelLogs=yes
ProtectKernelModules=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
ProtectProc=invisible
ProtectHostname=yes
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes

SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
NoNewPrivileges=yes

ConfigurationDirectory=lego
ConfigurationDirectoryMode=0750

StateDirectory=lego
StateDirectoryMode=0750

RuntimeDirectory=lego
StateDirectoryMode=0750

CacheDirectory=lego
CacheDirectoryMode=0750

NoExecPaths=/
ExecPaths=/usr/local/bin/lego
InaccessiblePaths=/etc/lldap -/var/lib/lldap /var/lib/postgresql -/etc/postgresql -/etc/postgresql-common

CapabilityBoundingSet=
AmbientCapabilities=

RestrictAddressFamilies=AF_INET AF_INET6
SocketBindDeny=any
SocketBindAllow=

[Install]
WantedBy=multi-user.target
```

Starting the service manually should obtain the certificate:

```bash frame="none"
sudo systemctl start lego.service
```

Now you can enable the timer so that the cert is renewed when necessary:

```bash frame="none"
sudo systemctl enable --now lego.timer
```

## PostgreSQL

In this section we will install PostgreSQL, create a user, and then create a database that the user has permission to use.

Other options are supported by LLDAP, such as MySQL and SQLite.

### Installation

```bash frame="none"
sudo apt install postgresql
```

### Create user and database

```bash frame="none"
sudo -u postgres createuser --pwprompt lldap
sudo -u postgres createdb --owner="lldap" --encoding="UTF8"--lc-collate="en_US.UTF-8" lc-ctype="en_US.UTF-8" lldap_db
```

## LLDAP

### Installation

This script will help install the requested LLDAP version from the project GitHub releases.
The script can also update the LLDAP install for future releases (as long as the file structure doesn't change).

```bash title="/usr/local/bin/update-lldap"
#!/usr/bin/env bash

set -eEuo pipefail

install_dir="/usr/local/bin"

if [ -z "$1" ]; then
    echo "Version not given, must give version in the following format: 1.0.0"
    exit 1
fi
download_base_url="https://github.com/lldap/lldap/releases/download/v${1}"

archive_name="amd64-lldap.tar.gz"
archive_url="${download_base_url}/${archive_name}"
extracted_folder="amd64-lldap"

cleanup() {
    rm -rf "${archive_name}" "${extracted_folder}"
}

cd "$(mktemp -d)"

if curl -fsSL "${archive_url}" --output "${archive_name}"; then
    tar -xzvf "${archive_name}"
    cd "${extracted_folder}"
    # Delete existing "app" directory if it exists
    sudo rm -vrf /var/lib/lldap/app
    sudo mkdir -vp "/var/lib/lldap"
    sudo cp -vr app "/var/lib/lldap"

    # Move existing executable if it exists
    if [ -f "${install_dir}/lldap" ]; then
        sudo mv -v "${install_dir}/lldap" "${install_dir}/lldap.old"
    fi

    # Copy new executable to $install_dir
    sudo cp -v lldap "${install_dir}/"
    sudo chmod -v +x "${install_dir}/lldap"

    # Restart service if active
    if sudo systemctl is-active --quiet lldap.service; then
        sudo systemctl restart lldap.service
    fi

    # Delete backup executable
    sudo rm -v "${install_dir}/lldap.old"
else
    echo "Failed to download archive! Exiting..."
    cleanup
    exit 1
fi

cleanup
```

Make it executable:

```bash frame="none"
sudo chmod +x /usr/local/bin/update-lldap
```

Check [LLDAP on Github](https://github.com/lldap/lldap/releases) to determine the current release version
and run the script with that version:

```bash frame="none"
update-lldap 0.4.3
```

After the installation, you may want to verify that it installed correctly:

```
$ lldap --version
lldap 0.4.3
```

### Configuration

First, let's create the directories we'll need:

```bash frame="none"
sudo mkdir -p /etc/lldap/secrets
```

I'll give an example of a minimal configuration file below, but if you want to have more details, check out the [example
on the LLDAP github repo](https://github.com/lldap/lldap/blob/main/lldap_config.docker_template.toml).

```toml title="/etc/lldap/config.toml"
## Tune the logging to be more verbose by setting this to be true.
# verbose=false

# The host address that the HTTP server should bind to, the current setting will bind
# to all available IPv4 addresses
ldap_host = "0.0.0.0"

# The host address that the HTTP server should bind to, the current setting will bind
# to all available IPv4 addresses
http_host = "0.0.0.0"

## The public URL of the server, for password reset links.
http_url = "https://ldap.example.com"

## Base DN for LDAP.
## This is usually your domain name, and is used as a
## namespace for your users. The choice is arbitrary, but will be needed
## to configure the LDAP integration with other services.
## The sample value is for "example.com", but you can extend it with as
## many "dc" as you want, and you don't actually need to own the domain
## name.
ldap_base_dn = "dc=example,dc=com"

## Admin username.
## For the LDAP interface, a value of "admin" here will create the LDAP
## user "cn=admin,ou=people,dc=example,dc=com" (with the base DN above).
## For the administration interface, this is the username.
#ldap_user_dn = "admin"

## Admin account email address
ldap_user_email = "admin@ldap.yourdomain.com"

# Database connection URL (Make sure to fill this out!!!)
database_url = "postgres://POSTGRES_USER_HERE:POSTGRES_PASSWORD_HERE@localhost:5432/POSTGRES_DB_NAME"
```

### Generating the JWT secret

```bash frame="none"
LC_ALL=C tr -dc 'A-Za-z0-9!#%&'\''()*+,-./:;<=>?@[\]^_{|}~' </dev/urandom | head -c 32; echo '' | sudo tee /etc/lldap/secrets/jwt_secret
```

### Create your default admin account password

Add whatever password you like (as long as it's secure) to `/etc/lldap/secrets/admin_password`

### Creating the systemd service

Begin creating the `lldap.service` file by running `sudo systemctl edit --full --force lldap.service`, then paste the contents below,
making sure to edit the paths to the cert files.

```ini title="/etc/systemd/system/lldap.service"
[Unit]
Description=LLDAP
Documentation=https://github.com/lldap/lldap
After=network.target network-online.target postgresql.service
Wants=network.target network-online.target
StartLimitIntervalSec=14400
StartLimitBurst=10

[Service]
DynamicUser=true
LockPersonality=yes
WorkingDirectory=/var/lib/lldap

# Use LoadCredential for our config file and our secrets, that way we don't
# need to worry about ownership/permissions of the files, which can be difficult
# when using DynamicUser.
LoadCredential=config.toml:/etc/lldap/config.toml
LoadCredential=jwt_secret:/etc/lldap/secrets/jwt_secret
LoadCredential=admin_password:/etc/lldap/secrets/admin_password
LoadCredential=cert.crt:/var/lib/lego/certificates/YOUR_CERT_HERE.crt
LoadCredential=cert.key:/var/lib/lego/certificates/YOUR_CERT_KEY_HERE.key

# Set our env vars for the credentials loaded above.
# `%d` resolves to the runtime credentials dir created by systemd
#
# Note that any ports changed here will necessitate updating the
# SocketBindAllow= options defined lower in this file.
Environment="LLDAP_JWT_SECRET_FILE=%d/jwt_secret"
Environment="LLDAP_LDAP_USER_PASS_FILE=%d/admin_password"
Environment="LLDAP_LDAP_PORT=3890"
Environment="LLDAP_HTTP_PORT=8080"
Environment="LLDAP_LDAPS_OPTIONS__ENABLED=true"
Environment="LLDAP_LDAPS_OPTIONS__PORT=6360"
Environment="LLDAP_LDAPS_OPTIONS__CERT_FILE=%d/cert.crt"
Environment="LLDAP_LDAPS_OPTIONS__KEY_FILE=%d/cert.key"

ExecStart=/usr/local/bin/lldap run -c %d/config.toml

Restart=on-abnormal

UMask=0077

DevicePolicy=closed
MemoryAccounting=yes
MemoryDenyWriteExecute=yes
ProcSubset=pid
RemoveIPC=yes
PrivateTmp=yes
PrivateDevices=yes
PrivateUsers=yes
PrivateMounts=yes
ProtectClock=yes
ProtectHome=yes
ProtectSystem=strict
ProtectKernelLogs=yes
ProtectKernelModules=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
ProtectProc=invisible
ProtectHostname=yes
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes

SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
NoNewPrivileges=yes

RestrictAddressFamilies=AF_INET AF_INET6
SocketBindDeny=any
SocketBindAllow=tcp:3890
SocketBindAllow=tcp:6360
SocketBindAllow=tcp:8080

ConfigurationDirectory=lldap
ConfigurationDirectoryMode=0750
StateDirectory=lldap
StateDirectoryMode=0750
RuntimeDirectory=lldap
RuntimeDirectoryMode=0750
CacheDirectory=lldap
CacheDirectoryMode=0750

CapabilityBoundingSet=
AmbientCapabilities=

NoExecPaths=/
ExecPaths=/usr/local/bin/lldap
InaccessiblePaths=/etc/lego /var/lib/postgresql -/etc/postgresql -/etc/postgresql-common

[Install]
WantedBy=multi-user.target
```

You should now have everything needed to start LLDAP:

```bash frame="none"
sudo systemctl enable --now lldap.service
```
