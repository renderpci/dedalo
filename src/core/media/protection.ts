/**
 * MEDIA PROTECTION — Rule A (back-office auth) + the generated web-server rules.
 * Native TS port of the PHP oracle `core/media_protection/class.media_protection.php`
 * (frozen tree), which the cutover left behind: PHP minted the auth cookie, wrote the
 * `auth/` markers and generated `media/.htaccess`, and PHP is gone. Closes audit
 * MEDIA-01 / SECURITY_DECISIONS DECISION 1 option (B). Definition of the whole
 * subsystem: engineering/MEDIA_PROTECTION.md.
 *
 * ONE media tree serves two audiences at the same URLs, with no file duplication:
 *
 *  - Rule A (work system): a logged-in user carries the FIXED-NAME cookie
 *    `dedalo_media_auth`, whose daily-rotated value must exist as a zero-byte marker
 *    in <media>/.publication/auth/{value}. Grants unrestricted media access.
 *  - Rule B (publication): an anonymous user may read only files of PUBLISHED records,
 *    and only inside the configured public quality folders. The web server stats
 *    <media>/.publication/pub/{section_tipo}_{section_id}, with the record identity
 *    parsed out of the media FILE NAME. Those markers are written by the diffusion
 *    engine (diffusion/targets/mediastore/media_index.ts) — never here.
 *
 * THE WEB SERVER ENFORCES, NOT THIS PROCESS. Authorization is one stat() per request,
 * performed by Apache/nginx itself, so multi-GB files keep native sendfile/Range and
 * the H.264 / nginx-mp4 `?start=` clipping handlers. No Bun process ever sits in the
 * media-serving path — the gate can never break streaming. This module only MAINTAINS
 * the artifacts the web server reads: the auth markers and the two rule files.
 *
 * FAIL CLOSED, AND AS 404 — never 403: the existence of unpublished media is not
 * disclosed. Every failure path (missing marker, malformed cookie, non-grammar
 * filename) denies. Rule A markers are engine-owned and independent of publication
 * state, so a diffusion failure can never lock editors out.
 *
 * MARKER-STORE OWNERSHIP IS EXCLUSIVE. Under <media>/.publication/:
 *   auth/{cookie_value}   ← THIS module, and only this module
 *   pub/{key}, dbs/…      ← media_index.ts, and only media_index.ts
 */

import { createHash, randomBytes } from 'node:crypto';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../../config/config.ts';
import { privateDir, readEnv } from '../../config/env.ts';
import { getServerState } from '../resolve/server_state.ts';

/**
 * The auth cookie NAME is fixed; only its VALUE rotates (daily). This is what lets the
 * generated rules stay static and lets nginx validate without a config reload — the
 * marker file is named by the value, so the rules never mention a value at all.
 * NEVER reintroduce rotating cookie NAMES (the pre-v7 design; it forced a reload).
 */
export const MEDIA_AUTH_COOKIE = 'dedalo_media_auth';

/**
 * Bump whenever a rule TEMPLATE below changes. It is folded into the config hash, so
 * bumping it is the ONLY thing that makes an existing install regenerate rule files
 * whose inputs are otherwise unchanged. Forget it and installs keep the old rules
 * forever.
 */
export const TEMPLATE_VERSION = 2;

/** The effective access mode. 'off' is a GENERATOR-only value — never returned here. */
export type MediaAccessMode = 'private' | 'publication' | false;
/** What the rule generators accept ('off' = write the hardening block, no gate). */
export type RuleMode = 'off' | 'private' | 'publication';

/** A cookie value is a sha512 hex digest. It becomes a literal FILENAME in auth/, so
 * this pattern is the path-traversal guard — nothing else may ever reach the disk. */
const COOKIE_VALUE_REGEX = /^[a-f0-9]{128}$/;

/** Quality folder names an admin may configure. Deliberately strict (these land in a
 * regex alternation inside a web-server config). */
const QUALITY_REGEX = /^[A-Za-z0-9_./-]+$/;

/**
 * The filename→record grammar. LOAD-BEARING, and stated in THREE places that must stay
 * in lockstep: this constant (which both generated rule files interpolate) and
 * `KEY_REGEX` in diffusion/targets/mediastore/media_index.ts. The lockstep is enforced
 * mechanically by test/unit/media_protection_tripwire.test.ts.
 *
 *   ...{component_tipo}_{section_tipo}_{section_id}[_lg-xxx].{ext}
 *
 * The GREEDY prefix (`[^/]*_`) pins the capture groups to the LAST TWO underscore
 * tokens, so a component tipo — which also contains underscores — can never be
 * mistaken for the section tipo. Files that do NOT parse (e.g. images renamed through
 * `properties.image_id` or an external_source) stay login-only BY DESIGN: they simply
 * never match rule B. Do not "fix" them by loosening this — that hands anonymous
 * users every unparseable file in a public quality folder.
 */
