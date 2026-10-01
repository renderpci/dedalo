#!/usr/bin/env bash
# LEAD-1b PID-1 mechanism probe — run as root on a systemd host (the floor is 248; the
# reference VM is Ubuntu 24.04, systemd 255; run it on 257+ too).
# Self-contained, touches only names starting with lead1bprobe, removes them on exit.
# Output: PASS/FAIL lines + /root/lead1bprobe-show-<ver>.txt (conformance fixture).
#
# THE LIVE LEG of the site builder's agent confinement: the suite runs where there is no
# systemd, so what only PID 1 can show — the uid, the per-(site, door) and per-site
# exclusion, the read-only egress bind, a daemon stop no late connect can cancel — is shown
# here, on the units' own shape (src/provision/render/agent_units.ts). Usage:
#   scp lead1b_pid1_probe.sh <host>:/tmp/ && ssh -t <host> sudo bash /tmp/lead1b_pid1_probe.sh

set -uo pipefail
P=lead1bprobe
V=$(systemctl show -p Version --value); VN=${V%%[!0-9]*}
echo "PID1 systemd: $V"
fail=0; ok(){ echo "PASS $*"; }; bad(){ echo "FAIL $*"; fail=1; }
cleanup(){
  systemctl stop "$P-"'*' 2>/dev/null; systemctl stop "$P-daemon.service" 2>/dev/null
  rm -rf /etc/systemd/system/$P-* /etc/polkit-1/rules.d/49-$P.rules; systemctl daemon-reload
  pkill -u $P-svc 2>/dev/null; sleep 1
  for u in $P-a1 $P-a2 $P-svc; do userdel $u 2>/dev/null; done
  for g in $P-g1 $P-g2 $P-inst; do groupdel $g 2>/dev/null; done
  rm -rf /run/$P /srv/$P /var/lib/$P /usr/local/lib/$P
}
trap cleanup EXIT

# --- identities: one per site, private group per site, service user in both private groups
groupadd -f $P-inst; groupadd -f $P-g1; groupadd -f $P-g2
useradd --system --gid $P-inst --groups $P-g1 --home-dir /nonexistent --shell /usr/sbin/nologin $P-a1
useradd --system --gid $P-inst --groups $P-g2 --home-dir /nonexistent --shell /usr/sbin/nologin $P-a2
useradd --system --gid $P-inst --groups $P-g1,$P-g2 --home-dir /nonexistent --shell /usr/sbin/nologin $P-svc
# P0: the ledger's retirement marker. A fresh useradd reads LOCKED to `passwd -S` (its `!` password)
# and has NO expiry; `usermod --lock --expiredate 1` sets field 8 to 1 — what identities.ts reads.
echo "INFO fresh: passwd -S -> $(passwd -S $P-a1 | awk '{print $2}'); shadow -> $(getent shadow $P-a1)"
[ "$(getent shadow $P-a1 | cut -d: -f8)" = "" ] && ok "P0 a fresh useradd has no expiry (ACTIVE to the ledger)" || bad "P0 a fresh useradd carries an expiry"
useradd --system --gid $P-inst --home-dir /nonexistent --shell /usr/sbin/nologin $P-ret
usermod --lock --expiredate 1 $P-ret
[ "$(getent shadow $P-ret | cut -d: -f8)" = "1" ] && ok "P0 usermod --lock --expiredate 1 sets expiry 1 (RETIRED to the ledger)" || bad "P0 expiry after retirement is '$(getent shadow $P-ret | cut -d: -f8)'"
userdel $P-ret
# P0b: the normalisation walk (plan.ts quiesceActions): only the earlier owner's files, links never followed.
W=$(mktemp -d); mkdir -p $W/d; touch $W/d/f $W/keep; chown -R $P-a1 $W/d; chown root $W/keep; ln -s /etc/hostname $W/d/l; chown -h $P-a1 $W/d/l
HOSTOWN=$(stat -c %U /etc/hostname)
chown -R -h -P --from=$P-a1 $P-a2 $W
[ "$(stat -c %U $W/d/f)" = "$P-a2" ] && [ "$(stat -c %U $W/keep)" = root ] && [ "$(stat -c %U /etc/hostname)" = "$HOSTOWN" ] && [ "$(stat -c %U -L $W/d/l 2>/dev/null)" = "$HOSTOWN" ] && [ "$(stat -c %U $W/d/l)" = "$P-a2" ] \
  && ok "P0b chown -R -h -P --from re-owns only the earlier owner's files, the link itself, never its target" || bad "P0b the normalisation walk touched something else"
