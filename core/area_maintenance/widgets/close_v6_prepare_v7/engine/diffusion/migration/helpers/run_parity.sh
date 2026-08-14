#!/usr/bin/env bash
#
# ONE-COMMAND v6↔v7 DIFFUSION PUBLICATION PARITY LOOP  (mht "Madres e hijas").
#
#   bash run_mht_parity.sh [--migrate] [--sections=a,b]
#                          [--normalize=media,json,numeric,ws] [--examples=5] [--quiet]
#
#   --migrate   run migrate_diffusion_properties.php first (rewrites dd_ontology.properties
#               from the frozen v6 propiedades). Omit to re-compare without re-migrating.
#
# THERE IS NO --limit-per-section. A per-record limit could not be made symmetric across the
# frontier-hop resolver, and an asymmetric limit produces a huge bogus diff that hides every real
# finding. A restricted smoke run is --sections=rt1 (3 records), applied to BOTH sides.
#
# Safe to re-run. Every artifact lands in a fresh helpers/out/<timestamp>/ directory and a
# `latest` symlink is repointed at it — a previous run is never clobbered.
#
# ─────────────────────────────────────────────────────────────────────────────
# WHY v6 RUNS FIRST
#   diffusion::get_publication_unix_timestamp() is a function-static memo: it calls time() once
#   per process and there is NO injection point. It can therefore only be pinned by letting the
#   v6 PUBLISH process choose it and reporting the value it actually used. So v6 publishes first,
#   its run_info records the run_started_at it really used, and we hand that value to v7 via
#   --run-started-at. (An earlier "print the timestamp, then publish" step was useless: the real
#   publish process memoised a fresh time() of its own, so the four mht nodes carrying
#   process_dato='diffusion::get_publication_unix_timestamp' — actv104, rsc712, rsc1209,
#   hierarchy78 — differed on EVERY row.)
#
#   v6 FIRST IS SAFE. The v6 pass does write 4 publication components back into its source
#   Postgres, but that source is dedalo_v6_mht while v7 reads dedalo_v7_mht. They are DIFFERENT
#   DATABASES, so the v6 write-back cannot contaminate the v7 read. (An earlier version of this
#   script ran v7 first for exactly that non-existent reason.)
#
# WHY THE HARNESS DB IS REFRESHED BEFORE *EVERY* PASS, NOT ONLY BETWEEN THEM
#   Neither publisher truncates — v7 does idempotent upserts keyed by (section_id,lang), v6
#   creates a table only when it writes its first row. A leftover table set from a PREVIOUS run is
#   therefore indistinguishable from freshly published rows, and a pass that publishes NOTHING
#   would be dumped as the previous run's output and read back as PARITY. Every dump is also
#   asserted non-empty before the comparison is allowed to proceed.
#
# WHY THE PRECONDITIONS EXIST (each is individually fatal, all checked BEFORE the first DROP)
#   · MariaDB / HARNESS_DB    — a missing database turns the whole loop into an empty MATCH.
#   · no live bun src/server.ts — the PHP migration writes dd_ontology OUT OF PROCESS, so a
#     running server keeps a stale in-memory planCache (src/diffusion/plan/cache.ts) and stale
#     ontology caches that nothing invalidates. It would publish the PREVIOUS grammar and the
#     comparison would be a lie. Stop the server before running this.
#   · both Postgres DBs       — v6 reads dedalo_v6_mht, v7 reads dedalo_v7_mht.
#   · v6 element target DB    — v6 has NO write redirection (the diffusion_sql::$database_name
#     override is commented out); it writes wherever the ontology says. If that is not
#     HARNESS_DB the run would publish into a real database.
#
# LANGUAGE RECONCILIATION
#   v6's DEDALO_DIFFUSION_LANGS resolves to DEDALO_PROJECTS_DEFAULT_LANGS (12 langs); v7's
#   ../private/.env declares 4. Different lang sets mean different row counts, i.e. a
#   guaranteed false divergence. We export the v6 list into the v7 process environment —
#   v7's readEnv gives the process environment precedence over ../private/.env.
#
set -uo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG (all overridable from the environment)
# ─────────────────────────────────────────────────────────────────────────────

V6_ROOT="${V6_ROOT:-/Users/render/Desktop/trabajos/dedalo/v6/master_dedalo}"
V7_ROOT="${V7_ROOT:-/Users/render/Desktop/trabajos/dedalo/v7/master_dedalo}"

HELPERS="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MIGRATE="$HELPERS/../migrate_diffusion_properties.php"

