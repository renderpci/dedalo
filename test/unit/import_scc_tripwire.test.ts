/**
 * IMPORT-CYCLE TRIPWIRE (audit S2-20, WS-C item 4).
 *
 * The 2026-07 foundation audit found exactly ONE strongly-connected component
 * of size >1 in the static value-import graph — but it was a 33-file knot
 * fusing six subsystems (components/registry + 15 descriptors, relations,
 * resolve/structure_context + component_data, section/context + buttons,
 * security/permissions, ontology/resolver). Failure modes: latent ESM boot
 * fragility (one review-invisible module-level constant computed from a cyclic
 * binding can throw at boot for SOME entry orders only) and the inability to
 * reason about or extract any member independently.
 *
 * WS-C dissolved it by breaking its two closing edges:
 *   1. ontology/resolver → components/registry, inverted to a boot-time
 *      registration (registerComponentModelFieldsLookup, the
 *      cache_invalidation.ts pattern);
 *   2. descriptors → relations/models/*, replaced by DATA bindings
 *      (descriptor.resolveData is a RelationResolverId string resolved by
 *      relations/registry.ts RESOLVER_IMPLEMENTATIONS).
 *
 * THIS TRIPWIRE keeps it dissolved: any static-import SCC of size >1 outside
 * the (currently EMPTY) allowlist fails. If you trip it: prefer breaking the
 * cycle (registration seam, data binding, or a type-only import). Only if a
 * small knot is genuinely irreducible, allowlist it below as a NAMED, sorted
 * member list with a written justification — never widen an entry silently.
 *
 * Graph rules (same as the audit probe): static VALUE imports only —
 * `import type` and specifier lists that are all `type X` are excluded, and
 * dynamic `await import()` is excluded (a lazy edge cannot throw at module
 * evaluation time). Scope: src/ plus the tools' server/ trees.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

/**
 * Irreducible cycles we accept, each a canonical signature: the SORTED
 * repo-relative member list joined with ' | '. EMPTY today — the audit knot is
 * fully dissolved; keep it that way.
 */
const ALLOWLISTED_SCCS = new Set<string>([]);

function walk(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		const st = statSync(path);
		if (st.isDirectory()) walk(path, acc);
		else if (path.endsWith('.ts') && !path.endsWith('.d.ts')) acc.push(path);
	}
	return acc;
}

const files = [
	...walk(join(ROOT, 'src')),
	...walk(join(ROOT, 'tools')).filter((f) => f.includes('/server/')),
];
const fileSet = new Set(files);

const stmtRe = /(?:^|\n)\s*(import|export)\s+(type\s+)?([^;'"]*?)from\s+['"]([^'"]+)['"]/g;

function buildGraph(): Map<string, Set<string>> {
	const graph = new Map<string, Set<string>>();
	for (const file of files) graph.set(file, new Set());
	for (const file of files) {
		const src = readFileSync(file, 'utf8');
		for (const match of src.matchAll(stmtRe)) {
			if (match[2]) continue; // `import type … from`
			const clause = (match[3] ?? '').trim();
			const inner = clause.match(/^\{([\s\S]*)\}$/);
			if (inner?.[1] !== undefined) {
				const specifiers = inner[1]
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean);
				if (specifiers.length > 0 && specifiers.every((s) => s.startsWith('type '))) continue;
			}
			const spec = match[4];
			if (spec === undefined) continue;
			if (!spec.startsWith('.')) continue;
			let target = resolve(dirname(file), spec);
			if (!fileSet.has(target)) {
				if (fileSet.has(`${target}.ts`)) target = `${target}.ts`;
				else if (fileSet.has(join(target, 'index.ts'))) target = join(target, 'index.ts');
				else continue;
			}
			graph.get(file)?.add(target);
		}
	}
	return graph;
}

/** Tarjan SCC, iterative-enough for this graph size (recursion is fine). */
function findSccs(graph: Map<string, Set<string>>): string[][] {
	let counter = 0;
	const index = new Map<string, number>();
	const lowlink = new Map<string, number>();
	const onStack = new Set<string>();
	const stack: string[] = [];
	const sccs: string[][] = [];

	function strongconnect(v: string): void {
		index.set(v, counter);
		lowlink.set(v, counter);
		counter++;
		stack.push(v);
		onStack.add(v);
		for (const w of graph.get(v) ?? []) {
			if (!index.has(w)) {
				strongconnect(w);
				lowlink.set(v, Math.min(lowlink.get(v) ?? 0, lowlink.get(w) ?? 0));
			} else if (onStack.has(w)) {
				lowlink.set(v, Math.min(lowlink.get(v) ?? 0, index.get(w) ?? 0));
			}
		}
		if (lowlink.get(v) === index.get(v)) {
			const component: string[] = [];
			let w: string | undefined;
			do {
				w = stack.pop();
				if (w === undefined) break;
				onStack.delete(w);
				component.push(w);
			} while (w !== v);
			if (component.length > 1) sccs.push(component);
		}
	}

	for (const file of graph.keys()) if (!index.has(file)) strongconnect(file);
	return sccs;
}

describe('static-import SCC tripwire (S2-20)', () => {
	const sccs = findSccs(buildGraph()).map((component) =>
		component.map((f) => f.slice(ROOT.length + 1)).sort(),
	);

	test('every static-import SCC of size >1 is allowlisted (target: none)', () => {
		const unexpected = sccs.filter((component) => !ALLOWLISTED_SCCS.has(component.join(' | ')));
		if (unexpected.length > 0) {
			const rendered = unexpected
				.map((component) => `SCC (${component.length} files):\n    ${component.join('\n    ')}`)
				.join('\n  ');
			throw new Error(
				`Static value-import cycle(s) found:\n  ${rendered}\nBreak the cycle (boot-time registration seam, data binding, or import type) — see this file’s header for the S2-20 precedents. Allowlisting is the LAST resort.`,
			);
		}
		expect(unexpected).toEqual([]);
	});

	test('allowlist stays honest — no stale entries for cycles that no longer exist', () => {
		const present = new Set(sccs.map((component) => component.join(' | ')));
		const stale = [...ALLOWLISTED_SCCS].filter((signature) => !present.has(signature));
		expect(stale).toEqual([]);
	});
});