rm -rf "$W"
# P0c: the migration stops pre-LEAD-1b runs with an exact-length glob; with none loaded it must be a no-op (exit 0), or apply halts.
systemctl stop "$P-agent-$(printf '[0-9a-f]%.0s' 1 2 3 4 5 6 7 8)-$(printf '[0-9a-f]%.0s' 1 2 3 4)-$(printf '[0-9a-f]%.0s' 1 2 3 4)-$(printf '[0-9a-f]%.0s' 1 2 3 4)-$(printf '[0-9a-f]%.0s' 1 2 3 4 5 6 7 8 9 10 11 12).service" \
  && ok "P0c systemctl stop <legacy glob> with nothing loaded exits 0" || bad "P0c systemctl stop <legacy glob> with nothing loaded fails — the migration's quiesce would halt"

# --- tree: workspaces (svc:inst 2770), per-(site,door) HOME 0700, egress dirs, root socket dir
install -d -o $P-svc -g $P-inst -m 2770 /srv/$P /srv/$P/site1 /srv/$P/site2
install -d -m 0755 /var/lib/$P /var/lib/$P/s1 /var/lib/$P/s2
for k in 1 2; do for d in turn build; do install -d -o $P-a$k -g $P-inst -m 0700 /var/lib/$P/s$k/$d; done; done
install -d -m 0755 /run/$P /run/$P/sock
# The egress directories are ROOT's (the rendered tmpfiles.d line): root:<site group> 0770
# under a root 0755 egress/ — the source of a bind PID 1 resolves as root.
install -d -m 0755 /run/$P/egress
for k in 1 2; do install -d -o root -g $P-g$k -m 0770 /run/$P/egress/s$k; done
install -d -m 0755 /usr/local/lib/$P
cat > /usr/local/lib/$P/conn.py <<'EOF'
import socket, sys
s = socket.socket(socket.AF_UNIX); s.connect(sys.argv[1]); s.sendall((sys.argv[2] + "\n").encode())
while True:
    b = s.recv(65536)
    if not b: break
    sys.stdout.buffer.write(b); sys.stdout.flush()
EOF
cat > /usr/local/lib/$P/egress.py <<'EOF'
import grp, os, socket, sys
path, group = sys.argv[1], sys.argv[2]
# The directory is root's (provisioned); the service user binds inside by group membership.
s = socket.socket(socket.AF_UNIX); s.bind(path); os.chown(path, -1, grp.getgrnam(group).gr_gid); os.chmod(path, 0o660); s.listen(8)
while True:
    c, _ = s.accept(); c.sendall(b"egress-ok\n"); c.close()
EOF
cat > /usr/local/lib/$P/egress_once.py <<'EOF'
import grp, os, socket, sys
# One gate open/close exactly as src/egress/gate.ts does it: unlink stale, bind, chgrp, chmod, unlink.
path, group = sys.argv[1], sys.argv[2]
try:
    os.unlink(path)
except FileNotFoundError:
    pass
