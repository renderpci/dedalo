/**
 * PIN THE AI MODELS — THE documented procedure for `src/core/ai/model_pins.json`.
 *
 * A model artifact is fetched by IMMUTABLE hub revision and verified by sha256
 * before the store records it (P1-25 / CARRY-06). Those digests come from here,
 * and from nowhere else — a hand-edited digest is a contract edit with no
 * evidence behind it, and leg (g) of `model_artifact_integrity_native` refuses
 * an entry without `pinned_at` and a `reason`.
 *
 * Usage (needs the network ONCE; never touches the model store):
 *   bun run scripts/pin_ai_models.ts --model <id> --reason "<why this pin changes>"
 *   bun run scripts/pin_ai_models.ts --all --reason "<why>"
 *   bun run scripts/pin_ai_models.ts --check          # every catalog model has a pin covering every wanted file
 *
 * What it does per model:
 *   1. `GET <hub>/api/models/<id>/revision/main` → the commit sha (immutable);
 *   2. `GET <hub>/api/models/<id>/tree/<sha>?recursive=true` → for every LFS
 *      weight, `lfs.oid` IS its sha256 and `lfs.size` its length (no gigabyte
 *      download); the small non-LFS files (config, tokenizer) carry only a git
 *      blob id, so they are downloaded at the pinned revision and hashed here;
 *   3. cross-check: the tree's size must equal the hashed file's size;
 *   4. rewrite the model's block with `revision`, `pinned_at` (today), the
 *      `reason` and every wanted file that exists at that revision. A wanted
 *      file the repository does not publish is left OUT (the downloader skips an
 *      OPTIONAL file with no pin and refuses a REQUIRED one).
 *
 * A model the hub does not serve at all (404 on the revision API) is recorded
 * in the `unpinned` block with the reason, so the gate can enumerate it
 * shrink-only instead of a digest being invented for it.
 *
 * `--hub <base>` exists for the gate (a loopback fixture hub); production runs
 * use the engine's own `HUB_BASE`.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { HUB_BASE } from '../src/core/ai/model_fetch.ts';
import { SHA256_HEX } from '../src/core/ai/model_integrity.ts';
import {
	type FilePin,
	MODEL_PINS_PATH,
	type ModelPin,
	type PinTable,
	parsePinTable,
	REVISION_HEX,
} from '../src/core/ai/model_pins.ts';
import {
	commonFilesFor,
	filesFor,
	type RegisterCatalogModel,
	readRegisterCatalog,
} from './lib/ai_model_register.ts';

interface TreeEntry {
	type: 'file' | 'directory';
	path: string;
	size: number;
	lfs?: { oid: string; size: number };
}

/** The hub's answer for one model at its immutable revision. */
export interface HubPinSource {
	revision: string;
	tree: Map<string, TreeEntry>;
}

async function hubJson(url: string): Promise<unknown | null> {
	const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
	if (response.status === 404 || response.status === 401) return null;
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
	return response.json();
}

/** Revision + recursive tree, or null when the hub has no such model. */
export async function readHubSource(
	hubBase: string,
	modelId: string,
): Promise<HubPinSource | null> {
	const revision = (await hubJson(`${hubBase}/api/models/${modelId}/revision/main`)) as {
		sha?: string;
	} | null;
	if (revision === null || typeof revision.sha !== 'string' || !REVISION_HEX.test(revision.sha)) {
		return null;
	}
	const tree = (await hubJson(
		`${hubBase}/api/models/${modelId}/tree/${revision.sha}?recursive=true`,
	)) as TreeEntry[] | null;
	if (!Array.isArray(tree))
		throw new Error(`${modelId}: the hub tree at ${revision.sha} is not a list`);
	return { revision: revision.sha, tree: new Map(tree.map((entry) => [entry.path, entry])) };
}

/** Download one small file at the pinned revision and hash it. */
async function hashRemoteFile(
	hubBase: string,
	modelId: string,
	revision: string,
	file: string,
): Promise<{ sha256: string; size: number }> {
	const url = `${hubBase}/${modelId}/resolve/${revision}/${file}`;
	const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
	if (!response.ok || response.body === null) throw new Error(`${url}: HTTP ${response.status}`);
	const hash = createHash('sha256');
	let size = 0;
	for await (const chunk of response.body) {
		hash.update(chunk);
		size += chunk.byteLength;
	}
	return { sha256: hash.digest('hex'), size };
}

/**
 * The pin of one wanted file: `lfs.oid` for a weight (cross-checked against the
 * tree size), a download-and-hash for a plain blob. Null when the repository
 * does not publish the file at this revision.
 */
