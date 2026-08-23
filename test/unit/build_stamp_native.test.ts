/**
 * Build provenance gate (core/update/build_stamp.ts) — the parser contract
 * (placeholder/malformed → dev posture, never a throw) plus the tripwire that
 * the COMMITTED build_info.txt still holds the literal `$Format:` placeholder:
 * someone committing an expanded value would stamp every dev checkout as a
 * release and drop the '.dev' tag installation-wide.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	DEDALO_BUILD,
	DEDALO_ENGINE_VERSION,
	DEDALO_PRERELEASE_TAG,
	parseBuildInfo,
} from '../../src/core/update/build_stamp.ts';
import { DEDALO_VERSION } from '../../src/core/update/version.ts';

const BUILD_INFO_PATH = join(
	import.meta.dir,
	'..',
	'..',
	'src',
	'core',
	'update',
	'build_info.txt',
);

describe('parseBuildInfo', () => {
	test('the unexpanded placeholder means a dev tree', () => {
		expect(parseBuildInfo('$Format:%H %cI$')).toEqual({ sha: null, build: null });
		expect(parseBuildInfo('$Format:%H %cI$\n')).toEqual({ sha: null, build: null });
	});

	test('an expanded stamp parses to sha + commit date', () => {
		const sha = 'a334a7b6e05f0c1d2e3f4a5b6c7d8e9f00112233';
		const info = parseBuildInfo(`${sha} 2026-08-23T10:15:00+02:00\n`);
		expect(info).toEqual({ sha, build: '2026-08-23T10:15:00+02:00' });
	});

	test('malformed content degrades to dev values, never a throw', () => {
		for (const bad of [
			'',
			'\n',
			'garbage',
			'not-a-sha 2026-08-23T10:15:00+02:00',
			'a334a7b6', // sha with no date
			'a334a7b6e0 not-a-date',
		]) {
			expect(parseBuildInfo(bad)).toEqual({ sha: null, build: null });
		}
	});
});

describe('module-level constants (this suite runs on a dev checkout)', () => {
	test('the engine version composes version + tag; tag matches the build signal', () => {
		expect(DEDALO_ENGINE_VERSION).toBe(`${DEDALO_VERSION}${DEDALO_PRERELEASE_TAG}`);
		expect(DEDALO_PRERELEASE_TAG).toBe(DEDALO_BUILD === null ? '.dev' : '');
	});
});

describe('TRIPWIRE — the committed build_info.txt keeps the literal placeholder', () => {
	test('build_info.txt is the unexpanded `$Format:%H %cI$` (expansion belongs to git archive only)', () => {
		const content = readFileSync(BUILD_INFO_PATH, 'utf8');
		expect(content.trim()).toBe('$Format:%H %cI$');
	});
});