s = socket.socket(socket.AF_UNIX); s.bind(path); os.chown(path, -1, grp.getgrnam(group).gr_gid); os.chmod(path, 0o660); s.listen(1); s.close(); os.unlink(path)
print("gate-open-ok")
EOF
chmod 0644 /usr/local/lib/$P/*.py
conn(){ runuser -u $P-svc -- python3 /usr/local/lib/$P/conn.py "/run/$P/sock/$1.sock" "$2"; }

# --- stand-in daemon (instances BindsTo it; it Wants= its sockets, which are PartOf= it)
SOCKS="$P-s1-turn.socket $P-s1-build.socket $P-s2-turn.socket $P-s2-build.socket"
cat > /etc/systemd/system/$P-daemon.service <<EOF
[Unit]
Wants=$SOCKS
After=$SOCKS
[Service]
User=$P-svc
ExecStart=/usr/bin/sleep infinity
EOF

# --- per (site, door): socket (Accept=yes, MaxConnections=1, svc-only), service template, door target
for k in 1 2; do for d in turn build; do
  o=$([ $d = turn ] && echo build || echo turn)
  cat > /etc/systemd/system/$P-s$k-$d.socket <<EOF
[Unit]
PartOf=$P-daemon.service
[Socket]
ListenStream=/run/$P/sock/s$k-$d.sock
Accept=yes
MaxConnections=1
SocketUser=$P-svc
SocketGroup=$P-inst
SocketMode=0600
DirectoryMode=0755
EOF
  cat > /etc/systemd/system/$P-s$k-$d.target <<EOF
[Unit]
Conflicts=$P-s$k-$o.target
$([ $d = turn ] && echo "After=$P-s$k-$o.target")
StopWhenUnneeded=yes
EOF
  cat > /etc/systemd/system/$P-s$k-$d@.service <<EOF
[Unit]
BindsTo=$P-s$k-$d.target $P-daemon.service
After=$P-s$k-$d.target $P-daemon.service
CollectMode=inactive-or-failed
[Service]
Type=exec
User=$P-a$k
StandardInput=socket
StandardOutput=socket
StandardError=journal
WorkingDirectory=/
ExecStart=/bin/sh -c 'IFS= read -r c; eval "\$\$c"'
Environment=HOME=/var/lib/$P/s$k/$d
PrivateNetwork=yes
PrivateIPC=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=yes
ProtectProc=invisible
NoNewPrivileges=yes
RestrictSUIDSGID=yes
LockPersonality=yes
UMask=0007
TemporaryFileSystem=/run:ro
TemporaryFileSystem=/dev/shm:mode=1777,nosuid,nodev
InaccessiblePaths=-/var/lib/mysql -/var/lib/mariadb -/var/lib/pgsql -/var/lib/postgresql
IPAddressDeny=any
IPAddressAllow=localhost
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK
MemoryMax=2G
CPUQuota=200%
TasksMax=512
TemporaryFileSystem=/var/lib/$P:ro
BindPaths=/var/lib/$P/s$k/$d
BindReadOnlyPaths=/run/$P/egress/s$k:/run/dedalo-egress
ReadWritePaths=/srv/$P/site$k
RuntimeMaxSec=300
TimeoutStopSec=10
EOF
done; done

# --- P0: the CURRENT rule shape (prefix + start/stop/kill) on this systemd: transient start
cat > /etc/polkit-1/rules.d/49-$P.rules <<EOF
polkit.addRule(function (action, subject) {
  if (action.id !== "org.freedesktop.systemd1.manage-units" || subject.user !== "$P-svc") return polkit.Result.NOT_HANDLED;
  var unit = action.lookup("unit"); if (typeof unit !== "string") return polkit.Result.NOT_HANDLED;
  if (unit.indexOf("$P-") !== 0 || unit.substr(unit.length - 8) !== ".service") return polkit.Result.NOT_HANDLED;
  if (["start","stop","kill"].indexOf(action.lookup("verb")) === -1) return polkit.Result.NOT_HANDLED;
  return polkit.Result.YES;
});
EOF
sleep 2
if runuser -u $P-svc -- systemd-run --quiet --wait --unit=$P-x.service --uid=$P-a1 /usr/bin/true 2>/tmp/$P.err
then echo "INFO P0 transient start AUTHORIZED under the current rule (expected only on >=257): F1 does not hold here"
else echo "INFO P0 transient start DENIED under the current rule: $(head -c 200 /tmp/$P.err) (F1 predicts this below 257)"; fi
if runuser -u $P-svc -- systemd-run --quiet --wait --unit=$P-y.service --uid=root /usr/bin/true 2>/dev/null
then echo "INFO P0 --uid=root AUTHORIZED under the current rule: F2 (root-equivalence) holds on this host"
else echo "INFO P0 --uid=root denied under the current rule"; fi

# --- the NEW rule: stop/kill only, enumerated socket-activated instances, never start
cat > /etc/polkit-1/rules.d/49-$P.rules <<EOF
polkit.addRule(function (action, subject) {
  if (action.id !== "org.freedesktop.systemd1.manage-units" || subject.user !== "$P-svc") return polkit.Result.NOT_HANDLED;
  var unit = action.lookup("unit"); if (typeof unit !== "string") return polkit.Result.NOT_HANDLED;
  if (!/^$P-s(1|2)-(turn|build)@[0-9]+-[0-9]+-[0-9]+\.service\$/.test(unit)) return polkit.Result.NOT_HANDLED;
  var verb = action.lookup("verb"); if (verb !== "stop" && verb !== "kill") return polkit.Result.NOT_HANDLED;
  return polkit.Result.YES;
});
EOF
systemctl daemon-reload
systemctl start $P-daemon.service
systemctl start $P-s1-turn.socket $P-s1-build.socket $P-s2-turn.socket $P-s2-build.socket
runuser -u $P-svc -- python3 /usr/local/lib/$P/egress.py /run/$P/egress/s1/p.sock $P-g1 & E1=$!
runuser -u $P-svc -- python3 /usr/local/lib/$P/egress.py /run/$P/egress/s2/p.sock $P-g2 & E2=$!
sleep 2
runuser -u $P-svc -- systemd-run --quiet --wait --unit=$P-z.service --uid=root /usr/bin/true 2>/dev/null \
  && bad "P1 transient --uid=root authorized under the new rule" || ok "P1 transient start (--uid=root) denied under the new rule"

# --- P2: two sites concurrently — distinct uid, /proc invisible, other run's socket unreachable
conn s1-turn 'echo "A uid=$(id -u)"; python3 -c "import socket;s=socket.socket(socket.AF_UNIX);s.connect(\"/run/dedalo-egress/p.sock\");print(\"A own egress:\",s.recv(64).decode().strip())"; touch /run/dedalo-egress/planted 2>/dev/null && echo "A planted" || echo "A no-plant"; sleep 25' > /tmp/$P.A & CA=$!
sleep 3
AINST=$(systemctl list-units --plain --no-legend "$P-s1-turn@*.service" | awk '{print $1}' | head -1)
APID=$(systemctl show -p MainPID --value "$AINST")
echo "INFO instance name form: $AINST (MainPID $APID)"
# The daemon's instance grammar (agent_identity.ts INSTANCE_SUFFIX_SOURCE): <=257 nr-pid-uid, >=258 nr-cookie-pid_pidfdid-uid | nr-cookie-pid-uid.
echo "$AINST" | grep -Eq -- "-s1-turn@[0-9]+-[0-9]+-[0-9]+(_[0-9]+-[0-9]+|-[0-9]+)?\.service$" && ok "P2 instance name '$AINST' matches the daemon's grammar on $VN" || bad "P2 instance name '$AINST' is outside the daemon's grammar on $VN"
OUT=$(conn s2-turn "echo B uid=\$(id -u); ls -d /proc/$APID 2>&1; cat /proc/$APID/environ 2>&1 | head -c 80; ls /proc/$APID/root/run/dedalo-egress 2>&1; ls /run/$P 2>&1; ls /var/lib/$P/s1 2>&1")
echo "$OUT" | sed 's/^/  B> /'
AUID=$(grep -o 'A uid=[0-9]*' /tmp/$P.A | cut -d= -f2); BUID=$(echo "$OUT" | grep -o 'B uid=[0-9]*' | cut -d= -f2)
[ -n "$AUID" ] && [ -n "$BUID" ] && [ "$AUID" != "$BUID" ] && ok "P2 distinct uids ($AUID vs $BUID)" || bad "P2 uids not distinct/absent ($AUID/$BUID)"
grep -q 'A own egress: egress-ok' /tmp/$P.A && ok "P2 A reaches its own egress socket (connect over a READ-ONLY bind)" || bad "P2 A cannot reach its own egress socket"
grep -q 'A no-plant' /tmp/$P.A && [ ! -e /run/$P/egress/s1/planted ] && ok "P2 A cannot plant in its own egress directory (read-only bind)" || bad "P2 A planted in its egress directory"
runuser -u $P-svc -- mv /run/$P/egress/s1 /run/$P/egress/s1x 2>/dev/null && bad "P2 the service user renamed a root-provisioned egress directory" || ok "P2 the service user cannot rename or re-point an egress directory (root's parent)"
[ "$(echo "$OUT" | grep -c 'No such file or directory')" -ge 4 ] && ok "P2 B cannot see A's /proc entries, /run/$P or s1 state" || bad "P2 B saw something of A"
setpriv --reuid=$P-a2 --regid=$P-inst --init-groups python3 -c "import socket;s=socket.socket(socket.AF_UNIX);s.connect('/run/$P/egress/s1/p.sock')" 2>/dev/null \
  && bad "P2 identity 2 connected to site 1's egress socket (host DAC)" || ok "P2 identity 2 refused by DAC on site 1's egress socket"

# --- P2b: the gate under the DAEMON's sandbox. ProtectSystem=strict mounts /run read-only; the rendered
# daemon unit lists the egress base in ReadWritePaths= (layout.ts tmpfilesWritablePaths). With it the
# service user binds/chgrps/chmods/unlinks in s1; without it (control) the same open fails as EROFS.
G=$(systemd-run --quiet --wait --pipe -p User=$P-svc -p ProtectSystem=strict -p ReadWritePaths=/run/$P/egress \
  python3 /usr/local/lib/$P/egress_once.py /run/$P/egress/s1/q.sock $P-g1 2>&1)
echo "$G" | grep -q gate-open-ok && ok "P2b the gate opens under ProtectSystem=strict with the egress base in ReadWritePaths=" || bad "P2b the gate could not open under the daemon's sandbox: $G"
G=$(systemd-run --quiet --wait --pipe -p User=$P-svc -p ProtectSystem=strict \
  python3 /usr/local/lib/$P/egress_once.py /run/$P/egress/s1/q.sock $P-g1 2>&1)
echo "$G" | grep -q 'Read-only file system' && ok "P2b control: without the entry the gate fails as EROFS (the leg measures the mount)" || bad "P2b control did not fail as EROFS: $G"
systemd-run --quiet --wait --pipe -p User=$P-svc -p ProtectSystem=strict -p ReadWritePaths=/run/$P/egress \
  mv /run/$P/egress/s1 /run/$P/egress/s1x 2>/dev/null && bad "P2b the sandboxed service user renamed s1" || ok "P2b the writable mount is not the permission: s1 still cannot be renamed"

# --- P3: same door — second connection dropped while the first unit lives; slot frees only on death
C3=$(conn s1-turn 'echo second-ran'); [ -z "$C3" ] && ok "P3 second s1-turn connection dropped while A lives" || bad "P3 second s1-turn ran concurrently: $C3"
echo "INFO s1-turn.socket: $(systemctl show -p NConnections,NRefused $P-s1-turn.socket | tr '\n' ' ')"
kill $CA 2>/dev/null; sleep 2
[ "$(systemctl show -p NConnections --value $P-s1-turn.socket)" = 1 ] && ok "P3 NConnections stays 1 after the client died (unit still alive)" || bad "P3 NConnections dropped before the unit died"
runuser -u $P-svc -- systemctl stop "$AINST" && ok "P3 service user may STOP its instance (polkit stop)" || bad "P3 stop of own instance denied"
sleep 1
[ "$(systemctl show -p NConnections --value $P-s1-turn.socket)" = 0 ] && ok "P3 NConnections 0 once the unit is dead" || bad "P3 NConnections not 0 after stop"
runuser -u $P-svc -- systemctl start $P-s1-turn.target 2>/dev/null && bad "P3 service user could START a unit" || ok "P3 service user cannot START any unit"

# --- P4: cross door on one site — the target Conflicts= stops the build BEFORE the turn's ExecStart
conn s1-build 'while :; do date +%s%N > /srv/'$P'/site1/build.tick; sleep 0.2; done' >/dev/null & CB=$!
sleep 3
OUT4=$(conn s1-turn 'n=$(grep -l "build@" /proc/[0-9]*/cgroup 2>/dev/null | wc -l); a=$(cat /srv/'$P'/site1/build.tick); sleep 1.5; b=$(cat /srv/'$P'/site1/build.tick); echo "live-build-procs=$n"; [ "$a" = "$b" ] && echo EXCLUSION_OK || echo EXCLUSION_FAIL')
echo "$OUT4" | sed 's/^/  T> /'
echo "$OUT4" | grep -q 'live-build-procs=0' && echo "$OUT4" | grep -q EXCLUSION_OK && ok "P4 build was dead before the turn started" || bad "P4 build and turn of one site overlapped"
kill $CB 2>/dev/null

