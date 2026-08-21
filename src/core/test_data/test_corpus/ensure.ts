/**
 * THE TEST-CORPUS DOOR — provision (and tear down) the records the generic
 * `test` TLD needs, from the ONE committed source in this directory.
 *
 * The corpus JSON is DERIVED, never hand-edited: `scripts/derive_test_corpus.ts`
 * replays the frozen oracle-harvest store and rewrites every tipo and every
 * section_id through the phase-2 clone map. This module is the runtime half:
 * the data lives in CODE, the database copy is a cache.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CORPUS IS EXPLICIT — A SITUATION, NOT A BACKDROP (amended 2026-08-19)
 *
 * It is NOT provisioned by the `bun test` preload and NOT by
 * `scripts/test_db_setup.ts`, and the difference from `seed.ts`'s
 * `restoreCanonicalTest3()` is deliberate: the seven test3 playground records
 * are rows the suite ALREADY assumed were present (restoring them removes
 * drift), while these 446 records over 36 sections are rows nothing asked for.
 * Ambient rows are not free — a census gate, a scratch-surface emptiness check
 * and a "count the rows this save appended" assertion all read whatever the
 * database holds, so seeding the corpus for everyone silently changed the
 * situation under gates that never wanted it (measured: 20 unrelated gates went
 * red).
 *
 * So a gate that needs the corpus OWNS it, the way
 * `test/helpers/zzd_diffusion_fixture.ts` owns the diffusion ontology:
 *
 *     beforeAll(async () => { await ensureTestCorpus(SCOPE); });
 *     afterAll(async () => { expect(await dropTestCorpus(SCOPE)).toBe(0); });
 *
 * Pass a SCOPE (one section tipo, or a list) whenever the gate only needs part
 * of it — the door is scoped end to end, residue included. The reference
 * consumer is `test/unit/test_corpus_fixture.test.ts`.
 *
 *   ensureTestCorpus(scope?)  idempotent delete-then-insert, one transaction
 *                             per section, explicit ids, counters raise-only.
 *   dropTestCorpus(scope?)    removes records + TM rows + counters + the
 *                             hierarchy registry rows; returns the RESIDUE.
 *   ensureMediaKit(options?)  materializes every media identity the corpus
 *                             names, from the four real assets in
 *                             `src/core/test_data/media_kit/`.
 *
 * WHERE THE RECORDS GO (amended 2026-08-19). A phase-2 CLONE stores in
 * `matrix_test` — plan decision 1: each cloned test section carries the `test24`
 * matrix_table relation, and any section_id inside `matrix_test` is free, which
 * is why the derive keeps the source ids. A SEED-SHIPPED section (`rsc170`,
 * `rsc205`, `dd128`…) is kept in place and stores in ITS OWN table: the suite
 * runs on a separate, disposable database (`bun run test:db:setup`), so safety
 * comes from the database, and those sections exist on every installation, so
 * portability holds. The two kinds are cleared differently and the difference is
 * load-bearing: a test section is emptied WHOLE, a seed section only ever loses
 * the ids this corpus owns (the derive refuses a pair the seed itself ships —
 * `seed_shipped_record` — so the shipped configuration is never overwritten).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE HIERARCHY REGISTRY ROWS ARE WRITTEN HERE, AND NOT BY `ensureHierarchy`
 *
 * Phase 2 cloned ten install thesauri into ten `test*` TLDs, but a thesaurus is
 * only RESOLVABLE at runtime (area_thesaurus tree, ts_object, term_resolver,
 * indexation) when a `hierarchy1` registry row in `matrix_hierarchy_main`
 * declares it. Those rows do not exist, and the engine's own provisioning door
 * — `src/core/ontology/hierarchy_state.ts` `ensureHierarchy()` — MUST NOT be
 * run on these TLDs, because it does not merely register: it WRITES the
 * `<tld>1`/`<tld>2` convention over whatever the ontology actually says
 * (phase-0 findings H1–H5):
 *
 *   H1 `ontologyPresent(tld)` asserts the `<tld>0/1/2` node triad plus records
 *      1 & 2 of `<tld>0` — a shape our clones do not have to take.
 *   H2 the target check's message/default hard-codes `<tld>1` / `<tld>2`.
 *   H3 `rootTermCheck` derives `${tld}1` instead of reading `hierarchy53` —
 *      a LIVE bug (the WW hierarchy, whose target is `mht72`, reports broken).
 *   H4 `ensureTargetSectionDefaults` WRITES `hierarchy53=<tld>1` and
 *      `hierarchy58=<tld>2` when they are unset — it would stamp a convention
 *      onto a registry row we author deliberately.
 *   H5 `ensureRootTerm` creates/links roots into `<tld>1`/`<tld>2`, inventing
 *      records inside a corpus that is pinned by a fixture gate.
 *
 * So the rows below are written DIRECTLY, exactly as an operator's registry row
 * looks, and no provisioning is run. What must change for `ensureHierarchy` to
 * become usable here: H3 must read `hierarchy53` (a correctness fix in its own
 * right), H4/H5 must derive their targets from the registry row instead of from
 * the TLD name, and H1 must ask the honest question (do the registry's declared
 * target sections exist, with the `is_descriptor`/`is_model` flags provisioning
 * writes?) instead of asserting the `<tld>0/1/2` triad. Once those land, this
 * function becomes `await ensureHierarchy(id)` per row and the constants below
 * become its inputs.
 */

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	truncateSync,
	utimesSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../../../config/config.ts';
