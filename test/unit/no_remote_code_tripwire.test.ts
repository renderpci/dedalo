/**
 * NO-REMOTE-CODE TRIPWIRE (DEC-12).
 *
 * The client and the tools may never load EXECUTABLE CODE from a third-party
 * host. Every library comes from the client-lib registry
 * (src/core/client_libs/registry.ts → /dedalo/lib/…) and every AI model from the
 * install's own model store (/dedalo/ai_models/…).
 *
 * WHY THIS EXISTS. Until 2026-07-28 the in-browser speech recogniser imported its
 * runtime straight from a CDN and streamed its model weights from a public hub.
 * The tool's whole promise is that an interview holding personal data is
 * transcribed locally — and that promise was quietly broken twice over: the
 * feature could not work at all in an air-gapped archive, and where there was
 * internet it announced to two third parties exactly when a record was being
 * worked on. A regression here is invisible in the browser (it still works, on a
 * developer's connected laptop) which is precisely why it needs a gate.
 *
 * WHAT IS CHECKED: statements that LOAD CODE — static and dynamic `import`,
 * `importScripts`, `new Worker(…)` and `<script src>`. Data URLs are a different
 * question (a map tile server is a legitimate remote address) and are out of
 * scope on purpose: this gate is about who gets to run code in the user's browser.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '../..');
// Widened 2026-07-28 (W1-02): src/ + .ts are scanned too — a remote code load
// is a remote code load wherever it lives, and the AI serving path is TS.
const SCAN_ROOTS = ['client/dedalo', 'tools', 'src'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.html', '.ts']);

/**
 * Code-loading statements pointing at an absolute http(s) URL. Each pattern is
 * anchored on the loading construct, never on the bare URL, so ordinary remote
 * DATA references (tile servers, documentation links) are untouched.
 */
const REMOTE_CODE_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
	{ name: 'static import', pattern: /\bimport\s[^;]*?from\s*['"`]https?:\/\/[^'"`]+['"`]/g },
	{ name: 'bare import', pattern: /\bimport\s*['"`]https?:\/\/[^'"`]+['"`]/g },
	{ name: 'dynamic import', pattern: /\bimport\s*\(\s*['"`]https?:\/\/[^'"`]+['"`]/g },
	{ name: 'importScripts', pattern: /\bimportScripts\s*\(\s*['"`]https?:\/\/[^'"`]+['"`]/g },
	{ name: 'worker', pattern: /\bnew\s+Worker\s*\(\s*['"`]https?:\/\/[^'"`]+['"`]/g },
	{ name: 'script src', pattern: /<script[^>]+src\s*=\s*['"]https?:\/\/[^'"]+['"]/g },
];

/**
 * Strip comments and template-literal-free string noise that would otherwise
 * produce false positives: a commented-out CDN import is documentation of what
 * we no longer do, not a live dependency.
 */
function stripComments(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.map((line) => {
			const commentAt = line.indexOf('//');
			if (commentAt === -1) return line;
			// Keep '//' that is part of a URL inside a string ("https://…").
			const before = line.slice(0, commentAt);
			if (/['"`:]$/.test(before.trimEnd())) return line;
			return before;
		})
		.join('\n');
}

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry === '.git') continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			walk(full, out);
			continue;
		}
		if (SCAN_EXTENSIONS.has(extname(full).toLowerCase())) out.push(full);
	}
	return out;
}

describe('no remote code: the client and tools load code only from this install', () => {
	test('no client or tool file imports code from a third-party host', () => {
		const offenders: string[] = [];

		for (const root of SCAN_ROOTS) {
			const rootPath = join(REPO_ROOT, root);
			for (const file of walk(rootPath)) {
				const source = stripComments(readFileSync(file, 'utf8'));
				for (const { name, pattern } of REMOTE_CODE_PATTERNS) {
					pattern.lastIndex = 0;
					const found = source.match(pattern);
					if (found !== null) {
						offenders.push(`${relative(REPO_ROOT, file)}: ${name} → ${found[0].slice(0, 120)}`);
					}
				}
			}
		}

		expect(offenders).toEqual([]);
	});

	test('every in-browser AI runtime pins onnxruntime WASM locally (RC-01, W1-02)', () => {
		// transformers.js loads its onnxruntime WASM glue (.mjs + .wasm) from
		// cdn.jsdelivr.net BY DEFAULT unless env.backends.onnx.wasm.wasmPaths is
		// pointed at a local path. That remote load is INVISIBLE to the URL
		// patterns above (there is no literal import URL — it is a library
		// default), so it gets its own invariant: any file importing the
		// transformers runtime MUST set wasmPaths. This is the exact hole the RC-01
		// finding walked through (tool_lang's browser_transformer set remoteHost
		// but never wasmPaths, so the runtime came from the CDN).
		const offenders: string[] = [];
		for (const root of SCAN_ROOTS) {
			for (const file of walk(join(REPO_ROOT, root))) {
				const source = readFileSync(file, 'utf8');
				const importsTransformers =
					/\bimport\b[^;]*\bfrom\s*['"`][^'"`]*transformers\.js['"`]/.test(source);
				if (!importsTransformers) continue;
				if (!/wasmPaths\s*=/.test(source)) {
					offenders.push(
						`${relative(REPO_ROOT, file)}: imports transformers.js but never sets env.backends.onnx.wasm.wasmPaths → onnxruntime WASM falls back to the CDN`,
					);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	test('the patterns actually catch what they claim to (the gate is not vacuous)', () => {
		const samples = [
			"import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2';",
			"import('https://evil.example.com/x.js')",
			"importScripts('http://cdn.example.com/w.js')",
			"new Worker('https://cdn.example.com/worker.js')",
			'<script src="https://cdn.example.com/lib.js"></script>',
		];

		for (const sample of samples) {
			const hit = REMOTE_CODE_PATTERNS.some(({ pattern }) => {
				pattern.lastIndex = 0;
				return pattern.test(sample);
			});
			expect(hit).toBe(true);
		}
	});

	test('local imports and remote DATA references are not flagged', () => {
		const allowed = [
			"import { pipeline } from '/dedalo/lib/transformers/dist/transformers.js';",
			"import { ui } from '../../../core/common/js/ui.js'",
			"new Worker('../../tools/tool_transcription/transcribers/browser_whisper/browser_whisper.js', { type: 'module' })",
			"const tiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'",
			"fetch('https://api.example.org/data.json')",
		];

		for (const sample of allowed) {
			const hit = REMOTE_CODE_PATTERNS.some(({ pattern }) => {
				pattern.lastIndex = 0;
				return pattern.test(sample);
			});
			expect(hit).toBe(false);
		}
	});
});
