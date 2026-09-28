/**
 * serve_code client render — the code-server (PUBLISH) panel, split out of
 * update_code on 2026-09-28 (WC-2026-09-28-maintenance-serve-code-widget).
 *
 * The build tests moved here verbatim from client_update_code_render.test.ts
 * with the code they pin; the new assertions pin the split itself: the build
 * action speaks to model `serve_code`, and the readout re-uses the consumer
 * panel's row helpers instead of a second copy of them.
 *
 * Honest limit: reads the source (no DOM). DB-less, network-less → hermetic tier.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WIDGETS = join(import.meta.dir, '..', '..', 'client/dedalo/core/area_maintenance/widgets');
const render_src = readFileSync(join(WIDGETS, 'serve_code/js/render_serve_code.js'), 'utf8');
const css_src = readFileSync(join(WIDGETS, 'serve_code/css/serve_code.less'), 'utf8');
/** The row helpers the readout imports (release_facts lives there, shared). */
const status_src = readFileSync(join(WIDGETS, 'update_code/js/render_update_status.js'), 'utf8');
const master_labels = JSON.parse(
	readFileSync(join(import.meta.dir, '../../src/core/labels/master.json'), 'utf8'),
) as Record<string, string>;

describe('serve_code split', () => {
	test('the build action targets model serve_code, never update_code', () => {
		expect(render_src).toContain(
			"model	: 'serve_code',\n\t\t\t\t\taction	: 'build_version_from_git_master'",
		);
		expect(render_src).not.toContain("model	: 'update_code'");
	});

	test('the readout re-uses the shared row helpers (one vocabulary, no copy)', () => {
		expect(render_src).toContain(
			"import {CHANNELS, section, fact_row, check_row, verdict, release_facts, channel_label} from '../../update_code/js/render_update_status.js'",
		);
		for (const helper of [
			'section',
			'fact_row',
			'check_row',
			'verdict',
			'release_facts',
			'channel_label',
		]) {
			expect(status_src).toContain(`export const ${helper} = function(`);
			expect(render_src).not.toContain(`const ${helper} = function(`);
		}
		expect(status_src).toContain("export const CHANNELS = ['master', 'dev']");
	});

	test('check-id-derived label keys were NOT renamed with the split', () => {
		// check_row resolves `update_code_check_<id>` / `update_code_note_<id>` at
		// RUNTIME, and code_server.checks rides through it: renaming one of those
		// keys to serve_code_* silently dropped its note (release_ref_current, caught
		// in review 2026-09-28). Every code-server check id keeps its update_code_ key.
		const status_ts = readFileSync(
			join(import.meta.dir, '../../src/core/update/status.ts'),
			'utf8',
		);
		const ids = [...status_ts.matchAll(/check\('([a-z_]+)'/g)].map((m) => m[1] as string);
		expect(ids.length).toBeGreaterThan(10);
		for (const id of ids) {
			expect(master_labels[`serve_code_check_${id}`], id).toBeUndefined();
			expect(master_labels[`serve_code_note_${id}`], id).toBeUndefined();
		}
		expect(master_labels.update_code_note_release_ref_current).toBeDefined();
	});

	test('a non-code-server (development entity) is told which key makes it one', () => {
		expect(render_src).toContain('serve_code_not_server');
		expect(master_labels.serve_code_not_server).toContain('IS_A_CODE_SERVER');
	});

	test('the status layout is the shared mixin, not a copy', () => {
		expect(css_src).toContain('.dd_update_status();');
		expect(css_src).toContain('button.build_button');
	});

	test('the build styles are scoped to the serve_code wrapper, and update_code has none left', () => {
		// build_form stamps `.light` on every submit button; the build button's own
		// weight must come from THIS widget's scope (serve_code.less), and a copy
		// left in update_code.less would style nothing and drift.
		const scope = css_src.slice(css_src.indexOf('.wrapper_widget.serve_code {'));
		expect(scope).toContain('.build_row {');
		expect(scope).toContain('button.build_button {');
		const update_css = readFileSync(join(WIDGETS, 'update_code/css/update_code.less'), 'utf8');
		expect(update_css).not.toContain('build_row');
		expect(update_css).not.toContain('build_button');
		// …and the compiled bundle carries the rule under the new wrapper
		const main_css = readFileSync(
			join(import.meta.dir, '../../client/dedalo/core/page/css/main.css'),
			'utf8',
		);
		expect(main_css).toMatch(/\.wrapper_widget\.serve_code > ?\.content_data \.build_row/);
	});

	test('no dead cross-widget event: nothing publishes what nobody subscribes to', () => {
		// 'build_code_done' was published for update_data_version, which never
		// subscribed to it. A build changes nothing THIS install runs.
		expect(render_src).not.toContain("publish('build_code_done'");
		expect(render_src).not.toContain('import {event_manager}');
	});
});

describe('serve_code developer-builds', () => {
	test("the developer channel builds THE SERVER'S branch, never a literal ref", () => {
		// A client-baked 'v7' refused on every code server that does not carry
		// that branch ("Could not read src/core/update/version.ts at ref 'v7'").
		// The ref is source.branch; when it IS the release ref there is nothing
		// unreleased to publish and the row says so instead of offering a button.
		// no branch LITERAL other than the release ref's own channel
		expect(/branch\s*:\s*['"](?!master['"])/.test(render_src)).toBe(false);
		expect(render_src).toContain('const dev_branch');
		expect(/branch\s*:\s*dev_branch/.test(render_src)).toBe(true);
		expect(render_src).toContain('source.release_ref');
		expect(render_src).toContain('serve_code_build_developer_unavailable');
		// the branch is a NAMED placeholder: its position differs per language
		expect(render_src).toContain("replaceAll('%branch%'");
		expect(master_labels.serve_code_build_developer_confirm).toContain('%branch%');
	});

	test('every translation of the confirm keeps ONE %branch% and TWO %s', () => {
		// The client substitutes %branch% by NAME and then the two %s POSITIONALLY
		// (version, then path). A translator dropping %branch% ships a sentence
		// naming no branch; a third %s puts the path where the version belongs —
		// both silent, and both invisible to the labels tripwire (it checks key
		// sets, never placeholders).
		const key = 'serve_code_build_developer_confirm';
		const catalog_dir = join(import.meta.dir, '../../src/core/labels/catalog');
		const sentences: Array<[string, string]> = [['master', master_labels[key] as string]];
		for (const file of readdirSync(catalog_dir).filter((name) => name.endsWith('.json'))) {
			const labels = JSON.parse(readFileSync(join(catalog_dir, file), 'utf8')) as Record<
				string,
				string
			>;
			// lg-eng carries no copy of master.json (the tripwire refuses duplicates)
			if (typeof labels[key] === 'string') sentences.push([file, labels[key]]);
		}
		expect(sentences.length).toBeGreaterThan(10);
		for (const [where, sentence] of sentences) {
			expect(`${where}: ${sentence.split('%branch%').length - 1}`).toBe(`${where}: 1`);
			expect(`${where}: ${sentence.split('%s').length - 1}`).toBe(`${where}: 2`);
		}
	});

	test('each build action is ONE entry with the archive it produces', () => {
		// The buttons and the archives were two blocks, and nothing said the first
		// writes the second. The readout now lays out a row per channel and calls
		// back to mount the action into it.
		expect(render_src).toContain('make_builder_mounter');
		// rendered through render_code_server_half, so a build can re-run it
		expect(
			/render_code_server_status\(\s*content_data_body,\s*code_server,\s*make_builder_mounter/.test(
				render_src,
			),
		).toBe(true);
		expect(render_src).toContain('render_code_server_half(value.code_server)');
		// the mounter also receives the ARTIFACT CELL and the facts it currently
		// shows: the in-flight state belongs on the row being rewritten, and the
		// before-value has to be captured before the refresh destroys this half.
		expect(render_src).toContain('mount_builder(channel, action, value, built || null)');
		expect(render_src).toContain('build_row');
		expect(render_src).toContain('serve_code_build_publish');
		// an unbuilt channel still shows its row, saying so
		expect(status_src).toContain('update_code_not_built');
		// and archives of other versions are listed, never dropped
		expect(render_src).toContain('serve_code_other_archives');
		// ONE writer for the archive facts, called from BOTH lists (the duplicate
		// is how the stale 'developer (not offered)' wording survived in one)
		expect(status_src).toContain('const release_facts = function(');
		expect((render_src.match(/release_facts\(/g) ?? []).length).toBe(2);
	});

	test('the build actions read as BUTTONS, weighted by channel', () => {
		// In the readout's label column a pale outline reads as a caption; the one
		// thing on the row that DOES something must not be the quietest mark on it.
		expect(render_src).toContain("button_class\t: 'primary'");
		expect(render_src).toContain("classList.add('build_button', def.button_class)");
		expect(css_src).toContain('button.build_button');
	});

	test('a finished build REFRESHES the archive list beside the button', () => {
		// The row next to the button is a claim about the disk that the build just
		// changed: stale, it shows the old timestamp — or 'Not built yet' next to a
		// build that succeeded.
		expect(render_src).toContain('on_built');
		expect(render_src).toContain('refresh_code_server');
		// re-read from the SERVER, not from the value this render closed over
		expect(
			/refresh_code_server\s*=\s*async\s*\(build_mark\)\s*=>\s*\{[\s\S]{0,200}await self\.get_value\(\)/.test(
				render_src,
			),
		).toBe(true);
		// and the half is re-rendered from that fresh value, carrying the mark:
		// the whole half is replaced, so without it the new archive line appears
		// where the old one was with nothing saying which one is on screen.
		expect(render_src).toContain('render_code_server_half(fresh.code_server, build_mark)');
		// a failed refresh must not take the panel down
		expect(
			/catch \(error\) \{[\s\S]{0,240}console\.error\('serve_code: could not refresh/.test(
				render_src,
			),
		).toBe(true);
	});
});

describe('serve_code build feedback', () => {
	test('the in-flight state is armed by the REQUEST, never by the click', () => {
		// build_form runs window.confirm synchronously and only then adds
		// `button_spinner`, before its first await — so a listener registered
		// after it sees the spinner iff the operator confirmed. Marking on click
		// would leave a declined confirm showing "building…" forever.
		expect(render_src).toContain("form.addEventListener('submit'");
		expect(render_src).toContain("classList.contains('button_spinner')");
		expect(render_src).toContain("artifact_cell.classList.add('building')");
		expect(render_src).toContain('serve_code_build_building');
		// the marker goes on the ARTIFACT cell, not on the button: the button
		// already reports the request; only the row can report that ITS file is
		// the one being rewritten.
		expect(render_src).toContain('function(channel, node, artifact_cell, built_before)');
	});

	test('the before-value is captured at mount and survives the refresh', () => {
		// the refresh destroys this half, so nothing could read it back off the
		// DOM afterwards — it has to be closed over when the row is built.
		expect(render_src).toContain('built_before');
		expect(/previous\s*:\s*built_before/.test(render_src)).toBe(true);
		expect(render_src).toContain('channel\t\t: channel');
		// …and reaches the renderer as the mark for that channel only
		expect(render_src).toContain('build_mark && build_mark.channel===channel');
		expect(
			/render_code_server_status = function\(parent, code_server, mount_builder, build_mark\)/.test(
				render_src,
			),
		).toBe(true);
	});

	test('the verdict is read off the STAMP, not asserted', () => {
		// "updated" must be a statement about the disk that the disk supports: a
		// build that wrote nothing leaves the stamp where it was, and the row
		// says THAT instead of claiming a change.
		expect(status_src).toContain('previous.stamp!==release.stamp');
		expect(status_src).toContain('update_code_build_updated');
		expect(status_src).toContain('update_code_build_unchanged');
		// the archive that did not exist before is an update, not "unchanged"
		expect(status_src).toContain('previous===null || previous.stamp!==release.stamp');
	});

	test('the before-value shows only what MOVED', () => {
		// Repeating the unchanged facts ("173 MB · 28/08/2026, 11:41:43" above,
		// "was 173 MB · 28/08/2026, 11:41:12" below) buries the one figure the
		// operator is reading for in three that did not change.
		expect(status_src).toContain('previous.bytes!==release.bytes');
		expect(status_src).toContain('same_day(previous.stamp, release.stamp)');
		expect(status_src).toContain('format_time');
		// and an UNCHANGED build renders no before-line at all: it would be
		// identical to the value above it, and the badge already says so.
		expect(/if \(!wrote\) \{\s*return null/.test(status_src)).toBe(true);
		expect(status_src).toContain('if (previous_text!==null)');
	});

	test('the value it replaced is spelled out, and every label is defined', () => {
		expect(status_src).toContain('build_file_previous');
		expect(status_src).toContain('update_code_build_previous');
		for (const key of [
			'serve_code_build_building',
			'update_code_build_previous',
			'update_code_build_unchanged',
			'update_code_build_updated',
		]) {
			expect(master_labels[key], `${key} is defined in master.json`).toBeDefined();
		}
		// one substitution slot: the size · date the row showed before
		expect(((master_labels.update_code_build_previous ?? '').match(/%s/g) ?? []).length).toBe(1);
		// and the states have somewhere to render
		expect(css_src).toContain('&.building');
		expect(css_src).toContain('.build_file_previous');
		expect(css_src).toContain('&.built_updated');
	});
});