export const MEDIA_FILENAME_GRAMMAR =
	'[^/]*_([a-z0-9]+)_([0-9]+)(?:_lg-[a-zA-Z0-9-]{2,12})?\\.[A-Za-z0-9]+$';

/**
 * Test seam. Redirects BOTH filesystem homes (the media root and the auth store) at a
 * scratch dir. Guarded to temp paths exactly like `overrideMediaIndexBaseForTests` —
 * a test must never be able to point these writers at a real media tree or at the real
 * <private>/ dir. null restores the configured resolution.
 */
let pathOverridesForTests: { mediaRoot: string; authStorePath: string } | null = null;
export function overrideMediaProtectionPathsForTests(
	overrides: { mediaRoot: string; authStorePath: string } | null,
): void {
	if (overrides !== null) {
		for (const path of [overrides.mediaRoot, overrides.authStorePath]) {
			if (!/\/(tmp|T)\//.test(path) && !path.startsWith('/tmp')) {
				throw new Error('overrideMediaProtectionPathsForTests only accepts temp-dir paths');
			}
		}
	}
	pathOverridesForTests = overrides;
}

/** The media root, or null when unset (feature off — every function no-ops). */
export function mediaRoot(): string | null {
	if (pathOverridesForTests !== null) return pathOverridesForTests.mediaRoot;
	return config.media.rootPath;
}

/** The marker store base. Shared with media_index.ts, which owns pub/ and dbs/. */
export function markerStoreBase(): string | null {
	const root = mediaRoot();
	return root === null ? null : join(root, '.publication');
}

/** The auth marker dir — the ONE directory this module writes inside the media tree. */
export function authMarkerDir(): string | null {
	const base = markerStoreBase();
	return base === null ? null : join(base, 'auth');
}

/**
 * The auth store: today's + yesterday's cookie values, persisted across restarts so a
 * second login the same day recycles them instead of invalidating everyone's cookie.
 *
 * Lives in <private>/, NOT in the media tree: the values in it ARE credentials, and
 * <private>/ is already outside every web root. (PHP kept it under DEDALO_EXTRAS_PATH
 * behind a `<?php exit();` guard line — a hack that is meaningless without a PHP
 * interpreter, so it is dropped rather than imitated.)
 */
export function authStorePath(): string {
	if (pathOverridesForTests !== null) return pathOverridesForTests.authStorePath;
	return join(privateDir, 'media_auth.json');
}

/**
 * THE worst failure mode in this subsystem, made impossible: the auth store must never
 * sit anywhere the web server serves. It holds today's and yesterday's cookie VALUES in
 * cleartext, so a fetchable store lets any anonymous visitor set `dedalo_media_auth` and
 * read the entire media tree — for up to 48 hours, leaving no trace. It therefore lives
 * in <private>/, which is outside every served root by construction; this guard refuses
 * to write it under the media root even if a future path change puts it there.
 */
function assertAuthStoreIsNotServed(path: string): void {
	const root = mediaRoot();
	if (root !== null && (path === root || path.startsWith(`${root.replace(/\/+$/, '')}/`))) {
		throw new Error(
			`[media_protection] REFUSING to write the media auth store inside the media root (${path}). Its contents are valid media credentials; serving it would hand every anonymous visitor a working cookie.`,
		);
	}
}

/** One day slot of the auth store. Keyed by 'YYYY_MM_DD' (the PHP shape). */
interface AuthDay {
	cookie_name: string;
	cookie_value: string;
}
export type AuthStore = Record<string, AuthDay>;

/** The rule files this module generates and the web server reads. */
export interface RuleFileStatus {
	/** Absolute path, or null when the media root is unset. */
	path: string | null;
	exists: boolean;
	/** true when the embedded config-hash matches the current config; null when the
	 * mode is off (there is no expected content to compare against). */
	up_to_date: boolean | null;
}

// ---------------------------------------------------------------------------
// Mode resolution
// ---------------------------------------------------------------------------

/**
 * The effective access mode. Precedence:
 *
 *  1. ts_state.json `media_access_mode` — the runtime override the media_control widget
 *     writes (root-only). The TS-native equivalent of PHP's DEDALO_MEDIA_ACCESS_MODE_CUSTOM;
 *     `../private/.env` is append-only, so a UI-settable mode CANNOT live there.
 *     `null`/absent = no override.
 *  2. .env DEDALO_MEDIA_ACCESS_MODE (via the typed catalog).
 *  3. the legacy DEDALO_PROTECT_MEDIA_FILES=true, honored as 'private' (also step 2's job).
 *
 * Anything that is not exactly 'private'/'publication' resolves to false (protection off).
 * getServerState() re-reads the state file per call, so a mode change from the widget
 * takes effect immediately — no restart.
 */
