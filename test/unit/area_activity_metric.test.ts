/**
 * get_activity_metric — the dashboard timeline's on-demand range switch
 * (client dashboard.js fetch_range → 3m/6m/1y). The dashboard READ serves only
 * activity_30d inline; wider windows are fetched through this action. Before it
 * existed the client's auto-advance (empty 1m → next range) hit an unregistered
 * action and got HTTP 400 on load (dd323).
 *
 * White-box against the DB (admin principal): the helper must produce the SAME
 * ActivityPayload shape as the inline activity_30d, over a wider window, and the
 * allowed-range set must bound the scan.
 */

import { expect, test } from 'bun:test';
import {
	ACTIVITY_RANGE_DAYS,
	getAreaActivityMetric,
	getDashboardChildSections,
	metricActivity,
} from '../../src/core/area/dashboard.ts';

const AREA_TIPO = 'dd242'; // area_root — the standing dashboard fixture

test('allowed ranges match the UI available_ranges', () => {
	expect([...ACTIVITY_RANGE_DAYS].sort((a, b) => a - b)).toEqual([30, 90, 180, 365]);
});

test('getAreaActivityMetric(90) yields the wider-window activity payload', async () => {
	const payload = await getAreaActivityMetric(AREA_TIPO, 90);
	expect(payload).not.toBe(null);
	if (payload === null) return;
	// 90-day window ⇒ 90 filled days (metricActivity fills every calendar day).
	expect(payload.days.length).toBe(90);
	expect(Array.isArray(payload.users)).toBe(true);
	expect(payload.available_ranges.map((r) => r.days)).toEqual([30, 90, 180, 365]);
}, 30000);

test('getAreaActivityMetric == metricActivity over the same child sections', async () => {
	const children = await getDashboardChildSections(AREA_TIPO);
	const direct = await metricActivity(children, 30);
	const viaHelper = await getAreaActivityMetric(AREA_TIPO, 30);
	expect(viaHelper).toEqual(direct);
}, 30000);
