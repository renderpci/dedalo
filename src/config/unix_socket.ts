/**
 * THE ENGINE'S UNIX SOCKET (`SERVER_UNIX_SOCKET`) AS A FILE ON THIS MACHINE —
 * one answer for every reader that asks whether a socket path can be bound, or
 * whether a server already answers on it: the server's boot (src/server.ts —
 * refuse to steal a live instance's socket, S2-17b) and the installer's
 * developer route (src/core/install/dev_listener_check.ts — refuse BEFORE
 * anything is written, so a second checkout never collides at its first boot).
 *
 * IMPORT-FREE on purpose (like dev_listener_address.ts): the installer's plan
 * is config-free, so this module may not reach the catalog readers.
 * Gate: test/unit/install_dev_route_listener_native.test.ts.
 */

/**
 * The longest socket path the kernel binds, in bytes: `sun_path` is 104 bytes
 * on macOS/BSD (108 on Linux), NUL included — the smaller one, so a path valid
 * here is valid on every supported OS.
 */
export const UNIX_SOCKET_PATH_MAX_BYTES = 103;

/** Why `path` cannot be bound as a unix socket by its length; null when it can. */
export function unixSocketLengthProblem(path: string): string | null {
	const bytes = Buffer.byteLength(path, 'utf8');
	return bytes > UNIX_SOCKET_PATH_MAX_BYTES
		? `is ${bytes} bytes; a unix socket path may be at most ${UNIX_SOCKET_PATH_MAX_BYTES} (the OS limit) — choose a shorter path`
		: null;
}

/**
 * True when a live process is LISTENING on the unix socket (audit S2-17b): a
 * second `startServer` used to silently unlink the FIRST instance's socket and
 * bind fresh, orphaning the old process. connect() answering = live instance.
 */
export async function unixSocketIsLive(socketPath: string): Promise<boolean> {
	try {
		await new Promise<void>((resolvePromise, rejectPromise) => {
			Bun.connect({
				unix: socketPath,
				socket: {
					open(socket) {
						socket.end();
						resolvePromise();
					},
					data() {},
					error(_socket, error) {
						rejectPromise(error);
					},
					connectError(_socket, error) {
						rejectPromise(error);
					},
				},
			}).catch(rejectPromise);
		});
		return true;
	} catch {
		return false;
	}
}
