/**
 * PHP reference API client — used ONLY by the parity harness.
 *
 * Talks to the live PHP Dédalo JSON API (config key PHP_API_BASE_URL) the same
 * way the browser client does: JSON POST, PHP session cookie, and the
 * per-session CSRF token echoed in every response (PHP dd_manager SEC-008 —
 * sent back via the X-Dedalo-Csrf-Token header on subsequent calls).
 *
 * This client exists so the differential harness (plan A6) can replay
 * identical RQOs against PHP and the TS server and diff the results. It must
 * never be imported by production server code.
 */

import { config } from '../../src/config/config.ts';
import {
	fixturesAvailable,
	lookupInteraction,
	oracleMode,
	recordInteraction,
} from './oracle_fixtures.ts';

export interface PhpApiCallResult {
	/** HTTP status of the call. */
	status: number;
	/** Parsed JSON response body. */
	body: Record<string, unknown>;
}

export class PhpApiClient {
	/**
	 * May be undefined on a machine without oracle config. Construction must
	 * NOT throw (S3-65: module-scope `new PhpApiClient()` used to hard-crash
	 * whole files on cred-less machines — 'Unhandled error between tests');
	 * the loud failure is deferred to the first actual call.
	 */
	private readonly baseUrl: string | undefined;
	/** PHP session cookie(s), captured from Set-Cookie and replayed verbatim. */
	private cookies = new Map<string, string>();
	/** Last CSRF token echoed by the server (attached to every next call). */
	private csrfToken: string | null = null;

	constructor(baseUrl: string | undefined = config.phpReference.apiBaseUrl) {
		this.baseUrl = baseUrl;
	}

	/** The configured base URL, or a loud throw when the oracle is absent. */
	private requireBaseUrl(): string {
		if (!this.baseUrl) {
			throw new Error(
				'PHP_API_BASE_URL is not configured (private/.env) — the parity harness needs the live PHP API. ' +
					'Gate the test with describe.if(hasPhpCredentials()) / test.if(hasPhpCredentials()).',
			);
		}
		return this.baseUrl;
	}

	/** Store cookies from a response (simple name=value capture; enough for PHP sessions). */
	private captureCookies(response: Response): void {
		for (const setCookieHeader of response.headers.getSetCookie()) {
			const firstPair = setCookieHeader.split(';')[0];
			if (!firstPair) continue;
			const separatorIndex = firstPair.indexOf('=');
			if (separatorIndex <= 0) continue;
			this.cookies.set(firstPair.slice(0, separatorIndex), firstPair.slice(separatorIndex + 1));
		}
	}

	/** POST one RQO to the PHP API, maintaining session + CSRF state. */
	async call(rqo: Record<string, unknown>): Promise<PhpApiCallResult> {
		// DEC-14b harvest seam: in fixture mode the oracle is the frozen store —
		// no network, no session, no credentials (see oracle_fixtures.ts).
		if (oracleMode() === 'fixtures') {
			const recorded = lookupInteraction('json', rqo);
			return {
				status: recorded.status,
				body: structuredClone(recorded.body ?? {}),
			};
		}
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (this.cookies.size > 0) {
			headers.Cookie = [...this.cookies.entries()]
				.map(([name, value]) => `${name}=${value}`)
				.join('; ');
		}
		if (this.csrfToken) {
			headers['X-Dedalo-Csrf-Token'] = this.csrfToken;
		}

		const response = await fetch(this.requireBaseUrl(), {
			method: 'POST',
			headers,
			body: JSON.stringify(rqo),
		});
		this.captureCookies(response);

		const body = (await response.json()) as Record<string, unknown>;
		// dd_manager appends csrf_token to every response; keep the freshest one.
		if (typeof body.csrf_token === 'string') {
			this.csrfToken = body.csrf_token;
		}
		if (oracleMode() === 'record') {
			recordInteraction('json', rqo, { status: response.status, body });
		}
		return { status: response.status, body };
	}

