/**
 * CHANGE LOG RENDERER — the pure half of scripts/lib/change_log.ts, on synthetic input.
 *
 * The repo-level invariants (every fragment valid, the committed page byte-identical to
 * a fresh render, every new wire-contract entry told to a reader) are
 * change_log_tripwire's. This file holds the machinery those assertions stand on: that
 * a fragment is parsed strictly, that versions order as releases do, and that the page
 * is laid out the way the manual promises its reader.
 *
 * DB-free, file-free. Synthetic ledger ids use year 1999: valid to the parser, and outside
 * the `WC-20xx-…` form wire_contract_tripwire resolves as a citation of a real entry.
 */

import { describe, expect, test } from 'bun:test';
import {
	type ChangeSet,
	compareVersions,
	type Fragment,
	GENERATED_MARKER,
	parseFragment,
	parseRelease,
	renderChangeLog,
} from '../../scripts/lib/change_log.ts';

const fragmentText = (front: string, body = 'What changed, for the reader.') =>
	`---\n${front}\n---\n${body}\n`;

const VALID_FRONT = [
	'title: Logging in no longer asks for the credentials twice.',
	'type: fixed',
	'audience: user',
	'date: 2026-08-13',
].join('\n');

function fragment(overrides: Partial<Fragment>): Fragment {
	return {
		file: 'changes/unreleased/x.md',
		slug: 'x',
		title: 'A change.',
		type: 'fixed',
		audience: 'user',
		date: '2026-09-01',
		breaking: false,
		wc: [],
		body: 'Body.',
		...overrides,
	};
}

describe('parseFragment', () => {
	test('a valid fragment parses to its fields and trimmed body', () => {
		const f = parseFragment('changes/unreleased/login-once.md', fragmentText(VALID_FRONT));
		expect(f).toEqual({
			file: 'changes/unreleased/login-once.md',
			slug: 'login-once',
			title: 'Logging in no longer asks for the credentials twice.',
			type: 'fixed',
			audience: 'user',
			date: '2026-08-13',
			breaking: false,
			wc: [],
			body: 'What changed, for the reader.',
		});
	});

	test('a title may contain a colon (only the first one splits)', () => {
		const f = parseFragment(
			'changes/unreleased/a.md',
			fragmentText(VALID_FRONT.replace(/^title: .*$/m, 'title: Search: dates now filter')),
		);
		expect(f.title).toBe('Search: dates now filter');
	});

	test('breaking and wc are read (wc is a comma list, either id grammar)', () => {
		const f = parseFragment(
			'changes/unreleased/a.md',
			fragmentText(`${VALID_FRONT}\nbreaking: true\nwc: WC-1999-08-01-a, WC-016`),
		);
		expect(f.breaking).toBe(true);
		expect(f.wc).toEqual(['WC-1999-08-01-a', 'WC-016']);
	});

	const refusals: [string, string, RegExp][] = [
		['no front matter', 'just prose\n', /front matter/],
		['an unknown key', fragmentText(`${VALID_FRONT}\nseverity: high`), /unknown key 'severity'/],
		['a repeated key', fragmentText(`${VALID_FRONT}\ntype: added`), /repeated key 'type'/],
		['a missing title', fragmentText(VALID_FRONT.replace(/^title: .*\n/m, '')), /missing 'title'/],
		['an unknown type', fragmentText(VALID_FRONT.replace('type: fixed', 'type: bugfix')), /type/],
		[
			'an unknown audience',
			fragmentText(VALID_FRONT.replace('audience: user', 'audience: everyone')),
			/audience/,
		],
		['a malformed date', fragmentText(VALID_FRONT.replace('2026-08-13', '13/08/2026')), /date/],
		['a non-boolean breaking', fragmentText(`${VALID_FRONT}\nbreaking: yes`), /breaking/],
		['a malformed wc id', fragmentText(`${VALID_FRONT}\nwc: WC-16-x`), /wc/],
		['an empty body', fragmentText(VALID_FRONT, '   '), /empty body/],
		[
			'a heading in the body',
			fragmentText(VALID_FRONT, 'Intro.\n\n## Details\n\nMore.'),
			/heading/,
		],
	];
	for (const [what, text, message] of refusals) {
		test(`refuses ${what}, naming the file`, () => {
			expect(() => parseFragment('changes/unreleased/bad.md', text)).toThrow(message);
			expect(() => parseFragment('changes/unreleased/bad.md', text)).toThrow(
				/changes\/unreleased\/bad\.md/,
			);
		});
	}

	test('refuses a file name that is not a kebab-case slug', () => {
		expect(() =>
			parseFragment('changes/unreleased/Login_Once.md', fragmentText(VALID_FRONT)),
		).toThrow(/slug/);
	});

	test('a fenced code line starting with # is not a heading', () => {
		const body = 'Run:\n\n```bash\n# rebuild\nbun run changelog\n```';
		expect(parseFragment('changes/unreleased/a.md', fragmentText(VALID_FRONT, body)).body).toBe(
			body,
		);
	});
});

