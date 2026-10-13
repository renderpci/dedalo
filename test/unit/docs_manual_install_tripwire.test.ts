/**
 * DOCS: THE HAND INSTALL CANNOT DISAGREE WITH THE INSTALLER (2026-10-12).
 *
 * `docs/install/manual_install.md` ("Install by hand") is the human version of
 * the Production route's Review screen: one section per host step, in run
 * order, with the commands that step runs and — what the Review shows only as
 * a path and a digest — every file it writes, in full. Its value is that it
 * says exactly what the installer does; the day a host step is added or a
 * render changes and the page does not follow, it becomes a second, wrong
 * install procedure that real operators type into real servers. So:
 *
 *  1. EVERY HOST STEP HAS ITS HAND SECTION, AND BOTH PAGES POINT AT EACH OTHER.
 *     The ids come from `PRODUCTION_HOST_STEP_IDS` (the installer's own run
 *     order — never a list here): each has exactly ONE `{#manual-<id>}` heading
 *     in the manual, that section links its `### \`<id>\`` section of
 *     `docs/install/production.md` by the slug that heading renders to, and
 *     that production section links back to `manual_install.md#manual-<id>`.
 *     The manual's step sections are in the run order, and no section names a
 *     step that no longer exists.
 *  2. EVERY FILE THE PAGE PRINTS IS THE RENDER. The drop-ins, the nginx and
 *     Apache sites (stage 1 and full), the media map include, and the lines the
 *     sites carry with the media gate OFF are produced HERE
 *     by the installer's own renderers (systemd/render.ts, web/nginx.ts,
 *     web/apache.ts) — and nginx's host-wide catch-all site (web/catch_all.ts) — over the page's `@@NAME@@` placeholders and must appear in
 *     the page byte for byte; the template and root-run-script lists, the
 *     per-OS package lists and binary directories equal the code's tables; the
 *     host-registry block carries exactly the registry entry's keys.
 *  3. Every `manual_install.md#…` link in production.md resolves to an anchor
 *     the manual defines (explicit `{#id}` or a heading slug).
 *
 *  4. THE PAGE'S OWN `render` GIVES THE INSTALLER'S BYTES FOR A REAL NAME
 *     (campaign 3 review, 2026-10-13). The `@@…@@` comparison above cannot see a
 *     value transform: the Apache name guard matches `Host` against the name AS
 *     A REGULAR EXPRESSION, escaped by the installer (`dedalo\.example\.org`),
 *     while a plain `@@SERVER_NAME@@` substitution would leave the dots
 *     unescaped (any character). So the page prints the guard with its own
 *     placeholder `@@SERVER_NAME_RE@@`, and this leg runs the page's `render`
 *     function (bash) over its Apache sites with a DOTTED name: the result must
 *     equal the installer's render for that name.
 *
 * Proven red in-file: a fake step id, a removed section, a production section
 * without its link, and a drifted render each make the checker report.
 *
 * DB-FREE, pure renders over two fixed files (the hermetic tier runs it).
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { instancePaths } from '../../src/core/install/host/layout.ts';
import { OS_ROWS } from '../../src/core/install/host/os_support.ts';
import type { InstanceEntry } from '../../src/core/install/host/registry.ts';
import {
	instanceDropins,
	ROOT_RUN_SCRIPTS,
	UNIT_TEMPLATES,
} from '../../src/core/install/host/systemd/render.ts';
import { renderApacheSite } from '../../src/core/install/host/web/apache.ts';
import { renderNginxCatchAll } from '../../src/core/install/host/web/catch_all.ts';
import {
	mapInclude,
	productionMediaRules,
	renderNginxSite,
} from '../../src/core/install/host/web/nginx.ts';
import type { SiteInput } from '../../src/core/install/host/web/site.ts';
import {
	type InstallAnswers,
	PRODUCTION_HOST_STEP_IDS,
} from '../../src/core/install/install_plan.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const MANUAL = readFileSync(join(REPO_ROOT, 'docs/install/manual_install.md'), 'utf8');
const PRODUCTION = readFileSync(join(REPO_ROOT, 'docs/install/production.md'), 'utf8');

// ── 1. step sections and cross-links ─────────────────────────────────────────

/** Python-Markdown's default toc slug (mkdocs.yml configures none): what a heading's anchor is. */
function slugOf(heading: string): string {
	// NFKD, then ASCII only (Python's `.encode('ascii', 'ignore')`).
	const text = [...heading.replace(/`/g, '').normalize('NFKD')]
		.filter((char) => char.charCodeAt(0) < 128)
		.join('');
	return text
		.replace(/[^\w\s-]/g, '')
		.trim()
		.toLowerCase()
		.replace(/[-\s]+/g, '-');
}

interface Section {
	heading: string;
	anchor: string;
	body: string;
}

/** The sections of `level` (`##`, `###`) — each up to the next heading of that level or higher. */
function sectionsOf(text: string, level: number): Section[] {
	const lines = text.split('\n');
	const sections: Section[] = [];
	let fenced = false;
	let current: { heading: string; lines: string[] } | null = null;
	const close = () => {
		if (current === null) return;
		const explicit = /\s*\{#([^}\s]+)\}\s*$/.exec(current.heading);
		const heading = current.heading.replace(/\s*\{#[^}]*\}\s*$/, '');
		sections.push({
			heading,
			anchor: explicit?.[1] ?? slugOf(heading),
			body: current.lines.join('\n'),
		});
		current = null;
	};
	for (const line of lines) {
		if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
		const match = fenced ? null : /^(#{1,6}) (.*)$/.exec(line);
		if (match !== null && (match[1] as string).length <= level) {
			close();
			if ((match[1] as string).length === level)
				current = { heading: match[2] as string, lines: [] };
			continue;
		}
		current?.lines.push(line);
	}
	close();
	return sections;
}

/** Every anchor a page defines (explicit ids and heading slugs, every level). */
function anchorsOf(text: string): Set<string> {
	const levels = [1, 2, 3, 4, 5, 6];
	return new Set(
		levels.flatMap((level) => sectionsOf(text, level).map((section) => section.anchor)),
	);
}

/** The production section of a step: `### \`<id>\` — …`. */
function productionSection(production: string, id: string): Section[] {
	return sectionsOf(production, 3).filter((section) => section.heading.startsWith(`\`${id}\``));
}

/** Every problem of the step cross-links (empty = green). */
function stepProblems(ids: readonly string[], manual: string, production: string): string[] {
	const problems: string[] = [];
	const manualSteps = sectionsOf(manual, 2).filter((section) =>
		section.anchor.startsWith('manual-'),
	);
	for (const id of ids) {
		const mine = manualSteps.filter((section) => section.anchor === `manual-${id}`);
		const theirs = productionSection(production, id);
		if (mine.length !== 1) {
			problems.push(`manual_install.md has ${mine.length} sections {#manual-${id}} (exactly 1)`);
			continue;
		}
		if (theirs.length !== 1) {
			problems.push(`production.md has ${theirs.length} sections \`${id}\` (exactly 1)`);
			continue;
		}
		const target = `production.md#${(theirs[0] as Section).anchor}`;
		if (!(mine[0] as Section).body.includes(`(${target})`))
			problems.push(`manual_install.md#manual-${id} does not link ${target}`);
		if (!(theirs[0] as Section).body.includes(`(manual_install.md#manual-${id})`))
			problems.push(`production.md \`${id}\` does not link manual_install.md#manual-${id}`);
	}
	const order = manualSteps.map((section) => section.anchor.slice('manual-'.length));
	for (const extra of order.filter((id) => !ids.includes(id)))
		problems.push(`manual_install.md#manual-${extra} names no production host step`);
	const known = order.filter((id) => ids.includes(id));
	if (known.join(' ') !== ids.filter((id) => known.includes(id)).join(' '))
		problems.push(`manual_install.md's step sections are not in run order: ${known.join(', ')}`);
	return problems;
}

/** `manual_install.md#x` links in `production` that the manual does not define. */
function deadAnchors(manual: string, production: string): string[] {
	const anchors = anchorsOf(manual);
	return [...production.matchAll(/\(manual_install\.md#([^)\s]+)\)/g)]
		.map((match) => match[1] as string)
		.filter((anchor) => !anchors.has(anchor));
}

// ── 2. the files the page prints ─────────────────────────────────────────────

/** The answers a render needs, as the page's placeholders (the page's defaults: ports, media root). */
function placeholderAnswers(overrides: Partial<InstallAnswers> = {}): InstallAnswers {
	return {
		instance: '@@INSTANCE@@',
		install_dir: '@@DIR@@',
		service_user: '@@USER@@',
		service_group: '@@GROUP@@',
		media_path: '/srv/dedalo/@@INSTANCE@@/dedalo/media',
		unix_socket: '/run/dedalo-@@INSTANCE@@/dedalo_ts.sock',
		backup_dir: '@@BACKUP_DIR@@',
		backup_site_builder: false,
		server_name: '@@SERVER_NAME@@',
		http_port: '80',
		https_port: '443',
		media_access_mode: 'publication',
		tls_mode: 'letsencrypt',
		...overrides,
	} as InstallAnswers;
}

/** THE stamp the page's files carry (the installer's stamp shape: `# dedalo-install <i> `). */
const MANUAL_STAMP = '# dedalo-install @@INSTANCE@@ manual';

/** Every file the page prints, rendered by the installer's own code: name → text (no final newline). */
function renderedBlocks(): Map<string, string> {
	const answers = placeholderAnswers();
	const paths = instancePaths(answers, '@@PIN@@', '@@GROUP@@');
	// The page's @@PG_BIN@@ stands for the row's PostgreSQL 18 binary directory.
	const row = { ...(OS_ROWS[0] as (typeof OS_ROWS)[number]), pgBinDir: '@@PG_BIN@@' };
	const blocks = new Map<string, string>();
	for (const dropin of instanceDropins(paths, row, answers, MANUAL_STAMP)) {
		const unit = /system\/([a-z-]+)@/.exec(dropin.path)?.[1] ?? dropin.path;
		blocks.set(`drop-in ${unit}`, dropin.content);
	}
	const cert = {
		fullchain: '/etc/letsencrypt/live/dedalo-@@INSTANCE@@/fullchain.pem',
		key: '/etc/letsencrypt/live/dedalo-@@INSTANCE@@/privkey.pem',
	};
	const site = (stage: SiteInput['cert']): SiteInput => ({
		paths,
		answers,
		stamp: MANUAL_STAMP,
		cert: stage,
		acme: true,
		logDir: '@@LOG_DIR@@',
		mediaRules: productionMediaRules('@@INSTANCE@@'),
	});
	blocks.set('nginx stage 1', renderNginxSite(site(null)));
	blocks.set('nginx full site', renderNginxSite(site(cert)));
	blocks.set('Apache stage 1', apachePageForm(renderApacheSite(site(null))));
	blocks.set('Apache full site', apachePageForm(renderApacheSite(site(cert))));
	blocks.set('nginx media map include', mapInclude('@@INSTANCE@@'));
	// nginx's host-wide catch-all (campaign 3 C3-30).
	blocks.set('nginx catch-all', renderNginxCatchAll());
	// The media gate OFF: the page prints only the lines that replace the gate's.
	const off = { ...site(cert), answers: placeholderAnswers({ media_access_mode: 'false' }) };
	blocks.set(
		'nginx media gate off',
		replacedLines(renderNginxSite(site(cert)), renderNginxSite(off as SiteInput)),
	);
	blocks.set(
		'Apache media gate off',
		replacedLines(renderApacheSite(site(cert)), renderApacheSite(off as SiteInput)),
	);
	return new Map([...blocks].map(([name, text]) => [name, text.replace(/\n$/, '')]));
}

/** The installer's Apache site over the placeholders, for a real `name` (leg 4). */
function renderApacheSiteFor(stage: 'cert' | null, name: string): string {
	const answers = placeholderAnswers({ server_name: name });
	const paths = instancePaths(answers, '@@PIN@@', '@@GROUP@@');
	return renderApacheSite({
		paths,
		answers,
		stamp: MANUAL_STAMP,
		cert:
			stage === null
				? null
				: {
						fullchain: '/etc/letsencrypt/live/dedalo-@@INSTANCE@@/fullchain.pem',
						key: '/etc/letsencrypt/live/dedalo-@@INSTANCE@@/privkey.pem',
					},
		acme: true,
		logDir: '@@LOG_DIR@@',
		mediaRules: productionMediaRules('@@INSTANCE@@'),
	});
}

/** What `variant` puts in place of `base`'s differing run: the lines between their common head and tail. */
function replacedLines(base: string, variant: string): string {
	const a = base.split('\n');
	const b = variant.split('\n');
	let head = 0;
	while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
	let tail = 0;
	while (
		tail < a.length - head &&
		tail < b.length - head &&
		a[a.length - 1 - tail] === b[b.length - 1 - tail]
	)
		tail += 1;
	return b.slice(head, b.length - tail).join('\n');
}

/** The page form of an Apache render over the placeholders: the name guard carries `@@SERVER_NAME_RE@@` (leg 4 proves it). */
function apachePageForm(text: string): string {
	return text.replaceAll(
		'RewriteCond %{HTTP_HOST} !^@@SERVER_NAME@@(',
		'RewriteCond %{HTTP_HOST} !^@@SERVER_NAME_RE@@(',
	);
}

/** The page's own `render` shell function, as printed. */
function pageRenderFunction(manual: string): string | null {
	return /^render\(\) \{\n[\s\S]*?\n\}$/m.exec(manual)?.[0] ?? null;
}

/**
 * Run the page's `render` over `text` with every variable set to its OWN
 * placeholder (identity) except NAME, the dotted name.
 */
function pageRender(manual: string, text: string, name: string): string {
	const identity: Record<string, string> = {
		I: '@@INSTANCE@@',
		U: '@@USER@@',
		G: '@@GROUP@@',
		DIR: '@@DIR@@',
		BACKUP_DIR: '@@BACKUP_DIR@@',
		PIN: '@@PIN@@',
		PGBIN: '@@PG_BIN@@',
		PGSVC: '@@PG_SERVICE@@',
		WEBLOG: '@@LOG_DIR@@',
		SELINUX_MODULE: '@@SELINUX_MODULE@@',
		NAME: name,
	};
	const script = `${pageRenderFunction(manual) ?? 'render() { exit 3; }'}\nrender`;
	const run = Bun.spawnSync(['bash', '-c', script], {
		stdin: new TextEncoder().encode(text),
		env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...identity },
	});
	return run.stdout.toString();
}

/** The blocks of `blocks` the page does not print verbatim. */
function missingBlocks(manual: string, blocks: Map<string, string>): string[] {
	return [...blocks].filter(([, text]) => !manual.includes(text)).map(([name]) => name);
}

/** The literal lines the page must carry for the code's tables. */
function tableLines(): Map<string, string> {
	const lines = new Map<string, string>([
		['the unit templates', `for unit in ${UNIT_TEMPLATES.join(' ')}; do`],
		['the root-run scripts', `for script in ${ROOT_RUN_SCRIPTS.join(' ')}; do`],
	]);
	for (const row of OS_ROWS) {
		lines.set(`${row.id} base packages`, `  ${row.packages.base.join(' ')} \\`);
		lines.set(
			`${row.id} PostgreSQL`,
			`PGBIN=${row.pgBinDir} PGSVC=${row.pgService} CERTBOT_TIMER=${row.certbotTimer}`,
		);
		if (row.packages.selinuxTools.length > 0)
			lines.set(`${row.id} SELinux tools`, `  ${row.packages.selinuxTools.join(' ')} \\`);
		if (row.packages.optional.length > 0)
			lines.set(`${row.id} optional`, `dnf install -y ${row.packages.optional.join(' ')}`);
		for (const web of Object.values(row.web)) {
			lines.set(`${row.id} ${web.service} site`, `SITE=${web.sitePath.replace('<i>', '$I')}`);
			lines.set(`${row.id} ${web.service} user`, `WEBUSER=${web.user}`);
			lines.set(`${row.id} ${web.service} logs`, `WEBLOG=${web.logDir}`);
		}
	}
	return lines;
}

/** The registry entry's keys, from a value TYPED as an entry (a new key fails to compile here). */
const REGISTRY_SAMPLE: InstanceEntry = {
	instance: '',
	bun_pin: null,
	templates: false,
	selinux_module: false,
	nginx_map_owner: false,
	catch_all: false,
	media: '',
	user: '',
	group: '',
	install_dir: '',
	backup_dir: '',
};

/** The JSON block the manual writes to the host registry. */
function registryBlock(manual: string): Record<string, unknown> | null {
	const match = /instances\/\$I\.json" <<'EOF'\n([\s\S]*?)\nEOF/.exec(manual);
	if (match === null) return null;
	try {
		// A quoted placeholder is a string; a bare one (`@@SELINUX_MODULE@@`) renders a boolean.
		const text = (match[1] as string)
			.replace(/"@@[A-Z_]+@@"/g, '"x"')
			.replace(/@@[A-Z_]+@@/g, 'false');
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return null;
	}
}

// ── the gate ─────────────────────────────────────────────────────────────────

describe('manual_install.md: one section per production host step, cross-linked (1)', () => {
	test('the installer has host steps to cover (anti-vacuity)', () => {
		expect(PRODUCTION_HOST_STEP_IDS.length).toBeGreaterThanOrEqual(15);
	});

	test('every step: one {#manual-<id>} section, linked both ways, in run order', () => {
		expect(stepProblems(PRODUCTION_HOST_STEP_IDS, MANUAL, PRODUCTION)).toEqual([]);
	});

	test('every manual_install.md#… link in production.md resolves', () => {
		const links = [...PRODUCTION.matchAll(/\(manual_install\.md#/g)].length;
		expect(links).toBeGreaterThanOrEqual(PRODUCTION_HOST_STEP_IDS.length);
		expect(deadAnchors(MANUAL, PRODUCTION)).toEqual([]);
	});

	test('red: a step the manual lacks is reported', () => {
		const problems = stepProblems([...PRODUCTION_HOST_STEP_IDS, 'host_fake'], MANUAL, PRODUCTION);
		expect(problems).toContain('manual_install.md has 0 sections {#manual-host_fake} (exactly 1)');
	});

	test('red: a removed manual section is reported', () => {
		const without = MANUAL.replace(/\n## `host_watchdog`[\s\S]*?(?=\n## )/, '\n');
		expect(without).not.toBe(MANUAL);
		expect(stepProblems(PRODUCTION_HOST_STEP_IDS, without, PRODUCTION)).toContain(
			'manual_install.md has 0 sections {#manual-host_watchdog} (exactly 1)',
		);
	});

	test('red: a production section without its link is reported', () => {
		const without = PRODUCTION.replace(
			'(manual_install.md#manual-host_tls)',
			'(manual_install.md)',
		);
		expect(without).not.toBe(PRODUCTION);
		expect(stepProblems(PRODUCTION_HOST_STEP_IDS, MANUAL, without)).toContain(
			'production.md `host_tls` does not link manual_install.md#manual-host_tls',
		);
	});

	test('red: a dead anchor is reported', () => {
		expect(deadAnchors(MANUAL, '(manual_install.md#no-such-section)')).toEqual(['no-such-section']);
	});
});

describe('manual_install.md: every file it prints is the installer render (2)', () => {
	const blocks = renderedBlocks();

	test('every drop-in, site stage and the map include, byte for byte', () => {
		expect(blocks.size).toBeGreaterThanOrEqual(12);
		expect(blocks.get('nginx media gate off')?.split('\n').length).toBe(2);
		expect(blocks.get('Apache media gate off')?.split('\n').length).toBe(2);
		expect(missingBlocks(MANUAL, blocks)).toEqual([]);
	});

	test("4. the page's own render of its Apache sites, for a DOTTED name, is the installer's render", () => {
		const name = 'dedalo.example.org';
		const blocks = renderedBlocks();
		expect(pageRenderFunction(MANUAL)).not.toBeNull();
		for (const stage of ['Apache stage 1', 'Apache full site']) {
			const page = blocks.get(stage) ?? '';
			// the page prints this block (leg 2) and it carries the guard placeholder
			expect(MANUAL.includes(page), stage).toBe(true);
			expect(page).toContain('@@SERVER_NAME_RE@@');
			const site = renderApacheSiteFor(stage === 'Apache stage 1' ? null : 'cert', name);
			expect(site).toContain('dedalo\\.example\\.org');
			expect(pageRender(MANUAL, `${page}\n`, name), stage).toBe(site);
		}
		// red on the drift this leg exists for: a guard substituted with the PLAIN name
		const plain = MANUAL.replaceAll('@@SERVER_NAME_RE@@', '@@SERVER_NAME@@');
		const unescaped = (blocks.get('Apache full site') ?? '').replaceAll(
			'@@SERVER_NAME_RE@@',
			'@@SERVER_NAME@@',
		);
		expect(pageRender(plain, `${unescaped}\n`, name)).not.toBe(renderApacheSiteFor('cert', name));
	});

	test('the template, script, package and per-OS lines equal the code tables', () => {
		const lines = tableLines();
		expect(lines.size).toBeGreaterThanOrEqual(10);
		expect([...lines].filter(([, line]) => !MANUAL.includes(line)).map(([name]) => name)).toEqual(
			[],
		);
	});

	test('the host-registry block carries exactly the registry entry keys', () => {
		const block = registryBlock(MANUAL);
		expect(block).not.toBeNull();
		expect(Object.keys(block ?? {}).sort()).toEqual(Object.keys(REGISTRY_SAMPLE).sort());
	});

	test('red: a drifted render is reported', () => {
		const drifted = MANUAL.replace(
			'ExecStart=/opt/dedalo/bun/@@PIN@@/bun run src/server.ts',
			'ExecStart=bun',
		);
		expect(drifted).not.toBe(MANUAL);
		expect(missingBlocks(drifted, blocks)).toEqual(['drop-in dedalo-ts']);
	});

	test('red: a media-gate-off variation without its comment is reported', () => {
		const drifted = MANUAL.replace(
			'\t# MEDIA ACCESS CONTROL IS OFF (media_access_mode false): every media file is public.\n\tlocation',
			'\tlocation',
		);
		expect(drifted).not.toBe(MANUAL);
		expect(missingBlocks(drifted, blocks)).toEqual(['nginx media gate off']);
	});
});
