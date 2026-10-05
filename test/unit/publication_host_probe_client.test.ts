/**
 * publication_hosts client — the public-URL probe (phase 6). The pure decision (which probe
 * facts a host row shows) is imported and exercised; the render wiring is pinned at the
 * source level (vanilla JS, no DOM here — the DOM behaviour is
 * client/dedalo/test/client/js/test_publication_hosts.js, `bun run test:client`).
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { probe_facts } from '../../client/dedalo/core/area_maintenance/widgets/publication_hosts/js/probe_view.js';

const DIR = join(
	import.meta.dir,
	'../../client/dedalo/core/area_maintenance/widgets/publication_hosts/js',
);
const render = readFileSync(join(DIR, 'render_publication_hosts.js'), 'utf8');

describe('public probe client', () => {
	test('probe_facts: when it was probed, and the detail only when there is one', () => {
		const probe = {
			state: 'failed',
			at: '2026-10-05T10:00:00.000Z',
			published_status: 200,
			unpublished_status: 200,
			detail: 'the gate is OPEN',
		};
		expect(probe_facts({ public_probe: probe })).toEqual([
			['publication_hosts_probe_at', 'Last public probe', '2026-10-05T10:00:00.000Z'],
			['publication_hosts_probe_detail', 'Public gate detail', 'the gate is OPEN'],
		]);
		expect(probe_facts({ public_probe: { ...probe, detail: null, at: null } })).toEqual([
			['publication_hosts_probe_at', 'Last public probe', ''],
		]);
		expect(probe_facts({ public_probe: null })).toEqual([]);
		expect(probe_facts({ probe: { published: 'a', unpublished: 'b' } })).toEqual([]);
		expect(probe_facts(null)).toEqual([]);
	});

	test('render shows the facts as TEXT (fact_row) and mounts the button through the ONE action path, no confirm', () => {
		expect(render).toContain("from './probe_view.js'");
		expect(render).toContain('probe_facts(host)');
		expect(render).toContain('render_probe_public(self, host, actions, body_response)');
		const start = render.indexOf('const render_probe_public');
		const block = render.slice(start, render.indexOf('//end render_probe_public', start));
		expect(start).toBeGreaterThan(0);
		expect(block.length).toBeGreaterThan(200);
		expect(block).toContain('run_action(self, {');
		expect(block).toContain("action: 'probe_public'");
		expect(block).toContain('options: { name: host.name }');
		expect(block).toContain('confirm_text: null');
		expect(block).not.toContain('innerHTML');
	});
});
