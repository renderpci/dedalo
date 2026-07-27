#!/usr/bin/env bash
#
# build_package.sh — assemble the drop-in "Prepare installation for v7" package.
#
# Produces a self-contained folder:
#
#   dist/prepare_v7/
#   ├── engine/     full snapshot of this v7_php_frozen master_dedalo (the isolated engine)
#   ├── run/        the CLI runner (orchestrator + phases + libs)
#   ├── widget/     the v6-facing maintenance widget (launcher UI)
#   ├── private/    (empty; the .env is generated at runtime by db_config_bridge)
#   ├── var/        (empty; logs + backups written here at runtime)
#   └── README.md
#
# The engine snapshot excludes this package (avoids recursion), VCS/build/media
# bulk, and anything secret. Per-install DB credentials are NOT copied — they are
# generated into private/.env from the live v6 config when the widget runs.
#
# Usage:
#   close_v6_prepare_v7/build_package.sh [DEST_DIR]
#     DEST_DIR default: close_v6_prepare_v7/dist/prepare_v7
#
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"      # …/close_v6_prepare_v7
REPO_DIR="$(cd "$PKG_DIR/.." && pwd)"                        # …/master_dedalo  (the engine source)
DEST="${1:-$PKG_DIR/dist/prepare_v7}"

echo "Engine source : $REPO_DIR"
echo "Package source: $PKG_DIR"
echo "Destination   : $DEST"

rm -rf "$DEST"
mkdir -p "$DEST/engine" "$DEST/private" "$DEST/var"

