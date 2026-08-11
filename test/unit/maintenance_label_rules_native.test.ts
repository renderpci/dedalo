/**
 * `labelFor` — the maintenance dashboard's label resolver (plan §4.1.2).
 *
 * OPERATOR-VISIBLE FAILURE THIS GATES: the maintenance dashboard renders the
 * RAW markup `<mark>config_areas</mark>` (or a raw key) as a panel header
 * instead of the translated term — i.e. the operator sees engine internals
 * where a label belongs, and a `label_mark_fallback` widget loses its curated
 * English literal.
 *
 * `resolveLabel` (registry.ts:157) is folded in here: it has no independent
 * case, it IS the dictionary lookup every rule kind goes through.
 *
 * NOTE: this drives `labelFor` DIRECTLY. Reaching it through
 * `getMaintenanceWidgets()` would fire every widget `eagerValue`, including
 * `checkSequences`' `setval` loop — a WRITE on a read path (plan §4.4 D2).
 */

import { describe, expect, test } from 'bun:test';
import { labelFor } from '../../src/core/area_maintenance/widgets/registry.ts';

/** A dictionary that HAS some keys and lacks others — both halves are load-bearing. */
const labels: Record<string, string> = {
	config_areas: 'Configurar áreas',
	install: 'Instalar',
	update: 'Actualizar',
};

describe('labelFor — LabelRule resolution', () => {
	test("'label': present key serves the dictionary term", () => {
		expect(labelFor(labels, { kind: 'label', key: 'install' })).toBe('Instalar');
	});

	test("'label': missing key serves the MARKED key (PHP get_label parity)", () => {
		expect(labelFor(labels, { kind: 'label', key: 'no_such_key' })).toBe(
			'<mark>no_such_key</mark>',
		);
	});

	// The PRESENT half is the load-bearing one: with the `<mark` predicate
	// inverted, the MISSING half alone still passes for any dictionary.
	test("'label_mark_fallback': key PRESENT serves the dictionary term, not the literal", () => {
		expect(
			labelFor(labels, {
				kind: 'label_mark_fallback',
				key: 'config_areas',
				literal: 'Config areas',
			}),
		).toBe('Configurar áreas');
	});

	test("'label_mark_fallback': key MISSING serves the curated literal, never the marked key", () => {
		const resolved = labelFor(labels, {
			kind: 'label_mark_fallback',
			key: 'menu_skip_tipos',
			literal: 'Menu skip tipos',
		});
		expect(resolved).toBe('Menu skip tipos');
		expect(resolved).not.toContain('<mark');
	});

	test("'label_concat': one key missing → marked key + SPACE + resolved key", () => {
		expect(labelFor(labels, { kind: 'label_concat', keys: ['install', 'hierarchies'] })).toBe(
			'Instalar <mark>hierarchies</mark>',
		);
		expect(labelFor(labels, { kind: 'label_concat', keys: ['update', 'data'] })).toBe(
			'Actualizar <mark>data</mark>',
		);
	});

	test("'label_concat': both keys present join with a single space", () => {
		expect(labelFor(labels, { kind: 'label_concat', keys: ['update', 'install'] })).toBe(
			'Actualizar Instalar',
		);
	});

	test("'literal': text passes through untouched (no dictionary lookup)", () => {
		expect(labelFor(labels, { kind: 'literal', text: 'install' })).toBe('install');
	});
});