import { MATRIX_JSONB_COLUMNS, type MatrixJsonbColumn } from '../../db/matrix.ts';
import { insertMatrixRecordWithExplicitId } from '../../db/matrix_write.ts';
import { sql, withTransaction } from '../../db/postgres.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import { requireTestMediaRoot } from '../../media/test_media_root.ts';
import { fireSaveEvent } from '../../section_record/save_event.ts';
import { assertTestDatabase } from '../test_database_marker.ts';

/** Every test section stores here (plan decision 1). */
export const TEST_CORPUS_TABLE = 'matrix_test';
/** The hierarchy registry section and its table. */
const HIERARCHY_SECTION = 'hierarchy1';
const HIERARCHY_MAIN_TABLE = 'matrix_hierarchy_main';

/**
 * The marker a directory must carry before the media kit writes into it.
 * RE-EXPORTED, never redefined: the constant lives with the guard
 * (src/core/media/test_media_root.ts), which every media-root door now asks.
 */
export { TEST_MEDIA_MARKER } from '../../media/test_media_root.ts';

const CORPUS_DIR = import.meta.dir;
const TEST_DATA_DIR = dirname(CORPUS_DIR);
const MEDIA_KIT_DIR = join(TEST_DATA_DIR, 'media_kit');

/* ------------------------------------------------------------ the source */

export interface CorpusRecord {
	section_id: number;
	source: { section_tipo: string; section_id: string };
	reconstructed: boolean;
	/**
	 * true when the row carries its IDENTITY and no component at all: the store
	 * proved the record exists (a frozen body read a component off it) but every
	 * value it revealed was unstorable — a media page, a computed model, a list
	 * projection. Present, contents unknown. The ensurer writes it like any
	 * other row; a gate must not read the absence of a component as an empty one.
	 */
	existence_only?: boolean;
	gates: string[];
	columns: Partial<Record<MatrixJsonbColumn, unknown>>;
}
export interface CorpusSection {
	section_tipo: string;
	source_section_tipo: string;
	/**
	 * WHERE the records live. A phase-2 CLONE stores in `matrix_test`; a
	 * SEED-shipped section (the amended record-surface law, 2026-08-19) is kept
	 * in place and stores in its own table (`matrix`, `matrix_dd`,
	 * `matrix_users`…), which is why `kind` decides how the ensurer clears it.
	 */
	table: string;
	/**
	 * `test` — the section exists only for the tests: it may be cleared WHOLE.
	 * `seed` — the section ships on every installation and may hold rows this
	 *          corpus does not own (the admin user, an enumeration), so only the
	 *          corpus's OWN ids are ever deleted there.
	 */
	kind: 'test' | 'seed';
	records: CorpusRecord[];
}
export interface CorpusTmRow {
	id: number;
	section_tipo: string;
	section_id: number;
	tipo: string | null;
	tipo_known: boolean;
	lang: string | null;
	timestamp: string | null;
	user_id: number | null;
	data: unknown;
}
export interface CorpusMediaFile {
	/** Media-root-relative, leading slash — the stored `files_info.file_path`. */
	file_path: string;
	/** The path grammar of src/core/media/path.ts, parsed back out of the path. */
	folder: string;
	quality: string;
	bucket: number | null;
	section_tipo: string;
	section_id: number;
	component_tipo: string;
	lang: string | null;
	extension: string;
	/**
	 * The file's own `stat` as the oracle read it: `file_size` bytes and the
	 * `file_time.timestamp` mtime. A media component emits BOTH verbatim, so a
	 * kit copy of the wrong length at today's mtime diverges on two fields that
	 * describe the file and nothing else. null when the identity came from a
	 * derived-media URL (`posterframe_url` / `base_svg_url`): those are
	 * existence-checked but carry no stat, so the asset is planted as it is.
	 */
	file_size: number | null;
	/** `YYYY-MM-DD HH:MM:SS` — the mtime to stamp on the planted asset. */
	file_time: string | null;
	/** The record whose walk revealed the path (provenance, not ownership). */
	seen_in: string;
}

