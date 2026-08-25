/**
 * engineering/TOOLS_SPEC.md is CHECKED against the code it describes (DEC-12:
 * an invariant — or a census — stated only in prose rots, silently).
 *
 * This gate exists because the 2026-07-28 tools audit found ELEVEN factual
 * errors in that one document, and two of them actively misled:
 *
 *  - the `ToolActionSpec` code block listed FOUR permission kinds after a fifth
 *    ('record_tipo') had shipped, so the spec taught the exact modelling mistake
 *    the new kind exists to prevent — pick 'tipo' or 'record' and silently drop
 *    the other half of PHP's SEC-024 door;
 *  - the §Files list named a test file that had never been written, and the
 *    server-module census was wrong in a way that produced a whole wrong
 *    starting premise ("~29 tools have no server module yet" → really 12, and
 *    none of them is a gap).
 *
 * Prose cannot be type-checked, so every claim in TOOLS_SPEC.md that is a
 * MECHANICAL FACT about the tree is asserted here. Claims of judgement
 * (why a design is right) are deliberately out of scope — this gate proves the
 * document's FACTS, not its opinions.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/strip_comments.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');
const exists = (rel: string): boolean => existsSync(join(REPO_ROOT, rel));

const SPEC = read('engineering/TOOLS_SPEC.md');

/** The doc minus fenced code blocks — inline backticks only, so a `ts` sample is not scanned. */
const SPEC_PROSE = SPEC.replace(/```[\s\S]*?```/g, '');