describe('parseRelease', () => {
	const valid = {
		version: '7.0.0-beta.4',
		date: '2026-08-24',
		from: 'v7.0.0-beta.3',
		to: 'v7.0.0-beta.4',
		commits: 321,
		wire_contract: ['WC-1999-08-10-x'],
	};

	test('a valid release.json parses', () => {
		expect(parseRelease('changes/7.0.0-beta.4/release.json', JSON.stringify(valid))).toEqual(valid);
	});

	test('from may be null (the first release has no predecessor tag)', () => {
		const r = parseRelease(
			'changes/7.0.0-beta.2/release.json',
			JSON.stringify({ ...valid, from: null }),
		);
		expect(r.from).toBeNull();
	});

	const refusals: [string, object, RegExp][] = [
		['a bad version', { ...valid, version: 'beta4' }, /version/],
		['a bad date', { ...valid, date: 'yesterday' }, /date/],
		['a negative commit count', { ...valid, commits: -1 }, /commits/],
		['a malformed wc id', { ...valid, wire_contract: ['WC-9'] }, /wire_contract/],
		['an unknown key', { ...valid, notes: 'x' }, /unknown key 'notes'/],
	];
	for (const [what, value, message] of refusals) {
		test(`refuses ${what}`, () => {
			expect(() => parseRelease('changes/x/release.json', JSON.stringify(value))).toThrow(message);
		});
	}
});

describe('compareVersions', () => {
	test('orders numerically, a prerelease before its release', () => {
		const sorted = [
			'7.0.1',
			'7.0.0',
			'7.0.0-beta.10',
			'7.0.0-beta.4',
			'7.0.0-alpha.2',
			'7.1.0',
		].sort(compareVersions);
		expect(sorted).toEqual([
			'7.0.0-alpha.2',
			'7.0.0-beta.4',
			'7.0.0-beta.10',
			'7.0.0',
			'7.0.1',
			'7.1.0',
		]);
	});
});

