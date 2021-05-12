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

Most major Linux distrobutions have a package available, we'll assume Ubuntu Server throughout this documentation.

On both the the system(s) being backed up and the backup server(s), install the following package:

```sh
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

This can be skipped if you intend to use a service like [Rsync.net](https://www.rsync.net/products/attic.html).

### Create borg user

```sh
sudo useradd -m -U -s /bin/bash borg
sudo passwd -l borg
```

### Create Backups Folder

```sh
sudo mkdir /backup/path
sudo chown borg:borg /backup/path
sudo chmod u+rwX,g+rX,o-rwx /backup/path
```

### Add Client to SSH authorized_keys

Copy the public key from the ssh keypair you generated earlier to the backup server, editing `/home/borg/.ssh/authorized_keys` so that the entry looks similar to the following:

```
command="cd /backup/path/client; borg serve --restrict-to-path /backup/path/client",restrict ssh-ed25519 AAAAC3N[...] user@host
```

You will need one of these entries for each client you intend to give access, with a different path for each client.

## Client Configuration

### Initialize Backup

```sh
sudo borg init --encryption=repokey-blake2 borg@example.com:/backup/path/client
```

### Backup script

The following script is adapted from the [Borg Quick Start](https://borgbackup.readthedocs.io/en/stable/quickstart.html) Documentation.

```sh
sudo touch /usr/local/bin/borg-backup
sudo chmod +x /usr/local/bin/borg-backup
sudo vim /usr/local/bin/borg-backup
```

```sh
#!/bin/sh

# Setting this, so the repo does not need to be given on the commandline:
export BORG_REPO=borg@example.com:/backup/path/client

export BORG_PASSPHRASE='SOME_PASSPHRASE_HERE'

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
    --exclude="/var/cache/*"        \
    --exclude="/var/lock/*"         \
    --exclude="/var/log/*"          \
    --exclude="/var/run/*"          \
                                    \
    ::'{hostname}-{now}'            \
    /etc                            \
    /home                           \
    /root                           \
    /var

backup_exit=$?

if [ ${backup_exit} -eq 0 ]; then
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
fi

# use highest exit code as global exit code
global_exit=$(( backup_exit > prune_exit ? backup_exit : prune_exit ))

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

`sudo systemctl edit --full --force borg-backup.service`

```ini
[Unit]
Description=Borg Backup Service
After=network.target

[Service]
Type=simple
Nice=19
IOSchedulingClass=2
IOSchedulingPriority=7
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

`sudo systemctl edit --full --force borg-backup.timer`

```ini
[Unit]
Description=Borg Backup Timer

[Timer]
OnCalendar=hourly
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
```

If you would like to change the frequency of backups, documentation for systemd timers can be found [here](https://www.freedesktop.org/software/systemd/man/systemd.timer.html).

Following the creation of the two systemd units, test that the script works by running the service and checking for errors:

```sh
sudo systemctl start borg-backup.service
sudo journalctl -xefu borg-backup.service
```

If all goes well, enable the timer: `sudo systemctl enable --now borg-backup.timer`