export function resolveMediaAccessMode(): MediaAccessMode {
	if (hasStateOverride()) {
		const override = getServerState().media_access_mode;
		return override === 'private' || override === 'publication' ? override : false;
	}
	// The catalog already folds DEDALO_MEDIA_ACCESS_MODE + the legacy flag into one value.
	return config.features.mediaAccessMode;
}

/**
 * Whether ts_state.json carries a media_access_mode OVERRIDE at all. `false` is a real
 * override ("protection explicitly off") and must be distinguished from absent/null
 * ("no opinion — defer to .env"). The state file is hand-editable, so an empty string is
 * tolerated as "absent" rather than trusted as a mode.
 */
function hasStateOverride(): boolean {
	const override: unknown = getServerState().media_access_mode;
	return override !== null && override !== undefined && override !== '';
}

/** The runtime override as stored (null = none). The widget shows it verbatim, so an
 * operator can tell "no override" from an explicit "off". */
export function getStateOverride(): 'private' | 'publication' | false | null {
	if (!hasStateOverride()) return null;
	const override = getServerState().media_access_mode;
	return override === 'private' || override === 'publication' ? override : false;
}

/** The RAW .env mode key (not the catalog value, which has already folded the legacy
 * flag into 'private' — the widget shows the two layers separately). */
export function getConfigFileMode(): string | null {
	const raw = readEnv('DEDALO_MEDIA_ACCESS_MODE');
	return raw === undefined || raw === '' ? null : raw;
}

/** The deprecated DEDALO_PROTECT_MEDIA_FILES flag, or null when unset. */
export function getLegacyProtectFlag(): boolean | null {
	const raw = readEnv('DEDALO_PROTECT_MEDIA_FILES');
	return raw === undefined || raw === '' ? null : raw === 'true';
}

/** Where the effective mode came from — surfaced by the widget so an operator can see
 * WHY the mode is what it is (a stale ts_state override is otherwise invisible). */
export function resolveModeSource(): string {
	if (hasStateOverride()) {
		return 'ts_state.json (media_access_mode, set from this widget)';
	}
	if (getConfigFileMode() !== null) {
		return '../private/.env (DEDALO_MEDIA_ACCESS_MODE)';
	}
	if (getLegacyProtectFlag() === true) {
		return '../private/.env (legacy DEDALO_PROTECT_MEDIA_FILES)';
	}
	return 'default — no media protection configured (media is world-readable)';
}

// ---------------------------------------------------------------------------
// Public qualities (rule B's folder allowlist)
// ---------------------------------------------------------------------------

/**
 * The delivery-grade quality folders anonymous users may read when a record is
 * published. DERIVED FROM THE TYPED CATALOG, not hardcoded: an install that renames a
 * quality (DEDALO_IMAGE_QUALITY_DEFAULT, DEDALO_AV_QUALITY_DEFAULT, …) must get rules
 * that match its own folder names, or rule B silently matches nothing.
 *
 * Master/work folders are intentionally ABSENT — see getPublicQualities()'s hard filter.
 */
export function getDefaultPublicQualities(): string[] {
	const media = config.media;
	const folder = (value: string): string => value.replace(/^\/+|\/+$/g, '');
	return [
		`${folder(media.av.folder)}/${media.av.defaultQuality}`,
		`${folder(media.av.folder)}/posterframe`,
		`${folder(media.av.folder)}/${folder(media.avExtras.subtitlesFolder)}`,
		`${folder(media.image.folder)}/${media.image.defaultQuality}`,
		`${folder(media.image.folder)}/${media.thumb.quality}`,
		`${folder(media.pdf.folder)}/${media.pdf.defaultQuality}`,
		`${folder(media.svg.folder)}/${media.svg.defaultQuality}`,
		`${folder(media.threeD.folder)}/${media.threeD.defaultQuality}`,
	];
}

/**
 * The VALIDATED public quality folders: the DEDALO_MEDIA_PUBLIC_QUALITIES override when
 * set, else the derived defaults — each passed through a hard security filter that no
 * configuration can defeat:
 *
 *  - master/work qualities are REFUSED (the per-type `originalQuality`, the retouched
 *    twin, and the literal names 'original'/'modified'). Masters are the source of
 *    truth and multi-GB; they must never be anonymously reachable, whatever an admin
 *    types. This is STRICTER than PHP, which only refused the two literal names — an
 *    install that renamed its original quality could configure it public.
 *  - path traversal ('..') is refused;
 *  - anything outside [A-Za-z0-9_./-] is refused (these strings are interpolated into a
 *    web-server regex alternation).
 *
 * A refused entry is dropped and logged — never silently accepted, never fatal.
 */
export function getPublicQualities(): string[] {
	return filterPublicQualities(config.media.publicQualities ?? getDefaultPublicQualities());
}

