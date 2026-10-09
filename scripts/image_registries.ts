/**
 * image_registries.ts — render the HOST and DOCS copies of the official image
 * registry list (engineering/image_registries.json) from the list itself.
 *
 *   bun run registries:gen                    write every target
 *   bun run registries:gen -- --target shell  deploy/image_registries.sh only
 *   bun run registries:check                  render, compare with disk, exit 1 on drift
 *
 * WHY GENERATED COPIES. The Docker host runs bash, not Bun: install.sh and the
 * image updater must know which registries are official without parsing JSON
 * on a machine that may have no jq. A hand-kept bash list beside the JSON would
 * be the second source of truth this repo forbids, so the bash file is RENDERED
 * from the list and gated byte-for-byte (test/unit/image_registries_tripwire.test.ts).
 * The same holds for the operator manual's table (docs/install/docker.md,
 * between the REGISTRY_DOCS markers).
 *
 * The docs region is optional until the page carries its markers: in write
 * mode a page without them is reported as pending and left alone; in --check
 * mode only a page that HAS the markers is compared.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	type ImageRegistry,
	type ImageRegistryList,
	loadImageRegistries,
	provisionedRegistries,
} from '../src/core/update/image_registries.ts';

const ROOT = join(import.meta.dir, '..');

/** The generated host file (sourced by install.sh and the image updater). */
export const REGISTRY_SHELL_PATH = 'deploy/image_registries.sh';
/** The page holding the generated registry table. */
export const REGISTRY_DOCS_PATH = 'docs/install/docker.md';

export const REGISTRY_DOCS_BEGIN =
	'<!-- BEGIN GENERATED — engineering/image_registries.json · regenerate: bun run registries:gen -->';
export const REGISTRY_DOCS_END = '<!-- END GENERATED -->';

/** A bash single-quoted word: the only character to escape is the quote itself. */
export function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

