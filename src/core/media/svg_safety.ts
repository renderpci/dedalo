/**
 * SVG SAFETY — the ONE definition of how an SVG under the media root may be served.
 *
 * SVG is the only image format that is also a DOCUMENT: it carries <script>, inline
 * event handlers, <foreignObject> (arbitrary HTML) and SMIL animation targets. Served
 * inline from the media origin — which is the SAME ORIGIN as the application in the
 * documented topology — an uploaded .svg is stored XSS against a curator's session.
 *
 * There are TWO populations under the media root and they must be served differently
 * (SECURITY_DECISIONS DECISION 2, "MEDIA-03 refined close", 2026-07-10):
 *
 *  - the SERVER-GENERATED image envelope (`<imageFolder>/…/svg/…/x.svg`, written only
 *    by svg_overlay.ts's fixed template and gated by ENVELOPE_REFUSALS below). The
 *    client renders it INLINE through `<object type="image/svg+xml">` and needs
 *    same-origin contentDocument access (quality switch, vector editor) plus the
 *    same-origin raster `<image>` fetch. `attachment` or a CSP `sandbox` severs all of
 *    that and the edit view renders blank — so this population gets a CSP that blocks
 *    SCRIPT without forcing an opaque origin.
 *  - EVERY OTHER SVG (raw component_svg uploads — uploader bytes). The client only ever
 *    uses those as an `<img src>` subresource, where a Content-Disposition is invisible,
 *    so they get the strict attachment + sandbox lockdown.
 *
 * WHY THIS MODULE EXISTS. The rule was implemented twice, in two languages, for two
 * consumers: `mediaSvgSafetyHeaders()` in src/server.ts (the Bun dev/fallback route) and
 * — since 2026-08-24 — the generated Apache/nginx rules in protection.ts, which are what
 * actually serves media in production. Until then the production origin emitted NO
 * headers at all and DECISION 2's closing sentence ("the production nginx/.htaccess
 * template must mirror the two path-scoped rules when it lands") was simply unpaid. Two
 * hand-written copies of a security rule drift, and the drift is invisible: this module
 * is the single source both consume, and media_protection_tripwire pins that they agree.
 *
 * The JS predicate and the PCRE below are the SAME RULE in two dialects. Keep them that
 * way: the envelope really lives one bucket directory deeper than its `svg/` segment
 * (`image/svg/0/rsc29_rsc170_1.svg`), so a pattern anchoring the file DIRECTLY inside
 * `svg/` matches no real envelope and quietly sends every one of them down the
 * attachment branch — a blank edit view on every Apache/nginx install.
 */

import { config } from '../../config/config.ts';

/**
 * The envelope CSP. `script-src 'none'` blocks inline script, `on*` handlers,
 * <foreignObject> script and SMIL-set script; `img-src 'self' data:` admits the raster
 * the envelope embeds and nothing else. NO `sandbox` — sandbox forces an opaque origin,
 * which severs the parent page's contentDocument access and blanks the edit view.
 * (`sandbox allow-same-origin` was rejected: its application to <object>-embedded
 * documents is browser-inconsistent, and a token error silently re-breaks the same
 * contract for no gain over `script-src 'none'`.)
 */
export const SVG_ENVELOPE_CSP =
	"default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'none'; form-action 'none'; base-uri 'none'";

/** The lockdown for uploader-supplied vector/XML: no origin, no script, nothing. */
export const SVG_QUARANTINE_CSP = "default-src 'none'; sandbox";

/** Uploader-supplied vector/XML is a DOWNLOAD, never a document the browser parses. */
export const SVG_QUARANTINE_DISPOSITION = 'attachment';

/** Emitted for the WHOLE media root: a .jpg whose bytes sniff as HTML is not a document. */
export const MEDIA_NOSNIFF = 'nosniff';

/**
 * The extensions that get the quarantine treatment. `.svg` and `.xml` are legitimate
 * heritage data (a curator's drawing, a finding aid) — they are SERVED, as a download.
 * Contrast MEDIA_ACTIVE_DOCUMENT_EXTENSIONS below, which are refused outright.
 */
export const SVG_QUARANTINE_EXTENSIONS = ['svg', 'xml', 'xsl', 'xslt'] as const;

/**
 * Extensions no media model accepts and that no web server should ever hand a browser
 * as a document (checked against every `allowedExtensions` list in config/catalog/media).
 * These are DENIED, not quarantined: nothing legitimate under the media root has them,
 * so a file with one of these names is either an attack or debris.
 */