# --- P5: daemon death kills live runs (BindsTo)
conn s2-build 'sleep 60' >/dev/null & CD=$!; sleep 2
systemctl kill -s KILL $P-daemon.service; sleep 3
[ -z "$(systemctl list-units --plain --no-legend "$P-s2-build@*.service" --state=active,activating,deactivating)" ] && ok "P5 daemon SIGKILL stopped the live instance" || bad "P5 instance survived the daemon"
kill $CD 2>/dev/null; systemctl start $P-daemon.service

# --- P6: HOME per (site,door): writable to its own run, other door's state masked
OUT6=$(conn s2-build 'touch "$HOME/x" && echo home-writable; ls /var/lib/'$P'/s2/turn 2>&1')
echo "$OUT6" | grep -q home-writable && echo "$OUT6" | grep -q 'No such file' && ok "P6 own HOME writable, turn state invisible to build" || bad "P6 HOME policy: $OUT6"

# --- P7: what PID 1 LOADED (the conformance fixture) + the silently-ignored key
F=/root/$P-show-$VN.txt
{ systemctl show "$P-s1-turn@probe.service" -p User,Group,DynamicUser,KillMode,KillSignal,SendSIGKILL,FinalKillSignal,TasksCurrent,OpenFile,MountImages,ExtensionImages,ExtensionDirectories,BPFProgram,IPIngressFilterPath,IPEgressFilterPath,LogNamespace,SupplementaryGroups,AmbientCapabilities,JoinsNamespaceOf,NetworkNamespacePath,IPCNamespacePath,PAMName,BindReadOnlyPaths,LoadCredential,SetCredential,ImportCredential,EnvironmentFiles,PassEnvironment,RuntimeDirectory,StateDirectory,CacheDirectory,LogsDirectory,ConfigurationDirectory,RootDirectory,RootImage,PrivateUsers,ExecCondition,ExecStartPre,ExecStartPost,ExecReload,ExecStop,ExecStopPost,ExecStartEx,Type,PrivateNetwork,PrivateIPC,PrivatePIDs,ProtectProc,ProtectSystem,ProtectHome,PrivateTmp,PrivateDevices,NoNewPrivileges,RestrictSUIDSGID,LockPersonality,UMask,ReadWritePaths,TemporaryFileSystem,InaccessiblePaths,BindPaths,IPAddressDeny,IPAddressAllow,RestrictAddressFamilies,MemoryMax,CPUQuotaPerSecUSec,TasksMax,RuntimeMaxUSec,TimeoutStopUSec,ExecStart,StandardInput,StandardOutput,StandardError,WorkingDirectory,Environment,BindsTo,After,CollectMode
  echo ---; systemctl show "$P-s1-turn@probe.service" | grep -E '^(KillMode|KillSignal|SendSIGKILL|FinalKillSignal|DynamicUser|Group|SupplementaryGroups|AmbientCapabilities|ExecStartPre|ExecStopPost)=' | sed 's/^/unfiltered: /'
  echo ---; systemctl show $P-s1-turn.socket -p PartOf,ExecStartPre,ExecStartPost,ExecStopPre,ExecStopPost,Accept,MaxConnections,SocketUser,SocketGroup,SocketMode,DirectoryMode,Listen,NConnections,TriggerLimitBurst,TriggerLimitIntervalUSec
  echo ---; systemctl show $P-s1-turn.target -p Conflicts,After,StopWhenUnneeded; } > "$F"