/**
 * The hard filter itself, as a PURE function over an arbitrary list — this is the
 * security-critical half of getPublicQualities(), so it is directly callable (and
 * directly testable) rather than reachable only through the frozen config catalog.
 */
export function filterPublicQualities(configured: readonly string[]): string[] {
	// Every quality name that identifies a MASTER/work copy on this install.
	const forbidden = new Set<string>([
		'original',
		'modified',
		config.media.image.originalQuality,
		config.media.av.originalQuality,
		config.media.pdf.originalQuality,
		config.media.svg.originalQuality,
		config.media.threeD.originalQuality,
		config.media.imageQualityRetouched,
	]);

	const qualities: string[] = [];
	for (const raw of configured) {
		const quality = String(raw).replace(/^\/+|\/+$/g, '');
		if (quality === '' || quality.includes('..') || !QUALITY_REGEX.test(quality)) {
			console.error(`[media_protection] refused invalid public media quality: ${String(raw)}`);
			continue;
		}
		if (quality.split('/').some((segment) => forbidden.has(segment))) {
			console.error(
				`[media_protection] refused MASTER quality folder in the public list: ${quality}`,
			);
			continue;
		}
		qualities.push(quality);
	}
	return [...new Set(qualities)];
}

/** Raw rewrite lines appended before the final deny (MEDIA_HTACCESS_ADDONS). The
 * operator owns their syntax; we only place them. */
export function getAddonLines(): string[] {
	return [...config.media.htaccessAddons];
}

// ---------------------------------------------------------------------------
// The rule templates (PURE — no filesystem, freely callable for preview/diff)
// ---------------------------------------------------------------------------

/**
 * Stable hash of EVERYTHING that shapes the generated rules. Embedded as
 * `# config-hash: …` in both files and compared before rewriting, so a login is a no-op
 * unless something actually changed. TEMPLATE_VERSION is folded in so bumping it in code
 * forces every install to regenerate.
 */
export function getConfigHash(mode: RuleMode, qualities: string[], addons: string[]): string {
	return createHash('sha256')
		.update(
			JSON.stringify({
				version: TEMPLATE_VERSION,
				mode,
				qualities,
				addons,
				media: mediaRoot(),
				media_dir: config.mediaDir,
			}),
		)
		.digest('hex');
}

/**
 * The always-on hardening block. Emitted in EVERY mode, including 'off' — none of it is
 * part of the access gate, and all of it must hold even when protection is disabled.
 *
 *  - SEC-088 script execution: the media root is full of USER-UPLOADED files, and the web
 *    server must never interpret one as code.
 *  - The marker store deny: STRICTER THAN PHP, whose 'off' template omitted it. The
 *    filenames under `.publication/auth/` ARE valid media credentials and the ones under
 *    `pub/` enumerate every published record id. Neither is ever something to serve, in
 *    any mode — and "protection is off today" must not mean "the credentials that work
 *    tomorrow were harvestable yesterday". The gated modes deny it again in the rewrite
 *    stage (rule 0); this is the belt to that pair of braces.
 */
function htaccessHardeningBlock(): string {
	return [
		'# SEC-088: block script execution inside the media root.',
		'<FilesMatch "(?i)\\.(phps?|phtml|phar|pht)$">',
		'\tSetHandler none',
		'</FilesMatch>',
		'<FilesMatch "(?i)\\.(phps?|phtml|phar|pht|cgi|pl|py|rb|sh|lua|asp|aspx|jsp)$">',
		'\tRequire all denied',
		'</FilesMatch>',
		'# Protect working files from prying eyes.',
		'<FilesMatch "\\.(deleted|temp|tmp|import|csv)$">',
		'\tRequire all denied',
		'</FilesMatch>',
		'# The marker store is NEVER served, in any mode: auth/ filenames are live media',
		'# credentials and pub/ filenames enumerate every published record.',
		'<IfModule mod_rewrite.c>',
		'RewriteEngine On',
		'RewriteRule (^|/)\\.publication(/|$) - [R=404,L]',
		'</IfModule>',
		'Options -Indexes -ExecCGI',
		'AddHandler default-handler .php .phtml .phar .pht',
		'',
	].join('\n');
}

/**
 * The Apache gate: the full text of <media>/.htaccess. PURE.
 *
 * Stage order is the whole design:
 *   0. the marker store itself is never served;
 *   1. rule A — a valid auth cookie whose value exists as a marker → allow everything;
 *   2. rule B — (publication mode) a public quality folder AND a pub/ marker for the
 *      record the FILENAME identifies → allow;
 *   3. default deny, as 404.
 *
 * (!) The rewrite substitution is ALWAYS '-' and the query string is never touched, so
 * Range requests and the H.264 `?start=` clipping handler keep working.
 *
 * (!) Rule B's RewriteCond uses `$1_$2` — the captures of the RewriteRule that FOLLOWS
 * it — not `%1`, which would reference rule A's last RewriteCond capture. This was a
 * real, shipped bug. The RewriteRule must stay immediately after its RewriteCond.
 */
