/**
 * Authenticated-session helper for capturing golden masters that require login.
 *
 * Reproduces the frontend's two-step login (core/login/js/login.js): `start`
 * (mints the session + CSRF) then `login` on dd_utils_api with the password sent
 * as `options.auth`. Returns the accumulated Cookie header + the post-login CSRF
 * token, which the capture client forwards on subsequent authenticated requests.
 */

export interface AuthSession {
  cookie: string;
  csrfToken: string;
}

/** Parse Set-Cookie headers into name=value pairs (dropping attributes). */
function collectCookies(into: Map<string, string>, res: Response): void {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const sc of setCookies) {
    const firstPair = sc.split(';', 1)[0] ?? '';
    const eq = firstPair.indexOf('=');
    if (eq > 0) into.set(firstPair.slice(0, eq).trim(), firstPair.slice(eq + 1).trim());
  }
}

function renderCookie(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

export async function login(
  apiUrl: string,
  username: string,
  password: string,
): Promise<AuthSession> {
  const jar = new Map<string, string>();

  // 1. start — establishes the session and returns the first CSRF token.
  const r1 = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dd_api: 'dd_core_api', action: 'start' }),
  });
  collectCookies(jar, r1);
  const startBody = (await r1.json()) as { csrf_token?: string };
  let csrfToken = startBody.csrf_token ?? '';

  // 2. login — password travels as options.auth (frontend contract).
  const r2 = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: renderCookie(jar),
      'x-dedalo-csrf-token': csrfToken,
    },
    body: JSON.stringify({
      dd_api: 'dd_utils_api',
      action: 'login',
      options: { username, auth: password },
    }),
  });
  collectCookies(jar, r2);
  const loginBody = (await r2.json()) as { result?: unknown; msg?: string; csrf_token?: string };
  if (loginBody.result !== true) {
    throw new Error(`login failed for ${username}: ${loginBody.msg ?? 'unknown error'}`);
  }
  if (typeof loginBody.csrf_token === 'string') csrfToken = loginBody.csrf_token;

  return { cookie: renderCookie(jar), csrfToken };
}