echo "INFO conformance fixture written: $F"
# EVERY property PID 1 prints for the template — what turns the widening DENYLIST into an
# allowlist (every key set is rendered or a known default; SITE_BUILDER_INSTANCES §10 residual 9).
systemctl show --all "$P-s1-turn@probe.service" > "/root/$P-show-all-$VN.txt"
echo "INFO full property dump written: /root/$P-show-all-$VN.txt"
mkdir -p /etc/systemd/system/$P-s2-turn@.service.d
printf '[Service]\nPrivatePIDs=yes\n' > /etc/systemd/system/$P-s2-turn@.service.d/extra.conf; systemctl daemon-reload
echo "INFO PrivatePIDs loaded on $VN: '$(systemctl show -p PrivatePIDs --value "$P-s2-turn@probe.service" 2>&1)' (empty below 257 = silently ignored)"

# --- P8: a connect while the daemon is being stopped cannot cancel the stop (sockets PartOf= it)
# Two live runs that ignore SIGTERM keep the stop in flight for TimeoutStopSec (instances are
# After= the daemon, so they are stopped FIRST, the daemon still running). Then a connect to a
# door with no live run: without PartOf= it would activate an instance whose BindsTo= pulls a
# START of the daemon, which cancels the stop.
systemctl start $P-daemon.service; sleep 1
conn s1-turn 'trap "" TERM; sleep 60' >/dev/null & C81=$!
conn s2-build 'trap "" TERM; sleep 60' >/dev/null & C82=$!
sleep 3
( systemctl stop $P-daemon.service; echo "rc=$?" > /tmp/$P.stop8 ) & S8=$!
sleep 2
LATE=$(conn s1-build 'echo late-run-started' 2>/dev/null)
wait $S8
[ -z "$LATE" ] && ok "P8 a connect during the daemon's stop activated nothing" || bad "P8 a late connect started a run during the stop: $LATE"
grep -q 'rc=0' /tmp/$P.stop8 && [ "$(systemctl is-active $P-daemon.service)" != active ] \
  && ok "P8 the daemon's stop completed with two live runs and a late connect (not cancelled)" || bad "P8 the daemon's stop was cancelled ($(cat /tmp/$P.stop8); $(systemctl is-active $P-daemon.service))"
