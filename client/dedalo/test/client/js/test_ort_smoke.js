// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

/**
 * ORT SMOKE — the vendored transformers.js runtime creates and runs ONE real
 * onnxruntime session in the browser.
 *
 * Why a browser test: the bundle compiles in onnxruntime-web's JS core and loads the
 * `.mjs`/`.wasm` glue from the `onnxruntime-web` pin. Nothing hermetic loads that
 * pair — onnxruntime_alignment_tripwire proves the versions are paired; this proves
 * the pair RUNS (bundle served, glue fetched through wasmPaths, a session created
 * and executed). It does not detect a version mismatch on its own: measured
 * 2026-10-04, a mismatched pair runs this model fine — the tripwire owns that.
 *
 * The model is built in memory by ./ort_smoke_model.js (one ONNX `Add` node:
 * last_hidden_state = input_features + input_features, float32 [1, 4]) and handed
 * to transformers.js through its custom-cache hook — no committed model bytes, no
 * weights, no login, no network. WASM only: the headless suite has no GPU.
 */

import { AutoModel, env, Tensor } from '/dedalo/lib/transformers/dist/transformers.js';
import { build_ort_smoke_model, ORT_SMOKE_CONFIG, ORT_SMOKE_MODEL_ID } from './ort_smoke_model.js';

// The runtime is configured exactly as every production importer configures it
// (no_remote_code_tripwire LEG 3): onnxruntime glue from the local pin, models
// from the install's store…
env.backends.onnx.wasm.wasmPaths = new URL(
	'/dedalo/lib/onnxruntime/dist/',
	self.location.origin,
).href;
env.allowRemoteModels = true;
env.allowLocalModels = false;
env.remoteHost = new URL('/dedalo/ai_models/', self.location.origin).href;
env.remotePathTemplate = '{model}/';
env.useBrowserCache = false;

// …except that the cache answers for this one model, from memory, before any fetch.
// A miss falls through to the store and 404s — loudly, never silently.
const model_url = (file) => `${env.remoteHost}${ORT_SMOKE_MODEL_ID}/${file}`;
const in_memory = new Map([
	[model_url('config.json'), () => new Response(JSON.stringify(ORT_SMOKE_CONFIG))],
	[model_url('onnx/model.onnx'), () => new Response(build_ort_smoke_model())],
]);
env.useCustomCache = true;
env.customCache = {
	match: async (request) => in_memory.get(typeof request === 'string' ? request : request.url)?.(),
	put: async () => {},
};

// A hung session create must fail the suite, not stall it.
const SETTLE_MS = 20000;
const within = (promise, what) =>
	Promise.race([
		promise,
		new Promise((_, reject) =>
			setTimeout(
				() => reject(new Error(`${what}: did not settle within ${SETTLE_MS} ms`)),
				SETTLE_MS,
			),
		),
	]);

describe('ORT SMOKE (vendored transformers.js + onnxruntime-web pin) : ', function () {
	this.timeout(SETTLE_MS * 3);

	it('creates a WASM session and runs it: Add(x, x) = 2x', async () => {
		const model = await within(
			AutoModel.from_pretrained(ORT_SMOKE_MODEL_ID, { device: 'wasm', dtype: 'fp32' }),
			'session create',
		);
		try {
			const input_features = new Tensor('float32', new Float32Array([1, 2, 3, 4]), [1, 4]);
			const output = await within(model({ input_features }), 'session run');

			assert.deepEqual(output.last_hidden_state.dims, [1, 4]);
			assert.deepEqual(Array.from(output.last_hidden_state.data), [2, 4, 6, 8]);
		} finally {
			await model.dispose?.();
		}
	});

	it('reports the onnxruntime-web build it runs on', () => {
		// Set by onnxruntime when it initialises (it did, above). Asserted to exist so a
		// runtime that never initialised cannot pass the first test vacuously.
		const versions = env.backends.onnx.versions;
		assert.isObject(versions);
		assert.isString(versions.web);
		assert.match(versions.web, /^\d+\.\d+\.\d+/);
	});
});