ELEMENT="${ELEMENT:-mht2}"
export HARNESS_DB="${HARNESS_DB:-web_madres_e_hijas}"

PG_V6_DB="${PG_V6_DB:-dedalo_v6_mht}"
PG_V7_DB="${PG_V7_DB:-dedalo_v7_mht}"
PG_HOST="${PG_HOST:-/tmp}"
PG_USER="${PG_USER:-render}"
export PGPASSWORD="${PGPASSWORD:-123123aS}"

# The default psql/pg_dump client on this machine is 17 and REFUSES to talk to the 18.4
# server; the postgresql@18 keg must be used explicitly.
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@18/bin}"
PSQL="$PG_BIN/psql"
PG_DUMP="$PG_BIN/pg_dump"

MYSQL_BIN="${MYSQL_BIN:-mysql}"
MYSQL_USER="${MYSQL_USER:-render_dev}"
MYSQL_PASS="${MYSQL_PASS:-capicua}"
MYSQL_SOCKET="${MYSQL_SOCKET:-/tmp/mysql.sock}"

# The v7 whole-element publisher (owned by the v7 side of this work). This exact path is the
# canonical contract; scripts/run_v7_diffusion_full.ts does not and will not exist.
V7_PUBLISH="${V7_PUBLISH:-scripts/diffusion_harness_publish.ts}"

PHP="${PHP:-php}"
BUN="${BUN:-bun}"

# ─────────────────────────────────────────────────────────────────────────────
# ARGS
# ─────────────────────────────────────────────────────────────────────────────

DO_MIGRATE=0
YES_DROP=0
SECTIONS_ARG=""
SECTIONS_CSV=""
# MEDIA IS NORMALISED BY DEFAULT. v6 and v7 serve media from DIFFERENT LOCATIONS
# (/dedalo/media_mib vs /dedalo/media on this install), so the URL PREFIX differs on every media
# column while the filename half is identical. That is a deployment fact, not a migration defect.
# The normaliser rewrites only the prefix and reports those columns as NORMALIZED(media) — they
# stay visible in the report, they are never folded into a plain MATCH. Override with
# --normalize=... (or --normalize= to compare raw).
NORMALIZE_ARG="--normalize=media"
EXAMPLES_ARG=""
QUIET_ARG=""

for a in "$@"; do
  case "$a" in
    --migrate)              DO_MIGRATE=1 ;;
    --yes-drop)             YES_DROP=1 ;;
    --sections=*)           SECTIONS_ARG="$a"; SECTIONS_CSV="${a#--sections=}" ;;
    --normalize=*)          NORMALIZE_ARG="$a" ;;
    --examples=*)           EXAMPLES_ARG="$a" ;;
    --quiet)                QUIET_ARG="--quiet" ;;
    --limit-per-section=*)
      echo "run_mht_parity: --limit-per-section is REMOVED." >&2
      echo "  A per-record limit cannot be made symmetric across the v7 frontier-hop resolver," >&2
      echo "  and an asymmetric limit produces a huge bogus diff that hides every real finding." >&2
      echo "  Use --sections=rt1 instead: it restricts BOTH sides identically." >&2
      exit 2 ;;
    *) echo "run_mht_parity: unknown option '$a'" >&2; exit 2 ;;
  esac
done

# The v7 publisher takes one --section per tipo (it also accepts --sections=a,b); build the
# repeated-flag form from the same csv the v6 side gets, so the two sides cannot drift.
V7_SECTION_FLAGS=()
if [ -n "$SECTIONS_CSV" ]; then
  IFS=',' read -r -a _v7_sections <<< "$SECTIONS_CSV"
  for s in "${_v7_sections[@]}"; do
    s="${s// /}"
    [ -n "$s" ] && V7_SECTION_FLAGS+=(--section "$s")
  done
fi

step() { printf '\n──────────── %s ────────────\n' "$1"; }
fatal() { printf '\nPRECONDITION FAILED [%s]\n  %s\n' "$1" "$2" >&2; exit 2; }
die()   { printf '\nFAILED [%s]\n  %s\n' "$1" "$2" >&2; exit 3; }

# ─────────────────────────────────────────────────────────────────────────────
# PRECONDITIONS — all of them, individually named, BEFORE the first DROP TABLE
# ─────────────────────────────────────────────────────────────────────────────

step "preconditions"

