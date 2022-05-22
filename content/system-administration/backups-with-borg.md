---
title: "Backups With Borg"
author: "Anthony Loop"
date: "2021-04-22"
tags:
  - linux
  - systemd
  - backup
  - administration
---

## Installation

Most major Linux distributions have a package available, we'll assume Ubuntu Server throughout this documentation.

On both the the system(s) being backed up and the backup server(s), install the following package:

```sh
sudo apt update
sudo apt install borgbackup
```

## Initial Client Configuration

Create an ssh keypair without a passphrase for the root account on your client(s):

```sh
sudo ssh-keygen -t ed25519
```

If you change the default file location for the key from `/root/.ssh/id_ed25519` to something else, you may need to configure the `/root/.ssh/config` file like so:

```
Match User borg Host example.com
    IdentitiesOnly yes
    IdentityFile /root/.ssh/borg_backup_key
```

## Server Configuration

This can be skipped if you intend to use a service like [rsync.net](https://www.rsync.net/products/attic.html), follow their directions instead.

### Create borg user

```sh
sudo useradd -m -U -s /bin/bash borg
sudo passwd -l borg
```

### Create Backups Folder

```sh
current_umask="$(umask)"
umask 027
sudo mkdir /backup/path/client
sudo chown borg:borg /backup/path/client
sudo chown borg:borg /backup/path/client
sudo chmod u+rwX,g+rX,o-rwx /backup/path/client
umask "$current_umask"
```

### Add Client to SSH authorized_keys

Copy the public key from the ssh keypair you generated earlier to the backup server, editing `/home/borg/.ssh/authorized_keys` so that the entry looks similar to the following:

```sh
command="cd /backup/path/client; borg serve --restrict-to-path /backup/path/client",restrict ssh-ed25519 AAAAC3N[...] user@host
```

You will need one of these entries for each client you intend to give access, with a different path for each client.

## Client Configuration

### Initialize Backup

```sh
sudo borg init --encryption=repokey-blake2 borg@example.com:/backup/path/client
```

### Create key file

This file will be loaded by the systemd service and passed to the backup script as a file located at `${CREDENTIALS_DIRECTORY}/passphrase`.
Make sure to replace the contents of `BACKUP_NAME`, `BACKUP_HOST`, and `BACKUP_PATH` with proper values, and optionally
provide values for `BACKUP_USER` and `BACKUP_PORT`.

```sh
export BACKUP_NAME=somename
export BACKUP_HOST=127.0.0.1
export BACKUP_PATH=/backup/path/client
current_umask="$(umask)"
umask 077
sudo mkdir -p /etc/borg/{keys,env}
sudo vim "/etc/borg/keys/${BACKUP_NAME}.key"
cat <<EOF | sudo tee "/etc/borg/env/${BACKUP_NAME}.env"
BACKUP_HOST=$BACKUP_HOST
BACKUP_PATH=$BACKUP_PATH
# OPTIONAL - defaults to "borg"
BACKUP_USER=
# OPTIONAL - defaults to 22
BACKUP_PORT=
EOF
umask "$current_umask"
```

### Backup script

The following script is adapted from the [Borg Quick Start](https://borgbackup.readthedocs.io/en/stable/quickstart.html) Documentation.

```sh
sudo vim /usr/local/bin/borg-backup
sudo chmod +x /usr/local/bin/borg-backup
```

```sh
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
    echo "\$BACKUP_HOST was not set, check /etc/borg/env/${BACKUP_INSTANCE_NAME}.env. exiting..."
    exit 1
fi

if [ -z "${BACKUP_PATH}" ]; then
    echo "\$BACKUP_PATH was not set, check /etc/borg/env/${BACKUP_INSTANCE_NAME}.env. exiting..."
    exit 1
fi

# Ensure that the backup path starts with a /, this is needed when using relative paths
# because of the alternate syntax being used to specify a port.
#
# For more info, see: https://borgbackup.readthedocs.io/en/stable/usage/general.html#repository-urls
#
BACKUP_PATH="/${BACKUP_PATH#/}"

export BORG_REPO="ssh://${BACKUP_USER:-borg}@${BACKUP_HOST}:${BACKUP_PORT:-22}${BACKUP_PATH}"

export BORG_PASSCOMMAND="cat ${CREDENTIALS_DIRECTORY}/passphrase"

# some helpers and error handling:
info() { printf "\n%s %s\n\n" "$( date )" "$*" >&2; }
trap 'echo $( date ) Backup interrupted >&2; exit 2' INT TERM

info "Starting backup"

# Backup the most important directories into an archive named after
# the machine this script is currently running on:

borg create                         \
    --verbose                       \
    --filter AME                    \
    --list                          \
    --stats                         \
    --show-rc                       \
    --compression lz4               \
    --exclude-caches                \
    --exclude '/home/*/.cache/*'    \
    --exclude '/var/tmp/*'          \
    --exclude '/var/cache/*'        \
    --exclude '/var/lock/*'         \
    --exclude '/var/log/*'          \
    --exclude '/var/run/*'          \
                                    \
    ::'{hostname}-{now}'            \
    /etc                            \
    /home                           \
    /root                           \
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

### Systemd Service and Timer

`sudo systemctl edit --full --force borg-backup@.service`

```ini
[Unit]
Description=Borg Backup Service
After=network.target network-online.target
Wants=network.target network-online.target
AssertPathExists=/etc/borg/keys/%i.key
AssertPathExists=/etc/borg/env/%i.env
AssertFileIsExecutable=/usr/local/bin/borg-backup

[Service]
Type=simple
Nice=19
IOSchedulingClass=2
IOSchedulingPriority=7
EnvironmentFile=/etc/borg/env/%i.env
Environment="BACKUP_NAME=%i"
LoadCredential=passphrase:/etc/borg/keys/%i.key
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

RuntimeDirectory=borg_backup
CacheDirectory=borg_backup
CacheDirectoryMode=0750

BindPaths=/root/.cache/borg/ /root/.config/borg/
```

`sudo systemctl edit --full --force borg-backup@.timer`

```ini
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

```sh
sudo systemctl start borg-backup@BACKUP_NAME.service
sudo journalctl -xefu borg-backup@BACKUP_NAME.service
```

If all goes well, enable the and start the timer: `sudo systemctl enable --now borg-backup@BACKUP_NAME.timer`