export function buildHtaccess(
	mode: RuleMode,
	qualities: string[] = [],
	addons: string[] = [],
): string {
	const root = (mediaRoot() ?? '').replace(/\/+$/, '');
	const hash = getConfigHash(mode, qualities, addons);

	const lines: string[] = [
		'# Dédalo media access control — GENERATED by src/core/media/protection.ts.',
		'# Do not edit: this file is overwritten whenever the configuration changes.',
		`# config-hash: ${hash}`,
		'',
		htaccessHardeningBlock(),
	];

	// 'off': hardening only. Used when an admin disables protection, so the previously
	// generated deny rules do not linger and keep denying.
	if (mode === 'off') {
		return `${lines.join('\n')}`;
	}

	lines.push(
		'<IfModule mod_rewrite.c>',
		'RewriteEngine On',
		'',
		'# 0. The marker store itself is never served.',
		'RewriteRule (^|/)\\.publication(/|$) - [R=404,L]',
		'',
		'# 1. Rule A: logged-in Dédalo users. Fixed cookie name; the daily-rotated value',
		'#    must exist as an auth marker (synced at login).',
		`RewriteCond %{HTTP_COOKIE} (?:^|;\\s*)${MEDIA_AUTH_COOKIE}=([a-f0-9]{128}) [NC]`,
		`RewriteCond "${root}/.publication/auth/%1" -f`,
		'RewriteRule ^ - [L]',
	);

	if (mode === 'publication' && qualities.length > 0) {
		const alternation = qualities.map(escapeRegexLiteral).join('|');
		lines.push(
			'',
			'# 2. Rule B: public quality folders, gated by the publication marker the',
			'#    diffusion engine maintains. The file name identifies the record:',
			'#    ...{component_tipo}_{section_tipo}_{section_id}[_lg-xxx].ext',
			// (!) $1_$2, NOT %1_%2 — see the docblock.
			`RewriteCond "${root}/.publication/pub/$1_$2" -f`,
			`RewriteRule ^(?:${alternation})/(?:.+/)?${MEDIA_FILENAME_GRAMMAR} - [L]`,
		);
	}

	if (addons.length > 0) {
		lines.push('', '# MEDIA_HTACCESS_ADDONS (from config)', ...addons);
	}

	lines.push(
		'',
		'# 3. Default deny: 404 hides the existence of unpublished media.',
		'RewriteRule ^ - [R=404,L]',
		'</IfModule>',
		'',
	);

	return lines.join('\n');
}

/**
 * The nginx gate: an include-able server{}-context block. PURE.
 *
 * (!) THE TS URL/ROOT SPLIT. PHP hardcoded `/media/` and `$document_root/media/…`.
 * Here the media URL is `/dedalo/<mediaDir>` (config.mediaDir; see
 * resolve/environment.ts DEDALO_MEDIA_URL) and the filesystem root is MEDIA_PATH,
 * which is INDEPENDENT of it. A block copied from the PHP sample would match nothing
 * and enforce nothing while looking perfectly correct — so both are interpolated here.
 *
 * (!) The rule-A location is a PLAIN PREFIX, deliberately. Adding `^~` would make nginx
 * stop before ever consulting the rule-B regex location, and every anonymous
 * public-quality request would 404. Classic pitfall; keep it plain.
 *
 * The `map` that sanitizes the cookie to hex-only belongs in the http{} context, so it
 * cannot live inside this server{} block: it is emitted as a separate file by
 * writeRuleFiles() and must be included in http{}. Without it $dedalo_auth_key is empty
 * and rule A fails closed for everyone.
 */
