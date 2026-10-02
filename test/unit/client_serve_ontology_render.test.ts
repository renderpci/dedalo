/**
 * serve_ontology client render — the provider-side panel is PRIMARY, honest and
 * text-safe (WC-2026-09-28-maintenance-serve-ontology-widget).
 *
 * Split out of update_ontology, where the same readout sat as a collapsed
 * <details> under a destructive pull action. The assertions:
 *   1. it is the panel's own content, never a collapsed note again;
 *   2. the "Enabled" badge needs ALL THREE keys — a master missing its CORS
 *      origins fails every client from the browser, so two-of-three is not ready;
 *   3. the server-provided endpoint reaches the DOM as a TEXT node (SEC-031);
 *   4. the pull panel no longer renders a second copy (one home, no drift);
 *   5. every label it reads exists in the master catalog (the fallbacks would
 *      otherwise hide a rename forever in every non-English UI).
 *
 * Read WHITESPACE-FREE (`flat`/`flatPull`): the browser formatter reflowed the
 * file (7164ae7bfd) and the tab-aligned spellings these legs pinned stopped
 * matching — two legs went red and the `not.toContain` one went VACUOUS (it
 * could no longer match the shape it refuses). A layout pass may not move a
 * gate in either direction.
 *
 * Honest limit: reads the source (no DOM) — the rendering was verified in the
 * browser when it landed. DB-less, network-less → hermetic tier.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const WIDGETS = join(REPO_ROOT, 'client/dedalo/core/area_maintenance/widgets');
const src = readFileSync(join(WIDGETS, 'serve_ontology/js/render_serve_ontology.js'), 'utf8');
const pull = readFileSync(join(WIDGETS, 'update_ontology/js/render_update_ontology.js'), 'utf8');
/** The source with every whitespace run removed — layout-independent. */
const flat = src.replace(/\s+/g, '');
const flatPull = pull.replace(/\s+/g, '');

describe('serve_ontology client render', () => {
	test('is the panel content, not a collapsed note', () => {
		expect(src).toContain('serve_ontology_content');
		// The positive half proves the flat reading sees element_type spellings at all.
		expect(flat).toContain("element_type:'div'");
		expect(flat).not.toContain("element_type:'details'");
	});

	test('the Enabled badge requires all three serving keys', () => {
		expect(flat).toContain(
			'constready=serving.enabled===true&&serving.has_server_code===true&&serving.cors_enabled===true',
		);
	});

	test('the endpoint url is a text node, never markup', () => {
		expect(flat).toContain('text_content:String(serving.url)');
		expect(/inner_html:[^,]*serving\.url/.test(flat)).toBe(false);
	});

	test('update_ontology no longer renders the serving readout', () => {
		expect(flatPull).not.toContain('build_serving_info');
		expect(flatPull).not.toContain('value.serving');
	});

	test('every get_label key it reads is defined in the master catalog', () => {
		const master = JSON.parse(
			readFileSync(join(REPO_ROOT, 'src/core/labels/master.json'), 'utf8'),
		) as Record<string, string>;
		const keys = [...src.matchAll(/get_label\.([a-z0-9_]+)/g)].map((m) => m[1] as string);
		expect(keys.length).toBeGreaterThan(8);
		expect(keys.filter((k) => !(k in master))).toEqual([]);
	});
});
