/**
 * CONFIG CATALOG — domain: server
 *
 * GENERATED SCAFFOLD (probe_emit_catalog.ts). Hand-edit from here on.
 */

import type { CatalogEntry } from '../catalog_types.ts';

export const SERVER_KEYS = {
	DEDALO_SUPERVISED: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Declaring that a process supervisor is present',
		typeLabel: 'bool',
		typeSuffix: '(optional; auto-detected)',
		doc: `A code update replaces the installation tree and then exits the server process, so that
it comes back up running the new code. That only works if **something restarts it**. To
avoid taking the server down for good, the update refuses to run unless it can see a
supervisor.

Leave this unset and the engine detects one by itself: a service manager exposes its own
markers in the environment (see \`INVOCATION_ID\` / \`JOURNAL_STREAM\`). Set it to \`true\`
when the server is supervised by something the detection does not recognise — a container
restart policy, a process manager, a shell loop that relaunches on exit — and the update
would otherwise be refused with *"No supervisor detected"*. Set it to \`false\` to state
there is none.

Declaring \`true\` on a process that nothing restarts is the one dangerous mistake here:
the update will swap the code, exit, and the server will stay down until you start it
by hand.

\`\`\`bash
DEDALO_SUPERVISED=true
\`\`\``,
	},
	INVOCATION_ID: {
		type: 'string',
		scope: 'environment',
		default: undefined,
		heading: 'Service invocation id (injected — not an administrator setting)',
		typeLabel: 'string',
		doc: `**Not a Dédalo setting, and not something to put in the configuration file.** The system
service manager injects this variable into every service it starts, with a unique id for
that run.

Dédalo only *reads* it, as one of the two signals that say "this process is supervised, so
a restart after a code update will be respawned" — see \`DEDALO_SUPERVISED\`.`,
	},
	JOURNAL_STREAM: {
		type: 'string',
		scope: 'environment',
		default: undefined,
		heading: 'Service journal stream (injected — not an administrator setting)',
		typeLabel: 'string',
		doc: `**Not a Dédalo setting, and not something to put in the configuration file.** The system
service manager injects this variable when the process's output is connected to the system
journal.

Like \`INVOCATION_ID\`, Dédalo only *reads* it, to detect that the process is supervised and
that a self-restart after a code update will be respawned (see \`DEDALO_SUPERVISED\`).`,
	},
	NODE_TLS_REJECT_UNAUTHORIZED: {
		type: 'string',
		scope: 'internal',
		default: undefined,
		heading: 'TLS verification switch (engine guard — never set it)',
		typeLabel: 'string',
		doc: `**Not a Dédalo setting: a runtime variable Dédalo defends against.** Setting it to \`0\`
turns OFF certificate verification for *every* outgoing connection the process makes —
ontology master servers, code-release downloads, external services — leaving them open to
interception.

The engine treats it as a hazard rather than an option: the ontology import **refuses to
run at all** while \`NODE_TLS_REJECT_UNAUTHORIZED=0\` is in the environment, and stops with
an explicit error.

If a server you must reach presents a private or self-signed certificate, trust its
authority instead of disabling verification — point \`NODE_EXTRA_CA_CERTS\` at the
certificate-authority bundle.`,
	},
	SERVER_IDLE_TIMEOUT_S: {
		type: 'number',
		scope: 'operator',
		default: 255,
		clamp: { min: 1, max: 255 },
		heading: 'Defining the request idle timeout',
		typeLabel: 'int',
		doc: `How many seconds a request may stay idle before the engine drops the connection. It
applies to both listeners, and it is clamped to the range 1–255.

Default \`255\` (the maximum): deliberately generous, because the previous silent 10-second
default killed slow but perfectly legitimate work — large exports, wide searches, long tool
actions — in the middle of the handler.

Whatever you choose, **the web server in front must be at least as patient**: a reverse-proxy
read timeout shorter than your slowest legitimate request re-introduces exactly the same
failure one hop earlier (in nginx, \`proxy_read_timeout\`).

\`\`\`bash
SERVER_IDLE_TIMEOUT_S=255
\`\`\``,
	},
	SERVER_MAX_BODY_BYTES: {
		type: 'number',
		scope: 'operator',
		default: 256 * 1024 * 1024,
		clamp: { min: 1 },
		heading: 'Defining the maximum request body size',
		typeLabel: 'int',
		doc: `The ceiling, in bytes, on the body of any single request the engine accepts. Every body
is buffered whole in a long-lived process, so an unbounded one is a memory-exhaustion
hazard — this is the cap that bounds it.

Default \`268435456\` (256 MiB). It does **not** limit the size of a media file: the client
always uploads large files in chunks, so a single request only ever has to carry one chunk.
The per-file limit is \`DEDALO_UPLOAD_MAX_SIZE_BYTES\`, and the chunk size is
\`DEDALO_UPLOAD_SERVICE_CHUNK_FILES\`.

Raise it only if a legitimate single request genuinely needs more, and remember the web
server has its own limit — in nginx, \`client_max_body_size\` — which will reject the request
first if it is lower.

\`\`\`bash
SERVER_MAX_BODY_BYTES=268435456
\`\`\``,
	},
	SERVER_SHUTDOWN_GRACE_MS: {
		type: 'number',
		scope: 'operator',
		default: 10000,
		clamp: { min: 0 },
		heading: 'Defining the shutdown grace period',
		typeLabel: 'int',
		doc: `When the server is asked to stop — a service restart, a deploy, a Ctrl-C — it stops
accepting new connections and then **drains the requests already in flight** for up to this
many milliseconds before it closes the database pool, removes the socket file and exits.
Users mid-save are not cut off by a routine restart.

Default \`10000\` (10 seconds). Raise it if your slowest legitimate request is longer and you
want it to survive a restart; \`0\` exits immediately and abandons whatever was running.

Keep it **below** the stop timeout of whatever supervises the process, or the supervisor
will kill the server before the drain has finished — which defeats the purpose.

\`\`\`bash
SERVER_SHUTDOWN_GRACE_MS=10000
\`\`\``,
	},
	SERVER_TCP_PORT: {
		type: 'number',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the development TCP port',
		typeLabel: 'int',
		typeSuffix: '(optional; development only)',
		doc: `When set, the engine opens an **additional** plain-HTTP listener on this port, on top of
the unix socket, and the client is reachable at \`http://localhost:<port>/dedalo/core/page/\`.
It exists because a browser cannot talk to a unix socket directly, so a developer would
otherwise need a web server in front of every local checkout.

Leave it **unset in production**. This listener terminates no TLS, and it is the only one
that will serve media straight from the engine when media protection is unconfigured — with
no per-record access control. A production install serves on the socket only, behind the
reverse proxy that owns TLS, the static files and the media.

\`\`\`bash
SERVER_TCP_PORT=3000
\`\`\``,
	},
	SERVER_UNIX_SOCKET: {
		type: 'string',
		scope: 'operator',
		default: '/tmp/dedalo_ts.sock',
		heading: 'Defining the server socket',
		typeLabel: 'string',
		doc: `The unix socket the engine listens on. In production this is the **only** listener: the web
server owns TCP and TLS, serves the client files and the media, and forwards the API and the
dynamic routes to this socket.

Default \`/tmp/dedalo_ts.sock\`. On a system that cleans \`/tmp\`, prefer a directory of your
own (\`/run/dedalo/\`). The path must be writable by the user the engine runs as and reachable
by the user the web server runs as — a socket neither can open is the usual cause of a
"bad gateway" that looks like the engine is down.

If the file already exists at start-up the engine probes it: when a live instance answers,
it **refuses to start** rather than quietly steal the running server's socket; a leftover
file from an unclean stop is removed.

\`\`\`bash
SERVER_UNIX_SOCKET="/run/dedalo/dedalo_ts.sock"
\`\`\``,
	},
	TRUSTED_PROXY_HOPS: {
		type: 'number',
		scope: 'operator',
		default: 1,
		clamp: { min: 1 },
		heading: 'Defining the number of trusted proxy hops',
		typeLabel: 'int',
		doc: `How many reverse proxies stand between the internet and the engine. Each one **appends**
the address it received the request from to the \`X-Forwarded-For\` header, so the genuine
client address is the entry this many positions **from the right**. Everything further to the
left was supplied by the caller and can be forged freely.

The engine uses that address for the login throttle and for audit records — never as an
authorization input. Set it to exactly the number of proxies that append the header; the
default \`1\` matches the standard single web server in front. Both mistakes hurt:

* **Too high** — you start trusting an entry the caller wrote. An attacker sends a new forged
  address on every attempt, gets a fresh login-throttle bucket each time, and the brute-force
  protection is gone.
* **Too low** — every request appears to come from your own proxy. All users share one throttle
  bucket, so one person's wrong passwords lock out everybody.

Your proxy must *append* rather than replace (in nginx,
\`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\`), or the count is meaningless.

\`\`\`bash
TRUSTED_PROXY_HOPS=1
\`\`\``,
	},
} as const satisfies Record<string, CatalogEntry>;
