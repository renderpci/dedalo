#!/usr/bin/env bun
/**
 * Render the PUBLICATION-HOST media rule profile (engineering/PUBLICATION_HOST_SPEC.md
 * §5.1) for a separate publication machine that reads the media through a READ-ONLY
 * shared mount. Prints to stdout, or writes --out. Read-only towards the media tree.
 *
 * Run it on the WORK host (it reads the engine's config: media dir, quality catalog),
 * then install the output on the publication host and reload its web server.
 */

import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { buildNginxMap, getPublicQualities } from '../src/core/media/protection.ts';
import {
	buildPublicationHostApacheConf,
	buildPublicationHostNginxConf,
	normalizePublicationHostInput,
	type PublicationHostRuleInput,
} from '../src/core/media/publication_host_rules.ts';

export interface CliResult {
	code: number;
	stdout: string;
	stderr: string;
	/** The parsed --out target (either `--out f` or `--out=f`), when given. */
	out?: string;
}

const USAGE = [
	'Usage: bun run media:publication-host-rules --root <host mount root> [options]',
	'  --server apache|nginx|nginx-map   default apache (nginx-map needs no --root)',
	'  --qualities a,b                   default: the engine public qualities',
	'  --out <file>                      write instead of printing',
	'',
].join('\n');

const BUILDERS: Record<string, (input: PublicationHostRuleInput) => string> = {
	apache: buildPublicationHostApacheConf,
	nginx: buildPublicationHostNginxConf,
};

function usage(reason: string): CliResult {
	return { code: 2, stdout: '', stderr: `${reason}\n${USAGE}` };
}

export function runPublicationHostRulesCli(argv: readonly string[]): CliResult {
	let values: { root?: string; server?: string; qualities?: string; out?: string };
	try {
		({ values } = parseArgs({
			args: [...argv],
			options: {
				root: { type: 'string' },
				server: { type: 'string', default: 'apache' },
				qualities: { type: 'string' },
				out: { type: 'string' },
			},
			strict: true,
		}));
	} catch (error) {
		return usage((error as Error).message);
	}
	const out = values.out;
	if (values.server === 'nginx-map') return { code: 0, stdout: buildNginxMap(), stderr: '', out };
	const build = BUILDERS[values.server ?? ''];
	if (build === undefined) return usage(`unknown --server: ${values.server}`);
	if (values.root === undefined) return usage('--root is required');

	const qualities =
		values.qualities !== undefined
			? values.qualities
					.split(',')
					.map((q) => q.trim())
					.filter((q) => q !== '')
			: getPublicQualities();
	const input = { root: values.root, qualities };
	try {
		const { dropped } = normalizePublicationHostInput(input);
		const stderr =
			dropped.length > 0
				? `REFUSED public qualities (master tier or invalid): ${dropped.join(', ')}\n`
				: '';
		return { code: 0, stdout: build(input), stderr, out };
	} catch (error) {
		return { code: 1, stdout: '', stderr: `${(error as Error).message}\n` };
	}
}

if (import.meta.main) {
	const result = runPublicationHostRulesCli(process.argv.slice(2));
	if (result.stderr !== '') process.stderr.write(result.stderr);
	if (result.code === 0 && result.out !== undefined) {
		writeFileSync(result.out, result.stdout);
		process.stderr.write(`written: ${result.out}\n`);
	} else if (result.stdout !== '') {
		process.stdout.write(result.stdout);
	}
	process.exit(result.code);
}
