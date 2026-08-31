/**
 * CONFIG CATALOG — domain: external
 *
 * The knobs of the EXTERNAL-SERVICES subsystem: the engine's outbound side, where an
 * ontology node declares a non-`dedalo` api_engine (a bibliographic catalogue, an
 * authority file) and the engine fetches records from it instead of from the matrix.
 *
 * The shape of this domain is deliberate. Reaching a third-party service is the one
 * place where an editor's keystroke turns into a request leaving the institution, so
 * every knob here either FAILS CLOSED (the host allowlist, the kill switches) or BOUNDS
 * the damage a sick service can do (timeout, byte ceiling, concurrency, retries, the
 * breaker, and the two emission ceilings that keep a hostile payload from becoming a
 * record the client has to render).
 */

import type { CatalogEntry } from '../catalog_types.ts';

export const EXTERNAL_KEYS = {
	DEDALO_EXTERNAL_ENABLED: {
		type: 'boolean',
		scope: 'operator',
		default: true,
		heading: 'Enabling external record services',
		typeLabel: 'bool',
		doc: `The master switch for every outbound record lookup. With it on (the default), a
component whose ontology declares a service other than Dédalo's own may resolve its values
from that service; with it off, every such component resolves to nothing and every outbound
call is refused — the rest of the application is untouched, and no record stored in the
matrix changes.

Turning it on is not by itself permission to reach anywhere: an outbound request must ALSO
name a host you have allowed (\`DEDALO_EXTERNAL_ALLOWED_HOSTS\`), which is empty by default.
The switch decides whether the subsystem exists at all; the allowlist decides where it may
go.

\`\`\`bash
DEDALO_EXTERNAL_ENABLED=true
\`\`\``,
	},
	DEDALO_EXTERNAL_DISABLED_SERVICES: {
		type: 'string_list',
		scope: 'operator',
		default: '',
		heading: 'Disabling one external service',
		typeLabel: 'string[]',
		doc: `A comma-separated list of service names that must not be contacted, while the rest of
the subsystem keeps working. It is the per-service kill switch: when one catalogue is down,
misbehaving, or has become a legal problem, you name it here instead of turning the whole
outbound side off.

The names are the service identifiers the ontology uses (the \`api_engine\` a node declares),
compared case-insensitively. A component bound to a disabled service resolves to nothing and
says so, exactly as if the master switch were off — it never falls back to a different
service. Empty by default: nothing is singled out.

\`\`\`bash
DEDALO_EXTERNAL_DISABLED_SERVICES=zenon
\`\`\``,
	},
	DEDALO_EXTERNAL_ALLOWED_HOSTS: {
		type: 'string_list',
		scope: 'operator',
		default: '',
		heading: 'Allowing the hosts the engine may contact',
		typeLabel: 'string[]',
		doc: `The comma-separated list of host names the engine may send an outbound record request
to. Read the default carefully, because it inverts the usual reading of an empty list:
**empty means every outbound request is REFUSED**. The allowlist is not a narrowing of an
otherwise open door — it *is* the door.

That is deliberate. The address a request goes to is assembled from the ontology, which is
editable data: without an allowlist held by the operator, an ontology edit would be enough to
make the server fetch from anywhere, including inside your own network. So the institution
states, once and in a file only it can write, the set of hosts it has decided to talk to. A
request to any other host is refused before a connection is opened, and refused loudly.

Entries are compared case-insensitively against the host name alone — no scheme, no path, no
port, and no wildcards: name each host you mean.

\`\`\`bash
DEDALO_EXTERNAL_ALLOWED_HOSTS=zenon.dainst.org
\`\`\``,
	},
	DEDALO_EXTERNAL_TIMEOUT_MS: {
		type: 'number',
		scope: 'operator',
		default: 4000,
		clamp: { min: 1 },
		heading: 'Defining the external request timeout',
		typeLabel: 'int',
		doc: `How long, in milliseconds, the engine waits for one outbound response before giving up.
It is what keeps a slow third party from becoming a slow Dédalo: an editor opening a record
must not sit behind someone else's overloaded server.

A timed-out request is a failed lookup, never a partial one — nothing half-read is ever shown
as a value or stored. 4000 is the historical value and suits a catalogue on the public
internet; raise it only if a service you depend on is genuinely slow, and remember that the
wait is paid on every record view that is not served from the row cache.

\`\`\`bash
DEDALO_EXTERNAL_TIMEOUT_MS=4000
\`\`\``,
	},
	DEDALO_EXTERNAL_MAX_BYTES: {
		type: 'number',
		scope: 'operator',
		default: 2097152,
		clamp: { min: 1 },
		heading: 'Defining the external response size ceiling',
		typeLabel: 'int',
		doc: `The largest response, in bytes, the engine will read from an external service. Reading
stops at the ceiling and the lookup fails; it is never truncated into a value, because half a
document parsed as a whole one is worse than no document.

It bounds the memory one hostile or broken service can make the server spend — a server that
answers a record lookup with a gigabyte of anything must not be able to take the engine down.
2097152 (2 MiB) is far above any bibliographic record and far below a problem.

\`\`\`bash
DEDALO_EXTERNAL_MAX_BYTES=2097152
\`\`\``,
	},
	DEDALO_EXTERNAL_MAX_CONCURRENCY: {
		type: 'number',
		scope: 'operator',
		default: 4,
		clamp: { min: 1 },
		heading: 'Defining the external request concurrency',
		typeLabel: 'int',
		doc: `How many outbound requests may be in flight at once towards one service on one host.
Further requests wait for a slot rather than being refused.

It protects both ends. A list view can hold dozens of components bound to the same catalogue,
and firing them all at once is how an institution gets rate-limited or blocked — the ceiling
makes Dédalo a polite client by construction rather than by luck. Lower it if a service asks
you to; raise it only against a service you run yourself.

\`\`\`bash
DEDALO_EXTERNAL_MAX_CONCURRENCY=4
\`\`\``,
	},
	DEDALO_EXTERNAL_SOFT_TTL_MS: {
		type: 'number',
		scope: 'operator',
		default: 300000,
		clamp: { min: 0 },
		heading: 'Defining how often a cached external row is refreshed',
		typeLabel: 'int',
		doc: `How old, in milliseconds, a cached external row may get before the engine asks the
service for it again. It is a SOFT age: a row past it is still served — immediately, from the
cache — and the refresh happens behind the request. An editor never waits on a third party for
data Dédalo already has.

That is what makes the subsystem survive an outage: while a service is unreachable the last
good values keep being shown, marked as such, instead of records emptying out. Raise it for a
catalogue that changes yearly; lower it where freshness genuinely matters. 300000 is five
minutes.

\`\`\`bash
DEDALO_EXTERNAL_SOFT_TTL_MS=300000
\`\`\``,
	},
	DEDALO_EXTERNAL_RETRY_ATTEMPTS: {
		type: 'number',
		scope: 'operator',
		default: 2,
		clamp: { min: 0, max: 10 },
		heading: 'Defining the external retry count',
		typeLabel: 'int',
		doc: `How many further attempts one outbound lookup makes after the first one fails, with a
growing pause between them. Only failures that a retry could plausibly fix are retried — a
dropped connection, a timeout, a "try later" from the service. A refusal, a not-found or a
malformed document is final and is not repeated.

Set it to \`0\` to make every lookup single-shot. Do not raise it far: retries multiply the
load a struggling service is already failing under, which is what the circuit breaker
(\`DEDALO_EXTERNAL_BREAKER_COOLDOWN_MS\`) exists to stop.

\`\`\`bash
DEDALO_EXTERNAL_RETRY_ATTEMPTS=2
\`\`\``,
	},
	DEDALO_EXTERNAL_BREAKER_COOLDOWN_MS: {
		type: 'number',
		scope: 'operator',
		default: 60000,
		clamp: { min: 0 },
		heading: 'Defining the external circuit-breaker cooldown',
		typeLabel: 'int',
		doc: `How long, in milliseconds, the engine stops calling a service after it has failed
repeatedly. During the cooldown every lookup for that service fails instantly from cached data
or from nothing at all — no connection is attempted.

It is the difference between one broken third party and a broken installation: without it,
every record view retries a dead host and every user waits the full timeout for it. The
breaker closes again on its own after the cooldown, and one successful call restores normal
service. 60000 is one minute.

\`\`\`bash
DEDALO_EXTERNAL_BREAKER_COOLDOWN_MS=60000
\`\`\``,
	},
	DEDALO_EXTERNAL_MAX_ENTRY_CHARS: {
		type: 'number',
		scope: 'operator',
		default: 8192,
		clamp: { min: 1 },
		heading: 'Defining the external entry length ceiling',
		typeLabel: 'int',
		doc: `The longest single value, in characters, the engine will emit from an external record.
A longer one is refused rather than cut: a silently shortened title is a wrong title, and it
would look exactly like a real one.

The value a third party returns is rendered by the client and may be exported and published
from there, so its size is not only a display question. 8192 characters is generous for a
bibliographic field and small enough that no single entry can bloat a record.

\`\`\`bash
DEDALO_EXTERNAL_MAX_ENTRY_CHARS=8192
\`\`\``,
	},
	DEDALO_EXTERNAL_MAX_ENTRIES: {
		type: 'number',
		scope: 'operator',
		default: 50,
		clamp: { min: 1 },
		heading: 'Defining the external entry count ceiling',
		typeLabel: 'int',
		doc: `How many values one external component may emit for one record — the count ceiling
beside the length ceiling. A response offering more is cut to this many, and the fact that it
was cut is reported rather than hidden.

It bounds what one remote answer can do to a page: a record with ten thousand contributors
would otherwise be rendered in full, in every list row that shows it. 50 comfortably covers a
real bibliographic record.

\`\`\`bash
DEDALO_EXTERNAL_MAX_ENTRIES=50
\`\`\``,
	},
	DEDALO_EXTERNAL_ZENON_API_KEY: {
		type: 'string',
		scope: 'secret',
		// ONE READER, and it is not the typed config object. The credential is
		// fetched BY NAME at the single outbound door —
		// src/external/transport.ts::attachCredential, via the service model's
		// `credentialCatalogKey` — which also asserts this entry's scope is
		// 'secret' before attaching it. Until 2026-08-31 a `config.external
		// .zenonApiKey` field ALSO existed and was read by nothing: a
		// security-relevant value with two readers, of which the one an auditor
		// finds first (the typed catalog this project reads config through) was
		// the DEAD one. Deleted (P2-27 / DEAD-09).
		consumer: 'src/external/transport.ts::attachCredential, by name via credentialCatalogKey',
		default: undefined,
		heading: 'Defining the Zenon credential',
		typeLabel: 'string',
		doc: `The credential sent to the Zenon bibliographic service. Zenon's public interface needs
none today, so this is unset by default and unset simply means the request carries no
authorization header — the lookup works exactly as before.

It exists because the credential PATH must exist before it is needed: a service that starts
asking for a key, or a second service added beside this one, must not require a code change to
be authenticated. It is a secret — keep it in \`../private/.env\`, never in a repository, and
never in the ontology, which is editable data.

\`\`\`bash
DEDALO_EXTERNAL_ZENON_API_KEY="•••••"
\`\`\``,
	},
} as const satisfies Record<string, CatalogEntry>;
