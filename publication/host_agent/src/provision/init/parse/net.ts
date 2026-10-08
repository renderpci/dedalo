/**
 * DISCOVERY: the listening TCP ports (spec §3.2 row Ports; §4.3 `declaration.v2_port`).
 * /proc/net/tcp and /proc/net/tcp6, proc(5): `sl local_address rem_address st …` with the
 * local address as `<hex address>:<hex port>` and the state `0A` = LISTEN.
 *
 * PURE, ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts).
 */

const LISTEN = '0A';

/** The ports in LISTEN state, sorted, without duplicates (tcp and tcp6 texts may be concatenated). */
export function parseProcNetTcp(text: string): number[] {
  const ports = new Set<number>();
  for (const raw of text.split('\n')) {
    const fields = raw.trim().split(/\s+/);
    if (fields.length < 4 || !/^\d+:$/.test(fields[0] as string)) continue; // the header line, blanks
    const local = /^[0-9A-Fa-f]+:([0-9A-Fa-f]{4})$/.exec(fields[1] as string);
    if (!local) throw new Error(`parse(net): local address '${fields[1]}' is not <hex>:<hex port>`);
    if ((fields[3] as string).toUpperCase() !== LISTEN) continue;
    ports.add(Number.parseInt(local[1] as string, 16));
  }
  return [...ports].sort((a, b) => a - b);
}
