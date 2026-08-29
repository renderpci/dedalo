/**
 * HOW THIS ENGINE REACHES ITS SITE-BUILDER DAEMON, AND HOW IT PROVES IT IS THE RIGHT ONE.
 *
 * Two facts live here, together, because they are the same fact seen from two sides: the
 * TRANSPORT (which socket or which URL) and the PAIRING (whose daemon that is). Keeping
 * them apart is what made the failure below possible.
 *
 * ── THE TOPOLOGY, WHICH IS NARROW ON PURPOSE ────────────────────────────────────────────
 *
 * One museum is one COMPLETE Dédalo install paired with exactly ONE site-builder instance.
 * There is no tenant map on either side and there must not be one: this engine does not
 * SELECT a daemon, it HAS an address. So everything below reads a handful of frozen config
 * values and never a per-request argument.
 *
 * ── WHY THE SOCKET IS THE TRANSPORT AND NOT AN OPTIMISATION ─────────────────────────────
 *
 * A provisioned daemon publishes no TCP listener at all. It answers on
 * `/run/dedalo-sites/<instance>/daemon.sock`, mode 0660, owned by its own service user
 * with THIS engine's group. The engine may open it because it group-owns it; no other uid
 * on the host — another museum's daemon, another museum's engine — can connect at all. The
 * ownership IS the access decision, which is why there is nothing to firewall and no token
 * crossing a network interface. `DEDALO_SITE_BUILDER_URL` remains for the genuinely remote
 * case (a daemon on another host, a laptop, a proxy).
 *
 * ── THE PAIRING PROOF, AND THE DISASTER IT DELETES ──────────────────────────────────────
 *
 * A private `.env` is the most copy-pasted artifact an operator owns. Carried from museum A
 * to museum B — or corrected on the socket line while the token line was left alone — it
 * points A's engine at B's daemon. That was undetectable by either side: within one fleet
 * the token may even be shared, and then it simply WORKS, which means A's curators driving
 * an agent inside B's workspace, spending B's provider budget, publishing onto B's public
 * domain. Not a broken feature: the exact disaster the instance model exists to prevent.
 *
 * So the pairing is proved before anything is sent. Both sides compute
 *
 *     sha256("dedalo-site-instance:" + <instance> + "\n" + <shared token>)
 *
 * the engine from `DEDALO_SITE_BUILDER_INSTANCE` + `DEDALO_SITE_BUILDER_TOKEN`, the daemon
 * from its own `DEDALO_SITE_INSTANCE` + `SERVICE_TOKEN`, and the daemon publishes its copy
 * on the one unauthenticated route it has (`GET /health`). Equal hex proves BOTH halves —
 * the identity and the credential — while disclosing NEITHER: a caller who cannot already
 * compute it learns one bit, and cannot tell which half it got wrong. A wrong instance
 * name, an instance that does not exist on that host, and a wrong token are
 * indistinguishable, so the check is not an enumeration oracle for either.
 *
 * THE RECIPE IS SPELLED TWICE — here and in the daemon's
 * `publication/site_builder/src/security/pairing.ts` — because the two are separate
 * deployables that share no module. Neither file pulls in a config, a pool or a process
 * exit (this one's single `config.ts` import is a TYPE, erased at run time), so
 * `test/unit/site_builder_pairing_tripwire.test.ts` imports BOTH and compares their output
 * on the same inputs: the equality is proved, not promised. A definition that could not be
 * loaded from the other side's test process would be kept in step by hope.
 *
 * ── THIS MODULE IS PURE ─────────────────────────────────────────────────────────────────
 *
 * It resolves, it hashes, it compares. It never opens a connection and never throws a
 * refusal: the probe and the registered `site_builder.*` throw belong to the ONE door that
 * talks to the daemon (tools/tool_sitebuilder/server/daemon_client.ts), and the ops panel
 * (area_maintenance/widgets/site_builder_status.ts) is the second reader of the transport.
 * Two consumers, one spelling.
 */

import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import type { SiteBuilderConfig } from '../../config/config.ts';

/**
 * THE DOMAIN-SEPARATION PREFIX. Byte-identical to the daemon's constant of the same name.
 *
 * It exists so this digest can never collide with some other sha256 over the same token
 * that a future feature might publish: a bare `sha256(instance + token)` is a value anyone
 * may reproduce for their own purpose, and two protocols sharing one digest is how a proof
 * of one thing quietly becomes a proof of another.
 */
export const PAIRING_FINGERPRINT_PREFIX = 'dedalo-site-instance:';

/**
 * The base path the daemon is mounted under when nothing says otherwise — the default of
 * its own `BASE_PATH` setting, which its router peels off before matching a route.
 *
 * It is a LITERAL here and a literal there, in two packages that share no module, so a
 * gate reads the daemon's config schema and asserts the two agree
 * (site_builder_pairing_tripwire). It is needed at all only for the socket transport: over
 * a socket there is no URL to carry the prefix, and the pairing fragment the provisioner
 * renders deliberately contains no URL, so an engine paired the ordinary way has this
 * literal and nothing else to prefix its requests with.
 */
export const DEFAULT_DAEMON_BASE_PATH = '/publication/site_builder';

/**
 * THE AUTHORITY IN THE REQUEST LINE OF A SOCKET CALL.
 *
 * A `fetch()` needs an absolute URL even when the bytes go to a unix socket, and the host
 * in that URL is what becomes the `Host:` header. Nothing routes on it — the daemon serves
 * one instance and matches on the path — but it is written into the daemon's logs, so it
 * says what is true: this request came from a paired engine over a socket. `.invalid` is
 * the reserved TLD that can never resolve in DNS (RFC 2606), which is the point: if this
 * URL ever escaped to a real network stack it would fail closed instead of reaching some
 * host that happens to exist.
 */