/** Every inline `backticked` token in the prose. */
const backticked = (src: string): string[] =>
	[...src.matchAll(/`([^`\n]+)`/g)].map((m) => (m[1] as string).trim());

/** Expand ONE brace group: `a/{b,c}.ts` → ['a/b.ts', 'a/c.ts'] (the doc's file-list shorthand). */
function expandBraces(token: string): string[] {
	const m = token.match(/^(.*)\{([^}]+)\}(.*)$/);
	if (m === null) return [token];
	return (m[2] as string).split(',').map((part) => `${m[1]}${part.trim()}${m[3]}`);
}

/**
 * Parse the `permission:` kinds out of any source text.
 *
 * EVERY `permission:` property declaration is read, in source order, and the
 * kinds are concatenated. One declaration was enough until P2-8(a) (2026-08-24)
 * split ToolActionSpec into a DISCRIMINATED UNION — the gated member declares
 * the six real kinds, the exempt member declares `null` and requires
 * `gatedInHandler` beside it — so the code now states the full set across two
 * interfaces while the doc states it as one union. Reading all of them keeps
 * this gate comparing the same fact it always compared: the set of kinds a tool
 * author may choose from. The doc side has a single declaration, so it is
 * unaffected.
 */
function permissionUnion(src: string, where: string): string[] {
	const kinds = [...src.matchAll(/\bpermission:\s*([^;]+);/g)].flatMap((match) =>
		(match[1] as string)
			.split('|')
			.map((k) => k.trim())
			.filter((k) => k.length > 0),
	);
	if (kinds.length === 0) throw new Error(`${where}: no permission union found`);
	return kinds;
}

/** Tool packages on disk, split by whether they ship a server module. */
function toolCensus(): { withServer: string[]; withoutServer: string[] } {
	const names = readdirSync(join(REPO_ROOT, 'tools'))
		.filter((n) => /^tool_[a-z0-9_]+$/.test(n))
		.filter((n) => exists(join('tools', n)))
		.sort();
	const withServer = names.filter((n) => exists(join('tools', n, 'server', 'index.ts')));
	const withoutServer = names.filter((n) => !exists(join('tools', n, 'server', 'index.ts')));
	// Non-vacuity: a mis-globbed scan that found nothing must not pass.
	expect(names.length, 'no tool packages found under tools/ — the scan is broken').toBeGreaterThan(
		10,
	);
	return { withServer, withoutServer };
}

describe('TOOLS_SPEC.md — the server module contract', () => {
	/**
	 * THE headline drift. The doc's ToolActionSpec block is what a tool author reads
	 * before choosing a gate; a missing kind there is not a typo, it is a permission
	 * bug waiting to be authored. Both sides are PARSED, so this cannot be satisfied
	 * by a stale hand-copy.
	 */
	test('the documented permission union is EXACTLY the one in src/core/tools/module.ts', () => {
		// COMMENTS STRIPPED on the code side: module.ts's own prose discusses
		// `permission: null` at length, and a scanner that reads its own
		// explanation as a declaration is the failure this helper exists to avoid.
		const fromCode = permissionUnion(stripComments(read('src/core/tools/module.ts')), 'module.ts');
		const fromDoc = permissionUnion(SPEC, 'engineering/TOOLS_SPEC.md');
		expect(
			fromDoc,
			'engineering/TOOLS_SPEC.md ToolActionSpec block has drifted from src/core/tools/module.ts. A kind missing from the doc teaches the modelling mistake the kind exists to prevent (declare `tipo` or `record` and silently drop the other half of the SEC-024 door).',
		).toEqual(fromCode);
	});

	/** The exemplar is what scripts/create_tool.ts copies, so the doc's claim that it
	 *  demonstrates every kind must hold on the exemplar itself, not just in prose. */
	test('the exemplar named in the doc demonstrates every kind the doc lists', async () => {
		const kinds = new Set(
			permissionUnion(SPEC, 'engineering/TOOLS_SPEC.md').map((k) => k.replace(/'/g, '')),
		);
		const { tool } = (await import('../../tools/tool_dev_template/server/index.ts')) as {
			tool: { apiActions: Record<string, { permission: string | null }> };
		};
		const demonstrated = new Set(Object.values(tool.apiActions).map((s) => String(s.permission)));
		const missing = [...kinds].filter((k) => !demonstrated.has(k));
		expect(
			missing,
			'engineering/TOOLS_SPEC.md says tool_dev_template demonstrates EVERY permission kind. Kinds the exemplar does not actually demonstrate:',
		).toEqual([]);
	});
});

describe('TOOLS_SPEC.md — every repo path it names resolves', () => {
	/**
	 * The audit found a named widget file that does not exist and a §Files test that
	 * had never been written. A path in this doc is a promise; here it is checked.
	 */
	test('every backticked repo path in the prose exists on disk', () => {
		const missing: string[] = [];
		for (const token of new Set(backticked(SPEC_PROSE))) {
			for (const path of expandBraces(token)) {
				if (!/^(src|test|scripts|tools|client|deploy|engineering|docs)\//.test(path)) continue;
				if (!/\.(ts|js|json|less|css|sh|md)$/.test(path)) continue;
				if (NEGATIVE_CLAIMS.has(path)) continue; // asserted ABSENT below
				if (!exists(path)) missing.push(path);
			}
		}
		expect(missing.sort(), 'engineering/TOOLS_SPEC.md names repo paths that do not exist:').toEqual(
			[],
		);
	});

	/**
	 * The doc makes one NEGATIVE path claim ("There is no src/core/resolve/widget_request.ts
	 * — earlier revisions of this doc named one"). If that file is ever created the
	 * sentence becomes false, so the claim is gated in its own direction.
	 */
	test("the doc's negative path claims stay false", () => {
		for (const path of NEGATIVE_CLAIMS) {
			expect(
				{ path, exists: exists(path) },
				`engineering/TOOLS_SPEC.md states ${path} does not exist. It now does — fix the doc.`,
			).toEqual({ path, exists: false });
			expect(SPEC, `${path} is listed as a negative claim but the doc never mentions it`).toContain(
				path,
			);
		}
	});

	/** §Files lists machinery tests by BARE name under test/unit/. */
	test('every machinery test named in §Files exists', () => {
		const bullet = SPEC.match(/- Machinery tests \(`test\/unit\/`\):([\s\S]*?)\n- /)?.[1];
		expect(bullet, '§Files: the "Machinery tests" bullet was not found').toBeDefined();
		// Identifier-shaped tokens only (the bullet names tests bare, without the
		// .test.ts suffix). Case-INSENSITIVE deliberately: a capitalised typo is a
		// broken reference too, and a lowercase-only filter would skip it silently.
		const names = backticked(bullet as string).filter((n) => /^[A-Za-z0-9_]+$/.test(n));
		expect(
			names.length,
			'no machinery test names parsed — the bullet format changed',
		).toBeGreaterThan(10);
		const missing = names.filter((n) => !exists(`test/unit/${n}.test.ts`));
		expect(missing, '§Files names machinery tests that do not exist under test/unit/:').toEqual([]);
	});

	/** §Files lists machinery parity gates as one brace group. */
	test('every machinery parity differential named in §Files exists', () => {
		const bullet = SPEC.match(/- Machinery parity \(`test\/parity\/`\):\s*`([^`]+)`/)?.[1];
		expect(bullet, '§Files: the "Machinery parity" bullet was not found').toBeDefined();
		const files = expandBraces(bullet as string);
		expect(
			files.length,
			'no parity differentials parsed — the bullet format changed',
		).toBeGreaterThan(3);
		const missing = files.filter((f) => !exists(`test/parity/${f}`));
		expect(missing, '§Files names parity differentials that do not exist:').toEqual([]);
	});
});

