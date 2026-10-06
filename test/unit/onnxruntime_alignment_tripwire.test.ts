/**
 * ONNXRUNTIME ALIGNMENT TRIPWIRE (DEC-12: a documented invariant has a gate).
 *
 * The vendored transformers.js bundle (`vendor/transformers/dist/transformers.js`)
 * COMPILES IN onnxruntime-web's JavaScript core, and loads the matching `.mjs` +
 * `.wasm` glue at runtime from `/dedalo/lib/onnxruntime/dist/` — i.e. from the
 * `onnxruntime-web` npm pin (the client-lib registry's `onnxruntime` row). Core
 * and glue are ONE onnxruntime build; nothing at runtime checks that they are.
 * This gate does: the onnxruntime-web version the bundle was built from must equal
 * the exact `package.json` pin AND the version `bun.lock` resolves.
 *
 * WHY THIS EXISTS. The policy (2026-10-05): serve the pair upstream built and
 * tested together. Before it, the pin had drifted unnoticed — 1.29.0 glue under
 * the 4.2.0 bundle's 1.26.0-dev core — and Dependabot proposed a lone 1.30.0 bump
 * (#125). Both mismatched pairs happened to RUN (bit-identical outputs, measured
 * 2026-10-04 in a clean browser context), which is exactly why nothing caught the
 * drift: an untested combination is invisible until one isn't. This gate makes
 * the pairing a fact instead of a hope, and turns a lone bump red.
 *
 * WHAT IT READS. The bundle's own provenance: esbuild's source-path comment
 * `node_modules/.pnpm/onnxruntime-web@<version>/…` names the package actually
 * bundled (the `ONNX Runtime Web v…` banner and minified `var x = "<version>"`
 * constants agree, but a minified name is no anchor). The runtime value
 * (`env.backends.onnx.versions.web`) is set only when onnxruntime initialises
 * in a browser — under Bun it is absent, so it cannot be the hermetic source.
 *
 * DB-free and fs-only (the bundle, package.json, bun.lock; the smoke model is built in memory): hermetic tier.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	build_ort_smoke_model,
	ORT_SMOKE_CONFIG,
	ORT_SMOKE_MODEL_ID,
} from '../../client/dedalo/test/client/js/ort_smoke_model.js';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const BUNDLE = 'vendor/transformers/dist/transformers.js';
const PACKAGE = 'onnxruntime-web';

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

/** The onnxruntime-web version(s) a bundle was built from, by esbuild source path. */
function bundledVersions(bundle: string): string[] {
	const found = new Set<string>();
	for (const m of bundle.matchAll(/node_modules\/\.pnpm\/onnxruntime-web@([^/\s]+)\//g)) {
		found.add(m[1] as string);
	}
	return [...found];
}

/** The ONE onnxruntime-web version the bundle embeds; throws on none or several. */
function bundledVersion(bundle: string): string {
	const versions = bundledVersions(bundle);
	if (versions.length !== 1) {
		throw new Error(
			`expected exactly one embedded onnxruntime-web version in ${BUNDLE}, found ${versions.length} (${versions.join(', ') || 'none'}) — the provenance marker moved; re-anchor this gate, never skip it`,
		);
	}
	return versions[0] as string;
}

/** The exact package.json pin; throws on a missing or range pin. */
function pinnedVersion(packageJson: string): string {
	const pkg = JSON.parse(packageJson) as { dependencies?: Record<string, string> };
	const pin = pkg.dependencies?.[PACKAGE];
	if (pin === undefined) throw new Error(`${PACKAGE} is not a runtime dependency in package.json`);
	if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(pin)) {
		throw new Error(`${PACKAGE} pin "${pin}" is not an exact version — the glue must be one build`);
	}
	return pin;
}

/** The version bun.lock resolves the package to; throws when absent or ambiguous. */
function lockedVersions(bunLock: string): string[] {
	const found = new Set<string>();
	for (const m of bunLock.matchAll(/"onnxruntime-web":\s*\["onnxruntime-web@([^"]+)"/g)) {
		found.add(m[1] as string);
	}
	return [...found];
}

