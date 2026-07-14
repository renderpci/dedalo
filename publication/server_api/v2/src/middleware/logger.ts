import { config } from '../config';
import { clientIp } from '../security/client-ip';

/**
 * One structured line per request, on the stream that matches its severity — so a log
 * collector filtering by level surfaces the 4xx/5xx without the noise of every successful read.
 *
 * The severity of the LINE follows the response, not `LOG_LEVEL`: server errors always go to
 * `console.error` and client errors to `console.warn`, whatever the configured level, because
 * losing the record of a failure is never the tradeoff an operator wanted when they quieted the
 * logs. `LOG_LEVEL` decides whether the *successful* requests are printed too — and `error`
 * silences the logger entirely, which is the deliberate "log nothing" setting.
 *
 * The line leads with the request id (request-id.ts) — the same id the client received in
 * `X-Request-Id`, and therefore the join key between a user's bug report and this log line.
 */
export function logRequest(req: Request, res: Response, duration: number): void {
  if (config.LOG_LEVEL === 'error') return;

  const url = new URL(req.url);
  const method = req.method;
  const status = res.status;
  const requestId = req.headers.get('x-request-id') || '-';
  // The same resolver the rate limiter buckets on (security/client-ip.ts): forwarding headers
  // only when a proxy is trusted, otherwise the connection's peer address. Reading the headers
  // directly here would log an attacker-supplied value when nothing is proxying us, and would
  // record 'unknown' for every request in standalone mode — where the peer address is knowable.
  const ip = clientIp(req);

  const message = `[${requestId}] ${method} ${url.pathname}${url.search} ${status} ${duration.toFixed(1)}ms ${ip}`;

  if (status >= 500) {
    console.error(message);
  } else if (status >= 400) {
    console.warn(message);
  } else if (config.LOG_LEVEL === 'debug' || config.LOG_LEVEL === 'info') {
    console.log(message);
  }
}
