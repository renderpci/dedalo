import { config } from '../config';

export function logRequest(req: Request, res: Response, duration: number): void {
  if (config.LOG_LEVEL === 'error') return;

  const url = new URL(req.url);
  const method = req.method;
  const status = res.status;
  const requestId = req.headers.get('x-request-id') || '-';
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

  const message = `[${requestId}] ${method} ${url.pathname}${url.search} ${status} ${duration.toFixed(1)}ms ${ip}`;

  if (status >= 500) {
    console.error(message);
  } else if (status >= 400) {
    console.warn(message);
  } else if (config.LOG_LEVEL === 'debug' || config.LOG_LEVEL === 'info') {
    console.log(message);
  }
}