export function buildNginxConf(mode: RuleMode, qualities: string[] = []): string {
	const root = (mediaRoot() ?? '').replace(/\/+$/, '');
	const url = `/dedalo/${config.mediaDir}`;
	const hash = getConfigHash(mode, qualities, []);

	const lines: string[] = [
		'# Dédalo media access control — GENERATED by src/core/media/protection.ts.',
		'# Do not edit: this file is overwritten whenever the configuration changes.',
		`# config-hash: ${hash}`,
		'#',
		'# WIRING (two includes — nginx requires it, a `map` is http{}-only):',
		'#   http   { include <media>/dedalo_media_protection_map.nginx.conf; }',
		'#   server { include <media>/dedalo_media_protection.nginx.conf;     }',
		'# Omit the map and nginx REFUSES TO START ("unknown $dedalo_auth_key") — loud,',
		'# which is the intent: a half-wired gate must never boot half-open.',
		'#',
		'# (!) RELOAD REQUIRED. Unlike the Apache .htaccess (read per request), nginx reads',
		'# this at reload: after a mode change, run `nginx -t && nginx -s reload` or the OLD',
		'# rules keep serving. The daily cookie ROTATION needs no reload — that is exactly',
		'# why the cookie NAME is fixed and only its value rotates.',
		'#',
		'# Operational notes:',
		'#  - Do NOT enable open_file_cache on these locations (or keep open_file_cache_valid',
		'#    <= 2s): it caches stat() results and delays an unpublish taking effect.',
		'#  - On NFS/shared storage the marker stat() honors the attribute cache, so an',
		'#    unpublish can lag a few seconds across web-farm hosts.',
		'#  - Behind a CDN, PURGE the record media paths on unpublish (especially .vtt',
		'#    subtitles): the origin denies immediately, downstream caches do not.',
		'',
		'# 0. The marker store itself is never served. `^~` beats every regex below.',
		`location ^~ ${url}/.publication/ { deny all; return 404; }`,
		'',
		// SEC-088. Emitted in EVERY mode, including 'off' — this is NOT part of the access
		// gate. The media root is full of user-uploaded files; a server with PHP-FPM wired
		// would otherwise happily execute an uploaded .php. Regex locations match in order,
		// so this must precede rule B.
		'# SEC-088: never serve or execute scripts under the media root (uploaded files!).',
		`location ~* ^${escapeRegexLiteral(url)}/.+\\.(phps?|phtml|phar|pht|cgi|pl|py|rb|sh|lua|asp|aspx|jsp)$ {`,
		'\tdeny all;',
		'\treturn 404;',
		'}',
		'',
	];

	if (mode === 'off') {
		lines.push(
			'# Protection is OFF: no access gate is generated (hardening above still applies).',
			'',
		);
		return lines.join('\n');
	}

	if (mode === 'publication' && qualities.length > 0) {
		const alternation = qualities.map(escapeRegexLiteral).join('|');
		lines.push(
			'# 2. Rule B: public quality folders. Allowed when the publication marker exists',
			'#    OR the logged-in auth cookie is valid. The file name identifies the record.',
			// The regex MUST be double-quoted. nginx's CONFIG lexer (not its regex engine)
			// treats `{` and `}` as block delimiters, so an unquoted pattern containing the
			// grammar's `{2,12}` repetition quantifier is truncated mid-token and nginx
			// REFUSES TO START ("pcre2_compile() failed: missing closing parenthesis").
			// Verified against nginx 1.31.2 — publication mode was unusable without this.
			`location ~ "^${escapeRegexLiteral(url)}/(?:${alternation})/(?:.+/)?${nginxNamedGrammar()}" {`,
			'\tset $dd_pass 0;',
			`\tif (-f ${root}/.publication/auth/$dedalo_auth_key) { set $dd_pass 1; }`,
			`\tif (-f ${root}/.publication/pub/\${dd_s}_\${dd_i})   { set $dd_pass 1; }`,
			'\tif ($dd_pass = 0) { return 404; }',
			"\tmp4;   # ngx_http_mp4_module: '?start='/'?end=' clipping (no-op for non-mp4)",
			'}',
			'',
		);
	}

	lines.push(
		'# 1. Rule A: everything else under the media tree is for logged-in users only.',
		'#    PLAIN PREFIX on purpose — a `^~` here would make nginx stop before ever',
		'#    consulting the rule-B regex location above, and every anonymous request for',
		'#    published media would 404. Classic pitfall; keep it plain.',
		`location ${url}/ {`,
		`\tif (!-f ${root}/.publication/auth/$dedalo_auth_key) { return 404; }`,
		"\tmp4;   # '?start='/'?end=' clipping for logged-in users too",
		'}',
		'',
	);

	return lines.join('\n');
}

/**
 * The filename grammar with NAMED captures, for nginx.
 *
 * Named captures are MANDATORY here, not cosmetic: the `if (-f …)` directives inside the
 * location run their own regex, which resets nginx's numeric captures ($1…$9). A rule
 * built on $1/$2 would silently stat `pub/_` for every request and deny everything.
 * Derived from the ONE grammar constant so the two can never drift.
 */
function nginxNamedGrammar(): string {
	return MEDIA_FILENAME_GRAMMAR.replace('([a-z0-9]+)', '(?<dd_s>[a-z0-9]+)').replace(
		'([0-9]+)',
		'(?<dd_i>[0-9]+)',
	);
}

/** The http{}-context companion: sanitizes the cookie to hex-only BEFORE it is ever used
 * in a filesystem path. Static (the cookie NAME never changes), but generated alongside
 * the gate so an operator has both files in hand. */
export function buildNginxMap(): string {
	return [
		'# Dédalo media access control — GENERATED by src/core/media/protection.ts.',
		'# Include this in the http{} context (a map cannot live inside server{}).',
		'# It sanitizes the auth cookie to hex-only before it is used in a file path.',
		`map $cookie_${MEDIA_AUTH_COOKIE} $dedalo_auth_key {`,
		'\t"~^(?<h>[a-f0-9]{128})$"  $h;',
		'\tdefault                   "_invalid_";',
		'}',
		'',
	].join('\n');
}

