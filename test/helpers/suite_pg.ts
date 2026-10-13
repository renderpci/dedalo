/**
 * HOW THE SUITE'S OWN TOOLING REACHES POSTGRESQL — the main database and the
 * vector one — decided by the engine's ONE transport rule
 * (src/config/pg_transport.ts: DB_SOCKET wins, a `/` DB_HOST is a socket
 * directory, else TCP).
 *
 * WHY THIS EXISTS (install campaign 3, C3-12). The preload's existence probe
 * (test/preload/test_database.ts) and the vector helper
 * (test/helpers/test_rag_database.ts) each carried a hand copy of the rule that
 * read DB_HOST only. On a socket install (`DB_SOCKET=/var/run/postgresql`,
 * `DB_HOST=localhost`) the preload then said "the test database does not exist"
 * about one that existed, and `test:db:setup` went over TCP with a password the
 * role never had (28P01). Both now ask this module; it imports only the PURE
 * transport module — never src/config/config.ts, which freezes the connection
 * at import and so may not be loaded by a preload still composing the env.
 *
 * And the psql the suite's scripts spawn (scripts/test_db_setup.ts,
 * scripts/lib/test_shard_db.ts) never prompts: `-w` plus a PGCONNECT_TIMEOUT —
 * a password prompt on /dev/tty is how a run sat ten minutes at
 * `Password for user dedalo:`. The engine's own pg clients get the same from
 * src/core/install/pg_exec.ts connArgs / pgClientEnv.
 *
 * PURE: every value comes through the `read` function handed in (the callers
 * pass `readEnv`), so the gate drives it with a fake environment.
 * Gate: test/unit/test_tooling_socket_native.test.ts.
 */

import {
	bunSqlTransportOptions,
	libpqTransportArgs,
	type PgEndpointInput,
	resolvePgTransport,
} from '../../src/config/pg_transport.ts';

/** An environment reader (`readEnv`, or a gate's fake). */
export type EnvRead = (key: string) => string | undefined;

/** Seconds a suite psql waits for its connection (an explicit PGCONNECT_TIMEOUT wins). */
export const SUITE_PG_CONNECT_TIMEOUT_SECONDS = '10';

/** The main database's endpoint, as the engine's pool reads it. */
export function suitePgEndpoint(read: EnvRead): PgEndpointInput {
	return {
		host: read('DB_HOST') ?? 'localhost',
		port: read('DB_PORT') ?? '',
		socket: read('DB_SOCKET'),
	};
}

/**
 * The vector database's endpoint — the engine's `ragEndpoint`
 * (src/ai/rag/vector_store.ts) over a reader: its own socket wins, then its own
 * host; with neither it inherits the MAIN route, DB_SOCKET included.
 */
export function suiteRagPgEndpoint(read: EnvRead): PgEndpointInput {
	const port = read('DEDALO_RAG_DB_PORT_CONN') ?? read('DB_PORT') ?? '';
	const socket = (read('DEDALO_RAG_DB_SOCKET_CONN') ?? '').trim();
	if (socket !== '') return { host: '', port, socket };
	const host = read('DEDALO_RAG_DB_HOSTNAME_CONN');
	if (host !== undefined) return { host, port };
	return { ...suitePgEndpoint(read), port };
}

/** Bun.sql transport options for an endpoint (the socket FILE in `path` when there is one). */
export function suiteBunSqlTarget(
	endpoint: PgEndpointInput,
): ReturnType<typeof bunSqlTransportOptions> {
	return bunSqlTransportOptions(resolvePgTransport(endpoint));
}

/** `-h … -p … -U <user> -w`: a suite psql's connection argv, never prompting. */
export function suitePsqlConnArgs(read: EnvRead, user: string): string[] {
	return [...libpqTransportArgs(resolvePgTransport(suitePgEndpoint(read))), '-U', user, '-w'];
}

/** A suite psql's environment: PGPASSWORD only when there is one, and a connect timeout. */
export function suitePsqlEnv(
	base: Readonly<Record<string, string | undefined>>,
	password: string,
): Record<string, string | undefined> {
	return {
		...base,
		PGCONNECT_TIMEOUT: base.PGCONNECT_TIMEOUT ?? SUITE_PG_CONNECT_TIMEOUT_SECONDS,
		...(password === '' ? {} : { PGPASSWORD: password }),
	};
}
