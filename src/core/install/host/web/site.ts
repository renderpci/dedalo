/**
 * WHAT EVERY SITE FILE THE INSTALLER WRITES SHARES (terminal installer phase 4,
 * 2026-10-12): its input, its stamp, the dynamic routes the engine serves under
 * /dedalo/, and the security headers — ONE constant, repeated in every place a
 * web server would otherwise drop them (nginx: a location with its own
 * add_header inherits NONE of the server's — campaign 2 L5/L55).
 */

import type { InstallAnswers } from '../../install_plan.ts';
import type { InstancePaths } from '../layout.ts';

export interface SiteInput {
	readonly paths: InstancePaths;
	readonly answers: InstallAnswers;
	/** The stamp line (`# dedalo-install <i> <hash>`), always the file's first line. */
	readonly stamp: string;
	/** null = stage 1 (Let's Encrypt not issued yet): the plain-HTTP server only. */
	readonly cert: { fullchain: string; key: string } | null;
	/** Serve the HTTP-01 challenge root on the plain-HTTP server (Let's Encrypt). */
	readonly acme: boolean;
	/** The web server's log directory (this instance's own log files go there). */
	readonly logDir: string;
}

/** The security headers (name, value) — the ONE list both renderers emit. */
export const SECURITY_HEADERS: readonly (readonly [string, string])[] = Object.freeze([
	['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
	['X-Content-Type-Options', 'nosniff'],
	['X-Frame-Options', 'SAMEORIGIN'],
	['Referrer-Policy', 'strict-origin-when-cross-origin'],
]);

/** The engine's own routes under /dedalo/ (proxied, never served from the client tree). */
export const ENGINE_PREFIXES: readonly string[] = Object.freeze([
	'/dedalo/lib/',
	'/dedalo/tools/',
	'/dedalo/core/tools_common/',
	'/dedalo/install/import/ontology/',
	'/dedalo/install/code/',
	'/dedalo/install/import/hierarchy/',
	'/dedalo/ai_models/',
	'/dedalo/upload_tmp/',
]);

/** The https origin as the redirect writes it (the port only when it is not 443). */
export function httpsOrigin(answers: InstallAnswers): string {
	return answers.https_port === '443' ? '' : `:${answers.https_port}`;
}

/** The site file's header: the stamp, then why the file must not be hand-edited. */
export function siteHeader(input: SiteInput): string[] {
	return [
		input.stamp,
		`# Dédalo instance ${input.paths.instance} — WRITTEN BY THE INSTALLER (scripts/install.ts, production`,
		'# route). Every other site, the default site and the global configuration are untouched.',
		'# Change the answers and re-run the installer rather than editing this file: a resume',
		'# compares it with its own render.',
		'',
	];
}

/** Is the media gate on (DEDALO_MEDIA_ACCESS_MODE not false/off/0)? Off: the media is served open. */
export function mediaGated(answers: InstallAnswers): boolean {
	return !['false', 'off', '0'].includes(answers.media_access_mode);
}