describe('renderChangeLog', () => {
	const set: ChangeSet = {
		unreleased: [
			fragment({
				slug: 'dev-a',
				title: 'Developer thing.',
				audience: 'developer',
				type: 'changed',
			}),
			fragment({ slug: 'user-fix', title: 'User fix.', audience: 'user', type: 'fixed' }),
			fragment({
				slug: 'user-sec',
				title: 'User security.',
				audience: 'user',
				type: 'security',
				body: 'First paragraph.\n\nSecond paragraph.\n\n!!! tip "Hint"\n    Inside.',
			}),
		],
		releases: [
			{
				release: {
					version: '7.0.0-beta.3',
					date: '2026-08-03',
					from: 'v7.0.0-beta.2',
					to: 'v7.0.0-beta.3',
					commits: 10,
					wire_contract: [],
				},
				fragments: [
					fragment({ slug: 'old', title: 'Old change.', audience: 'admin', type: 'added' }),
				],
			},
			{
				release: {
					version: '7.0.0-beta.4',
					date: '2026-08-24',
					from: 'v7.0.0-beta.3',
					to: 'v7.0.0-beta.4',
					commits: 321,
					wire_contract: ['WC-1999-08-10-x', 'WC-1999-08-11-y'],
				},
				fragments: [
					fragment({
						slug: 'break',
						title: 'A key was renamed.',
						audience: 'admin',
						type: 'changed',
						breaking: true,
					}),
				],
			},
		],
	};
	const page = renderChangeLog(set, ['WC-1999-09-01-z']);

	test('opens with the generated marker, then the h1', () => {
		expect(page.startsWith(`${GENERATED_MARKER}\n\n# Change log\n`)).toBe(true);
	});

	test('Unreleased first, then releases newest first', () => {
		const order = [...page.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
		expect(order).toEqual(['Unreleased', '7.0.0-beta.4 — 2026-08-24', '7.0.0-beta.3 — 2026-08-03']);
	});

	test('audiences user → admin → developer; types security before fixed', () => {
		const unreleased = page.slice(page.indexOf('## Unreleased'), page.indexOf('## 7.0.0-beta.4'));
		const heads = [...unreleased.matchAll(/^###+ (.+)$/gm)].map((m) => m[1]);
		expect(heads).toEqual(['For users', 'Security', 'Fixed', 'For developers', 'Changed']);
	});

	test('a fragment is a bold-title bullet with its body indented four spaces', () => {
		expect(page).toContain(
			'- **User security.**\n\n    First paragraph.\n\n    Second paragraph.\n\n    !!! tip "Hint"\n        Inside.\n',
		);
	});

	test('a breaking change is flagged at the top of its release and on the entry', () => {
		const beta4 = page.slice(page.indexOf('## 7.0.0-beta.4'), page.indexOf('## 7.0.0-beta.3'));
		expect(beta4).toMatch(
			/^!!! warning "Action needed when you update"\n\n {4}- A key was renamed\.$/m,
		);
		expect(beta4).toContain('- **A key was renamed.** *(action needed)*');
	});

	test('a release lists its wire-contract ids and its commit range', () => {
		const beta4 = page.slice(page.indexOf('## 7.0.0-beta.4'), page.indexOf('## 7.0.0-beta.3'));
		expect(beta4).toContain(
			'??? note "Wire contract — 2 entries"\n\n    - `WC-1999-08-10-x`\n    - `WC-1999-08-11-y`\n',
		);
		expect(beta4).toContain('321 commits: `git log --no-merges v7.0.0-beta.3..v7.0.0-beta.4`');
	});

	test('the unreleased section lists the wire-contract ids no release has claimed', () => {
		const unreleased = page.slice(page.indexOf('## Unreleased'), page.indexOf('## 7.0.0-beta.4'));
		expect(unreleased).toContain('??? note "Wire contract — 1 entry"\n\n    - `WC-1999-09-01-z`\n');
	});

	test("an entry's own wc ids close its body", () => {
		const out = renderChangeLog(
			{
				unreleased: [fragment({ title: 'T.', body: 'B.', wc: ['WC-047', 'WC-1999-09-01-z'] })],
				releases: [],
			},
			[],
		);
		expect(out).toContain(
			'- **T.**\n\n    B.\n\n    Wire contract: `WC-047`, `WC-1999-09-01-z`.\n',
		);
	});

	test('the first release with no predecessor names only its end tag', () => {
		const first: ChangeSet = {
			unreleased: [],
			releases: [
				{
					release: {
						version: '7.0.0-beta.2',
						date: '2026-07-18',
						from: null,
						to: 'v7.0.0-beta.2',
						commits: 5,
						wire_contract: [],
					},
					fragments: [fragment({})],
				},
			],
		};
		const out = renderChangeLog(first, []);
		expect(out).toContain('5 commits: `git log --no-merges v7.0.0-beta.2`');
		expect(out).toContain('## Unreleased\n\nNothing yet');
	});

	test('rendering is deterministic (same input, same bytes) and ends in one newline', () => {
		expect(renderChangeLog(set, ['WC-1999-09-01-z'])).toBe(page);
		expect(page.endsWith('\n')).toBe(true);
		expect(page.endsWith('\n\n')).toBe(false);
	});
});