/** The derived files are NOT reserved names of the corpus section set. */
const NON_SECTION_FILES: ReadonlySet<string> = new Set([
	'tm.json',
	'files_info.json',
	'id_map.json',
	'refused.json',
]);

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === 'string' && value !== '';
/** The two record surfaces a corpus file may declare (header: test vs seed). */
const KNOWN_CORPUS_KINDS: ReadonlySet<string> = new Set(['test', 'seed']);

/**
 * The four facts a corpus file must state about itself before it is trusted:
 * its name IS its section_tipo, it names a storage table, it declares a known
 * kind, and kind and table agree (the record-surface law in the header).
 */
function assertCorpusFileShape(name: string, parsed: CorpusSection): void {
	if (parsed.section_tipo !== name.replace(/\.json$/, '')) {
		refuse(`corpus file '${name}' declares section_tipo '${parsed.section_tipo}'`, { file: name });
	}
	if (!isNonEmptyString(parsed.table)) {
		refuse(`corpus file '${name}' declares no storage table`, { file: name });
	}
	if (!KNOWN_CORPUS_KINDS.has(parsed.kind)) {
		refuse(`corpus file '${name}' declares kind '${String(parsed.kind)}'`, { file: name });
	}
	if ((parsed.kind === 'test') !== (parsed.table === TEST_CORPUS_TABLE)) {
		refuse(`corpus file '${name}': kind '${parsed.kind}' and table '${parsed.table}' disagree`, {
			file: name,
		});
	}
}

/**
 * Every corpus section, sorted by tipo, read from disk on each call.
 * DELIBERATELY NOT MEMOIZED: a module-level cache is exactly the state the
 * §4 request-isolation tripwire forbids, and this is a fixture door read a
 * handful of times per process, never on a request path.
 */
export function loadTestCorpus(): CorpusSection[] {
	const sections: CorpusSection[] = [];
	for (const name of readdirSync(CORPUS_DIR).sort()) {
		if (!name.endsWith('.json') || NON_SECTION_FILES.has(name)) continue;
		const parsed = JSON.parse(readFileSync(join(CORPUS_DIR, name), 'utf8')) as CorpusSection;
		assertCorpusFileShape(name, parsed);
		sections.push(parsed);
	}
	return sections;
}

/** The TM rows the corpus carries (matrix_time_machine, explicit ids). */
export function loadTestCorpusTm(): CorpusTmRow[] {
	const parsed = JSON.parse(readFileSync(join(CORPUS_DIR, 'tm.json'), 'utf8')) as {
		rows: CorpusTmRow[];
	};
	return parsed.rows;
}

/** The media identities the corpus names (media-root-relative paths). */
export function loadTestCorpusFiles(): CorpusMediaFile[] {
	const parsed = JSON.parse(readFileSync(join(CORPUS_DIR, 'files_info.json'), 'utf8')) as {
		files: CorpusMediaFile[];
	};
	return parsed.files;
}

export interface CorpusRefusal {
	source: string;
	detail: string;
	gates: string[];
}

/**
 * The derive's refusal ledger, grouped by kind — the phase-4 punch list, and
 * the SOURCE of the corpus gate's exemptions (a token the gate tolerates must
 * be one the derive listed, never one a human typed into the test).
 */
export function loadTestCorpusRefusals(): Record<string, CorpusRefusal[]> {
	const parsed = JSON.parse(readFileSync(join(CORPUS_DIR, 'refused.json'), 'utf8')) as {
		by_kind: Record<string, CorpusRefusal[]>;
	};
	return parsed.by_kind;
}

function refuse(message: string, coordinates: Record<string, string | number> = {}): never {
	throw new DedaloError('internal.invariant', {
		message: `test corpus: ${message}`,
		coordinates,
	});
}

/* --------------------------------------------------- the hierarchy rows */

export interface TestHierarchyRegistryRow {
	/** `hierarchy1` record id — a fixed, install-safe band (see BASE below). */
	section_id: number;
	/** `hierarchy6` — the TLD this row registers. */
	tld: string;
	/** `hierarchy5` — the name the thesaurus tree shows. */
	name: string;
	/** `hierarchy53` — the TERMS section. Read verbatim by area/tree.ts. */
	termsSection: string;
	/** `hierarchy58` — the MODEL section, when the TLD has one. */
	modelSection: string | null;
	/** `hierarchy9` → the typology record (hierarchy13). */
	typologyId: number;
	/** `hierarchy48` — the tree order. */
	order: number;
}

/**
 * The registry ids live in a band no install reaches (the biggest local
 * install holds 299 rows) and are FIXED per TLD, so a re-run rewrites the same
 * row and `dropTestCorpus` can delete exactly what it wrote.
 */
