/**
 * parse/cpu.ts — the Bun asset's inputs (spec §3.2 row CPU): `uname -m`, AVX2 from /proc/cpuinfo
 * (every processor), musl.
 */
import { expect, test } from 'bun:test';
import { parseCpu } from '../src/provision/init/parse/cpu';
import { fixture } from './fixtures/init/load';

test('x86_64 with AVX2 on every processor', () => {
  expect(parseCpu('x86_64\n', fixture('typed/cpu/cpuinfo_x86_avx2.txt'), false)).toEqual({ arch: 'x64', avx2: true, musl: false });
});

test('x86_64 without AVX2 (avx512vl is not avx2) → the baseline asset', () => {
  expect(parseCpu('x86_64', fixture('typed/cpu/cpuinfo_x86_noavx2.txt'), false).avx2).toBe(false);
});

test('one processor without AVX2 makes the host non-AVX2', () => {
  const mixed = `${fixture('typed/cpu/cpuinfo_x86_avx2.txt')}\n${fixture('typed/cpu/cpuinfo_x86_noavx2.txt')}`;
  expect(parseCpu('x86_64', mixed, false).avx2).toBe(false);
  expect(parseCpu('x86_64', '', false).avx2).toBe(false);
});

test('aarch64 and arm64; other machines; musl passes through', () => {
  expect(parseCpu('aarch64', fixture('typed/cpu/cpuinfo_aarch64.txt'), false)).toEqual({ arch: 'aarch64', avx2: false, musl: false });
  expect(parseCpu('arm64', '', true)).toEqual({ arch: 'aarch64', avx2: false, musl: true });
  expect(parseCpu('ppc64le', fixture('typed/cpu/cpuinfo_x86_avx2.txt'), false)).toEqual({ arch: 'other', avx2: false, musl: false });
  expect(parseCpu('amd64', fixture('typed/cpu/cpuinfo_x86_avx2.txt'), false).arch).toBe('x64');
});
