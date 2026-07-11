#!/usr/bin/env bun
/**
 * Tool scaffolder (PHP tools/tool_common/cli/create_tool.php).
 *
 * Copies the tool_dev_template package into a new tools/<name>/ directory,
 * renames the identifiers, and writes a minimal register.json in the flat
 * AUTHORING format (which importTools converts to the column-keyed record).
 *
 * Usage:
 *   bun run scripts/create_tool.ts --name=tool_my_thing --label="My Thing" [--models=section,component_input_text]
 *
 * The new tool is created but NOT registered — run the area_maintenance
 * "Register tools" widget (dry-run by default) to reconcile it with dd1324.
 */

import { cpSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TOOLS_ROOT = resolve(import.meta.dir, '../tools');
const TEMPLATE = 'tool_dev_template';

function arg(flag: string): string | undefined {
	const hit = Bun.argv.find((a) => a.startsWith(`--${flag}=`));
	return hit?.slice(flag.length + 3);
}

const name = arg('name');
const label = arg('label') ?? name;
const models = (arg('models') ?? 'all_components')
	.split(',')
	.map((m) => m.trim())
	.filter(Boolean);

if (name === undefined || !/^tool_[a-z0-9_]+$/.test(name)) {
	console.error('Error: --name=tool_<snake_case> is required (pattern ^tool_[a-z0-9_]+$)');
	process.exit(1);
}
const targetDir = resolve(TOOLS_ROOT, name);
if (existsSync(targetDir)) {
	console.error(`Error: ${targetDir} already exists`);
	process.exit(1);
}

// 1. Copy the template package.
cpSync(resolve(TOOLS_ROOT, TEMPLATE), targetDir, { recursive: true });

// 2. Rename template identifiers in every file, and rename template-named files.
function renameInTree(dir: string): void {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = resolve(dir, entry.name);
		if (entry.isDirectory()) {
			renameInTree(full);
			continue;
		}
		const text = readFileSync(full, 'utf8').replaceAll(TEMPLATE, name as string);
		writeFileSync(full, text);
		if (entry.name.includes(TEMPLATE)) {
			renameSync(full, resolve(dir, entry.name.replaceAll(TEMPLATE, name as string)));
		}
	}
}
renameInTree(targetDir);

// 3. Overwrite register.json with a minimal AUTHORING-format file.
const authoring = {
	$schema: '../../src/core/tools/client/register.schema.json',
	name,
	version: '1.0.0',
	label: { 'lg-eng': label },
	affected_models: models,
	show_in_component: true,
	active: true,
	properties: { open_as: 'modal' },
};
writeFileSync(resolve(targetDir, 'register.json'), `${JSON.stringify(authoring, null, '\t')}\n`);

console.log(`Created ${name} at ${targetDir}`);
console.log('Next: run the area_maintenance "Register tools" widget to reconcile dd1324.');
