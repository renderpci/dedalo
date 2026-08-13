/**
 * AI MODELS WIDGET GATE — the administrator's answer to "can this install
 * transcribe at all?".
 *
 * The panel shape is a pure function of already-read facts, so this gate never
 * touches the store or the catalog: the widget's own I/O shell reads those.
 */

import { describe, expect, test } from 'bun:test';
import { buildAiModelsPanel, widget } from '../../src/core/area_maintenance/widgets/ai_models.ts';

describe('the panel tells an administrator what to do', () => {
	test('an unreachable store is reported as such, with no model rows invented', () => {
		const panel = buildAiModelsPanel({
			storePath: '/private/ai_models',
			storeAvailable: false,
			hubAllowed: false,
			models: [],
		});
		expect(panel.store_available).toBe(false);
		expect(panel.models).toEqual([]);
		expect(panel.usable_count).toBe(0);
	});

	test('every state is carried through, and usable_count counts only runnable ones', () => {
		const panel = buildAiModelsPanel({
			storePath: '/private/ai_models',
			storeAvailable: true,
			hubAllowed: false,
			models: [
				{ name: 'a', label: 'High', state: 'ready', bytes: 100 },
				{ name: 'b', label: 'Medium', state: 'unverified', bytes: 50 },
				{ name: 'c', label: 'Low', state: 'incomplete', bytes: 7 },
				{ name: 'd', label: 'Tiny', state: 'missing', bytes: 0 },
			],
		});
		expect(panel.models.map((model) => model.state)).toEqual([
			'ready',
			'unverified',
			'incomplete',
			'missing',
		]);
		expect(panel.usable_count).toBe(2);
		expect(panel.total_bytes).toBe(157);
	});

	test('a damaged model is never counted as usable', () => {
		const panel = buildAiModelsPanel({
			storePath: '/private/ai_models',
			storeAvailable: true,
			hubAllowed: true,
			models: [{ name: 'a', label: 'High', state: 'damaged', bytes: 900 }],
		});
		expect(panel.usable_count).toBe(0);
		expect(panel.hub_allowed).toBe(true);
		expect(panel.total_bytes).toBe(900);
	});

	test('the widget registers under a stable id and serves a value', () => {
		expect(widget.spec.id).toBe('ai_models');
		expect(typeof widget.getValue).toBe('function');
	});

	test('it is DISPLAY-ONLY: no apiActions reach the wire', () => {
		// The download / verify / repair executes live in tool_transcription,
		// admin-gated there. A second copy here would be a second gate to keep right.
		expect(widget.apiActions).toBeUndefined();
	});
});