const HIERARCHY_REGISTRY_BASE = 900_001;
/** `hierarchy13/15` = "others" — the same default the ontology registry takes. */
const TYPOLOGY_OTHERS = 15;

interface ThesaurusManifest {
	thesaurus_tlds: Record<string, { tld: string; term: string; reason: string } | string>;
	/** Phase 2b: the thesauri with no ontology source, twinned from hierarchy20. */
	synthetic_thesauri: Record<string, { tld: string; term: string } | string>;
}

/**
 * The ten rows, derived from the SAME committed files the clone used
 * (`test_tld_clone_manifest.json` names the TLD + term of every cloned
 * thesaurus; `test_tld_tipo_map.json` says which test section the source
 * thesaurus became), so the registry can never drift from the ontology.
 */
export function testHierarchyRegistry(): TestHierarchyRegistryRow[] {
	const manifest = JSON.parse(
		readFileSync(join(TEST_DATA_DIR, 'test_tld_clone_manifest.json'), 'utf8'),
	) as ThesaurusManifest;
	const tipoMap = JSON.parse(
		readFileSync(join(TEST_DATA_DIR, 'test_tld_tipo_map.json'), 'utf8'),
	) as { map: Record<string, { target: string }> };
	const rows: TestHierarchyRegistryRow[] = [];
	const group = (
		source: Record<string, { tld: string; term: string } | string>,
	): [string, { tld: string; term: string }][] =>
		Object.entries(source)
			.filter(([key, value]) => !key.startsWith('_') && typeof value === 'object')
			.sort(([a], [b]) => a.localeCompare(b)) as [string, { tld: string; term: string }][];
	// The CLONED thesauri first, then the SYNTHETIC ones: two ordered groups, so
	// adding a phase-2b twin appends registry ids instead of renumbering the ten
	// rows that already exist.
	const entries = [...group(manifest.thesaurus_tlds), ...group(manifest.synthetic_thesauri ?? {})];
	for (const [sourceSection, spec] of entries) {
		const termsSection = tipoMap.map[sourceSection]?.target;
		if (termsSection === undefined) {
			refuse(`thesaurus '${sourceSection}' has no clone in the tipo map`, { sourceSection });
		}
		if (termsSection !== `${spec.tld}1`) {
			refuse(
				`thesaurus '${sourceSection}' cloned to '${termsSection}', not the '${spec.tld}1' anchor`,
				{ sourceSection, termsSection },
			);
		}
		rows.push({
			section_id: HIERARCHY_REGISTRY_BASE + rows.length,
			tld: spec.tld,
			name: spec.term,
			termsSection,
			// The clone gives a thesaurus TLD no `<tld>2` MODEL section: the
			// registry declares none rather than pointing at a node that is not
			// there (`model_section.ts` falls back cleanly on a null pairing).
			modelSection: null,
			typologyId: TYPOLOGY_OTHERS,
			order: rows.length + 1,
		});
	}
	return rows;
}

const locatorItem = (
	id: number,
	sectionTipo: string,
	sectionId: number | string,
	fromComponentTipo: string,
): Record<string, unknown> => ({
	id,
	type: 'dd151',
	section_id: String(sectionId),
	section_tipo: sectionTipo,
	from_component_tipo: fromComponentTipo,
});

/** The jsonb columns of one registry row (the operator-authored shape). */
function hierarchyRowColumns(
	row: TestHierarchyRegistryRow,
	rootTermId: number,
): Partial<Record<MatrixJsonbColumn, unknown>> {
	const string: Record<string, unknown[]> = {
		// `hierarchy5` is lang-sliced by area/tree.ts (falls back to item 0).
		hierarchy5: [
			{ id: 1, lang: 'lg-eng', value: row.name },
			{ id: 2, lang: 'lg-spa', value: row.name },
		],
		hierarchy6: [{ id: 1, lang: 'lg-nolan', value: row.tld }],
		// The TARGET section, read verbatim — never derived from the TLD name.
		hierarchy53: [{ id: 1, lang: 'lg-nolan', value: row.termsSection }],
	};
	if (row.modelSection !== null) {
		string.hierarchy58 = [{ id: 1, lang: 'lg-nolan', value: row.modelSection }];
	}
	return {
		data: { section_id: row.section_id, section_tipo: HIERARCHY_SECTION, label: row.name },
		string,
		relation: {
			// active (dd64/1 = yes) — the tree query filters on this one.
			hierarchy4: [locatorItem(1, 'dd64', 1, 'hierarchy4')],
			// active IN THESAURUS — without it the tree drops the hierarchy.
			hierarchy125: [locatorItem(1, 'dd64', 1, 'hierarchy125')],
			// typology: the grouper the client renders the hierarchy under.
			hierarchy9: [locatorItem(1, 'hierarchy13', row.typologyId, 'hierarchy9')],
			// root term: an EXISTING record of the terms section (the tree
			// refuses a hierarchy with no root term).
			hierarchy45: [locatorItem(1, row.termsSection, rootTermId, 'hierarchy45')],
		},
		number: { hierarchy48: [{ id: 1, value: row.order }] },
	};
}