export const MEDIA_ACTIVE_DOCUMENT_EXTENSIONS = [
	'html',
	'htm',
	'xhtml',
	'xht',
	'shtml',
	'swf',
	'hta',
] as const;

/** The image folder as a path SEGMENT (config stores it with a leading slash). */
function imageFolderSegment(): string {
	return config.media.image.folder.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Is this media-root-relative path a server-generated image envelope?
 * THE selection rule, in JS. `relSegments` e.g. ['image','svg','0','x.svg'].
 */
export function isImageEnvelopeSvg(relSegments: readonly string[]): boolean {
	return relSegments[0] === imageFolderSegment() && relSegments.includes('svg');
}

/**
 * THE SAME RULE as a PCRE over the request URI, for the generated web-server rules.
 * Anchored at the media URL space (`/dedalo/<mediaDir>`), because that — not the
 * filesystem root — is what Apache's `<If>` and nginx's `map` actually see.
 *
 * Mirrors isImageEnvelopeSvg exactly: first segment is the image folder, SOME later
 * segment is literally `svg`, and the file ends in `.svg`. The `(?:[^/]+/)*` on BOTH
 * sides of `svg/` is the part that matters — the envelope sits in a bucket directory
 * below it, and an install may carry a non-empty initial media path above it.
 */
export function imageEnvelopePcre(): string {
	const url = `/dedalo/${config.mediaDir}`;
	return `^${escapePcreLiteral(url)}/${escapePcreLiteral(imageFolderSegment())}/(?:[^/]+/)*svg/(?:[^/]+/)*[^/]+\\.svg$`;
}

/** The quarantine population as a PCRE (extension alternation), for the same consumers. */
export function svgQuarantinePcre(): string {
	return `\\.(?:${SVG_QUARANTINE_EXTENSIONS.join('|')})$`;
}

/** Escape a literal for embedding in a PCRE (media dir / image folder carry '.' and '-'). */
function escapePcreLiteral(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * SVG CONSTRUCTS AN ENVELOPE MAY NOT CARRY, and the same table used to DESCRIBE what an
 * uploaded SVG contains.
 *
 * Two consumers, two different verdicts, deliberately:
 *  - svg_overlay.writeSvgEnvelope REFUSES a payload matching any of these. The envelope
 *    is generated by our own vector editor from a drawing; a match means the payload is
 *    not what it claims to be, and the write fails loudly.
 *  - the UPLOAD path only NOTICES them. Refusing a curator's SVG because it carries a
 *    <foreignObject> is data loss — a heritage archive may legitimately hold a vector
 *    file we did not author, and the serving-side quarantine (attachment + sandbox) is
 *    what actually makes it inert. The notice exists so an operator can find such files,
 *    not so the engine can reject them.
 */
export const ENVELOPE_REFUSALS: readonly { pattern: RegExp; what: string }[] = [
	{ pattern: /<\s*script\b/i, what: '<script>' },
	{ pattern: /<\s*foreignObject\b/i, what: '<foreignObject> (arbitrary HTML)' },
	{
		pattern: /<\s*(iframe|embed|object|animate|set|handler)\b/i,
		what: 'an embedding/animation element',
	},
	{ pattern: /<!DOCTYPE/i, what: 'a DOCTYPE (entity expansion / XXE)' },
	{ pattern: /<!ENTITY/i, what: 'an ENTITY declaration' },
	// The QUOTE is required, and that is not a weakening: an envelope is served as
	// image/svg+xml and loaded by the client through an <object>, i.e. parsed as
	// XML, where an unquoted attribute value is a fatal parse error — `onload=x`
	// without quotes cannot execute because the document never renders. Requiring
	// it keeps the ANNOTATION TEXT of a drawing out of the refusal: a curator
	// marking up a switch position ("on=off") wrote no attribute, and a save that
	// refuses their drawing forever — the stored item replays through this gate on
	// every later save — is a false positive with no way out.
	{ pattern: /\son[a-z]+\s*=\s*["']/i, what: 'an inline event handler (on…=)' },
	{
		pattern: /(?:href|src|from|to|values)\s*=\s*["']?\s*(?:javascript|data:text\/html|vbscript)/i,
		what: 'a script URL',
	},
];

/**
 * Which active-content constructs an SVG payload carries, by name. Empty = none found.
 * DESCRIPTIVE ONLY — a caller decides whether that is a refusal or a notice. The names
 * are this table's own English and never echo the payload.
 */
export function detectActiveSvgContent(svgString: string): string[] {
	const found: string[] = [];
	for (const { pattern, what } of ENVELOPE_REFUSALS) {
		if (pattern.test(svgString)) found.push(what);
	}
	return found;
}
