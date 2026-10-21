/**
 * THE KIT PACKER NEVER HANGS ON A CHILD (closure review cross-diffusion:r3, S3
 * "Kit packer spawns git and `bun install` (network) with no timeout").
 *
 * scripts/publication_host_pack.ts waits on three kinds of child: git (local),
 * the draft judge (a scratch Bun), and the production `bun install` — the one
 * that may stall on the network. Each ran with no bound: a stalled install hung
 * the operator's `bun run hostagent:pack`, and the scratch copy stayed on disk
 * until someone killed it.
 *
 * WHAT IS ASSERTED (outcomes):
 *   - runBounded kills a child past its bound and throws PackTimedOut — fast,
 *     never after the child's own end;
 *   - runPack whose install step times out FAILS typed (exit 4, the message
 *     names the bound) and its finally removes the scratch copy.
 *
 * WRITES: os-tmp scratch only (the packer's own scratch, asserted removed).
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	PackTimedOut,
	REPO_ROOT,
	runBounded,
	runPack,
} from '../../scripts/publication_host_pack.ts';

const AGENT_REL = 'publication/host_agent';

describe('every child the packer waits on is bounded', () => {
	test('runBounded SIGKILLs a child past its bound and throws PackTimedOut', () => {
		const startedAt = Date.now();
		let thrown: unknown = null;
		try {
			runBounded(['sleep', '30'], tmpdir(), 300);
		} catch (error) {
			thrown = error;
		}
		const elapsed = Date.now() - startedAt;
		expect(thrown, 'a child that never ends was waited out').toBeInstanceOf(PackTimedOut);
		expect((thrown as Error).message).toContain('did not finish within');
		expect(elapsed, 'the bound did not end the wait').toBeLessThan(5_000);
	});

	test('a child inside its bound answers normally', () => {
		expect(runBounded(['sh', '-c', 'echo ok'], tmpdir(), 10_000)).toEqual({
			code: 0,
			out: 'ok\n',
			err: '',
		});
	});

	test('runPack whose install times out FAILS typed (exit 4) and removes its scratch copy', async () => {
		const dir = mkdtempSync(join(realpathSync(tmpdir()), 'dd_pack_bounded_'));
		try {
			const draft = join(dir, 'museum.draft.json');
			writeFileSync(
				draft,
				`${JSON.stringify({ instance: 'museum', layout: 'home', site: { domain: 'museum.test' }, media: { mode: 'none' } })}\n`,
			);
			let scratchAgent: string | null = null;
			const result = await runPack(
				['--draft', draft, '--out', join(dir, 'museum.tar.gz')],
				REPO_ROOT,
				{
					installDeps: (agent) => {
						scratchAgent = agent;
						runBounded(['sleep', '30'], agent, 300);
					},
				},
			);
			expect(result.code).toBe(4);
			expect(result.stderr).toContain('FAILED');
			expect(result.stderr).toContain('did not finish within');
			expect(scratchAgent).not.toBeNull();
			const scratch = (scratchAgent as unknown as string).slice(0, -(AGENT_REL.length + 1));
			expect(existsSync(scratch), 'the timed-out pack left its scratch copy behind').toBe(false);
			expect(existsSync(join(dir, 'museum.tar.gz'))).toBe(false);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}, 30_000);
});
