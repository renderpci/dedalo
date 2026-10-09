/**
 * THE ONE ANSWER to "how does Dédalo reach its PostgreSQL server": unix socket or
 * TCP, and where. Every main-database connection decides its transport HERE — the
 * engine's pools (src/core/db/postgres.ts), the install probe and every psql /
 * pg_dump / pg_restore the engine spawns (src/core/install/pg_exec.ts and the
 * maintenance doors), and the vector store when it inherits the main connection
 * (src/ai/rag/vector_store.ts) — so the install-time probe can never pass over one
 * route while the engine connects over another.
 *
 * PRECEDENCE: `DB_SOCKET` (a unix-socket DIRECTORY, libpq's own meaning of a host
 * that starts with `/`) wins; `DB_HOST` is then ignored for transport. Without a
 * socket, a `DB_HOST` that starts with `/` is ALSO a socket directory (libpq's
 * rule, honoured since the first TS engine); anything else is a TCP hostname.
 * A socket value naming the socket FILE itself (`…/.s.PGSQL.5433`) is accepted
 * too: its directory is the socket directory and the port is the one the file
 * name carries, because that is the server the operator pointed at.
 *
 * WHY THE BUN OPTIONS SET BOTH `path` AND `hostname` (measured, Bun 1.4.2): given
 * a `path` that does not exist, Bun.sql SILENTLY falls back to TCP
 * `hostname:port` (default `localhost:5432`) — a misconfigured socket would reach
 * whatever server listens there. `hostname` is therefore set to the socket path
 * itself, which no resolver turns into an address: a missing socket fails LOUDLY
 * ("Failed to connect") instead of quietly reaching another server. Bun also
 * accepts a directory in `path` (it appends `.s.PGSQL.<port>`), but the full file
 * path is passed so the port can never be applied twice.
 *
 * PURE: no env read, no config import — callers hand it the values they hold
 * (config.db, posted install answers, CLI flags). Gate:
 * test/unit/pg_transport_native.test.ts.
 */

/** The values a connection is described by (a config.db, a posted form, CLI flags). */
export interface PgEndpointInput {
	readonly host: string;
	readonly port: string | number;
	/** Unix-socket directory (or socket file path); empty/undefined means none. */
	readonly socket?: string | undefined;
}

/** The decided transport. `port` is meaningful for both kinds (the socket file name carries it). */
export type PgTransport =
	| {
			readonly kind: 'socket';
			/** The socket DIRECTORY — what libpq clients take in `-h`. */
			readonly directory: string;
			/** The socket FILE: `<directory>/.s.PGSQL.<port>`. */
			readonly socketPath: string;
			readonly port: number;
	  }
	| { readonly kind: 'tcp'; readonly hostname: string; readonly port: number };

const DEFAULT_PORT = 5432;
const SOCKET_FILE = /^\.s\.PGSQL\.(\d+)$/;

/** A positive integer port, else PostgreSQL's default. */
function portOf(raw: string | number): number {
	const port = Number(raw);
	return Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
}

/** A socket transport from a directory or a `.s.PGSQL.<port>` file path. */
function socketTransport(value: string, port: number): PgTransport {
	const trimmed = value.length > 1 ? value.replace(/\/+$/, '') : value;
	const slash = trimmed.lastIndexOf('/');
	const fileMatch = SOCKET_FILE.exec(trimmed.slice(slash + 1));
	const directory = fileMatch === null ? trimmed : trimmed.slice(0, slash) || '/';
	const finalPort = fileMatch === null ? port : Number(fileMatch[1]);
	const prefix = directory === '/' ? '' : directory;
	return {
		kind: 'socket',
		directory,
		socketPath: `${prefix}/.s.PGSQL.${finalPort}`,
		port: finalPort,
	};
}

/** Decide the transport: socket first, then a `/`-host, else TCP. */
export function resolvePgTransport(input: PgEndpointInput): PgTransport {
	const port = portOf(input.port);
	const socket = (input.socket ?? '').trim();
	if (socket !== '') return socketTransport(socket, port);
	const host = input.host.trim();
	if (host.startsWith('/')) return socketTransport(host, port);
	return { kind: 'tcp', hostname: host === '' ? 'localhost' : host, port };
}

/**
 * Why a socket value cannot be used, or null. Only an ABSOLUTE path names a unix
 * socket — libpq would read a relative one as a TCP hostname, the very
 * disagreement this module exists to prevent.
 */
export function pgSocketProblem(socket: string | undefined): string | null {
	const value = (socket ?? '').trim();
	if (value === '' || value.startsWith('/')) return null;
	return `the PostgreSQL socket '${value}' is not an absolute path — name the socket directory, e.g. /var/run/postgresql`;
}

/** The Bun.sql transport options (see the header for why `hostname` mirrors `path`). */
export function bunSqlTransportOptions(
	transport: PgTransport,
): { path: string; hostname: string; port: number } | { hostname: string; port: number } {
	if (transport.kind === 'socket') {
		return { path: transport.socketPath, hostname: transport.socketPath, port: transport.port };
	}
	return { hostname: transport.hostname, port: transport.port };
}

/** The `-h <host|socket dir> -p <port>` pair every libpq client binary takes. */
export function libpqTransportArgs(transport: PgTransport): string[] {
	const host = transport.kind === 'socket' ? transport.directory : transport.hostname;
	return ['-h', host, '-p', String(transport.port)];
}

/** A one-line human description (`socket /tmp/.s.PGSQL.5432` / `localhost:5432`). */
export function describePgTransport(transport: PgTransport): string {
	return transport.kind === 'socket'
		? `socket ${transport.socketPath}`
		: `${transport.hostname}:${transport.port}`;
}