kill $C81 $C82 2>/dev/null
systemctl start $P-daemon.service; sleep 1
[ "$(systemctl is-active $P-s1-turn.socket)" = active ] && [ "$(systemctl is-active $P-s2-build.socket)" = active ] \
  && ok "P8 starting the daemon brought its sockets back (Wants=)" || bad "P8 the sockets stayed down after the daemon started"

# --- P9: dead means an EMPTY cgroup. A drop-in that skips SIGKILL (conformance refuses one — this
# is the run started before it was dropped in) ends a stop with the unit dead to `ActiveState`,
# MaxConnections released, and its processes running on; confinement.ts asks TasksCurrent
# (cgroupEmpty), and the idle proof finds the unit because PID 1 never collects a populated one.
mkdir -p /etc/systemd/system/$P-s2-turn@.service.d
printf '[Service]\nSendSIGKILL=no\nFinalKillSignal=SIGTERM\nTimeoutStopSec=2\n' > /etc/systemd/system/$P-s2-turn@.service.d/nokill.conf
systemctl daemon-reload
conn s2-turn 'trap "" TERM; sleep 120' >/dev/null & C9=$!
sleep 3
I9=$(systemctl list-units --plain --no-legend "$P-s2-turn@*.service" | awk '{print $1}' | head -1)
systemctl stop "$I9"; sleep 4
S9=$(systemctl show -p LoadState,ActiveState,TasksCurrent "$I9" | tr '\n' ' ')
L9=$(systemctl list-units --all --plain --no-legend "$P-s2-turn@*.service" | awk '{print $1" "$3}' | tr '\n' ' ')
T9=$(systemctl show -p TasksCurrent --value "$I9")
echo "INFO P9 after a stop without SIGKILL: $S9; listed: $L9; s2-turn NConnections=$(systemctl show -p NConnections --value $P-s2-turn.socket)"
echo "$S9" | grep -Eq 'ActiveState=(failed|inactive)' && [ -n "$T9" ] && [ "$T9" != 0 ] && [ "$T9" != "[not set]" ] && echo "$L9" | grep -q "$I9" \
  && ok "P9 a stop that skips SIGKILL: the unit reads dead with TasksCurrent=$T9, and list-units --all still lists it" \
  || bad "P9 the survivor's shape differs from what the death proof assumes: $S9 / listed: $L9"