# 1. tooling present
command -v "$PHP" >/dev/null 2>&1 || fatal 'php'  "php not found on PATH (set PHP=…)"
command -v "$BUN" >/dev/null 2>&1 || fatal 'bun'  "bun not found on PATH (set BUN=…)"
[ -x "$PSQL" ]                    || fatal 'psql' "postgres 18 client not found at $PSQL. The default client is 17 and refuses to talk to the 18.4 server (set PG_BIN=…)"
[ -x "$PG_DUMP" ]                 || fatal 'pg_dump' "pg_dump not found at $PG_DUMP (set PG_BIN=…)"
echo "  ok  tooling: php, bun, $PSQL"

# 2. helper scripts present
for f in "$HELPERS/run_v6_diffusion_full.php" "$HELPERS/harness_dump_db.php" \
         "$HELPERS/harness_refresh_only.php" "$HELPERS/compare_publication.php"; do
  [ -f "$f" ] || fatal 'helpers' "missing helper: $f"
done
[ -f "$V7_ROOT/$V7_PUBLISH" ] || fatal 'v7-publisher' \
  "v7 whole-element publisher not found: $V7_ROOT/$V7_PUBLISH (set V7_PUBLISH=…)"
echo "  ok  helpers + v7 publisher present"

# 3. MariaDB reachable AND HARNESS_DB exists
MYSQL_ARGS=(-u"$MYSQL_USER" -p"$MYSQL_PASS" --socket="$MYSQL_SOCKET" -N -B)
"$MYSQL_BIN" "${MYSQL_ARGS[@]}" -e 'SELECT 1' >/dev/null 2>&1 \
  || fatal 'mariadb' "cannot connect to MariaDB as $MYSQL_USER via $MYSQL_SOCKET"
db_found=$("$MYSQL_BIN" "${MYSQL_ARGS[@]}" \
  -e "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$HARNESS_DB'" 2>/dev/null)
[ "$db_found" = "$HARNESS_DB" ] \
  || fatal 'harness-db' "MariaDB database '$HARNESS_DB' does not exist (create it, or set HARNESS_DB=…)"
echo "  ok  MariaDB reachable, database '$HARNESS_DB' exists"

# 4. NO live bun src/server.ts — ONLY when this run migrates.
#    A running server holds an in-memory planCache + ontology caches that no out-of-process PHP
#    write to dd_ontology invalidates. That only matters if we are about to make such a write:
#    the publisher below is a FRESH bun process whose own planCache starts empty, so without
#    --migrate a live server cannot influence the publication at all. Refusing anyway would just
#    push the operator into killing an unrelated dev server.
live_server=$(pgrep -f 'bun .*src/server\.ts' 2>/dev/null | tr '\n' ' ')
if [ -n "${live_server// /}" ] && [ "$DO_MIGRATE" -eq 1 ]; then
  fatal 'live-bun-server' \
"a 'bun … src/server.ts' process is running (pid(s): ${live_server%% }) and this run uses --migrate.
  Its in-memory planCache (src/diffusion/plan/cache.ts) and ontology caches go stale the moment
  the PHP migration writes dd_ontology, and nothing invalidates them — the publication would use
  the PREVIOUS grammar. Stop the server, then re-run."
fi
if [ -n "${live_server// /}" ]; then
  echo "  ok  live bun src/server.ts (pid(s): ${live_server%% }) — harmless without --migrate"
else
  echo "  ok  no live bun src/server.ts process"
fi

# 5. both Postgres databases reachable
"$PSQL" -h "$PG_HOST" -U "$PG_USER" -d "$PG_V6_DB" -tAc 'SELECT 1' >/dev/null 2>&1 \
  || fatal 'postgres-v6' "cannot connect to Postgres '$PG_V6_DB' at $PG_HOST as $PG_USER"
"$PSQL" -h "$PG_HOST" -U "$PG_USER" -d "$PG_V7_DB" -tAc 'SELECT 1' >/dev/null 2>&1 \
  || fatal 'postgres-v7' "cannot connect to Postgres '$PG_V7_DB' at $PG_HOST as $PG_USER"
echo "  ok  Postgres reachable: $PG_V6_DB, $PG_V7_DB"

# 6. the v6 element's target database equals HARNESS_DB
#    v6 has NO runtime write redirection: it writes wherever the ontology says.
check_out=$( cd "$V6_ROOT" && "$PHP" "$HELPERS/run_v6_diffusion_full.php" "$ELEMENT" --check-only 2>&1 )
check_rc=$?
if [ $check_rc -ne 0 ]; then
  fatal 'element-target-db' "$check_out"
