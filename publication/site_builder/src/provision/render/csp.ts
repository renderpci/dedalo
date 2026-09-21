/**
 * THE CONTENT SECURITY POLICY OF A GENERATED SITE — one policy, both web servers.
 *
 * WHY THIS EXISTS (audit P2-6 / CARRY-01, systemic S-4). A generated site is a static
 * tree an AGENT wrote, served to ANONYMOUS visitors, rendering values that came out of a
 * heritage record. The engine's own client escapes every such value at the render
 * boundary (render_escape.js) and runs under an enforcing CSP; a generated site has neither
 * guarantee — its markup is whatever the agent turn produced, and until this file every
 * vhost this renderer wrote shipped `X-Robots-Tag` and nothing else. If an agent-authored
 * page ever put a component value into `innerHTML`, a stored payload became live XSS on a
 * public site and nothing in the repository would notice. This header is the control that
 * does not depend on the agent having been careful.
 *
 * WHAT IT PERMITS, AND WHY EXACTLY THAT.
 *
 *   script-src 'self'   — no 'unsafe-inline', no 'unsafe-eval', no remote host. The one
 *                         directive this policy exists for: a payload in a record cannot
 *                         run, whatever the page did with it. MEASURED against the shipped
 *                         template (templates/basic, a Vite build): the entry is one
 *                         `<script type="module" src>`; Leaflet 1.9 and Chart.js 4 set
 *                         styles through the CSSOM and use no eval.
 *   style-src 'self'    — MEASURED the same way: neither the template nor its two libraries
 *                         emit a `style=` attribute or a `<style>` element. An agent design
 *                         that needs inline styles is a design decision the museum makes in
 *                         the open, by changing this policy — not a default this file
 *                         quietly grants to every site.
 *   object-src 'none', base-uri 'self', frame-ancestors 'none', form-action 'self'
 *                       — the classic bypass routes (plugins, a rewritten `<base>`, framing
 *                         the site into a phishing page, posting the page's forms elsewhere)
 *                         closed. A read-only heritage site has no legitimate use for any
 *                         of them.
 *   connect-src / img-src / media-src / font-src
 *                       — the DATA classes: 'self', the museum's declared Publication API
 *                         origin (the one host the site is built against), plus any https:
 *                         origin — map tiles, IIIF servers, the engine's media host, a web
 *                         font: a museum's design chooses these and a renderer cannot
 *                         enumerate them. These classes carry no script and cannot
 *                         exfiltrate without one, so widening them does not weaken the
 *                         directive above. `data:`/`blob:` for images and fonts is what a
 *                         bundler (and Leaflet's marker icons) actually produce.
 *
 * NO REPORT ENDPOINT. A report-uri is a host that must exist; the declaration names none,
 * and a policy that reports to nowhere is a policy that logs a 404 per violation.
 */

import type { InstanceLayout } from '../layout.ts';

/**
 * The declared Publication API's ORIGIN (scheme + host + port), for the data classes.
 * `PUBLICATION_API_URL` is validated by layout.ts against API_URL_PATTERN before it lands
 * in `envVars`, so `new URL` cannot throw on a derived layout — and a layout that arrived
 * here by another door with a URL that does not parse is refused rather than rendered
 * without the origin the site fetches from.
 */
function publicationApiOrigin(layout: InstanceLayout): string {
  const url = layout.envVars.PUBLICATION_API_URL;
  if (typeof url !== 'string' || url === '') {
    throw new Error(
      `render/csp: instance '${layout.instance}' has no PUBLICATION_API_URL in its env; ` +
        'the policy cannot name the origin the site fetches from. Nothing was rendered.',
    );
  }
  try {
    return new URL(url).origin;
  } catch {
    throw new Error(
      `render/csp: instance '${layout.instance}' PUBLICATION_API_URL is not a URL: ${JSON.stringify(url)}. Nothing was rendered.`,
    );
  }
}

/** The policy value — the string between the quotes of the header directive. */
export function contentSecurityPolicy(layout: InstanceLayout): string {
  const api = publicationApiOrigin(layout);
  const data = `'self' ${api} https:`;
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    `connect-src ${data}`,
    `img-src ${data} data: blob:`,
    `media-src ${data}`,
    `font-src 'self' https: data:`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}

/** The header, as both renderers write it. */
export const CSP_HEADER_NAME = 'Content-Security-Policy';
