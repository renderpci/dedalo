#!/usr/bin/env bash
# COLUMN-COVERAGE v6↔v7 test: diffuse MANY section_ids so every column is exercised
# on a section where its source is populated, then classify each column OK / MISMATCH
# / UNTESTED. A table is only truly verified when no column is UNTESTED.
#
#   bash column_coverage.sh <element> <section_tipo> [N] [--ids=1,2,3] [--tables=t] [--show-untested]
#
# N (default 25) = how many section_ids to sample (more = better column coverage).
set -uo pipefail

V6_ROOT="/Users/render/Desktop/trabajos/dedalo/v6/master_dedalo"
V7_ROOT="/Users/render/Desktop/trabajos/dedalo/v7/master_dedalo"
HELPERS="$V7_ROOT/diffusion/migration/helpers"
ENGINE="$V7_ROOT/diffusion/api/v1"

ELEMENT="${1:-numisdata29}"
SECTION_TIPO="${2:-numisdata3}"
N="${3:-25}"
IDS=""
PASS_ARGS=""
for a in "$@"; do
  case "$a" in
    --ids=*) IDS="${a#--ids=}" ;;
    --tables=*|--show-untested) PASS_ARGS="$PASS_ARGS $a" ;;
  esac
done

# --- pick section_ids with data, SPREAD across the full id range (regular → matrix,
#     thesaurus → matrix_hierarchy) so optional/sparse columns get a populated sample ---
if [ -z "$IDS" ]; then
  IDS=$(psql -U render -h /tmp -d dedalo_mib_v7 -t -A -c \
    "WITH src AS ( \
       SELECT section_id FROM matrix WHERE section_tipo='$SECTION_TIPO' \
       UNION SELECT section_id FROM matrix_hierarchy WHERE section_tipo='$SECTION_TIPO' ), \
     ranked AS ( SELECT section_id, row_number() OVER (ORDER BY section_id) rn, \
                        count(*) OVER () tot FROM src ) \
     SELECT section_id FROM ranked \
     WHERE rn % GREATEST(1, (tot / $N)::int) = 0 ORDER BY section_id LIMIT $N" 2>/dev/null | paste -sd, -)
fi
if [ -z "$IDS" ]; then echo "No section_ids with data for $SECTION_TIPO"; exit 2; fi
echo "Sampling section_ids: $IDS"

echo "──────────── v6 reference (accumulating) ────────────"
( cd "$V6_ROOT" && php "$HELPERS/coverage_v6.php" "$ELEMENT" "$SECTION_TIPO" "$IDS" ) || { echo "v6 failed"; exit 2; }

echo "──────────── v7 result (accumulating) ────────────"
first=1
IFS=',' read -ra ID_ARR <<< "$IDS"
for id in "${ID_ARR[@]}"; do
  if [ "$first" = "1" ]; then
    ( cd "$V7_ROOT" && php "$HELPERS/build_v7_dump.php" "$ELEMENT" "$SECTION_TIPO" "$id" >/dev/null 2>&1 )
    first=0
  else
    ( cd "$V7_ROOT" && HARNESS_NO_REFRESH=1 php "$HELPERS/build_v7_dump.php" "$ELEMENT" "$SECTION_TIPO" "$id" >/dev/null 2>&1 )
  fi
  ( cd "$ENGINE" && bun run_v7_processor.ts >/dev/null 2>&1 ) || echo "  bun warn id=$id"
done
( cd "$V7_ROOT" && php "$HELPERS/dump_scratch_v7.php" "$HELPERS/v7_cov.json" ) || { echo "v7 dump failed"; exit 2; }

echo "──────────── column coverage ────────────"
php "$HELPERS/coverage_compare.php" "$HELPERS/v6_cov.json" "$HELPERS/v7_cov.json" "--ids=$IDS" $PASS_ARGS