/* ------------------------------------------------------------- ensure */

export interface EnsureCorpusResult {
	sections: number;
	records: number;
	tmRows: number;
	hierarchies: number;
	/** Root-term records the ensurer had to synthesize (a thesaurus with no corpus record). */
	synthesizedRoots: string[];
}

/** Normalize a scope to the set of section tipos it selects (null = all). */
function scopeSet(scope?: string | readonly string[]): Set<string> | null {
	if (scope === undefined) return null;
	const list = typeof scope === 'string' ? [scope] : [...scope];
	if (list.length === 0) return null;
	return new Set(list);
}

/**
 * Provision the corpus. IDEMPOTENT: every section's rows are deleted and
 * re-inserted from the JSON with their explicit ids (counter raised, never
 * lowered), so a second run leaves no drift and no stray.
 */
export async function ensureTestCorpus(
	scope?: string | readonly string[],
): Promise<EnsureCorpusResult> {
	// The database must SAY it is a disposable test database before a single
	// row moves (src/core/test_data/test_database_marker.ts). This door
	// DELETES rows of seed-shipped sections; on an installation those rows are
	// real records.
	await assertTestDatabase('ensureTestCorpus');
	const wanted = scopeSet(scope);
	const sections = loadTestCorpus().filter(
		(section) => wanted === null || wanted.has(section.section_tipo),
	);
	let records = 0;
	for (const section of sections) {
		// ONE transaction per section: a failure isolates to its own section
		// instead of rolling the whole corpus back (and keeps the tx short).
		await withTransaction(async () => {
			if (section.kind === 'test') {
				// A test-only section: the corpus IS its whole content.
				await sql.unsafe(`DELETE FROM "${section.table}" WHERE section_tipo = $1`, [
					section.section_tipo,
				]);
			} else {
				// A seed-shipped section: delete ONLY what this corpus owns, or a
				// re-ensure would wipe rows the installation ships (the admin
				// user, an enumeration) that no derive can put back.
				await sql.unsafe(
					`DELETE FROM "${section.table}" WHERE section_tipo = $1 AND section_id = ANY($2::int[])`,
					[section.section_tipo, `{${section.records.map((r) => r.section_id).join(',')}}`],
				);
			}
			for (const record of section.records) {
				const columns: Partial<Record<MatrixJsonbColumn, unknown>> = {};
				for (const column of MATRIX_JSONB_COLUMNS) {
					const value = record.columns[column];
					if (value !== undefined) columns[column] = value;
				}
				await insertMatrixRecordWithExplicitId(
					section.table,
					section.section_tipo,
					record.section_id,
					columns,
				);
				records++;
			}
		});
		await fireSaveEvent(section.section_tipo);
	}

	// TM rows of the sections in scope.
	const tmRows = loadTestCorpusTm().filter(
		(row) => wanted === null || wanted.has(row.section_tipo),
	);
	if (tmRows.length > 0) {
		const { encodeForJsonb } = await import('../../db/json_codec.ts');
		await withTransaction(async () => {
			for (const row of tmRows) {
				await sql.unsafe('DELETE FROM matrix_time_machine WHERE id = $1', [row.id]);
				await sql.unsafe(
					`INSERT INTO matrix_time_machine
					   (id, section_id, section_tipo, tipo, lang, timestamp, user_id, data)
					 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text::jsonb)`,
					[
						row.id,
						row.section_id,
						row.section_tipo,
						row.tipo,
						row.lang,
						row.timestamp,
						row.user_id === null ? null : String(row.user_id),
						encodeForJsonb(row.data ?? null),
					],
				);
			}
		});
	}

	const { hierarchies, synthesizedRoots } = await ensureTestHierarchyRegistry(wanted);
	return {
		sections: sections.length,
		records,
		tmRows: tmRows.length,
		hierarchies,
		synthesizedRoots,
	};
}

/**
 * The ten `hierarchy1` rows (module header: why `ensureHierarchy` is bypassed).
 * A thesaurus whose terms section holds no corpus record gets ONE synthesized
 * root term — a hierarchy without a root term is invisible to the tree, and an
 * empty terms section is a structural hole, not data.
 */