const SOCKET_AUTHORITY = 'http://site-builder.invalid';

/** Where the engine sends its requests, and over what. */
export interface SiteBuilderTransport {
	/**
	 * Absolute URL prefix, no trailing slash: a request path is appended verbatim. Over a
	 * socket this carries only the path prefix and the Host header.
	 */
	readonly base: string;
	/** The unix socket to dial, or undefined for an ordinary network request. */
	readonly unixSocket: string | undefined;
	/** The shared bearer. NEVER logged, never put in a message that leaves the process. */
	readonly token: string;
	/** The daemon instance this engine is paired with. */
	readonly instance: string;
	readonly timeoutMs: number;
}

/**
 * A configured value, or `undefined`.
 *
 * An EMPTY string is not a value: `KEY=` in an env file is how a key gets commented out
 * without deleting the line, and reading it as "a socket path" or "a token" would produce a
 * transport that dials nowhere with a credential of length zero. One helper rather than the
 * same two-part test written four times, so the four halves of the pairing cannot come to
 * disagree about what "set" means.
 */
function configured(value: string | undefined): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * The transport, or `null` when this install has no site builder.
 *
 * PARTIAL IS UNCONFIGURED, and that is the fail-closed reading. A transport without an
 * instance name is an engine that cannot prove which museum's daemon it is dialling; a
 * transport without a token cannot authenticate at all. Both are configuration mistakes
 * whose safe interpretation is "the feature is off", never "connect anyway and hope".
 *
 * `describeUnconfigured()` below says WHICH half is missing, for the server log — the
 * caller gets one undifferentiated refusal.
 */
export function resolveSiteBuilderTransport(
	siteBuilder: SiteBuilderConfig,
): SiteBuilderTransport | null {
	const instance = configured(siteBuilder.instance);
	const token = configured(siteBuilder.token);
	const socket = configured(siteBuilder.socket);
	const url = configured(siteBuilder.url);

	if (instance === undefined || token === undefined) return null;
	if (socket === undefined && url === undefined) return null;

	// The socket WINS over a URL that is also set: the URL then supplies only the path
	// prefix and the host name. An operator who has both lines has a same-host daemon and a
	// leftover (or documentary) address; dialling the network in that case would be
	// choosing the transport whose access control is a firewall rule over the one whose
	// access control is file ownership.
	const base =
		url === undefined ? `${SOCKET_AUTHORITY}${DEFAULT_DAEMON_BASE_PATH}` : url.replace(/\/+$/, '');

	return Object.freeze({
		base,
		unixSocket: socket,
		token,
		instance,
		timeoutMs: siteBuilder.timeoutMs,
	});
}

/**
 * Which half of the configuration is missing, as a sentence for the SERVER LOG.
 *
 * Never for the wire: an operator reading the journal needs to know that the instance name
 * is absent, while a browser must learn nothing beyond "the site builder is not
 * configured". Names keys, never values — the token's absence is reportable, its content
 * is not.
 */
export function describeUnconfigured(siteBuilder: SiteBuilderConfig): string {
	const missing: string[] = [];
	if (configured(siteBuilder.instance) === undefined) {
		missing.push('DEDALO_SITE_BUILDER_INSTANCE');
	}
	if (configured(siteBuilder.token) === undefined) {
		missing.push('DEDALO_SITE_BUILDER_TOKEN');
	}
	if (configured(siteBuilder.socket) === undefined && configured(siteBuilder.url) === undefined) {
		missing.push('DEDALO_SITE_BUILDER_SOCKET (or DEDALO_SITE_BUILDER_URL)');
	}
	return missing.length === 0
		? 'the site builder is configured'
		: `the site builder is not configured: ${missing.join(', ')} unset in ../private/.env`;
}

/**
 * The pairing fingerprint, lower-case hex.
 *
 * The newline between the instance and the token is not decoration: it is what makes the
 * encoding unambiguous. Without it, instance `ab` + token `cde` and instance `abc` + token
 * `de` would hash identically, and anyone able to choose one half could shift bytes across
 * the boundary. The instance name is constrained to `[a-z][a-z0-9-]*` on the daemon's side,
 * so it can never contain the separator itself.
 */
export function instanceFingerprint(instance: string, token: string): string {
	return new Bun.CryptoHasher('sha256')
		.update(`${PAIRING_FINGERPRINT_PREFIX}${instance}\n${token}`)
		.digest('hex');
}

/**
 * Does the fingerprint a daemon published match the one this pairing implies?
 *
 * A missing or malformed field counts as a MISMATCH, deliberately. The alternative — "an
 * old daemon does not publish it, so let it through" — is a downgrade any wrong daemon
 * could take simply by not answering the question, which would leave the whole proof
 * optional. A daemon too old to answer is a daemon to upgrade, and the server log says so.
 *
 * CONSTANT TIME, because the comparison happens against something a stranger controls. The
 * refusal fires BEFORE the bearer is sent, so a rogue daemon on the other end never sees
 * the token — but it does get to hand us bytes and observe how long we take over them, and
 * a byte-at-a-time compare would let it read our expected fingerprint out of that timing.
 * The fingerprint is a hash of the token; handing it over would turn a pre-image problem
 * into an offline brute force. Costs one buffer compare on a 64-character hex string.
 */
export function fingerprintMatches(published: unknown, expected: string): boolean {
	if (typeof published !== 'string' || published.length !== expected.length) return false;
	// timingSafeEqual demands equal lengths, which the guard above has established. Both
	// sides are lower-case hex of a fixed width, so the length itself discloses nothing.
	return timingSafeEqual(Buffer.from(published, 'utf8'), Buffer.from(expected, 'utf8'));
}