fi
echo "  ok  ${check_out}"

# ─────────────────────────────────────────────────────────────────────────────
# ARTIFACT DIRECTORY (never clobber a previous run)
# ─────────────────────────────────────────────────────────────────────────────

RUN_DIR="$HELPERS/out/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RUN_DIR" || die 'artifacts' "cannot create $RUN_DIR"
ln -sfn "$RUN_DIR" "$HELPERS/out/latest"
echo "  ok  artifacts: $RUN_DIR (helpers/out/latest)"

LOG="$RUN_DIR/run.log"
exec > >(tee -a "$LOG") 2>&1

# ─────────────────────────────────────────────────────────────────────────────
# 1. OPTIONAL: MIGRATE THE DIFFUSION ONTOLOGY
# ─────────────────────────────────────────────────────────────────────────────

if [ "$DO_MIGRATE" -eq 1 ]; then
  step "migrate dd_ontology.propiedades → properties"
  [ -f "$MIGRATE" ] || die 'migrate' "migration script not found: $MIGRATE"
  ( cd "$V6_ROOT" && "$PHP" "$MIGRATE" ) || die 'migrate' "migrate_diffusion_properties.php failed"
else
  step "migrate (skipped — pass --migrate to re-run it)"
fi


# ─────────────────────────────────────────────────────────────────────────────
# SHARED STEPS
# ─────────────────────────────────────────────────────────────────────────────

# Drop every table in the harness DB. Run BEFORE EVERY PASS (C5), not only between them:
# neither publisher truncates, so leftovers from a previous run masquerade as this run's output.
refresh_harness() {
  local why="$1"
  ( cd "$V6_ROOT" && "$PHP" "$HELPERS/harness_refresh_only.php" ) \
    || die 'refresh' "could not drop tables in $HARNESS_DB (before the $why pass)"
}

# HARNESS_DB is, by the v6 safety belt's own construction, the element's REAL publication
# database — the belt refuses any other value, because neither engine has a runtime redirect.
# So the first refresh_harness of a run destroys real published data. Gate it here, where the
# operator actually types the command, rather than only inside the v6 publisher.
assert_drop_authorised() {
  local inventory tables rows
  inventory=$( cd "$V6_ROOT" && "$PHP" "$HELPERS/harness_refresh_only.php" --count-only ) \
    || die 'drop-gate' "could not inventory $HARNESS_DB"
  tables="${inventory%% *}"
  rows="${inventory##* }"
  if [ "${tables:-0}" -eq 0 ]; then
    return 0   # nothing to lose
  fi
  if [ "$YES_DROP" -eq 1 ]; then
    echo "  --yes-drop: dropping $tables table(s) / $rows row(s) in $HARNESS_DB"
    return 0
  fi
  echo "REFUSING TO RUN." >&2
  echo "  harness database : $HARNESS_DB" >&2
  echo "  it currently holds: $tables table(s), $rows row(s)" >&2
  echo "  This run would DROP all of them, twice (once before each pass)." >&2
  echo "  HARNESS_DB is the element's real publication database by construction — there is no" >&2
  echo "  runtime redirect on either engine — so this is real published data." >&2
  echo "  Re-run with --yes-drop if that is what you intend." >&2
  exit 2
}