systemctl kill -s KILL "$I9" 2>/dev/null; sleep 2
T9b=$(systemctl show -p TasksCurrent --value "$I9" 2>/dev/null)
{ [ -z "$T9b" ] || [ "$T9b" = 0 ] || [ "$T9b" = "[not set]" ]; } && ok "P9 once killed the cgroup reads empty (TasksCurrent '${T9b:-unit gone}')" || bad "P9 TasksCurrent after the kill reads '$T9b'"
kill $C9 2>/dev/null
rm -f /etc/systemd/system/$P-s2-turn@.service.d/nokill.conf; systemctl daemon-reload; systemctl reset-failed "$P-"'*' 2>/dev/null

# --- P10: the INSTANCE CLAIM's premise (src/drivers/confinement.ts daemonClaimProblem). The daemon unit is
# Type=simple, ExecStart=<pinned bun> run <entry> (src/provision/render/unit.ts), and the claim refuses the
# boot unless PID 1's MainPID for it equals the daemon's own process.pid — measured here on that shape.
# No bun on the host is a FAIL, never a skip: the premise would stay unmeasured.
BUN=${BUN:-$(command -v bun)}
if [ -z "$BUN" ] || [ ! -x "$BUN" ]; then
  bad "P10 no bun binary (run with BUN=<the pinned bun>): the claim's MainPID premise is unmeasured"