describe('onnxruntime-web: the vendored bundle core and the served glue are one build', () => {
	test('bundle = package.json pin = bun.lock resolution', () => {
		const embedded = bundledVersion(read(BUNDLE));
		const pin = pinnedVersion(read('package.json'));
		const locked = lockedVersions(read('bun.lock'));
		expect(locked, 'bun.lock must resolve onnxruntime-web to exactly one version').toHaveLength(1);
		const fix = `re-vendor transformers.js and pin ${PACKAGE} to the version it declares — never bump one half`;
		expect(pin, `package.json pins ${pin}; ${BUNDLE} was built from ${embedded} — ${fix}`).toBe(
			embedded,
		);
		expect(locked[0], `bun.lock resolves ${locked[0]}; the pin is ${pin} — run bun install`).toBe(
			pin,
		);
	});

	test('the provenance marker is really there (a scan over nothing is red)', () => {
		const bundle = read(BUNDLE);
		const hits = bundle.match(/node_modules\/\.pnpm\/onnxruntime-web@/g) ?? [];
		expect(hits.length).toBeGreaterThan(0);
		// The banner agrees with the source path — two independent spellings of one fact.
		expect(bundle).toContain(`ONNX Runtime Web v${bundledVersion(bundle)}`);
	});
});

describe('the browser half: test_ort_smoke runs a real session on an in-memory model', () => {
	// The pairing above is a version fact; whether the pair RUNS is a browser fact,
	// proven by the client suite test_ort_smoke. Its model is built in memory by a
	// first-party encoder (no committed model bytes); these legs keep that encoder
	// honest where Bun can reach it, so a broken encoder is red here, not as a
	// puzzling browser failure.
	test('the encoder emits the documented one-node Add graph', () => {
		const model = build_ort_smoke_model();
		expect(model.length).toBe(179);
		expect([model[0], model[1]]).toEqual([0x08, 0x08]); // ModelProto.ir_version = 8
		const text = new TextDecoder('latin1').decode(model);
		for (const marker of ['input_features', 'last_hidden_state', 'Add', 'ort_smoke']) {
			expect(text, marker).toContain(marker);
		}
		expect(ORT_SMOKE_CONFIG).toEqual({ model_type: 'wespeaker-resnet' });
		expect(ORT_SMOKE_MODEL_ID).toBe('ort_smoke');
	});

	test('the suite is registered (a suite in no manifest never runs)', () => {
		expect(read('client/dedalo/test/client/js/test_registry.js')).toMatch(/^\t'test_ort_smoke'/m);
	});
});

describe('onnxruntime-web alignment: the checks refuse what they cannot state truthfully', () => {
	const marker = (v: string): string =>
		`// ../../node_modules/.pnpm/onnxruntime-web@${v}/node_modules/onnxruntime-web/dist/ort.webgpu.bundle.min.mjs\n`;

	test('CONSTRUCTED RED — the #125 shape (1.26-dev core, 1.30.0 pin) is a mismatch', () => {
		const embedded = bundledVersion(marker('1.26.0-dev.20260416-b7804b056c'));
		const pin = pinnedVersion(JSON.stringify({ dependencies: { [PACKAGE]: '1.30.0' } }));
		expect(pin).not.toBe(embedded);
	});

	test('CONSTRUCTED RED — no marker throws instead of passing vacuously', () => {
		expect(() => bundledVersion('var x = 1;')).toThrow('found 0');
	});

	test('CONSTRUCTED RED — two embedded versions throw', () => {
		expect(() => bundledVersion(marker('1.30.0') + marker('1.31.0'))).toThrow('found 2');
	});

	test('CONSTRUCTED RED — a range pin throws', () => {
		expect(() => pinnedVersion(JSON.stringify({ dependencies: { [PACKAGE]: '^1.31.0' } }))).toThrow(
			'not an exact version',
		);
	});

	test('CONSTRUCTED RED — a missing or dev-only pin throws', () => {
		expect(() =>
			pinnedVersion(JSON.stringify({ devDependencies: { [PACKAGE]: '1.31.0' } })),
		).toThrow('not a runtime dependency');
	});

	test('a -dev exact pin is accepted (the pairing, not the label, is the law)', () => {
		const v = '1.31.0-dev.20260914-8d85527a0';
		expect(pinnedVersion(JSON.stringify({ dependencies: { [PACKAGE]: v } }))).toBe(v);
		expect(lockedVersions(`"onnxruntime-web": ["onnxruntime-web@${v}", "", {}]`)).toEqual([v]);
	});
});