echo "→ snapshotting engine…"
rsync -a \
	--exclude 'node_modules/' \
	--exclude '*.log' \
	--exclude '.DS_Store' \
	--exclude '.env' \
	--exclude '.env.*' \
	--exclude 'config/config.php' \
	--exclude 'config/config_core.php' \
	--exclude 'config/config_db.php' \
	--exclude 'config/config_areas.php' \
	--exclude '*.bak' \
	`#     ^ SECURITY: never ship pre-cutover/quarantine config backups — they carry old DB secrets` \
	--exclude '*.pre-cutover*' \
	--exclude '*.cutover*' \
	--exclude '/config/bootstrap/' \
	`#     ^ SECURITY: dev boot-diff snapshots (config/bootstrap/dev/snapshots/*.json) capture LIVE`  \
	`#       config incl. real DB passwords; dir (NOT config/bootstrap.php) is dev-only, unused at boot` \
	--exclude '/config/profiles/' \
	`#     ^ per-install .env profiles (mdcat.env, monedaiberica.env) — other installs; not loaded at boot` \
	`# --- TOP-LEVEL only (leading / anchors to the transfer root, so same-named`  \
	`#     files deeper in the tree, e.g. config/catalog/domains/media_image.php, stay) ---` \
	--exclude '/.*' \
	`#     ^ every top-level hidden file/dir (.git, .github, .vscode, .gitignore, …)` \
	--exclude '/close_v6_prepare_v7/' \
	--exclude '/backups/' \
	--exclude '/dist/' \
	--exclude '/var/' \
	--exclude '/media*' \
	--exclude '/docs/' \
	--exclude '/mcp/' \
	--exclude '/mockup/' \
	--exclude '/security-audit/' \
	--exclude '/test/' \
	`# --- tools/: 27M of tool modules, none on the migration path — BUT core/base/class.loader.php` \
	`#     EAGERLY includes tools/tool_common/class.tool_common.php + class.tool_paths.php on every` \
	`#     boot (tool_paths is consulted by the autoloader itself), so keep tool_common's classes ---` \
	--include '/tools/' \
	--include '/tools/tool_common/' \
	--include '/tools/tool_common/*.php' \
	--include '/tools/tool_common/register.schema.json' \
	--exclude '/tools/tool_common/*' \
	--exclude '/tools/*' \
	--exclude '/downloads/' \
	--exclude '/analysis/' \
	--exclude '/lib/' \
	`#     ^ front-end/JS asset libs + wkhtmltopdf/xlsx — not the core/media_engine/lib used by AV` \
	--exclude '/code/' \
	--exclude '/vendor/' \
	`#     ^ composer deps (mailer/SAML/RDF/phpunit) — not on the migration path; boot never requires autoload` \
	--exclude '/worker/' \
	--exclude '/dev/' \
	--exclude '/local/' \
	--exclude '/publication/' \
	`# --- install/: keep ONLY the runtime-read SQL twins under install/db (the store DDLs`  \
	`#     loaded by v6_to_v7::create_*_store); drop 355M of dumps/import/config-migration ---` \
	--include '/install/' \
	--include '/install/db/' \
	--include '/install/db/*.sql' \
	`#     keep the config-migration classes too (config_auto_migrate + deps, ~120K): they let`  \
	`#     bootstrap import a v6 config_core.php/config_db.php dropped into config/ → ../private/.env` \
	--include '/install/*.php' \
	--include '/install/trait.*.php' \
	--exclude '/install/**' \
	`# --- per-module client assets: no PHP reads them; the CLI migration serves no UI ---` \
	--exclude '/core/*/css/' \
	--exclude '/core/*/js/' \
	`# --- UI area + button modules: not on the migration path (reformat routes by model`  \
	`#     string, never instantiates them; boot's dd_area_maintenance_api is in core/api, not here) ---` \
	--exclude '/core/area*' \
	--exclude '/core/button*' \
	--exclude '/core/rag/' \
	`#     ^ RAG vector subsystem (v7 feature, dormant unless DEDALO_RAG_ENABLED; dd_rag_api is in core/api) ` \
	--exclude '/core/dd_mailer/' \
	--exclude '/core/extras/' \
	--exclude '/core/services/' \
	--exclude '/core/themes/' \
	--exclude '/core/dd_grid/' \
	--exclude '/core/widgets/' \
	`#     ^ dd_grid + widgets are boot-eager-included; their dead loader includes are neutralized below (post-copy sed) ` \
	`# --- diffusion: keep diffusion/migration/ (the v6→v7 diffusion-ontology scripts) AND the`  \
	`#     top-level diffusion/*.php classes (the loader EAGER-INCLUDES ~10 of them + autoloads`  \
	`#     diffusion_* from here — boot dies without them). Drop the heavy REST-API + parser/service. ---` \
	--exclude '/diffusion/api/' \
	--exclude '/diffusion/parser/' \
	--exclude '/diffusion/service/' \
	--exclude '/diffusion/acc/' \
	--exclude '/download/' \
	`#     ^ web download endpoint (class.download + h264 build code); not on boot/migration path.` \
	`#     Remaining top-level engine dirs are all load-bearing: config core shared install diffusion` \
	`# --- unused TOP-LEVEL files (docs, dev tooling, web front controller) — none on boot/migration path ---` \
	--exclude '/*.md' \
	--exclude '/Readme.html' \
	--exclude '/phpstan*' \
	--exclude '/composer.*' \
	--exclude '/cliff.toml' \
	--exclude '/mkdocs.yml' \
	--exclude '/config.codekit3' \
	--exclude '/quick-lint-js' \
	--exclude '/favicon.ico' \
	--exclude '/index.php' \
	`#     ^ top-level web front controller only; core/api/**/index.php are NOT matched (anchored)` \
	--exclude '/stub.php' \
	--exclude '/v7_dump.json' \
	"$REPO_DIR/" "$DEST/engine/"

# Neutralize eager loader includes for the boot-loaded dirs we removed above
# (core/dd_grid, core/widgets). These are `include` (not require) of now-absent files;
# deleting the lines keeps boot warning-free. Not used anywhere on the migration path.
LOADER="$DEST/engine/core/base/class.loader.php"
if [ -f "$LOADER" ]; then
	sed -i.bak -E "/include DEDALO_CORE_PATH \. '\/(dd_grid|widgets)\//d" "$LOADER"
	rm -f "$LOADER.bak"
	echo "→ neutralized dd_grid/widgets loader includes"
fi

echo "→ copying runner + widget…"
cp -R "$PKG_DIR/run"    "$DEST/run"
cp -R "$PKG_DIR/widget" "$DEST/widget"
cp    "$PKG_DIR/README.md" "$DEST/README.md" 2>/dev/null || true

# guard: never ship a secret env
rm -f "$DEST/private/.env" 2>/dev/null || true

echo "✓ Package built at: $DEST"
echo
echo "Deploy: copy '$DEST' into the v6 install, register the widget"
echo "        (widget/prepare_v7/class.prepare_v7.php) in v6's area_maintenance,"
echo "        then use it — or run headless:"
echo "        php '$DEST/run/run_prepare_v7.php' --dry-run"
