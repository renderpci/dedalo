/**
 * DISCOVERY: the CPU and the C library (spec §3.2 row CPU; §4.3 `host.cpu`). They pick the
 * Bun asset (install.sh's asset table, init/bun_asset.ts pickAsset): x86_64 → bun-linux-x64,
 * or the `-baseline` build when the CPU lacks AVX2; aarch64/arm64 → bun-linux-aarch64. A musl
 * host (`/lib/ld-musl-*`) gets no asset: the pinned Bun is glibc-linked.
 *
 * PURE, ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts).
 */

export interface CpuFacts {
  readonly arch: 'x64' | 'aarch64' | 'other';
  /** Only meaningful on x64 (false elsewhere). */
  readonly avx2: boolean;
  readonly musl: boolean;
}

/** `uname -m`, /proc/cpuinfo's text and whether a `/lib/ld-musl-*` exists → HostFacts.cpu. */
export function parseCpu(unameM: string, cpuinfo: string, muslPresent: boolean): CpuFacts {
  const machine = unameM.trim();
  const arch = machine === 'x86_64' || machine === 'amd64' ? 'x64' : machine === 'aarch64' || machine === 'arm64' ? 'aarch64' : 'other';
  // The `flags` line of every processor names the same set on a sane host; AVX2 must be on all.
  const flagLines = cpuinfo.split('\n').filter(line => /^flags\s*:/.test(line));
  const avx2 = arch === 'x64' && flagLines.length > 0 && flagLines.every(line => /(?:^|\s)avx2(?:\s|$)/.test(line.replace(/^flags\s*:/, ' ')));
  return Object.freeze({ arch, avx2, musl: muslPresent });
}
