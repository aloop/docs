---
title: "Automated Static Site Builds"
author: "Anthony Loop"
date: "2020-08-08"
tags:
  - linux
  - systemd
  - static site
  - builds
  - development
  - deployment
  - webdev
---

## Notes

This is was created for Ubuntu Server, other distros may have different directory structures, and the user `www-data` may not exist, or may have a differently named equivalent.

## Packages

```bash
sudo apt install webhook
```

## Configuring Webhooks

Edit the default webhook.service by using the command `sudo systemctl edit webhook`, with the following contents:

```ini
[Unit]
ConditionPathExists=
ConditionPathExists=/etc/webhooks/hooks.json

[Service]
Restart=on-abnormal

DynamicUser=true

ExecStart=
ExecStart=/usr/bin/webhook -nopanic -ip 127.0.0.1 -port 9000 -verbose -hooks /etc/webhooks/hooks.json

PrivateTmp=true
PrivateDevices=true
ProtectHome=tmpfs
ProtectSystem=strict
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictRealtime=true
RestrictAddressFamilies=AF_INET AF_INET6
RestrictNamespaces=true
RestrictSUIDSGID=true

SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM

StateDirectory=webhooks
StateDirectoryMode=0755

RuntimeDirectory=webhooks

CacheDirectory=webhooks
CacheDirectoryMode=0750

TemporaryFileSystem=/etc:ro
BindReadOnlyPaths=/etc/webhooks /etc/resolv.conf /etc/ssl/

CapabilityBoundingSet=
AmbientCapabilities=
NoNewPrivileges=true
```

Then create a file at `/etc/webhooks/hooks.json`

The example below will need to be adjusted with real parameters, this example is based off of a github webhook.

To generate a random uuid, you can use `uuidgen --random`

Upon successfully triggering this webhook, it will `touch` the file `YOUR_SITE_HERE` in the `/var/lib/webhooks/` directory, which in turn triggers the systemd path file we setup later in this document, which then runs the systemd service that executes the build script.

```json
[
  {
    "id": "YOUR_RANDOM_UUID_HERE",
    "execute-command": "/usr/bin/touch",
    "command-working-directory": "/var/lib/webhooks/",
    "pass-arguments-to-command": [
      {
        "source": "string",
        "name": "YOUR_SITE_HERE"
      }
    ],
    "trigger-rule": {
      "and": [
        {
          "match": {
            "type": "payload-hash-sha1",
            "secret": "YOUR_SECRET_HERE",
            "parameter": {
              "source": "header",
              "name": "X-Hub-Signature"
            }
          }
        },
        {
          "match": {
            "type": "value",
            "value": "refs/heads/master",
            "parameter": {
              "source": "payload",
              "name": "ref"
            }
          }
        }
      ]
    }
  }
]
```

## External webhooks access

Outside of the scope of this document, a simple reverse proxy will suffice.

## Static site build systemd service

Create a file at `/etc/systemd/system/static-site-build@.service`, with the following contents:

```ini
[Unit]
Description=Build %I
AssertPathExists=/var/www/%I/
AssertPathExists=/var/www/%I/.git/
AssertPathExists=/var/www/%I/build.sh
AssertPathIsReadWrite=/var/www/%I/
AssertFileIsExecutable=/var/www/%I/build.sh
After=network.target

[Service]
Type=oneshot
User=www-data
Group=www-data
LockPersonality=yes
WorkingDirectory=/var/www/%I/
ExecStart=git pull origin master
ExecStart=/var/www/%I/build.sh

CPUWeight=10
CPUQuota=80%

PrivateTmp=yes
PrivateDevices=yes
ProtectHome=tmpfs
ProtectSystem=strict
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
ProtectHostname=yes
RestrictNamespaces=yes
RestrictRealtime=yes
# The following seems to crash node.js
#MemoryDenyWriteExecute=yes
RestrictAddressFamilies=AF_INET AF_INET6
RestrictSUIDSGID=yes
SystemCallArchitectures=native

SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
NoNewPrivileges=yes

TemporaryFileSystem=/var/www:ro /etc/nginx:ro /etc/letsencrypt:ro
# /var/www/.ssh is only needed when using git over ssh
BindPaths=/var/www/.ssh/known_hosts /var/www/.npm /var/www/%I/
BindReadOnlyPaths=/var/www/.ssh/ /etc/ssl

CapabilityBoundingSet=
AmbientCapabilities=

[Install]
WantedBy=multi-user.target
```

## systemd .path template unit

To trigger a build when a webhook modifies a file, we'll need to make a .path template unit. Create the file `/etc/systemd/system/static-site-build@.path`, with the contents:

```ini
[Install]
WantedBy=multi-user.target

[Path]
PathChanged=/var/lib/webhooks/%I
```

## Putting it to use

After creating the systemd files above, make sure to run `sudo systemctl daemon-reload`, so that systemd is aware of the new unit and path files.

Assuming that a git repo that has a `build.sh` script for building a site resides at `/var/www/YOUR_SITE_HERE/`,
and that you have configured a webhook which executes `touch /var/lib/webhooks/YOUR_SITE_HERE`, you can simply execute the following:

```
sudo systemctl enable --now static-site-build@YOUR_SITE_HERE.path
```

And to manually trigger a build: `sudo systemctl start static-site-build@YOUR_SITE_HERE.service`
