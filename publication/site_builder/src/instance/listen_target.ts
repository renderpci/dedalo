/**
 * WHERE THIS DAEMON LISTENS, and whether something already answers there.
 *
 * Asked TWICE by the boot (`src/boot.ts`): first by the INSTANCE CLAIM, right after the preflight
 * and before anything that stops a unit or writes (a listen target already served means another
 * daemon holds this instance — its runs and its sessions are not this process's to reconcile or
 * sweep); then again by `listen()` in `src/index.ts`, because a socket file that does NOT accept
 * a connection is a corpse it unlinks before binding, and that unlink is only safe on a fresh
 * answer.
 *
 * A unix socket is held when a connect to it succeeds. A path that does not exist, a file that is
 * not a socket, a socket nobody listens on: not held. A tcp target is held when its port accepts
 * a connection — whoever holds it, the bind that follows would fail.
 */

export type ListenTarget =
  | { readonly kind: 'unix'; readonly path: string }
  | { readonly kind: 'tcp'; readonly hostname: string; readonly port: number };

/** Why `target` is already served (a sentence naming it), or null when nothing answers there. */
export async function listenTargetHeld(target: ListenTarget): Promise<string | null> {
  const where = target.kind === 'unix' ? `'${target.path}'` : `${target.hostname}:${target.port}`;
  return (await acceptsConnections(target)) ? `${where} is already accepting connections` : null;
}

async function acceptsConnections(target: ListenTarget): Promise<boolean> {
  const handlers = { data() {}, open() {}, error() {} };
  try {
    const socket =
      target.kind === 'unix'
        ? await Bun.connect({ unix: target.path, socket: handlers })
        : await Bun.connect({ hostname: target.hostname, port: target.port, socket: handlers });
    socket.end();
    return true;
  } catch {
    return false;
  }
}
