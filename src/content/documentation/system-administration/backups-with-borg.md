---
layout: ../../../layouts/MarkdownLayout.astro
title: "Backups With Borg"
author: "Anthony Loop"
date: "2021-04-22"
tags:
  - linux
  - systemd
  - backups
  - administration
  - cli
---

## Installation

Most major Linux distributions have a package available, we'll assume Ubuntu Server throughout this documentation.

On both the the system(s) being backed up and the backup server(s), install the following package:

```bash frame="none"
sudo apt update
sudo apt install borgbackup
```

## Initial Client Configuration

### Create config directories and files

This file will be loaded by the systemd service and passed to the backup script as a file located at `${CREDENTIALS_DIRECTORY}/passphrase`.
Make sure to replace the contents of `BACKUP_NAME`, `BACKUP_HOST`, and `BACKUP_PATH` with proper values, and optionally
provide values for `BACKUP_USER` and `BACKUP_PORT`.

```bash frame="none"
export BACKUP_NAME=somename
export BACKUP_HOST=127.0.0.1
export BACKUP_PATH=/backup/path/client
current_umask="$(umask)"
umask 077
sudo mkdir -p "/etc/borg/targets/${BACKUP_NAME}"
sudo vim "/etc/borg/targets/${BACKUP_NAME}/passphrase"
cat <<EOF | sudo tee "/etc/borg/targets/${BACKUP_NAME}/env"
BACKUP_HOST=$BACKUP_HOST
BACKUP_PATH=$BACKUP_PATH
# OPTIONAL - defaults to "borg"
BACKUP_USER=
# OPTIONAL - defaults to 22
BACKUP_PORT=
EOF
umask "$current_umask"
```

### Creating an SSH Key

Create an ssh keypair without a passphrase for the root account on your client(s):

```bash frame="none"
sudo ssh-keygen -t ed25519 -f "/etc/borg/targets/${BACKUP_NAME}/id_${BACKUP_NAME}"
```

Make sure to replace `${BACKUP_NAME}` with the name you will use for this backup target

## Server Configuration

