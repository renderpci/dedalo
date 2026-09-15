/**
 * Detects a CAPTCHA/bot-block/interstitial page rather than real content. Real interstitial/challenge
 * pages are compact (almost entirely the challenge message itself), so the ambiguous words are
 * only trusted as a block signal on a small response; the more specific phrasings (actual
 * Cloudflare/CAPTCHA challenge copy) are trusted regardless of page size.
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