	/** POST one RQO and return the RAW response text (NDJSON streams etc.). */
	async callRaw(
		rqo: Record<string, unknown>,
	): Promise<{ status: number; contentType: string | null; text: string }> {
		if (oracleMode() === 'fixtures') {
			const recorded = lookupInteraction('raw', rqo);
			return {
				status: recorded.status,
				contentType: recorded.contentType ?? null,
				text: recorded.text ?? '',
			};
		}
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (this.cookies.size > 0) {
			headers.Cookie = [...this.cookies.entries()]
				.map(([name, value]) => `${name}=${value}`)
				.join('; ');
		}
		if (this.csrfToken) {
			headers['X-Dedalo-Csrf-Token'] = this.csrfToken;
		}
		const response = await fetch(this.requireBaseUrl(), {
			method: 'POST',
			headers,
			body: JSON.stringify(rqo),
		});
		this.captureCookies(response);
		const raw = {
			status: response.status,
			contentType: response.headers.get('content-type'),
			text: await response.text(),
		};
		if (oracleMode() === 'record') {
			recordInteraction('raw', rqo, raw);
		}
		return raw;
	}

	/**
	 * Log into the PHP server (dd_utils_api::login expects
	 * options.username / options.auth). Returns true on success.
	 */
	async login(username: string, password: string): Promise<boolean> {
		// A first anonymous call establishes the PHP session + CSRF token.
		await this.call({ action: 'get_environment', dd_api: 'dd_core_api' });
		const { body } = await this.call({
			action: 'login',
			dd_api: 'dd_utils_api',
			options: { username, auth: password },
		});
		// PHP login::Login returns {result: false} on failure and a truthy
		// result (true or a payload object) on success.
		return body.result !== false && body.result !== null && body.result !== undefined;
	}
}

/** Raw credential presence, independent of the oracle mode. */
function hasRawPhpCredentials(): boolean {
	return Boolean(
		config.phpReference.apiBaseUrl && config.phpReference.username && config.phpReference.password,
	);
}

/**
 * True when AN oracle is available for read-path differentials: the live PHP
 * server (base URL AND dev credentials), or — under ORACLE_MODE=fixtures — the
 * harvested golden store (DEC-14b; engineering/ORACLE_HARVEST.md). Used as the
 * collection-time condition for describe.if()/test.if() so bun reports
 * explicit SKIPS (S2-40) instead of silently green no-op tests on machines
 * without any oracle.
 */
export function hasPhpCredentials(): boolean {
	if (oracleMode() === 'fixtures') {
		return fixturesAvailable();
	}
	return hasRawPhpCredentials();
}

/**
 * True only when the LIVE PHP oracle is in play (never under
 * ORACLE_MODE=fixtures). The condition for the fixture-EXEMPT gates — the
 * ones whose PHP-side round-trips are real mutations (create/save/delete/
 * widget actions) and therefore cannot be served from frozen fixtures. See
 * FIXTURE_EXEMPT_GATES in oracle_fixtures.ts and engineering/ORACLE_HARVEST.md.
 */
export function hasLivePhpOracle(): boolean {
	return oracleMode() !== 'fixtures' && hasRawPhpCredentials();
}

/**
 * ORACLE_REQUIRED=1 — CI mode for the parity job: the canary hard-fails when
 * the oracle is absent, even if ORACLE_OPTIONAL is also set.
 */
export function oracleRequired(): boolean {
	return process.env.ORACLE_REQUIRED === '1';
}

/**
 * ORACLE_OPTIONAL=1 — explicit developer acknowledgment that this run has no
 * oracle; the canary then skips instead of failing. Ignored under
 * ORACLE_REQUIRED=1.
 */
export function oracleOptional(): boolean {
	return process.env.ORACLE_OPTIONAL === '1' && !oracleRequired();
}
