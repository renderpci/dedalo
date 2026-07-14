/**
 * The PUBLIC ORIGIN of this installation — the `<protocol><host>` other machines use to
 * reach it.
 *
 * Three call sites built this by hand (the ontology-server entry in the update panel, and
 * the ontology/code update manifests served to client installs), and each carried its own
 * `'localhost'` fallback. That is how `DEDALO_HOST` came to have two different defaults
 * depending on which file you opened: these three said 'localhost', while the two sites
 * that merely REPORT this install's hostname said ''. A key cannot have two defaults, so
 * the URL-building fallback lives here, once, instead of at each call site.
 *
 * WHY 'localhost' IS A TRAP, AND WHY IT IS STILL THE FALLBACK.
 * This origin is handed to OTHER installations: a client told to fetch from
 * `http://localhost/dedalo/...` will fetch from ITSELF and get nonsense (or its own files).
 * So 'localhost' is only ever correct when the client is on this same machine — i.e. a
 * developer box. Any install that actually serves ontology or code to others MUST set
 * DEDALO_HOST. We keep 'localhost' rather than throwing because that is the behavior the
 * engine has always had, and a same-machine dev setup depends on it; `publicOriginIsLocal()`
 * lets a caller notice and warn.
 */

import { readString } from '../../config/readers.ts';

/** True when no DEDALO_HOST is configured and we are falling back to the local default. */
export function publicOriginIsLocal(): boolean {
	return readString('DEDALO_HOST') === '';
}

/**
 * `<protocol><host>` with no trailing slash, e.g. `https://dedalo.example.org`.
 * Falls back to `localhost` when DEDALO_HOST is unset — see the trap above.
 */
export function publicOrigin(): string {
	const protocol = readString('DEDALO_PROTOCOL');
	const host = readString('DEDALO_HOST');
	return `${protocol}${host === '' ? 'localhost' : host}`;
}