/** One line of prose, safe inside a comment or a table cell. */
function oneLine(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function shellArray(name: string, values: readonly string[]): string {
	return `${name}=(${values.map(shellQuote).join(' ')})`;
}

/**
 * The bash 3.2 file: GENERATED header, the unprovisioned entries as comments
 * (never as values — they name no address), then four parallel arrays of the
 * PROVISIONED entries, primary first, and the signing identity.
 */
export function renderShellFile(list: ImageRegistryList): string {
	const offered = provisionedRegistries(list);
	const absent = list.registries.filter((entry) => !entry.provisioned);
	return [
		'# GENERATED — engineering/image_registries.json · regenerate: bun run registries:gen',
		'# Do not edit: test/unit/image_registries_tripwire.test.ts compares this file with the render.',
		'#',
		'# The OFFICIAL registries Dédalo publishes its signed image to, PROVISIONED ones only,',
		'# primary first, then the mirrors. Four parallel bash 3.2 arrays (index i describes one',
		'# registry). Iterate by index up to the array length: expanding a whole EMPTY array',
		'# is an error under `set -u` in bash 3.2.',
		'# Sourced by install.sh, deploy/dedalo-image-update.sh and the host image updater.',
		'#',
		'# Not provisioned yet (never offered, no address):',
		...(absent.length === 0
			? ['#   (none)']
			: absent.map((entry) => `#   ${entry.id} — ${oneLine(entry.reason ?? '')}`)),
		'# shellcheck shell=bash disable=SC2034',
		shellArray(
			'DEDALO_REGISTRY_IDS',
			offered.map((entry) => entry.id),
		),
		shellArray(
			'DEDALO_REGISTRY_LABELS',
			offered.map((entry) => entry.label),
		),
		shellArray(
			'DEDALO_REGISTRY_ROLES',
			offered.map((entry) => entry.role),
		),
		shellArray(
			'DEDALO_REGISTRY_REPOSITORIES',
			offered.map((entry) => entry.repository as string),
		),
		`DEDALO_IMAGE_SIGNING_ISSUER=${shellQuote(list.signing.issuer)}`,
		`DEDALO_IMAGE_SIGNING_IDENTITY_REGEXP=${shellQuote(list.signing.identity_regexp)}`,
		'',
	].join('\n');
}

function tableCell(value: string): string {
	return oneLine(value).replaceAll('|', '\\|');
}

function docsRow(entry: ImageRegistry): string {
	const repository = entry.repository === null ? '—' : `\`${entry.repository}\``;
	const status = entry.provisioned
		? 'available'
		: `not yet available — ${tableCell(entry.reason ?? '')}`;
	return `| ${tableCell(entry.label)} | ${repository} | ${entry.role} | ${status} |`;
}

/** The manual's table, every entry in list order (unprovisioned ones say why). */
export function renderDocsTable(list: ImageRegistryList): string {
	return [
		'| Registry | Repository | Role | Status |',
		'|---|---|---|---|',
		...list.registries.map(docsRow),
	].join('\n');
}

/** `page` with the region between the markers replaced by `table`; throws without both markers. */
export function spliceRegistryDocs(page: string, table: string): string {
	const begin = page.indexOf(REGISTRY_DOCS_BEGIN);
	const end = begin === -1 ? -1 : page.indexOf(REGISTRY_DOCS_END, begin);
	if (begin === -1 || end === -1)
		throw new Error(
			`the page has no registry region (${REGISTRY_DOCS_BEGIN} … ${REGISTRY_DOCS_END})`,
		);
	const head = page.slice(0, begin + REGISTRY_DOCS_BEGIN.length);
	return `${head}\n${table}\n${page.slice(end)}`;
}

/** Whether a page carries both markers, in order. */
export function hasRegistryDocsRegion(page: string): boolean {
	const begin = page.indexOf(REGISTRY_DOCS_BEGIN);
	return begin !== -1 && page.indexOf(REGISTRY_DOCS_END, begin) !== -1;
}

type Target = 'shell' | 'docs';

/** One target's on-disk path and freshly rendered bytes; null when the target is pending. */
function renderTarget(
	target: Target,
	list: ImageRegistryList,
): { rel: string; next: string } | null {
	if (target === 'shell') return { rel: REGISTRY_SHELL_PATH, next: renderShellFile(list) };
	const page = readFileSync(join(ROOT, REGISTRY_DOCS_PATH), 'utf8');
	if (!hasRegistryDocsRegion(page)) return null;
	return { rel: REGISTRY_DOCS_PATH, next: spliceRegistryDocs(page, renderDocsTable(list)) };
}

/** Write or check one target; returns false on a --check drift. */
function applyTarget(target: Target, list: ImageRegistryList, check: boolean): boolean {
	const rendered = renderTarget(target, list);
	if (rendered === null) {
		console.log(`  pending    ${REGISTRY_DOCS_PATH} (no registry markers yet — nothing to render)`);
		return true;
	}
	const full = join(ROOT, rendered.rel);
	const current = existsSync(full) ? readFileSync(full, 'utf8') : '';
	if (current === rendered.next) {
		console.log(`  unchanged  ${rendered.rel}`);
		return true;
	}
	return check ? reportDrift(rendered.rel) : writeTarget(full, rendered);
}

function reportDrift(rel: string): false {
	console.error(`  DRIFT  ${rel}\nRun: bun run registries:gen`);
	return false;
}

function writeTarget(full: string, rendered: { rel: string; next: string }): true {
	writeFileSync(full, rendered.next);
	console.log(`  written    ${rendered.rel}`);
	return true;
}

function targetsOf(argv: readonly string[]): Target[] {
	const at = argv.indexOf('--target');
	const value = at === -1 ? 'all' : argv[at + 1];
	if (value === 'shell' || value === 'docs') return [value];
	if (value === 'all') return ['shell', 'docs'];
	throw new Error(`--target must be shell, docs or all (got ${String(value)})`);
}

export function main(argv: readonly string[]): number {
	const check = argv.includes('--check');
	const list = loadImageRegistries();
	const results = targetsOf(argv).map((target) => applyTarget(target, list, check));
	return results.every(Boolean) ? 0 : 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
