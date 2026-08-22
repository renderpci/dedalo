#!/usr/bin/env bash
#
# verify_package.sh — check that this migration package is complete and self-contained.
#
# The package ships its OWN engine and is expected to run from a plain v6 checkout: no
# build step, no snapshot to regenerate, no reference to any other repository. This script
# proves that, and is the replacement for the old build_package.sh (which rebuilt engine/
# from a separate v7 repo and therefore made the package depend on it).
#
# Usage:  close_v6_prepare_v7/verify_package.sh
# Exit:   0 = self-contained and complete · 1 = something is missing or leaking
#
set -uo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fail=0

say()  { printf '%-58s %s\n' "$1" "$2"; }
ok()   { say "$1" "OK"; }
bad()  { say "$1" "FAIL — $2"; fail=1; }

echo "Package: $PKG_DIR"
echo

# 1. the parts that must be present
for path in \
	engine/config/bootstrap.php \
	engine/core/base/class.loader.php \
	engine/core/base/update/updates.php \
	engine/core/base/upgrade/class.v6_to_v7.php \
	engine/core/base/upgrade/class.v6_to_v7_normalize.php \
	run/lib/verify_geolocation_studio_default.php \
	engine/diffusion/migration/migrate_diffusion_properties.php \
	engine/install/db/matrix_string_search.sql \
	engine/install/db/matrix_relation_index.sql \
	engine/install/db/matrix_activity_diffusion.sql \
	run/run_prepare_v7.php \
	run/phase1_backup_pre_update.php \
	run/phase2_update.php \
	run/phase3_diffusion.php \
	run/lib/engine_boot.php \
	widget/prepare_v7/class.prepare_v7.php \
	widget/prepare_v7/js/prepare_v7.js
do
	[ -f "$PKG_DIR/$path" ] && ok "present: $path" || bad "present: $path" "missing"
done

# 2. every eager include in the bundled loader must resolve inside the package
missing_includes=$(
	php -r '
		$engine = $argv[1] . "/engine";
		$map = [
			"DEDALO_CORE_PATH"      => $engine . "/core",
			"DEDALO_TOOLS_PATH"     => $engine . "/tools",
			"DEDALO_SHARED_PATH"    => $engine . "/shared",
			"DEDALO_DIFFUSION_PATH" => $engine . "/diffusion",
			"DEDALO_LIB_PATH"       => $engine . "/lib",
			"DEDALO_ROOT_PATH"      => $engine,
		];
		$src = (string) @file_get_contents($engine . "/core/base/class.loader.php");
		preg_match_all("/^\s*(include|include_once|require|require_once)\s+([A-Z_]+)\s*\.\s*\x27([^\x27]+)\x27\s*;/m", $src, $m, PREG_SET_ORDER);
		$missing = 0;
		foreach ($m as $hit) {
			if (!isset($map[$hit[2]])) { continue; }
			if (!is_file($map[$hit[2]] . $hit[3])) { echo $hit[2], $hit[3], "\n"; $missing++; }
		}
		exit($missing > 0 ? 1 : 0);
	' "$PKG_DIR" 2>/dev/null
)
[ -z "$missing_includes" ] && ok "every eager loader include resolves" \
	|| bad "every eager loader include resolves" "missing: $missing_includes"

# 3. no dependency on any other repository
strays=$(grep -rIl "v7_php_frozen" "$PKG_DIR/run" "$PKG_DIR/widget" "$PKG_DIR/README.md" 2>/dev/null)
[ -z "$strays" ] && ok "no reference to another repository" \
	|| bad "no reference to another repository" "$strays"

# 4. no secrets staged for commit
leaks=$(find "$PKG_DIR/engine/config" -maxdepth 1 \( -name 'config_db.php' -o -name '.env*' \) 2>/dev/null)
if [ -n "$leaks" ]; then
	tracked=$(cd "$PKG_DIR" && git check-ignore -q engine/config/config_db.php 2>/dev/null && echo ignored || echo TRACKED)
	[ "$tracked" = "ignored" ] && ok "runtime config present but git-ignored" \
		|| bad "runtime config must not be committed" "$leaks"
else
	ok "no runtime config present"
fi

# 5. every session-forging file is CLI-gated
# Several files here fabricate an authenticated session (is_logged / is_global_admin /
# is_developer) with NO credential check, because a migration has no interactive login.
# That is fine on a shell and catastrophic over HTTP: the package .htaccess is Apache-only
# and INERT under nginx, so the SAPI gate is the only portable control. It must also sit
# BEFORE the bootstrap require, or an unauthenticated request still boots the engine against
# the production database (and these scripts echo backtraces on error).
# This check exists because the diffusion migration was instead gated on DEVELOPMENT_SERVER,
# which made it fail on every production install while protecting nothing.
forgers=$(grep -rIl "_SESSION\['dedalo'\]\['auth'\]\['\(is_logged\|is_global_admin\|is_developer\)'\]" \
	"$PKG_DIR/engine/diffusion" "$PKG_DIR/run" "$PKG_DIR/widget" --include=*.php 2>/dev/null)
ungated=""
for f in $forgers; do
	gate_line=$(grep -nE "(PHP_SAPI|php_sapi_name\(\))[[:space:]]*!==[[:space:]]*'cli'" "$f" | head -1 | cut -d: -f1)
	# a real require STATEMENT (line starts with it), never a docblock mentioning one
	boot_line=$(grep -nE "^[[:space:]]*(require|require_once|include|include_once)[[:space:]].*(bootstrap\.php|config/config\.php)" "$f" | head -1 | cut -d: -f1)
	if [ -z "$gate_line" ]; then
		ungated="$ungated ${f#$PKG_DIR/}(no-gate)"
	elif [ -n "$boot_line" ] && [ "$gate_line" -gt "$boot_line" ]; then
		ungated="$ungated ${f#$PKG_DIR/}(gate-after-bootstrap)"
	fi
done
[ -z "$ungated" ] && ok "every session-forging file is CLI-gated" \
	|| bad "every session-forging file is CLI-gated" "$ungated"

echo
[ "$fail" -eq 0 ] && echo "Package is self-contained." || echo "Package is INCOMPLETE."
exit "$fail"