/** Escape a literal for embedding in an Apache/nginx regex (quality folders carry '.'
 * and '/', e.g. 'image/1.5MB' — an unescaped '.' would match any character). */
function escapeRegexLiteral(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// The generated artifacts on disk
// ---------------------------------------------------------------------------

/** Absolute paths of the three generated files (null when the media root is unset). */
export function ruleFilePaths(): { htaccess: string; nginx: string; nginxMap: string } | null {
	const root = mediaRoot();
	if (root === null) return null;
	return {
		htaccess: join(root, '.htaccess'),
		nginx: join(root, 'dedalo_media_protection.nginx.conf'),
		nginxMap: join(root, 'dedalo_media_protection_map.nginx.conf'),
	};
}

/**
 * Write the rule files when missing or when their embedded config-hash no longer matches
 * the current configuration. Idempotent: on a normal login this compares two hashes and
 * writes nothing.
 *
 * `modeOverride` is REQUIRED by the widget: after changing the mode, the caller cannot
 * re-resolve it, because `config` is a frozen module-level const evaluated once at import
 * (the .env layer is stale for the life of the process). Pass the new mode explicitly.
 * Omitting it resolves the effective mode, and a resolved `false` leaves any existing
 * file alone (login never calls this with protection off).
 *
 * Throws on write failure: a mode is configured but the gate cannot be written is a
 * misconfiguration the operator MUST see (CONVENTIONS §1 — the default is fail-loud).
 */
export function writeRuleFiles(modeOverride?: RuleMode): boolean {
	const paths = ruleFilePaths();
	if (paths === null) return false; // media root unset — feature off

	let mode: RuleMode;
	if (modeOverride !== undefined) {
		mode = modeOverride;
	} else {
		const resolved = resolveMediaAccessMode();
		if (resolved === false) return true; // protection off: leave existing files alone
		mode = resolved;
	}

	const qualities = mode === 'publication' ? getPublicQualities() : [];
	const addons = getAddonLines();
	const hash = getConfigHash(mode, qualities, addons);

	const artifacts: Array<{ path: string; text: string }> = [
		{ path: paths.htaccess, text: buildHtaccess(mode, qualities, addons) },
		{ path: paths.nginx, text: buildNginxConf(mode, qualities) },
		{ path: paths.nginxMap, text: buildNginxMap() },
	];

	for (const artifact of artifacts) {
		// Idempotency guard: compare the EMBEDDED hash comment rather than the whole body,
		// so incidental whitespace drift never forces a rewrite. The map file carries no
		// hash (it is static), so it is written only when absent.
		if (artifact.path === paths.nginxMap) {
			if (!existsSync(artifact.path)) writeFileSync(artifact.path, artifact.text);
			continue;
		}
		if (existsSync(artifact.path)) {
			const current = readFileSync(artifact.path, 'utf8');
			if (current.includes(`# config-hash: ${hash}`)) continue;
		}
		writeFileSync(artifact.path, artifact.text);
	}

	return true;
}

/** Read-only inspection of the generated files against the current config, for the
 * media_control widget. Never writes. */
export function getRulesStatus(): { htaccess: RuleFileStatus; nginx: RuleFileStatus } {
	const paths = ruleFilePaths();
	const mode = resolveMediaAccessMode();

	const statusOf = (path: string | null): RuleFileStatus => {
		const exists = path !== null && existsSync(path);
		if (mode === false || path === null) {
			return { path, exists, up_to_date: null };
		}
		const qualities = mode === 'publication' ? getPublicQualities() : [];
		const hash = getConfigHash(mode, qualities, getAddonLines());
		return {
			path,
			exists,
			up_to_date: exists && readFileSync(path, 'utf8').includes(`# config-hash: ${hash}`),
		};
	};

	return {
		htaccess: statusOf(paths?.htaccess ?? null),
		nginx: statusOf(paths?.nginx ?? null),
	};
}

// ---------------------------------------------------------------------------
// Rule A: the auth cookie and its markers
// ---------------------------------------------------------------------------

/** A fresh cookie value: 128 lowercase hex chars (sha512 of CSPRNG bytes). */
export function mintAuthCookieValue(): string {
	return createHash('sha512').update(randomBytes(64)).digest('hex');
}

/** 'YYYY_MM_DD' — the auth store's day key (PHP date("Y_m_d")). */
function dayKey(date: Date): string {
	const pad = (n: number): string => String(n).padStart(2, '0');
	return `${date.getFullYear()}_${pad(date.getMonth() + 1)}_${pad(date.getDate())}`;
}

export function readAuthStore(): AuthStore | null {
	try {
		const parsed = JSON.parse(readFileSync(authStorePath(), 'utf8')) as unknown;
		return typeof parsed === 'object' && parsed !== null ? (parsed as AuthStore) : null;
	} catch {
		return null; // absent or malformed: the caller mints a fresh store (PROBE catch)
	}
}

export function writeAuthStore(store: AuthStore): void {
	const path = authStorePath();
	assertAuthStoreIsNotServed(path);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(store, null, '\t')}\n`, { mode: 0o600 });
	// writeFileSync's `mode` applies only when CREATING the file — rewriting an existing
	// one keeps whatever bits it already had. The values in here ARE valid media
	// credentials, so tighten unconditionally.
	chmodSync(path, 0o600);
}

/**
 * Mirror the valid cookie values (today + yesterday) as zero-byte marker files: the web
 * server authorizes rule A with `-f auth/{cookie_value}`. Any OTHER file in the dir is
 * removed — that is the daily rotation, and it is what expires a stolen cookie.
 *
 * Called at EVERY login, so the store self-heals after a redeploy or a wiped media dir
 * without anyone having to notice.
 *
 * The marker files hold no content: THE FILENAME IS THE CREDENTIAL. Values are therefore
 * validated as strict sha512 hex before they can reach the disk (path traversal).
 */
export function syncAuthMarkers(values: string[]): void {
	const dir = authMarkerDir();
	if (dir === null) return; // media root unset — feature off

	// 0750: the filenames here are valid cookie values; other local users must not be
	// able to list them.
	mkdirSync(dir, { recursive: true, mode: 0o750 });

	const keep = new Set<string>();
	for (const value of values) {
		if (typeof value !== 'string' || !COOKIE_VALUE_REGEX.test(value)) {
			console.error('[media_protection] refused invalid auth cookie value (expected sha512 hex)');
			continue;
		}
		keep.add(value);
		const marker = join(dir, value);
		if (!existsSync(marker)) writeFileSync(marker, '');
	}

	// Rotation: drop markers for values that are no longer valid.
	for (const entry of readdirSync(dir)) {
		if (keep.has(entry)) continue;
		const marker = join(dir, entry);
		try {
			if (statSync(marker).isFile()) unlinkSync(marker);
		} catch {
			// Raced with another login's rotation — the file is already gone. Benign.
		}
	}
}

/**
 * Recreate the auth markers from the values already persisted on disk. Used when
 * protection is (re-)enabled from the widget, so users who ALREADY hold a valid cookie
 * keep media access instead of being locked out until their next login.
 * No-op when no store exists yet — the next login creates one.
 */
export function syncAuthMarkersFromStore(): void {
	const store = readAuthStore();
	if (store === null) return;
	const values = Object.values(store)
		.map((day) => day?.cookie_value)
		.filter((value): value is string => typeof value === 'string');
	if (values.length > 0) syncAuthMarkers(values);
}

/**
 * The login hook. Recycles or rotates the auth store, syncs the markers, refreshes the
 * generated rules, and returns the cookie value the response must set — or null when
 * protection is off (a TOTAL no-op: no cookie, no markers, no files).
 *
 * Today's AND yesterday's values are both kept valid so a session does not break at
 * midnight, and so a second login the same day recycles rather than invalidating the
 * cookie every other user is holding.
 *
 * Throws on filesystem failure (CONVENTIONS §1: fail-loud). A configured gate that
 * cannot be written must not degrade into silently unprotected media.
 */
export function initMediaAuthCookie(now: Date = new Date()): string | null {
	const mode = resolveMediaAccessMode();
	if (mode === false) return null;
	if (mediaRoot() === null) {
		throw new Error(
			`[media_protection] DEDALO_MEDIA_ACCESS_MODE is '${mode}' but MEDIA_PATH is not configured — the gate cannot be written and media would be served unprotected.`,
		);
	}

	const today = dayKey(now);
	const yesterday = dayKey(new Date(now.getTime() - 86_400_000));

	const existing = readAuthStore();
	const newDay = (): AuthDay => ({
		cookie_name: MEDIA_AUTH_COOKIE,
		cookie_value: mintAuthCookieValue(),
	});

	const todayEntry = existing?.[today] ?? newDay();
	const yesterdayEntry = existing?.[yesterday] ?? newDay();
	const store: AuthStore = { [today]: todayEntry, [yesterday]: yesterdayEntry };

	// Persist only when something actually changed — a second login the same day RECYCLES
	// the values rather than rotating every other editor's cookie out from under them.
	const recycled =
		existing?.[today]?.cookie_value !== undefined &&
		existing?.[yesterday]?.cookie_value !== undefined;
	if (!recycled) {
		writeAuthStore(store);
	}

	syncAuthMarkers([todayEntry.cookie_value, yesterdayEntry.cookie_value]);
	writeRuleFiles();

	return todayEntry.cookie_value;
}
