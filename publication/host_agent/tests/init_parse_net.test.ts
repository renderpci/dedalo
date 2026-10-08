/**
 * parse/net.ts — the listening TCP ports (spec §3.2 row Ports; §4.3 declaration.v2_port).
 */
import { expect, test } from 'bun:test';
import { parseProcNetTcp } from '../src/provision/init/parse/net';
import { fixture } from './fixtures/init/load';

test('LISTEN rows only (3100 busy); tcp and tcp6 together, deduplicated, sorted', () => {
  expect(parseProcNetTcp(fixture('typed/net/proc_net_tcp.txt'))).toEqual([80, 443, 3100]);
  expect(parseProcNetTcp(`${fixture('typed/net/proc_net_tcp.txt')}\n${fixture('typed/net/proc_net_tcp6.txt')}`)).toEqual([22, 80, 443, 3100]);
});

test('an established or TIME_WAIT row never counts as busy-listening (8080 is TIME_WAIT)', () => {
  expect(parseProcNetTcp(fixture('typed/net/proc_net_tcp.txt'))).not.toContain(8080);
});

test('empty input; a malformed local address throws', () => {
  expect(parseProcNetTcp('')).toEqual([]);
  expect(() => parseProcNetTcp('   0: nothex 00000000:0000 0A\n')).toThrow('not <hex>:<hex port>');
});