/** Paths the doc asserts do NOT exist. Kept next to the gate that checks both directions. */
const NEGATIVE_CLAIMS = new Set(['src/core/resolve/widget_request.ts']);

describe('TOOLS_SPEC.md — the server-module census', () => {
	/**
	 * "~29 tools have client code but no server module yet" is the sentence that
	 * produced the audit's own wrong starting premise. A census is a fact about the
	 * tree, so it is derived here rather than trusted.
	 */
	test('the counts and BOTH name lists match the tools tree exactly', () => {
		const { withServer, withoutServer } = toolCensus();
		const total = withServer.length + withoutServer.length;

		const headline = SPEC.match(
			/\*\*(\d+) of the (\d+) tool packages ship a `server\/index\.ts`; (\d+) do not\.\*\*/,
		);
		expect(
			headline,
			'§Server-module coverage: the headline census sentence was not found',
		).not.toBeNull();
		expect(
			[Number(headline?.[1]), Number(headline?.[2]), Number(headline?.[3])],
			'§Server-module coverage headline disagrees with the tools tree [with, total, without]:',
		).toEqual([withServer.length, total, withoutServer.length]);

		const listed = (label: string): string[] => {
			const block = SPEC.match(new RegExp(`${label}[^:]*:([\\s\\S]*?)\\n\\n`))?.[1];
			expect(block, `§Server-module coverage: the "${label}" list was not found`).toBeDefined();
			return [
				...new Set(backticked(block as string).filter((n) => /^tool_[a-z0-9_]+$/.test(n))),
			].sort();
		};
		expect(listed('WITH a server module'), 'the WITH list disagrees with the tools tree:').toEqual(
			withServer,
		);
		expect(listed('WITHOUT one'), 'the WITHOUT list disagrees with the tools tree:').toEqual(
			withoutServer,
		);
	});

	/**
	 * The doc's load-bearing CLAIM about those 12 — that they are UI-only BY DESIGN
	 * and not un-ported gaps. The mechanical half of the audit's proof: a tool whose
	 * client never posts `tool_request` needs no remote surface, and the split is
	 * bimodal, which is why "no server module" is informational and not a TODO.
	 */
	test('no client-only tool posts tool_request, and every server-backed tool does', () => {
		const { withServer, withoutServer } = toolCensus();
		const postsToolRequest = (name: string): boolean => {
			const dir = join(REPO_ROOT, 'tools', name);
			const stack: string[] = [dir];
			while (stack.length > 0) {
				const current = stack.pop() as string;
				for (const entry of readdirSync(current, { withFileTypes: true })) {
					const full = join(current, entry.name);
					if (entry.isDirectory()) {
						if (entry.name !== 'server') stack.push(full);
						continue;
					}
					if (!/\.(js|json|html)$/.test(entry.name)) continue;
					if (readFileSync(full, 'utf8').includes('tool_request')) return true;
				}
			}
			return false;
		};

		expect(
			withoutServer.filter(postsToolRequest),
			'These tools have NO server module but their client posts tool_request — every such call is refused at dispatch gate 5. Either they are real gaps (port a server/index.ts) or the call is dead code:',
		).toEqual([]);
		// The control half: without it the assertion above would also pass if the scan
		// simply never found anything.
		expect(
			withServer.filter((n) => !postsToolRequest(n)),
			'These tools SHIP a server module no client ever calls — the census claim that the split is bimodal no longer holds:',
		).toEqual([]);
	});
});
