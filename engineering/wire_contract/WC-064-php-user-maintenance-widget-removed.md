# WC-064 — `php_user` maintenance widget removed (2026-07-29)

The `php_user` area_maintenance widget administered the PHP engine's system
user — meaningless since the cutover retired that engine. Its two client files
(`widgets/php_user/js/{php_user,render_php_user}.js`) are gone from the TS
tree; the frozen oracle still censuses them. Filtered from BOTH sides
(`isPhpUserRemovalEntry`), the same pattern as the WC-030 runtime_info merge.
