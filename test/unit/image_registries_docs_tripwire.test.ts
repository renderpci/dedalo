/**
 * image_registries_docs_tripwire — THE OPERATOR MANUAL NAMES THE REGISTRIES THE
 * LIST NAMES, AND THE SIGNATURE CHECK IT PRINTS IS THE ONE THE RELEASE SIGNS
 * WITH (installer unification D1, 2026-10-09).
 *
 * `engineering/image_registries.json` is the ONE list of where Dédalo publishes
 * its image. docs/install/docker.md shows it to operators as a table GENERATED
 * from that list (`bun run registries:gen`), between two markers. A hand-edited
 * table drifts the day a registry is provisioned: the manual would keep saying
 * "not yet available" for a registry install.sh already offers — or, worse,
 * print an address the list never held. So the region must equal the render,
 * byte for byte.
 *
 * The page also prints the `cosign verify` command an operator runs. Its
 * identity regexp and OIDC issuer must be the list's `signing` block verbatim:
 * a command with a stale identity verifies nothing (it fails on every genuine
 * image, and an operator learns to skip it).
 *
 * What is asserted:
 *   A. the two markers appear exactly once each, in order;
 *   B. the page equals spliceRegistryDocs(page, renderDocsTable(list)) — the
 *      region IS the render;
 *   C. anti-vacuity: the region holds one row per registry in the list (at
 *      least three), every provisioned repository appears, and no unprovisioned
 *      entry is shown with an address;
 *   D. a `cosign verify` command on the page carries the list's identity regexp
 *      and issuer exactly;
 *   E. positive controls: a stale table, a missing marker and a drifted identity
 *      are each caught by the same predicates.
 *
 * Hermetic: reads two repo files, writes nothing.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	REGISTRY_DOCS_BEGIN,
	REGISTRY_DOCS_END,
	REGISTRY_DOCS_PATH,
	renderDocsTable,
	spliceRegistryDocs,
} from '../../scripts/image_registries.ts';
import {
	type ImageRegistryList,
	loadImageRegistries,
	provisionedRegistries,
} from '../../src/core/update/image_registries.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const PAGE = readFileSync(join(REPO_ROOT, REGISTRY_DOCS_PATH), 'utf8');
const LIST = loadImageRegistries();

/** Floor: the list was decided with three registries (one primary, two mirrors). */
const REGISTRY_FLOOR = 3;

function occurrences(text: string, needle: string): number {
	return text.split(needle).length - 1;
}

/** The text between the markers. */
function region(page: string): string {
	const begin = page.indexOf(REGISTRY_DOCS_BEGIN);
	const end = page.indexOf(REGISTRY_DOCS_END, begin);
	return page.slice(begin + REGISTRY_DOCS_BEGIN.length, end);
}

/** Is the page's region exactly the render of `list`? */
function regionIsRender(page: string, list: ImageRegistryList): boolean {
	return spliceRegistryDocs(page, renderDocsTable(list)) === page;
}

/** The `cosign verify` commands on a page, continuation lines joined. */
function cosignVerifyCommands(page: string): string[] {
	const joined = page.replace(/\\\n\s*/g, ' ');
	return joined.split('\n').filter((line) => /^\s*cosign verify\b/.test(line));
}

/** Does some `cosign verify` command carry this identity and issuer, quoted, verbatim? */
function verifiesWith(page: string, identity: string, issuer: string): boolean {
	return cosignVerifyCommands(page).some(
		(command) =>
			command.includes(`--certificate-identity-regexp '${identity}'`) &&
			command.includes(`--certificate-oidc-issuer '${issuer}'`),
	);
}

describe('the registry table in docs/install/docker.md', () => {
	test('A. both markers, once each, in order', () => {
		expect(occurrences(PAGE, REGISTRY_DOCS_BEGIN)).toBe(1);
		expect(occurrences(PAGE, REGISTRY_DOCS_END)).toBe(1);
		expect(PAGE.indexOf(REGISTRY_DOCS_BEGIN)).toBeLessThan(PAGE.indexOf(REGISTRY_DOCS_END));
	});

	test('B. the region IS the render of engineering/image_registries.json', () => {
		expect(regionIsRender(PAGE, LIST)).toBe(true);
	});

	test('C. one row per registry; provisioned ones with their address, the others with none', () => {
		expect(LIST.registries.length).toBeGreaterThanOrEqual(REGISTRY_FLOOR);
		const rows = region(PAGE)
			.split('\n')
			.filter((line) => line.startsWith('| ') && !line.startsWith('| Registry |'));
		expect(rows).toHaveLength(LIST.registries.length);
		for (const [index, entry] of LIST.registries.entries()) {
			const row = rows[index] ?? '';
			expect(row).toContain(entry.label);
			expect(row).toContain(`| ${entry.role} |`);
			if (entry.provisioned) {
				expect(row).toContain(`\`${entry.repository}\``);
				expect(row).toEndWith('| available |');
			} else {
				expect(row).toContain('| — |');
				expect(row).toContain('not yet available');
			}
		}
		expect(provisionedRegistries(LIST).length).toBeGreaterThan(0);
	});
});

describe('the signature check the page prints', () => {
	test('D. a cosign verify command carries the release identity and issuer verbatim', () => {
		expect(cosignVerifyCommands(PAGE).length).toBeGreaterThan(0);
		expect(verifiesWith(PAGE, LIST.signing.identity_regexp, LIST.signing.issuer)).toBe(true);
	});
});

describe('E. positive controls — the predicates catch what they guard', () => {
	test('a stale table (a registry provisioned since the page was rendered) is not the render', () => {
		const changed: ImageRegistryList = structuredClone(LIST);
		const target = changed.registries.find((entry) => !entry.provisioned) ?? changed.registries[0];
		if (target === undefined) throw new Error('the list has no registry');
		target.provisioned = !target.provisioned;
		target.repository = target.provisioned ? 'registry.example.org/planted/dedalo' : null;
		target.reason = target.provisioned ? null : 'planted';
		expect(regionIsRender(PAGE, changed)).toBe(false);
	});

	test('a hand edit inside the region is not the render', () => {
		const edited = PAGE.replace(
			`${REGISTRY_DOCS_BEGIN}\n`,
			`${REGISTRY_DOCS_BEGIN}\n<!-- edited -->\n`,
		);
		expect(regionIsRender(edited, LIST)).toBe(false);
	});

	test('a page without its END marker cannot be spliced', () => {
		expect(() => spliceRegistryDocs(PAGE.replace(REGISTRY_DOCS_END, ''), '')).toThrow();
	});

	test('a drifted identity or issuer is not the signature check', () => {
		const identity = LIST.signing.identity_regexp;
		expect(
			verifiesWith(PAGE, identity.replace('image-release', 'other'), LIST.signing.issuer),
		).toBe(false);
		expect(verifiesWith(PAGE, identity, 'https://issuer.example.org')).toBe(false);
	});
});
