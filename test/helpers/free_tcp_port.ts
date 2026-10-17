/**
 * A TCP port nothing listens on right now (the kernel's own pick, released at
 * once). For a gate that runs a DEVELOPER-route install: the plan's
 * development listener defaults to 3500 (DEV_ROUTE_SERVE D3) and the install
 * REFUSES a port in use — on a developer's desk, `bun run dev` holds 3500 — so
 * the gate builds its situation (`--dev-port <this>`) instead of borrowing the
 * machine's.
 */
export function freeTcpPort(): number {
	const probe = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data: () => {} } });
	const { port } = probe;
	probe.stop(true);
	return port;
}
