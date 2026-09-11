/**
 * Single identifiable User-Agent used by every source's acquisition code, whether or not it
 * consults robots.txt for that fetch - conservative and honest either way, never a spoofed
 * browser or bot identity. Previously two near-identical strings existed (one Biddr-named, one
 * generic) purely by historical accident of which source was built first; consolidated to one.
 */
export const USER_AGENT =
	'PersonalNumismaticArchive/1.0 (+local personal research tool; conservative fetch rate)';
