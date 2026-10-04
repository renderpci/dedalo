/**
 * publication_hosts CLIENT LABELS: the keys the publication_hosts widget resolves
 * DYNAMICALLY. labels_tripwire scans only static `get_label.x` /
 * `get_label['x']` references, so these keys are invisible to it:
 *   - `publication_hosts_check_<id>` through check_row(…, 'publication_hosts');
 *   - `publication_hosts_lead` through the System Map's MAP_TOOL_DESC_LABEL.
 * Each key must be defined in master.json and translated in every catalog except
 * the master-source lang. CHECK_IDS is the FIXED HostCheck id list of the phase-3
 * plan (src/core/publication_host/host_status.ts). A new id needs its label first.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MASTER_SOURCE_LANG } from '../../src/core/labels/catalog.ts';

const LABELS_DIR = resolve(import.meta.dir, '../../src/core/labels');

const CHECK_IDS = [
	'registry',
	'secrets',
	'reachable',
	'pairing',
	'agent_version',
	'media_mode',
	'media_mount',
	'media_read_only',
	'rules_hash',
	'api_v1',
	'api_v2',
] as const;
const DYNAMIC_KEYS = [
	...CHECK_IDS.map((id) => `publication_hosts_check_${id}`),
	'publication_hosts_lead',
];

const readJson = (path: string): Record<string, string> =>
	JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;

describe('publication_hosts client labels', () => {
	const master = readJson(join(LABELS_DIR, 'master.json'));

	test('every dynamically resolved key is defined in the master', () => {
		expect(DYNAMIC_KEYS.filter((key) => master[key] === undefined)).toEqual([]);
	});

	test('every dynamically resolved key is translated in every non-master catalog', () => {
		const gaps: string[] = [];
		for (const name of readdirSync(join(LABELS_DIR, 'catalog')).sort()) {
			const lang = name.replace('.json', '');
			if (lang === MASTER_SOURCE_LANG) continue;
			const catalog = readJson(join(LABELS_DIR, 'catalog', name));
			for (const key of DYNAMIC_KEYS) {
				if (catalog[key] === undefined) gaps.push(`${lang}:${key}`);
			}
		}
		expect(gaps).toEqual([]);
	});
});
