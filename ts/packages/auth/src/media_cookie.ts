import { createHash, randomBytes } from 'node:crypto';

/**
 * The media-protection auth cookie value/grammar, ported from
 * login::get_auth_cookie_value + media_protection (fail-closed media access).
 *
 * PHP issues a fixed-name cookie `dedalo_media_auth` whose value is a random
 * sha512 hex string (128 lowercase hex), rotated daily with today+yesterday both
 * valid, and mirrored as zero-byte marker files the web server stat()s. The web
 * server enforces access via `RewriteCond %{HTTP_COOKIE} dedalo_media_auth=([a-f0-9]{128})`.
 *
 * This module ports the value generation + grammar (the security-critical,
 * self-contained part). The marker-file store and .htaccess/nginx generation are
 * the media_protection subsystem (Phase 7) and must stay in lockstep across three
 * enforcement surfaces — they consume `MediaAuthMarkerStore` defined here.
 */

export const MEDIA_AUTH_COOKIE_NAME = 'dedalo_media_auth';

/** The exact grammar the web server enforces (sha512 hex, 128 chars, lowercase). */
const MEDIA_AUTH_VALUE_GRAMMAR = /^[a-f0-9]{128}$/;

export function isValidMediaAuthCookieValue(value: unknown): value is string {
  return typeof value === 'string' && MEDIA_AUTH_VALUE_GRAMMAR.test(value);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** PHP getdate()['yday'] — 0-based day of the year (Jan 1 = 0). */
function yearDay(now: Date): number {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - start) / 86_400_000) - 1;
}

/**
 * Generate a fresh media-auth cookie value. Mirrors PHP's formula
 * `sha512('dedalo_c_value_' . wday . yday . mday . month . random_bytes(8))`.
 * The value is non-deterministic by design (the random suffix); only its FORMAT
 * must match PHP, which it does (128 lowercase hex). Uses local date parts to
 * match PHP's date()/getdate() default timezone behavior.
 */
export function generateMediaAuthCookieValue(now: Date = new Date()): string {
  const wday = now.getDay(); // 0 (Sun) .. 6 (Sat), as PHP getdate()['wday']
  const yday = yearDay(now);
  const mday = now.getDate();
  const month = MONTHS[now.getMonth()]!;
  return createHash('sha512')
    .update(`dedalo_c_value_${wday}${yday}${mday}${month}`, 'utf8')
    .update(Uint8Array.from(randomBytes(8)))
    .digest('hex');
}

/** PHP date('Y_m_d') day key, used to index the today/yesterday cookie store. */
export function dayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}_${m}_${d}`;
}

/** Today + yesterday day keys (the two simultaneously-valid windows). */
export function validDayKeys(now: Date = new Date()): { today: string; yesterday: string } {
  const yest = new Date(now.getTime() - 86_400_000);
  return { today: dayKey(now), yesterday: dayKey(yest) };
}

/**
 * Persistence + marker seam for the media-auth cookie, implemented by the Phase 7
 * media_protection subsystem. Kept here so @dedalo/auth can issue the cookie on
 * login without owning the filesystem/htaccess layout. `syncAuthMarkers` MUST
 * reject any value failing isValidMediaAuthCookieValue (fail-closed), matching
 * media_protection::sync_auth_markers' `^[a-f0-9]{128}$` guard.
 */
export interface MediaAuthMarkerStore {
  /** Read the persisted {dayKey: cookieValue} map (today/yesterday), or null. */
  readCookieData(): Promise<Record<string, string> | null>;
  /** Persist the {dayKey: cookieValue} map. */
  writeCookieData(data: Record<string, string>): Promise<void>;
  /** Create marker files for the valid values and rotate stale ones out. */
  syncAuthMarkers(validValues: string[]): Promise<void>;
}

export interface IssuedMediaAuthCookie {
  name: string;
  value: string;
  expiresEpochSeconds: number;
}

/**
 * Resolve (recycle-or-create) today's media-auth cookie and refresh markers,
 * mirroring login::init_cookie_auth's recycle logic: reuse today+yesterday values
 * when both already persisted, else mint the missing ones. Returns the cookie to
 * set. `nowEpochSeconds` is injected for deterministic testing.
 */
export async function issueMediaAuthCookie(
  store: MediaAuthMarkerStore,
  now: Date = new Date(),
  nowEpochSeconds: number = Math.floor(now.getTime() / 1000),
): Promise<IssuedMediaAuthCookie> {
  const { today, yesterday } = validDayKeys(now);
  const existing = (await store.readCookieData()) ?? {};

  const data: Record<string, string> = {};
  data[today] = isValidMediaAuthCookieValue(existing[today]) ? existing[today]! : generateMediaAuthCookieValue(now);
  data[yesterday] = isValidMediaAuthCookieValue(existing[yesterday])
    ? existing[yesterday]!
    : generateMediaAuthCookieValue(now);

  await store.writeCookieData(data);
  await store.syncAuthMarkers([data[today]!, data[yesterday]!]);

  return {
    name: MEDIA_AUTH_COOKIE_NAME,
    value: data[today]!,
    expiresEpochSeconds: nowEpochSeconds + 86_400, // time() + 86400, matching PHP
  };
}
