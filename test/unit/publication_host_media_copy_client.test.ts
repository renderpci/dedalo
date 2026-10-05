/**
 * publication_hosts client — the media-copy button (phase 5). The pure decision (does this
 * host row carry a media_copy check?) is imported and exercised; the controller and render
 * wiring are pinned at the source level (vanilla JS, no DOM here — the DOM behaviour is
 * client/dedalo/test/client/js/test_publication_hosts.js, `bun run test:client`).
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { has_media_copy } from '../../client/dedalo/core/area_maintenance/widgets/publication_hosts/js/media_copy_view.js';
import { widget } from '../../src/core/area_maintenance/widgets/publication_hosts.ts';

const DIR = join(
	import.meta.dir,
	'../../client/dedalo/core/area_maintenance/widgets/publication_hosts/js',
);
const controller = readFileSync(join(DIR, 'publication_hosts.js'), 'utf8');
const render = readFileSync(join(DIR, 'render_publication_hosts.js'), 'utf8');

describe('media_copy client', () => {
	test('has_media_copy: only a row whose checks include media_copy', () => {
		expect(has_media_copy({ checks: [{ id: 'media_copy', state: 'ok' }] })).toBe(true);
		expect(has_media_copy({ checks: [{ id: 'reachable', state: 'ok' }] })).toBe(false);
		expect(has_media_copy({ checks: 'media_copy' })).toBe(false);
		expect(has_media_copy({})).toBe(false);
		expect(has_media_copy(null)).toBe(false);
	});

	test("the controller's closed action set is the server's apiActions, reconcile_media_copy included", () => {
		const match = /PUBLICATION_HOST_ACTIONS = Object\.freeze\(\[([^\]]*)\]\)/.exec(controller);
		const names = [...(match?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
		expect(names).toContain('reconcile_media_copy');
		expect(names.sort()).toEqual(Object.keys(widget.apiActions ?? {}).sort());
	});

	test('render mounts the button through the ONE action path: has_media_copy-gated, confirm-gated, {name}, server text', () => {
		expect(render).toContain("from './media_copy_view.js'");
		expect(render).toContain('has_media_copy(host)');
		expect(render).toContain("action: 'reconcile_media_copy'");
		const start = render.indexOf('const render_media_copy');
		const block = render.slice(start, render.indexOf('//end render_media_copy', start));
		expect(start).toBeGreaterThan(0);
		expect(block.length).toBeGreaterThan(200);
		expect(block).toContain('run_action(self, {');
		expect(block).toContain('options: { name: host.name }');
		expect(block).toContain('confirm_text: confirm_text(');
		expect(block).not.toContain('innerHTML');
		expect(/\balert\s*\(|[^.]\bconfirm\s*\(/.test(block)).toBe(false);
	});
});
