/**
 * area_maintenance widget VALUE-PATH agreement (client ↔ server).
 *
 * OPERATOR-VISIBLE FAILURE THIS GATES — both halves have shipped:
 *
 *  - client assigns `get_value`, server module has NO `getValue`: opening the
 *    panel throws `maintenance.widget_unavailable` ("panel is not available on
 *    this engine") and the widget never renders. Shipped for export_hierarchy;
 *    the sync form was unreachable because of it.
 *  - server module HAS `getValue` but the client never assigns `get_value`:
 *    `widget_common.prototype.load()` no-ops (it is a no-op by design when the
 *    widget has no `get_value`), `self.value` stays the eager catalog value —
 *    null for a widget with no `eagerValue` — and the panel renders EMPTY while
 *    a perfectly good server value is served on request. Shipped for all five
 *    move_* widgets: no explanation body, no definition files to select.
 *
 * The pairing is the invariant, in BOTH directions. A widget that deliberately
 * has neither (dataframe_control, WC-071) is agreement, not a hole, and passes.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WidgetModule } from '../../src/core/area_maintenance/widgets/support.ts';

const CLIENT_DIR = join(import.meta.dir, '../../client/dedalo/core/area_maintenance/widgets');
const SERVER_DIR = join(import.meta.dir, '../../src/core/area_maintenance/widgets');

/** Widget ids from the CLIENT tree — the enumeration an operator can actually open. */
const widgetIds = readdirSync(CLIENT_DIR, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();

/** Does the client widget wire the lazy loader (`<id>.prototype.get_value = …`)? */
function clientAssignsGetValue(id: string): boolean {
	const dir = join(CLIENT_DIR, id, 'js');
	if (!existsSync(dir)) return false;
	return readdirSync(dir)
		.filter((name) => name.endsWith('.js'))
		.some((name) =>
			new RegExp(`${id}\\.prototype\\.get_value\\s*=`).test(readFileSync(join(dir, name), 'utf-8')),
		);
}

describe('maintenance widget get_value pairing', () => {
	test('the client tree and the server modules agree on every widget', async () => {
		expect(widgetIds.length).toBeGreaterThan(20); // the enumeration itself must not go empty

		const mismatches: string[] = [];
		for (const id of widgetIds) {
			const modulePath = join(SERVER_DIR, `${id}.ts`);
			expect(existsSync(modulePath)).toBe(true); // a client panel with no server module
			const { widget } = (await import(modulePath)) as { widget: WidgetModule };

			const client = clientAssignsGetValue(id);
			const server = typeof widget.getValue === 'function';
			if (client !== server) {
				mismatches.push(
					`${id}: client get_value=${client}, server getValue=${server}` +
						(client
							? ' — opening the panel throws maintenance.widget_unavailable'
							: ' — the served value is never fetched; the panel renders empty'),
				);
			}
		}
		expect(mismatches).toEqual([]);
	});
});