This can be skipped if you intend to use a service like [rsync.net](https://www.rsync.net/products/attic.html), follow their directions instead.

### Create borg user

```bash frame="none"
sudo useradd -m -U -s /bin/bash borg
sudo passwd -l borg
```

### Create Backups Folder

```bash frame="none"
current_umask="$(umask)"
umask 027
sudo mkdir /backup/path/client
sudo chown borg:borg /backup/path/client
sudo chown borg:borg /backup/path/client
sudo chmod u+rwX,g+rX,o-rwx /backup/path/client
umask "$current_umask"
```

### Add Client to SSH authorized_keys

Copy the public key from the ssh keypair you generated earlier to the backup server:

```bash title="/home/borg/.ssh/authorized_keys"
command="mkdir -p /backup/path/client && cd /backup/path/client && borg serve --restrict-to-path /backup/path/client",restrict ssh-ed25519 AAAAC3N[...] user@host
```

You will need one of these entries for each client you intend to give access, with a different path for each client.

## Client Configuration

### Initialize Backup

```bash frame="none"
sudo borg init --encryption=repokey-blake2 borg@example.com:/backup/path/client
```

### Backup script

The following script is adapted from the [Borg Quick Start](https://borgbackup.readthedocs.io/en/stable/quickstart.html) Documentation.

```bash title="/usr/local/bin/borg-backup"
#!/bin/sh

###
### This script has been modified to work in tandem with a systemd unit that sets up
### the ENV vars and provides the credentials file. Direct usage is not advised.
###
### For more info, see: https://docs.aloop.dev/system-administration/backups-with-borg/
###

if [ -z "${CREDENTIALS_DIRECTORY}" ]; then
    echo "Credentials not found, exiting..."
    exit 1
fi

if [ -z "${BACKUP_HOST}" ]; then
    echo "\$BACKUP_HOST was not set, check /etc/borg/targets/${BACKUP_NAME}/env. exiting..."
    exit 1
fi

if [ -z "${BACKUP_PATH}" ]; then
    echo "\$BACKUP_PATH was not set, check /etc/borg/targets/${BACKUP_NAME}/env. exiting..."
    exit 1
fi

if [ -z "${STATE_DIRECTORY}" ] || [ -z "${CACHE_DIRECTORY}" ] || [ -z "${CONFIGURATION_DIRECTORY}" ]; then
    echo "Systemd directories not set. Exiting..."
    exit 1
fi

# Tell borg to use the directories we've setup in the systemd service
export BORG_BASE_DIR="${STATE_DIRECTORY}"
export BORG_CACHE_DIR="${CACHE_DIRECTORY}"
export BORG_CONFIG_DIR="${CONFIGURATION_DIRECTORY}"

# Ensure that the backup path starts with a /, this is needed when using relative paths
# because of the alternate syntax being used to specify a port.
#
# For more info, see: https://borgbackup.readthedocs.io/en/stable/usage/general.html#repository-urls
#
BACKUP_PATH="/${BACKUP_PATH#/}"

export BORG_REPO="ssh://${BACKUP_USER:-borg}@${BACKUP_HOST}:${BACKUP_PORT:-22}${BACKUP_PATH}"

export BORG_PASSCOMMAND="cat ${CREDENTIALS_DIRECTORY}/passphrase"

# Make sure borg uses the correct ssh key
export BORG_RSH="ssh -i /etc/borg/targets/${BACKUP_NAME}/id_${BACKUP_NAME}"

# some helpers and error handling:
info() { printf "\n%s %s\n\n" "$( date )" "$*" >&2; }
trap 'echo $( date ) Backup interrupted >&2; exit 2' INT TERM

info "Starting backup"

# Backup the most important directories into an archive named after
# the machine this script is currently running on:

borg create                           \
    --verbose                         \
    --filter AME                      \
    --list                            \
    --stats                           \
    --show-rc                         \
    --compression lz4                 \
    --exclude-caches                  \
    --exclude-if-present '.no-backup' \
    --exclude '/home/*/.cache/*'      \
    --exclude '/var/tmp/*'            \
    --exclude '/var/cache/*'          \
    --exclude '/var/lock/*'           \
    --exclude '/var/log/*'            \
    --exclude '/var/run/*'            \
                                      \
    ::'{hostname}-{now}'              \
    /etc                              \
    /home                             \
    /root                             \
    /var

backup_exit=$?

info "Pruning repository"

# Use the `prune` subcommand to maintain 48 hourly, 7 daily, 4 weekly and 6 monthly
# archives of THIS machine. The '{hostname}-' prefix is very important to
# limit prune's operation to this machine's archives and not apply to
# other machines' archives also:

borg prune                          \
    --list                          \
    --prefix '{hostname}-'          \
    --show-rc                       \
    --keep-hourly   48              \
    --keep-daily    7               \
    --keep-weekly   4               \
    --keep-monthly  6

prune_exit=$?

borg compact

compact_exit=$?

# use highest exit code as global exit code
global_exit=$(( backup_exit > prune_exit ? backup_exit : prune_exit ))
global_exit=$(( compact_exit > global_exit ? compact_exit : global_exit ))

if [ ${global_exit} -eq 0 ]; then
    info "Backup and Prune finished successfully"
elif [ ${global_exit} -eq 1 ]; then
    info "Backup and/or Prune finished with warnings"
else
    info "Backup and/or Prune finished with errors"
fi

exit ${global_exit}
```

```bash frame="none"
sudo chmod +x /usr/local/bin/borg-backup
```

### Systemd Service and Timer

`sudo systemctl edit --full --force borg-backup@.service`

```ini title="borg-backup@.service"
[Unit]
Description=Borg Backup Service
After=network.target network-online.target
Wants=network.target network-online.target
AssertPathExists=/etc/borg/targets/%i/passphrase
AssertPathExists=/etc/borg/targets/%i/env
AssertPathExists=/etc/borg/targets/%i/id_%i
AssertFileIsExecutable=/usr/local/bin/borg-backup

[Service]
Type=simple
Nice=19
IOSchedulingClass=2
IOSchedulingPriority=7
EnvironmentFile=/etc/borg/targets/%i/env
Environment="BACKUP_NAME=%i"
LoadCredential=passphrase:/etc/borg/targets/%i/passphrase
ExecStart=/usr/local/bin/borg-backup

NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectHome=read-only
ProtectSystem=strict
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectHostname=yes
ProtectClock=yes
RestrictNamespaces=yes
RestrictRealtime=yes
MemoryDenyWriteExecute=yes
RestrictAddressFamilies=AF_INET AF_INET6
RestrictSUIDSGID=yes
SystemCallArchitectures=native

ConfigurationDirectory=borg/configuration/%i
ConfigurationDirectoryMode=0750
StateDirectory=borg/targets/%i
StateDirectoryMode=0750
RuntimeDirectory=borg/targets/%i
RuntimeDirectoryMode=0750
CacheDirectory=borg/targets/%i
CacheDirectoryMode=0750
```

`sudo systemctl edit --full --force borg-backup@.timer`

```ini title="borg-backup@.timer"
[Unit]
Description=Borg Backup Timer

[Timer]
OnCalendar=hourly
RandomizedDelaySec=15min
Persistent=true

[Install]
WantedBy=timers.target
```

If you would like to change the frequency of backups, documentation for systemd timers can be found [here](https://www.freedesktop.org/software/systemd/man/systemd.timer.html).

Following the creation of the two systemd units, test that the script works by running the service and checking for errors:

```bash frame="none"
sudo systemctl start borg-backup@BACKUP_NAME.service
sudo journalctl -xefu borg-backup@BACKUP_NAME.service
```

If all goes well, enable and start the timer: `sudo systemctl enable --now borg-backup@BACKUP_NAME.timer`