async function ensureTestHierarchyRegistry(
	wanted: Set<string> | null,
): Promise<{ hierarchies: number; synthesizedRoots: string[] }> {
	const rows = testHierarchyRegistry().filter(
		(row) => wanted === null || wanted.has(row.termsSection),
	);
	const synthesizedRoots: string[] = [];
	for (const row of rows) {
		await withTransaction(async () => {
			const existing = (await sql.unsafe(
				`SELECT MIN(section_id)::int AS id FROM "${TEST_CORPUS_TABLE}" WHERE section_tipo = $1`,
				[row.termsSection],
			)) as { id: number | null }[];
			let rootTermId = existing[0]?.id ?? null;
			if (rootTermId === null) {
				rootTermId = 1;
				synthesizedRoots.push(`${row.termsSection}/1`);
				await insertMatrixRecordWithExplicitId(
					TEST_CORPUS_TABLE,
					row.termsSection,
					rootTermId,
					{
						data: {
							section_id: rootTermId,
							section_tipo: row.termsSection,
							label: row.name,
							synthesized_root_term: true,
						},
					},
					{ onConflict: 'ignore' },
				);
			}
			// A registry row is written DIRECTLY (never through the counter door):
			// raising the shared `hierarchy1` counter into the 900k band would
			// re-address every hierarchy an operator creates afterwards.
			await sql.unsafe(
				`DELETE FROM "${HIERARCHY_MAIN_TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
				[HIERARCHY_SECTION, row.section_id],
			);
			const columns = hierarchyRowColumns(row, rootTermId);
			const names = ['section_tipo', 'section_id'];
			const placeholders = ['$1', '$2'];
			const params: (string | number)[] = [HIERARCHY_SECTION, row.section_id];
			let index = 3;
			for (const [column, value] of Object.entries(columns)) {
				names.push(column);
				placeholders.push(`$${index}::text::jsonb`);
				params.push(JSON.stringify(value));
				index++;
			}
			await sql.unsafe(
				`INSERT INTO "${HIERARCHY_MAIN_TABLE}" (${names.map((n) => `"${n}"`).join(', ')})
				 VALUES (${placeholders.join(', ')})`,
				params,
			);
		});
	}
	if (rows.length > 0) await fireSaveEvent(HIERARCHY_SECTION);
	return { hierarchies: rows.length, synthesizedRoots };
}

/* --------------------------------------------------------------- drop */

/**
 * Remove everything `ensureTestCorpus` writes: the records, their TM rows and
 * counters, and the hierarchy registry rows. Returns the RESIDUE (rows still
 * present), so a gate asserts hermeticity instead of trusting the sweep.
 */
/** Delete ONE section's corpus rows (test = whole; seed = only our own ids). */
async function dropSectionRows(tipo: string, section: CorpusSection | undefined): Promise<void> {
	if (section === undefined || section.kind === 'test') {
		// A test-only section (or a thesaurus terms section with no corpus
		// file, whose only rows are the ones this door synthesizes).
		await sql.unsafe(
			`DELETE FROM "${section?.table ?? TEST_CORPUS_TABLE}" WHERE section_tipo = $1`,
			[tipo],
		);
		// The counter is the section's own — safe to drop with its records.
		await sql`DELETE FROM matrix_counter WHERE tipo = ${tipo}`;
	} else {
		// A SEED-shipped section: only this corpus's ids go, and its counter
		// stays (an installation's own numbering is not ours to reset).
		await sql.unsafe(
			`DELETE FROM "${section.table}" WHERE section_tipo = $1 AND section_id = ANY($2::int[])`,
			[tipo, idArray(section.records.map((record) => record.section_id))],
		);
	}
	await sql`DELETE FROM matrix_time_machine WHERE section_tipo = ${tipo}`;
	await fireSaveEvent(tipo);
}

export async function dropTestCorpus(scope?: string | readonly string[]): Promise<number> {
	// A teardown is a delete sweep — the most expensive thing to run on the
	// wrong database, and the one a `finally` runs even when the gate failed.
	await assertTestDatabase('dropTestCorpus');
	const wanted = scopeSet(scope);
	const sections = loadTestCorpus();
	const byTipo = new Map(sections.map((section) => [section.section_tipo, section] as const));
	for (const tipo of tiposInScope(sections, wanted)) {
		await dropSectionRows(tipo, byTipo.get(tipo));
	}
	// TM rows whose CALLER section holds no corpus record (the record was
	// refused, the audit row was not) are addressed by id, or the sweep above
	// would leave them behind.
	const tmIds = tmIdsInScope(wanted);
	if (tmIds.length > 0) {
		await sql.unsafe('DELETE FROM matrix_time_machine WHERE id = ANY($1::int[])', [idArray(tmIds)]);
	}
	const registryIds = registryIdsInScope(wanted);
	if (registryIds.length > 0) {
		await sql.unsafe(
			`DELETE FROM "${HIERARCHY_MAIN_TABLE}" WHERE section_tipo = $1 AND section_id = ANY($2::int[])`,
			[HIERARCHY_SECTION, idArray(registryIds)],
		);
		await fireSaveEvent(HIERARCHY_SECTION);
	}
	return testCorpusResidue(scope);
}

/** The TM row ids the scope owns (scope = the AUDITED section, not the corpus file). */
function tmIdsInScope(wanted: Set<string> | null): number[] {
	return loadTestCorpusTm()
		.filter((row) => wanted === null || wanted.has(row.section_tipo))
		.map((row) => row.id);
}

/** The `hierarchy1` registry ids the scope owns. */
function registryIdsInScope(wanted: Set<string> | null): number[] {
	return testHierarchyRegistry()
		.filter((row) => wanted === null || wanted.has(row.termsSection))
		.map((row) => row.section_id);
}

/**
 * Every tipo the scope touches: the corpus sections PLUS the thesaurus terms
 * sections the registry declares (those have no corpus file of their own, but
 * this door synthesizes their root rows, so it must clear and count them too).
 */
function tiposInScope(sections: readonly CorpusSection[], wanted: Set<string> | null): Set<string> {
	const tipos = new Set(
		sections
			.filter((section) => wanted === null || wanted.has(section.section_tipo))
			.map((section) => section.section_tipo),
	);
	for (const row of testHierarchyRegistry()) {
		if (wanted === null || wanted.has(row.termsSection)) tipos.add(row.termsSection);
	}
	return tipos;
}

/** Bun.sql's int[] bind form (a Postgres array literal, never a JS array). */
const idArray = (ids: readonly number[]): string => `{${ids.join(',')}}`;

/** One `count(*)` over a prepared predicate. 0 when the id list is empty. */
async function countRows(table: string, where: string, params: unknown[]): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${table}" WHERE ${where}`,
		params,
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

/**
 * Rows still present for ONE section. A seed-shipped section is never EMPTY
 * (that is the point of it), so its residue is the corpus's OWN ids, never the
 * section's row count. A tipo with no corpus file (a synthesized thesaurus
 * terms section) is a test surface and counts whole.
 */
function countSectionResidue(tipo: string, section: CorpusSection | undefined): Promise<number> {
	if (section === undefined || section.kind === 'test') {
		return countRows(section?.table ?? TEST_CORPUS_TABLE, 'section_tipo = $1', [tipo]);
	}
	return countRows(section.table, 'section_tipo = $1 AND section_id = ANY($2::int[])', [
		tipo,
		idArray(section.records.map((record) => record.section_id)),
	]);
}

/** Rows still present for the scope (records + TM + registry). 0 = clean. */
export async function testCorpusResidue(scope?: string | readonly string[]): Promise<number> {
	const wanted = scopeSet(scope);
	const sections = loadTestCorpus();
	const byTipo = new Map(sections.map((section) => [section.section_tipo, section] as const));
	let total = 0;
	for (const tipo of tiposInScope(sections, wanted)) {
		total += await countSectionResidue(tipo, byTipo.get(tipo));
	}
	const tmIds = tmIdsInScope(wanted);
	if (tmIds.length > 0) {
		total += await countRows('matrix_time_machine', 'id = ANY($1::int[])', [idArray(tmIds)]);
	}
	const registryIds = registryIdsInScope(wanted);
	if (registryIds.length > 0) {
		total += await countRows(
			HIERARCHY_MAIN_TABLE,
			'section_tipo = $1 AND section_id = ANY($2::int[])',
			[HIERARCHY_SECTION, idArray(registryIds)],
		);
	}
	return total;
}

/* --------------------------------------------------------- media kit */

/** kind (the media dir the path lives under) → the kit asset that fills it. */
const KIT_BY_EXTENSION: Readonly<Record<string, string>> = {
	jpg: 'image.jpg',
	jpeg: 'image.jpg',
	png: 'image.jpg',
	avif: 'image.jpg',
	webp: 'image.jpg',
	gif: 'image.jpg',
	svg: 'svg.svg',
	mp4: 'av.mp4',
	webm: 'av.mp4',
	mov: 'av.mp4',
	pdf: 'pdf.pdf',
};

/** The four assets themselves, materialized under `/kit/` on every run. */
export const MEDIA_KIT_FILES = ['image.jpg', 'av.mp4', 'pdf.pdf', 'svg.svg'] as const;

export interface MediaKitResult {
	root: string;
	/** Files written for a corpus media identity. */
	identities: number;
	/** The kit assets themselves, under `<root>/kit/`. */
	kit: number;
}

/** Refuse a root that has not declared itself a test root, or a missing asset. */
function assertMediaKitRoot(root: string): void {
	// UNCONDITIONAL — this door exists only for tests, so an unmarked root is never
	// legitimate here, seam armed or not. Same check, same constant, one definition
	// (src/core/media/test_media_root.ts).
	requireTestMediaRoot(root, 'ensureMediaKit');
	for (const name of MEDIA_KIT_FILES) {
		if (!existsSync(join(MEDIA_KIT_DIR, name))) {
			refuse(`media kit asset '${name}' is missing from ${MEDIA_KIT_DIR}`, { name });
		}
	}
}

/** Plant ONE corpus media identity: the kit asset of its kind, at its own path. */
function writeMediaIdentity(root: string, file: CorpusMediaFile): void {
	const asset = KIT_BY_EXTENSION[file.extension];
	if (asset === undefined) {
		refuse(`no media-kit asset for extension '${file.extension}' (${file.file_path})`, {
			file_path: file.file_path,
		});
	}
	const target = join(root, file.file_path.replace(/^\//, ''));
	if (!target.startsWith(`${root}/`)) {
		refuse(`media path '${file.file_path}' escapes the media root`, { root });
	}
	mkdirSync(dirname(target), { recursive: true });
	copyFileSync(join(MEDIA_KIT_DIR, asset), target);
	// THE FILE'S OWN STAT, reproduced. A media read emits `file_size` and
	// `file_time` straight off the disk, so those two fields are a property of
	// the PLANTED FILE, not of the record — and a kit copy is 220 bytes stamped
	// today. The corpus carries the oracle's stat for every identity a
	// `files_info` page revealed, so the file is grown to exactly that length
	// (the kit assets are smaller than every recorded size, so this only ever
	// EXTENDS — the extension is a hole, which keeps the leading bytes, and the
	// asset, valid) and stamped with exactly that mtime.
	applyRecordedStat(target, file);
}

/**
 * Reproduce the oracle's `file_size` / `file_time` on a planted kit copy. Split
 * out of `writeMediaIdentity` to keep both functions inside the complexity cap
 * (crap_complexity_ratchet rule 3) — it is also the whole of the "the stat is a
 * property of the FILE, not of the record" rule, in one place.
 */
function applyRecordedStat(target: string, file: CorpusMediaFile): void {
	if (file.file_size !== null && file.file_size > statSync(target).size) {
		truncateSync(target, file.file_size);
	}
	if (file.file_time === null) return;
	// `YYYY-MM-DD HH:MM:SS`, local time — the same wall clock the oracle's
	// `file_time.timestamp` was formatted in and the engine formats back.
	const stamp = new Date(file.file_time.replace(' ', 'T'));
	if (!Number.isNaN(stamp.getTime())) utimesSync(target, stamp, stamp);
}

/**
 * Materialize every media identity the corpus names, plus the kit assets
 * themselves. REFUSES a root without the `.dedalo_test_media` marker: this
 * function writes files, and an install's media root (32 GB of irreplaceable
 * heritage masters) is never a place a test may write into by accident.
 *
 * The identity list comes from `files_info.json`, whose every entry was parsed
 * back OUT of a stored `files_info.file_path` against the engine's own grammar
 * (src/core/media/path.ts: `/<folder>/<quality>[/<bucket>]/<component>_<section>
 * _<id>[_<lang>].<ext>`) — a path that does not parse is refused by the derive
 * (`media_path_not_engine_shaped`), never planted. So every file written here
 * sits exactly where the engine will look for it, quality directory included.
 * The four kit assets are written too, under `<root>/kit/`, so a gate can point
 * a component at a real file of each kind.
 */
export async function ensureMediaKit(
	options: { mediaRoot?: string } = {},
): Promise<MediaKitResult> {
	// TWO markers, because two different things are being protected: the
	// DATABASE marker says this process is not pointed at an installation
	// (media identities are written for corpus records that only exist there),
	// and `.dedalo_test_media` says this ROOT is not an install's 32 GB of
	// irreplaceable masters.
	await assertTestDatabase('ensureMediaKit');
	const root = options.mediaRoot ?? config.media.rootPath;
	if (root === null || root === '') {
		refuse('no media root configured (config.media.rootPath) and none passed');
	}
	assertMediaKitRoot(root);
	const kitDir = join(root, 'kit');
	mkdirSync(kitDir, { recursive: true });
	for (const name of MEDIA_KIT_FILES) {
		copyFileSync(join(MEDIA_KIT_DIR, name), join(kitDir, name));
	}
	let identities = 0;
	for (const file of loadTestCorpusFiles()) {
		writeMediaIdentity(root, file);
		identities++;
	}
	return { root, identities, kit: MEDIA_KIT_FILES.length };
}