export async function pinOneFile(
	hubBase: string,
	modelId: string,
	source: HubPinSource,
	file: string,
): Promise<FilePin | null> {
	const entry = source.tree.get(file);
	if (entry === undefined || entry.type !== 'file') return null;
	if (entry.lfs !== undefined) {
		if (!SHA256_HEX.test(entry.lfs.oid))
			throw new Error(`${modelId}/${file}: lfs.oid is not a sha256`);
		if (entry.lfs.size !== entry.size) {
			throw new Error(`${modelId}/${file}: tree size ${entry.size} != lfs size ${entry.lfs.size}`);
		}
		return { sha256: entry.lfs.oid, size: entry.lfs.size };
	}
	const hashed = await hashRemoteFile(hubBase, modelId, source.revision, file);
	if (hashed.size !== entry.size) {
		throw new Error(
			`${modelId}/${file}: downloaded ${hashed.size} bytes, the tree says ${entry.size}`,
		);
	}
	return hashed;
}

/** Pin one catalog model against the hub; null when the hub does not serve it. */
export async function pinModel(
	hubBase: string,
	model: RegisterCatalogModel,
	reason: string,
	today: string,
): Promise<ModelPin | null> {
	const source = await readHubSource(hubBase, model.id);
	if (source === null) return null;
	const files: Record<string, FilePin> = {};
	for (const file of filesFor(model)) {
		const pin = await pinOneFile(hubBase, model.id, source, file);
		if (pin !== null) files[file] = pin;
	}
	return { revision: source.revision, pinned_at: today, reason, files };
}

function readTable(path: string): PinTable {
	if (!existsSync(path)) return { models: {}, unpinned: {} };
	return parsePinTable(readFileSync(path, 'utf8'));
}

/** Sorted-key, tab-indented JSON so a diff of the pin file reads as one entry. */
function serialize(table: PinTable): string {
	const sortKeys = <T extends Record<string, unknown>>(record: T): T =>
		Object.fromEntries(
			Object.keys(record)
				.sort()
				.map((key) => [key, record[key]]),
		) as T;
	return `${JSON.stringify(
		{ models: sortKeys(table.models), unpinned: sortKeys(table.unpinned) },
		null,
		'\t',
	)}\n`;
}

/** The pin problems of the current table against the catalog (empty = fine). */
export function checkTable(table: PinTable, catalog: RegisterCatalogModel[]): string[] {
	const problems: string[] = [];
	for (const model of catalog) {
		const pin = table.models[model.id];
		if (pin === undefined) {
			if (table.unpinned[model.id] === undefined)
				problems.push(`${model.id}: no pin and not in unpinned`);
			continue;
		}
		const { optional } = commonFilesFor(model.kind ?? 'asr');
		for (const file of filesFor(model)) {
			// An OPTIONAL file the repository does not publish has no pin, honestly.
			if (pin.files[file] === undefined && !optional.includes(file)) {
				problems.push(`${model.id}: ${file} has no pin`);
			}
		}
	}
	return problems;
}

function arg(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

if (import.meta.main) {
	const argv = process.argv.slice(2);
	const pinsPath = arg('--pins') ?? MODEL_PINS_PATH;
	const hubBase = arg('--hub') ?? HUB_BASE;
	const catalog = readRegisterCatalog();
	const table = readTable(pinsPath);

	if (argv.includes('--check')) {
		const problems = checkTable(table, catalog);
		for (const problem of problems) console.error(`  ✗ ${problem}`);
		console.log(
			problems.length === 0 ? 'every catalog model is pinned' : `${problems.length} problem(s)`,
		);
		process.exit(problems.length === 0 ? 0 : 1);
	}

	const reason = (arg('--reason') ?? '').trim();
	const wanted = argv.includes('--all') ? catalog.map((model) => model.id) : [arg('--model') ?? ''];
	if (reason.length < 12 || wanted[0] === '') {
		console.log(
			'usage: bun run scripts/pin_ai_models.ts (--model <id> | --all) --reason "<why>" [--hub <base>] [--pins <file>]\n       bun run scripts/pin_ai_models.ts --check',
		);
		process.exit(1);
	}
	const today = new Date().toISOString().slice(0, 10);
	for (const modelId of wanted) {
		const model = catalog.find((entry) => entry.id === modelId);
		if (model === undefined) {
			console.error(`${modelId}: not in the catalog (tools/tool_transcription/register.json)`);
			process.exit(1);
		}
		process.stdout.write(`${modelId} … `);
		const pin = await pinModel(hubBase, model, reason, today);
		if (pin === null) {
			table.unpinned[modelId] = {
				reason: `the hub has no repository at this id (revision API answered 404/401 on ${today}); ${reason}`,
			};
			delete table.models[modelId];
			console.log('NOT SERVED by the hub — recorded as unpinned');
			continue;
		}
		delete table.unpinned[modelId];
		table.models[modelId] = pin;
		const missing = filesFor(model).filter((file) => pin.files[file] === undefined);
		console.log(
			`${pin.revision.slice(0, 12)} (${Object.keys(pin.files).length} files${missing.length > 0 ? `, not published: ${missing.join(', ')}` : ''})`,
		);
	}
	writeFileSync(pinsPath, serialize(table));
	console.log(`wrote ${pinsPath}`);
}