# A dump that carries no rows means the pass published NOTHING. Comparing two such dumps is
# how a no-op pass gets reported as PARITY, so refuse before the comparison can ever see it.
assert_snapshot_non_empty() {
  local file="$1" label="$2"
  local counts tables rows
  counts=$( "$PHP" -r '
    $d = json_decode((string)file_get_contents($argv[1]), true);
    if (!is_array($d)) { fwrite(STDERR, "unreadable"); exit(1); }
    $rows = 0;
    foreach ($d as $t) { $rows += is_array($t) ? count($t) : 0; }
    echo count($d), " ", $rows;
  ' "$file" ) || die "$label" "cannot read the $label snapshot: $file"
  tables="${counts%% *}"
  rows="${counts##* }"
  echo "  $label snapshot: $tables table(s), $rows row(s)"
  if [ "$rows" -lt 1 ]; then
    die "$label" \
"the $label snapshot ($file) carries ZERO rows in $tables table(s).
  The $label pass published nothing. An empty snapshot compared against another empty snapshot
  reports PARITY while proving absolutely nothing, so the run stops here."
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# 2. THE v6 ENVIRONMENT THE v7 PASS MUST BE RECONCILED TO (mutates nothing)
# ─────────────────────────────────────────────────────────────────────────────

step "read v6 run environment"

# NOTE: the publication timestamp is NOT read here. get_publication_unix_timestamp() memoises
# time() per process, so any value printed by this read-only process would not be the value the
# real v6 publish uses. It is harvested from the v6 run_info after the v6 pass instead.
V6_ENV_JSON=$( cd "$V6_ROOT" && "$PHP" "$HELPERS/run_v6_diffusion_full.php" "$ELEMENT" --print-env-only ) \
  || die 'pin-env' "could not read the v6 diffusion environment"
echo "$V6_ENV_JSON" > "$RUN_DIR/v6_env.json"

V6_LANGS=$( "$PHP" -r '$j=json_decode(stream_get_contents(STDIN),true); echo implode(",", $j["langs"] ?? []);' <<< "$V6_ENV_JSON" )
V6_MEDIA_URL=$( "$PHP" -r '$j=json_decode(stream_get_contents(STDIN),true); echo (string)($j["media_url"] ?? "");' <<< "$V6_ENV_JSON" )
V6_RESOLVE_LEVELS=$( "$PHP" -r '$j=json_decode(stream_get_contents(STDIN),true); echo (int)($j["resolve_levels"] ?? 0);' <<< "$V6_ENV_JSON" )

[ -n "$V6_LANGS" ] || die 'pin-env' "v6 DEDALO_DIFFUSION_LANGS resolved to an empty list"
[ "$V6_RESOLVE_LEVELS" -gt 0 ] 2>/dev/null \
  || die 'pin-env' "v6 resolve_levels resolved to '$V6_RESOLVE_LEVELS' — the frontier depth cannot be pinned"

echo "  langs (v6)     : $V6_LANGS"
echo "  media_url (v6) : $V6_MEDIA_URL"
echo "  levels (v6)    : $V6_RESOLVE_LEVELS"

# ─────────────────────────────────────────────────────────────────────────────
# 3. v6 PASS  (FIRST — it is the side that CHOOSES the publication timestamp)
# ─────────────────────────────────────────────────────────────────────────────

step "authorise the harness-db drop"
assert_drop_authorised

step "refresh harness db (before the v6 pass)"
refresh_harness 'v6'

step "v6 publish (php)"
( cd "$V6_ROOT" && "$PHP" "$HELPERS/run_v6_diffusion_full.php" "$ELEMENT" \
    --yes-drop \
    --out="$RUN_DIR/v6_rows.json" \
    --run-info="$RUN_DIR/v6_run_info.json" \
    ${SECTIONS_ARG:+$SECTIONS_ARG} \
)
V6_RC=$?
if [ $V6_RC -eq 2 ]; then
  die 'v6-publish' "the v6 publisher refused to run (exit 2) — see the message above"
fi

V6_ERRORS=$( "$PHP" -r '
  $j = json_decode((string)file_get_contents($argv[1]), true);
  echo (int)($j["errors_count"] ?? -1);
' "$RUN_DIR/v6_run_info.json" 2>/dev/null )
V6_ERRORS="${V6_ERRORS:--1}"

if [ $V6_RC -ne 0 ]; then
  echo "  (!) the v6 pass reported $V6_ERRORS error(s) (exit $V6_RC)."
  echo "      The comparison still runs — a partial v6 side is itself a finding — but this"
  echo "      exit code is FOLDED INTO the final one, never discarded."
fi

step "dump v6"
( cd "$V6_ROOT" && "$PHP" "$HELPERS/harness_dump_db.php" --schema --out="$RUN_DIR/v6_schema.json" ) \
  || die 'v6-dump' "schema dump failed"
assert_snapshot_non_empty "$RUN_DIR/v6_rows.json" 'v6'

# The value the v6 publish PROCESS actually memoised. This is the only way to pin it: it is a
# function-static memo on time() with no injection point.
RUN_STARTED_AT=$( "$PHP" -r '
  $j = json_decode((string)file_get_contents($argv[1]), true);
  echo (string)($j["run_started_at"] ?? "");
' "$RUN_DIR/v6_run_info.json" )
RUN_STARTED_AT="${RUN_STARTED_AT//[$'\t\r\n ']}"
[ -n "$RUN_STARTED_AT" ] \
  || die 'pin-timestamp' "the v6 run info carries no run_started_at: $RUN_DIR/v6_run_info.json"
echo "  run_started_at (as used by the v6 publish): $RUN_STARTED_AT"

# ─────────────────────────────────────────────────────────────────────────────
# 4. v7 PASS
# ─────────────────────────────────────────────────────────────────────────────
#
# v6 writing Postgres dedalo_v6_mht CANNOT contaminate v7 reading dedalo_v7_mht — they are
# DIFFERENT DATABASES. That is why v6-first is safe.

step "refresh harness db (before the v7 pass)"
refresh_harness 'v7'

step "v7 publish (bun)"

# process env wins over ../private/.env in v7's readEnv, so this is how the two lang sets
# are reconciled without editing any .env file.
( cd "$V7_ROOT" && \
  DEDALO_DIFFUSION_LANGS="$V6_LANGS" \
  HARNESS_DB="$HARNESS_DB" \
  "$BUN" "$V7_PUBLISH" \
    --element "$ELEMENT" \
    --database "$HARNESS_DB" \
    --run-started-at "$RUN_STARTED_AT" \
    --max-levels "$V6_RESOLVE_LEVELS" \
    --run-info "$RUN_DIR/v7_run_info.json" \
    ${V7_SECTION_FLAGS[@]+"${V7_SECTION_FLAGS[@]}"} \
)
V7_RC=$?

# The publisher contains errors PER SECTION and then exits non-zero if any section failed.
# Treating that as fatal here would throw away the other thirteen tables — which is exactly what
# the containment exists to prevent. So: warn, carry on to the comparison, and fold the code into
# the final exit, the same treatment the v6 side gets. A pass that published NOTHING is still
# caught, by assert_snapshot_non_empty below and by the comparator's NOTHING COMPARED gate.
if [ $V7_RC -ne 0 ]; then
  echo "  (!) the v7 pass reported at least one FAILED SECTION (exit $V7_RC)."
  echo "      Its table holds a PARTIAL publication and will show up as a real divergence."
  echo "      Search 'SECTION FAILED' above. This exit code is FOLDED INTO the final one."
fi

step "dump v7"
( cd "$V6_ROOT" && "$PHP" "$HELPERS/harness_dump_db.php" --out="$RUN_DIR/v7_rows.json" ) \
  || die 'v7-dump' "row dump failed"
( cd "$V6_ROOT" && "$PHP" "$HELPERS/harness_dump_db.php" --schema --out="$RUN_DIR/v7_schema.json" ) \
  || die 'v7-dump' "schema dump failed"
assert_snapshot_non_empty "$RUN_DIR/v7_rows.json" 'v7'

# ─────────────────────────────────────────────────────────────────────────────
# 5. COMPARE
# ─────────────────────────────────────────────────────────────────────────────

step "compare"
"$PHP" "$HELPERS/compare_publication.php" \
  "$RUN_DIR/v6_rows.json" "$RUN_DIR/v7_rows.json" \
  --schema6="$RUN_DIR/v6_schema.json" \
  --schema7="$RUN_DIR/v7_schema.json" \
  --run-info6="$RUN_DIR/v6_run_info.json" \
  --run-info7="$RUN_DIR/v7_run_info.json" \
  --json="$RUN_DIR/report.json" \
  ${NORMALIZE_ARG:+$NORMALIZE_ARG} \
  ${EXAMPLES_ARG:+$EXAMPLES_ARG} \
  ${QUIET_ARG:+$QUIET_ARG}
CMP_RC=$?

# ─────────────────────────────────────────────────────────────────────────────
# 6. FINAL EXIT CODE — the v6 publisher's result is FOLDED IN, never discarded.
#    A v6 pass in which every record failed must not be able to exit 0 just because the
#    comparator found the (equally empty) two sides consistent.
# ─────────────────────────────────────────────────────────────────────────────

step "summary"
echo "  v6 publish  : exit $V6_RC ($V6_ERRORS error(s) in v6_run_info.json)"
echo "  v7 publish  : exit ${V7_RC:-0} (per-section containment; see 'SECTION FAILED' above)"
echo "  comparison  : exit $CMP_RC"

FINAL_RC=$CMP_RC
if [ $V6_RC -ne 0 ] && [ $FINAL_RC -eq 0 ]; then
  FINAL_RC=$V6_RC
fi
if [ ${V7_RC:-0} -ne 0 ] && [ $FINAL_RC -eq 0 ]; then
  FINAL_RC=$V7_RC
fi

printf '\nartifacts: %s\n' "$RUN_DIR"
printf 'latest   : %s\n' "$HELPERS/out/latest"
echo "exit     : $FINAL_RC"
exit $FINAL_RC
