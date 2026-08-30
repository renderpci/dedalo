#!/bin/sh
# Dédalo backup set — THE FAILURE ALARM. Run by dedalo-backup-alert@.service, which
# deploy/dedalo-backup.service names in `OnFailure=`.
#
# WHY IT EXISTS (P0-13, 2026-08-30). Before this there was no `OnFailure=` and no
# notification anywhere in deploy/. A nightly backup that fails silently is WORSE
# than no backup at all, because it is believed: the panel says a recent backup
# exists, the operator authorises a code update or a risky import on the strength
# of it, and the absence is discovered only at the one moment it cannot be fixed.
#
# WHO IS BEING TOLD. A museum sysadmin, often part-time, with no monitoring stack,
# no alerting pipeline and no dashboard anybody watches. So this uses only what is
# already on the machine, and it tells them in three places at once, because the
# one thing that must not happen is the message going only somewhere nobody looks:
#
#   1. A FILE, BACKUP_FAILED, in the backup state directory — the place a person
#      goes when they think about backups at all, and the one signal that survives
#      a reboot, an unread journal and a rotated log. It is also machine-readable
#      by anything added later (a check script, a monitoring agent, the engine's
#      own maintenance panel) without inventing a protocol for it. The successful
#      run REMOVES it (deploy/dedalo-backup-step.sh), so its presence always means
#      "the last run failed", never "it failed once, months ago".
#   2. SYSLOG at crit, via `logger` — it lands in the journal and in whatever the
#      host already forwards, and `journalctl -p crit` is the standard first look.
#   3. `wall` — a broadcast to every logged-in terminal. It costs nothing, needs no
#      configuration whatsoever, and is seen by the person who is actually at the
#      machine.
#
# And, OPT-IN, local mail to $DEDALO_BACKUP_MAILTO through sendmail if the host has
# one — the habit cron gave every sysadmin. It is configured with a systemd drop-in
#
#     systemctl edit dedalo-backup-alert@.service
#     [Service]
#     Environment=DEDALO_BACKUP_MAILTO=collections@museum.example
#
# and deliberately NOT with a key in ../private/.env: that file is append-only and
# documented-keys-only (a new key belongs in the typed catalog under src/config/,
# and this alarm must keep working even when the engine cannot start).
#
# Usage: dedalo-backup-alert.sh <failed unit name>
set -u

UNIT=${1:-dedalo-backup.service}
STATE_DIR=${DEDALO_BACKUP_STATE_DIR:-/opt/dedalo/backups}
WHEN=$(date '+%Y-%m-%d %H:%M:%S%z')
HOSTNAME_=$(hostname 2>/dev/null || echo unknown-host)

SUMMARY="DEDALO BACKUP FAILED on $HOSTNAME_ at $WHEN ($UNIT). This machine has no verified restore point from this run."

# The journal is where the reason is; quoting the last lines of it into the file
# means the operator gets the WHY in the same place as the WHAT, without knowing
# journalctl. Missing journalctl (a container, a non-systemd host) is not an error:
# the alarm still fires, it just carries less detail.
DETAIL=$(journalctl -u "$UNIT" -n 40 --no-pager 2>/dev/null || echo '(journalctl is not available on this host)')

if mkdir -p "$STATE_DIR" 2>/dev/null; then
	{
		printf '%s\n\n' "$SUMMARY"
		printf 'What to do:\n'
		printf '  1. journalctl -u %s -n 200      # why it failed\n' "$UNIT"
		printf '  2. fix it, then: systemctl start %s\n' "$UNIT"
		printf '  3. this file disappears by itself on the next run in which EVERY store succeeds\n\n'
		printf 'Last journal lines:\n%s\n' "$DETAIL"
	} > "$STATE_DIR/BACKUP_FAILED" 2>/dev/null ||
		echo "dedalo-backup-alert: cannot write '$STATE_DIR/BACKUP_FAILED'" >&2
else
	echo "dedalo-backup-alert: cannot create the state directory '$STATE_DIR'" >&2
fi

command -v logger >/dev/null 2>&1 && logger -p daemon.crit -t dedalo-backup "$SUMMARY"
command -v wall >/dev/null 2>&1 && echo "$SUMMARY" | wall 2>/dev/null

if [ -n "${DEDALO_BACKUP_MAILTO:-}" ] && [ -x /usr/sbin/sendmail ]; then
	{
		printf 'To: %s\n' "$DEDALO_BACKUP_MAILTO"
		printf 'Subject: [Dedalo] BACKUP FAILED on %s\n' "$HOSTNAME_"
		printf 'Auto-Submitted: auto-generated\n\n'
		printf '%s\n\n%s\n' "$SUMMARY" "$DETAIL"
	} | /usr/sbin/sendmail -t
fi

# The alarm itself always succeeds: a failing alarm unit would only add a second,
# emptier failure on top of the one that matters.
exit 0
