/**
 * Detects a CAPTCHA/bot-block/interstitial page rather than real content. Split into two tiers
 * after a real false positive found live against jesusvico.com: its normal catalogue page (250KB+
 * of real content) embeds a large i18n dictionary of the *site's own* form-validation strings for
 * bidder registration, including `"recaptcha_incorrect":"Error in validating recaptcha"` and
 * `"error_register":"Access denied"` - generic words like "captcha"/"access denied"/"forbidden"
 * matched those unrelated translation strings, not an actual block. Real interstitial/challenge
 * pages are compact (almost entirely the challenge message itself), so the ambiguous words are
 * only trusted as a block signal on a small response; the more specific phrasings (actual
 * Cloudflare/CAPTCHA challenge copy) are trusted regardless of page size.
 *
 * A second real false positive found live against numisbids.com (Cloudflare-fronted): its normal,
 * fully-successful pages routinely embed Cloudflare's own background bot-management script (email
 * obfuscation, threat scoring) referencing paths/tokens like "cloudflare-static/..." and internal
 * parameters that legitimately contain the word "challenge" - present on every visit, not just a
 * blocked one. A loose `cloudflare.*(checking|challenge)` substring match (unbounded distance,
 * matches anywhere in the head) fired on that routine script. Replaced with the actual *visible*
 * interstitial copy a real challenge page shows a human, which that background script never
 * contains - "just a moment" below already covers the modern Cloudflare challenge page's own
 * title, so no coverage is lost.
 */
const STRONG_BLOCK_SIGNALS = [
	/are you a human/i,
	/checking your browser before accessing/i,
	/verify you are (a )?human/i,
	/just a moment/i,
	/unusual traffic/i,
];

const WEAK_BLOCK_SIGNALS = [/captcha/i, /access denied/i, /forbidden/i];
const WEAK_SIGNAL_MAX_BODY_LENGTH = 15_000;

export function looksBlocked(html: string): boolean {
	const head = html.slice(0, 20_000);
	if (STRONG_BLOCK_SIGNALS.some((pattern) => pattern.test(head))) return true;
	return (
		html.length <= WEAK_SIGNAL_MAX_BODY_LENGTH &&
		WEAK_BLOCK_SIGNALS.some((pattern) => pattern.test(head))
	);
}