else
  cat > /usr/local/lib/$P/claim.ts <<'EOF'
require('node:fs').writeFileSync(process.argv[2], String(process.pid));
setInterval(() => {}, 1 << 30);
EOF
  chmod 0644 /usr/local/lib/$P/claim.ts
  cat > /etc/systemd/system/$P-claim.service <<EOF
[Service]
Type=simple
User=$P-svc
WorkingDirectory=/usr/local/lib/$P
ExecStart=$BUN run /usr/local/lib/$P/claim.ts /srv/$P/claim.pid
EOF
  systemctl daemon-reload; rm -f /srv/$P/claim.pid
  systemctl start $P-claim.service
  for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s /srv/$P/claim.pid ] && break; sleep 1; done
  M10=$(systemctl show -p MainPID --value $P-claim.service); O10=$(cat /srv/$P/claim.pid 2>/dev/null)
  [ -n "$O10" ] && [ "$M10" = "$O10" ] \
    && ok "P10 Type=simple '<bun> run <entry>': MainPID $M10 IS the daemon's process.pid (the claim's premise)" \
    || bad "P10 MainPID '$M10' != the daemon's process.pid '$O10': every boot would refuse its claim"
  systemctl stop $P-claim.service
  M10b=$(systemctl show -p MainPID --value $P-claim.service)
  [ "$M10b" = 0 ] && ok "P10 a stopped daemon unit reads MainPID 0 (the claim refuses it)" || bad "P10 a stopped daemon unit reads MainPID '$M10b'"
fi

kill $E1 $E2 2>/dev/null
[ $fail = 0 ] && echo "LEAD-1b PROBE: ALL PASS on systemd $V" || echo "LEAD-1b PROBE: FAILURES on systemd $V"
