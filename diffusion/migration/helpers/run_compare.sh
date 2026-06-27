#!/usr/bin/env bash
# One-command v6↔v7 diffusion comparison for a single record.
#
#   bash run_compare.sh <element> <section_tipo> <section_id> [--tables=mints]
#
# Pipeline:
#   1. v6: refresh scratch → diffusion_sql::update_record → dump  → v6_result.json
#   2. v7: build datum dump → refresh scratch → bun processor → dump → v7_result.json
#   3. compare the snapshots (excludes volatile cols id, dd_tm)
#
# Requires one-time setup: bash setup_scratch_db.sh
set -uo pipefail

V6_ROOT="/Users/render/Desktop/trabajos/dedalo/v6/master_dedalo"
V7_ROOT="/Users/render/Desktop/trabajos/dedalo/v7/master_dedalo"
HELPERS="$V7_ROOT/diffusion/migration/helpers"
ENGINE="$V7_ROOT/diffusion/api/v1"

ELEMENT="${1:-numisdata29}"
SECTION_TIPO="${2:-numisdata6}"
SECTION_ID="${3:-2}"
TABLES_ARG=""
for a in "$@"; do
  case "$a" in --tables=*) TABLES_ARG="$a" ;; esac
done

echo "──────────── v6 reference ────────────"
( cd "$V6_ROOT" && php "$HELPERS/run_v6_diffusion.php" "$ELEMENT" "$SECTION_TIPO" "$SECTION_ID" ) || { echo "v6 run failed"; exit 2; }

echo "──────────── v7 dump (PHP) ────────────"
( cd "$V7_ROOT" && php "$HELPERS/build_v7_dump.php" "$ELEMENT" "$SECTION_TIPO" "$SECTION_ID" ) || { echo "v7 dump failed"; exit 2; }

echo "──────────── v7 process (Bun) ────────────"
( cd "$ENGINE" && bun run_v7_processor.ts ) || { echo "bun processor failed"; exit 2; }

echo "──────────── v7 snapshot (PHP) ────────────"
( cd "$V7_ROOT" && php "$HELPERS/dump_scratch_v7.php" ) || { echo "v7 dump failed"; exit 2; }

echo "──────────── compare ────────────"
php "$HELPERS/compare_tables.php" "$HELPERS/v6_result.json" "$HELPERS/v7_result.json" $TABLES_ARG
