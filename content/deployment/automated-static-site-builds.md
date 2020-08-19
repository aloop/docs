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

Upon successfully triggering this webhook, it will `touch` the file `example.com` in the `/var/lib/webhooks/` directory, which in turn triggers the systemd path file we setup later in this document, which then runs the systemd service that executes the build script.

```json
[
  {
    "id": "YOUR_RANDOM_UUID_HERE",
    "execute-command": "/usr/bin/touch",
    "command-working-directory": "/var/lib/webhooks/",
    "pass-arguments-to-command": [
      {
        "source": "string",
        "name": "example.com"
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
MemoryDenyWriteExecute=yes
RestrictAddressFamilies=
RestrictSUIDSGID=yes
SystemCallArchitectures=native

SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
NoNewPrivileges=yes

TemporaryFileSystem=/var/www:ro
BindPaths=/var/www/%I/

CapabilityBoundingSet=
AmbientCapabilities=

[Install]
WantedBy=multi-user.target
```

## systemd .path files

For each site that you want to build, make a .path file. For example, create the file `/etc/systemd/system/static-site-build@example.com.path`, with contents:

```ini
[Install]
WantedBy=multi-user.target

[Path]
PathChanged=/var/lib/webhooks/example.com
```
