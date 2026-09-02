# Owly — Stable Fallback (7-Day Rolling Snapshots)

## What this gives you

- **Daily snapshots** of the running Owly (database + Docker image + WhatsApp auth)
- **7 days of retention** so you can roll back to any of the last 7 days
- **One-command restore** that brings the whole stack back to a chosen day
- Uses the existing `scripts/restore.sh` for the database part (no duplication)

## Layout on disk

```
/backups/stable/
├── snapshots/
│   ├── owly-stable-2026-09-02.tar.gz        # full archive, ready for restore.sh
│   ├── owly-stable-2026-09-03.tar.gz
│   ├── ...
│   └── owly-stable-2026-09-08.tar.gz
└── images/
    ├── owly-app-2026-09-02.tar.gz            # docker save of stable-2026-09-02
    └── ...
```

Docker image tags also exist:
- `owly-app:stable-2026-09-02`
- `owly-app:stable-2026-09-03`
- ...
- `owly-app:latest`  ← always the most recent rebuild

## One-time install

```sh
chmod +x scripts/snapshot-stable.sh scripts/list-snapshots.sh \
         scripts/switch-to-snapshot.sh scripts/setup-snapshot-cron.sh

# Take an initial snapshot now (optional but recommended)
scripts/snapshot-stable.sh

# Install the daily cron at 03:00
scripts/setup-snapshot-cron.sh
```

The cron writes its log to `/var/log/owly-snapshot.log`.

## Daily usage

### List available snapshots
```sh
scripts/list-snapshots.sh
```

### Take a snapshot on demand (after a deploy, for example)
```sh
scripts/snapshot-stable.sh
```

### Roll back to a previous day
```sh
# Pick a date from list-snapshots.sh, e.g. 2026-09-05
scripts/switch-to-snapshot.sh 2026-09-05
# then type SWITCH to confirm
```

`switch-to-snapshot.sh` will:
1. Replace the database with the snapshot's dump
2. Replace the WhatsApp auth volume with the snapshot's auth
3. Load the corresponding Docker image and re-tag it as `latest`
4. Restart the `app` container

## What this does NOT protect against

- **The server itself dying** (disk failure, datacenter outage) — for that, copy `/backups/stable/` off-site (rsync, S3, etc.)
- **Loss of uncommitted transactions** between the last snapshot and the crash — for zero-RPO, you'd need a second server with synchronous replication
- **A bad snapshot** — if the cron ran while the DB was in a bad state, the snapshot itself is bad. We recommend running snapshots during low-traffic hours (default: 03:00).

## Customization

All scripts honor these env vars (set in your shell or in `/etc/default/owly-snapshot`):

| Var | Default | Meaning |
|---|---|---|
| `BACKUP_ROOT` | `/backups/stable` | Where snapshots are stored |
| `RETENTION_DAYS` | `7` | How many days to keep |
| `OWLY_DB_CONTAINER` | `owly-db-1` | Postgres container name |
| `OWLY_IMAGE_NAME` | `owly-app` | Docker image to tag |
| `POSTGRES_USER` / `POSTGRES_DB` | `postgres` / `owly` | DB credentials |

## Uninstallation

```sh
scripts/setup-snapshot-cron.sh --remove
# Optionally wipe snapshots:
rm -rf /backups/stable
```
