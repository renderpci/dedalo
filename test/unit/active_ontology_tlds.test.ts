/**
 * ACTIVE_ONTOLOGY_TLDS — the config key, the retired spelling, and the wire key.
 *
 * Renamed 2026-07-11 from DEDALO_PREFIX_TIPOS (WC-028): the value is the set of
 * ontology TOP-LEVEL DOMAINS active in this installation, not a "prefix tipo".
 * The rename is HARD — the old spelling is deliberately NOT in env.ts's
 * PHP_KEY_ALIASES — so the retirement has to be LOUD: an old .env line left in
 * place must refuse the boot, never silently fall back to the [] default (an
 * empty TLD list shrinks the update panel's manifest to ontology/ontologytype
 * alone — exactly the silent scope-narrowing the hard rules ban).
 *
 * `config` is frozen at import time, so the env-facing half of this gate boots a
 * REAL subprocess per case; asserting against a re-imported module in-process
 * would prove nothing about how the server actually reads its config.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { dispatchGetWidgetValue } from '../../src/core/area_maintenance/widgets/registry.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

const ROOT = join(import.meta.dir, '..', '..');
const ADMIN: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as Principal;

/**
 * Boot src/config/config.ts in a child with `env` overlaid on the real
 * environment and hand back what it printed / how it died.
 */
const READ_CONFIG_KEY =
	"const { config } = await import('./src/config/config.ts');" +
	'console.log(JSON.stringify(config.ontologyIo.activeOntologyTlds));';

/** The panel payload as the client receives it, from a child booted with a given env. */
const READ_PANEL_TLDS =
	"const { dispatchGetWidgetValue } = await import('./src/core/area_maintenance/widgets/registry.ts');" +
	'const ADMIN = { userId: -1, isGlobalAdmin: true, isDeveloper: true };' +
	"const body = await dispatchGetWidgetValue(ADMIN, { model: 'update_ontology' });" +
	'console.log(JSON.stringify(body.result.active_ontology_tlds));';

function bootConfigWith(
	env: Record<string, string | undefined>,
	snippet: string = READ_CONFIG_KEY,
): {
	exitCode: number;
	stdout: string;
	stderr: string;
} {
	const child = Bun.spawnSync(['bun', '-e', snippet], {
		cwd: ROOT,
		env: { ...process.env, ...env } as Record<string, string>,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	return {
		exitCode: child.exitCode,
		// The child may log boot noise; the payload is the LAST line it prints.
		stdout: (child.stdout.toString().trim().split('\n').pop() ?? '').trim(),
		stderr: child.stderr.toString().trim(),
	};
}

describe('ACTIVE_ONTOLOGY_TLDS config key', () => {
	test('reads the comma-list form', () => {
		const boot = bootConfigWith({
			ACTIVE_ONTOLOGY_TLDS: 'dd, rsc ,oh',
			DEDALO_PREFIX_TIPOS: undefined,
		});
		expect(boot.exitCode).toBe(0);
		// readListEnv trims each entry.
		expect(JSON.parse(boot.stdout)).toEqual(['dd', 'rsc', 'oh']);
	});

	test('reads the JSON-array form', () => {
		const boot = bootConfigWith({
			ACTIVE_ONTOLOGY_TLDS: '["dd","hierarchy","lg"]',
			DEDALO_PREFIX_TIPOS: undefined,
		});
		expect(boot.exitCode).toBe(0);
		expect(JSON.parse(boot.stdout)).toEqual(['dd', 'hierarchy', 'lg']);
	});

	test('defaults to [] when unset', () => {
		const boot = bootConfigWith({
			ACTIVE_ONTOLOGY_TLDS: undefined,
			DEDALO_PREFIX_TIPOS: undefined,
		});
		expect(boot.exitCode).toBe(0);
		expect(JSON.parse(boot.stdout)).toEqual([]);
	});
});

describe('DEDALO_PREFIX_TIPOS is RETIRED (hard rename, no alias)', () => {
	test('the old spelling ALONE refuses the boot, naming its replacement', () => {
		const boot = bootConfigWith({
			ACTIVE_ONTOLOGY_TLDS: undefined,
			DEDALO_PREFIX_TIPOS: 'dd,rsc,oh',
		});
		// Loud, not a silent fall back to [].
		expect(boot.exitCode).not.toBe(0);
		expect(boot.stderr).toContain('DEDALO_PREFIX_TIPOS');
		expect(boot.stderr).toContain('RETIRED');
		expect(boot.stderr).toContain('ACTIVE_ONTOLOGY_TLDS');
	});

	test('the old spelling does NOT configure anything when the new key is set', () => {
		const boot = bootConfigWith({
			ACTIVE_ONTOLOGY_TLDS: 'dd',
			DEDALO_PREFIX_TIPOS: 'rsc,oh,ich',
		});
		// Boots (the new key is present) and the retired value is ignored — an
		// alias would have merged or won here.
		expect(boot.exitCode).toBe(0);
		expect(JSON.parse(boot.stdout)).toEqual(['dd']);
	});
});

describe('update_ontology panel wire key (WC-028)', () => {
	test('the panel emits active_ontology_tlds, unioned with the core pair', async () => {
		// Through the REAL dispatch path the client hits (get_widget_value), not
		// the widget module's getValue in isolation.
		const body = (await dispatchGetWidgetValue(ADMIN, {
			model: 'update_ontology',
		})) as unknown as { result: Record<string, unknown> };
		const result = body.result;

		expect(result).toHaveProperty('active_ontology_tlds');
		// The retired wire key must be GONE, not merely shadowed by the new one.
		expect(result).not.toHaveProperty('prefix_tipos');

		const tlds = result.active_ontology_tlds as string[];
		expect(Array.isArray(tlds)).toBe(true);
		// The core pair is always unioned in, whatever the config says.
		expect(tlds).toContain('ontology');
		expect(tlds).toContain('ontologytype');
		// Union, not append: no duplicates.
		expect(new Set(tlds).size).toBe(tlds.length);
		// Every configured TLD survives the union.
		for (const tld of config.ontologyIo.activeOntologyTlds) {
			expect(tlds).toContain(tld);
		}
	});

	test('a CONFIGURED TLD set reaches the panel, unioned with the core pair', () => {
		// The assertion above is vacuous when ACTIVE_ONTOLOGY_TLDS is unset (the
		// default here) — the union loop iterates nothing. Boot a child that
		// actually sets the key, so the config→panel→client path is proven with a
		// non-empty value: this is the behavior the rename exists to preserve.
		const boot = bootConfigWith(
			{ ACTIVE_ONTOLOGY_TLDS: 'dd,rsc,oh', DEDALO_PREFIX_TIPOS: undefined },
			READ_PANEL_TLDS,
		);
		expect(boot.exitCode).toBe(0);
		expect(JSON.parse(boot.stdout)).toEqual(['dd', 'rsc', 'oh', 'ontology', 'ontologytype']);
	});
});
