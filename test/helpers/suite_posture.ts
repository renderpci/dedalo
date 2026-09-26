/**
 * THE SUITE POSTURE — config values the test suite runs with, whatever the
 * developer's ../private/.env says. One copy, read by the bun test preload
 * (test/preload/test_database.ts) and held EQUAL to the hosted CI tier's own
 * default (scripts/ci/hosted_env.sh) by media_export_base.test.ts, so a local
 * run and CI measure the same branches — and the unit baseline's per-file
 * floors mean the same thing on every machine.
 *
 * Plain constants: the preload imports this BEFORE src/config/config.ts freezes,
 * so nothing here may import engine code.
 */

/**
 * DEDALO_MEDIA_EXPORT_BASE. Unset, every export/relation cell that leaves the
 * app is reported unresolved and the media-ZIP gates that read cells skip or
 * go red (tool_export_media_zip_native R4/R7, tool_export_native) — measured
 * 2026-09-26 on a .env without the key. The value is only string-compared.
 */
export const SUITE_MEDIA_EXPORT_BASE = 'http://localhost:8080/dedalo/media';
