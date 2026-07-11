/**
 * component_alias v7 migration (WC-020) — one-shot, dry-run by default.
 *
 * Reshapes the v5 alias relics into the v7 contract (src/core/ontology/alias.ts)
 * and makes numisdata203 THE config carrier for the epigraphy tool's coins
 * portal:
 *
 *  1. numisdata203 → v7 shape: ontology18 = {alias_of, view:'mosaic'} (retires
 *     max_records/look_inside/edit_view*), ontology17 = the coins source FOLDED
 *     VERBATIM from numisdata201's tool_config ddo_map inline copy (request_config
 *     with sqo_config.limit 1 + show ddo_map), ontology16 = that entry's css
 *     (the working tool-grid look; the v5 400px skin survives in the pre-image).
 *  2. numisdata201 → ddo_map re-point: role 'coins' → tipo numisdata203, inline
 *     properties/view DELETED (single source of truth).
 *  3. numisdata629 → v7 shape (alias_of + view kept, retired keys dropped,
 *     ontology17 REMOVED so it inherits the target's source wholesale) —
 *     consumerless until numisdata625 gains a renderer (ledgered out of scope).
 *  4. numisdata573/numisdata627 → re-modeled to component_autocomplete (they are
 *     standalone autocomplete definitions misusing model component_alias; the
 *     ontology6 model locator flips dd0/164 → dd0/530).
 *  5. --legends (default OFF): re-point the 6 legend/type roles at their aliases
 *     (numisdata190/192/193/196/198/562) after reshaping them — deferred until
 *     the coins alias has soaked.
 *
 * SOURCE OF TRUTH: matrix_ontology records (numisdata0/<id>; misc ontology16=css,
 * ontology17=source, ontology18=properties blob; relation ontology6=model
 * locator) — dd_ontology is DERIVED (parser.ts), so every write goes through
 * saveComponentData (TM audit + counters) and re-derives via
 * setRecordsInDdOntology (cache fan-out included).
 *
 * (Historical WC-020 coexistence caveat, closed at the 2026-07-11 cutover:
 * while the engines coexisted, step 2 degraded the PHP oracle's epigraphy
 * coins panel — PHP had no component_alias resolution. The PHP engine is
 * retired; the alias engine (src/core/ontology/alias.ts) is simply the
 * contract now. rewrite/COEXISTENCE.md history.)
 *
 * USAGE:
 *   bun run scripts/migrate_component_alias.ts             # dry-run: diffs + validation
 *   bun run scripts/migrate_component_alias.ts --execute   # apply + re-derive
 *   bun run scripts/migrate_component_alias.ts --execute --legends
 *
 * A pre-image JSON of every touched record slice is written next to the script
 * output dir before any write (manual rollback material).
 */

import { sql } from '../src/core/db/postgres.ts';

const ONTOLOGY_SECTION = 'numisdata0';
const TOOL_NAME = 'tool_numisdata_epigraphy';
const AUTOCOMPLETE_MODEL_LOCATOR = [
	{
		id: 1,
		type: 'dd151',
		section_id: '530',
		section_tipo: 'dd0',
		from_component_tipo: 'ontology6',
	},
];
/** role → alias tipo for the deferred --legends pass. */
const LEGEND_ROLE_ALIASES: Record<string, string> = {
	obverse_legend: 'numisdata192',
	reverse_legend: 'numisdata198',
	obverse_desing: 'numisdata190',
	reverse_desing: 'numisdata562',
	obverse_symbol: 'numisdata193',
	reverse_symbol: 'numisdata196',
};

const execute = process.argv.includes('--execute');
const legends = process.argv.includes('--legends');

interface OntologyRecordSlice {
	section_id: number;
	misc: Record<string, { id?: number; value?: unknown }[] | undefined> | null;
	relation: Record<string, unknown[] | undefined> | null;
}

async function readRecord(sectionId: number): Promise<OntologyRecordSlice> {
	const rows = (await sql.unsafe(
		`SELECT section_id, misc, relation FROM matrix_ontology
		 WHERE section_tipo = $1 AND section_id = $2`,
		[ONTOLOGY_SECTION, sectionId],
	)) as OntologyRecordSlice[];
	const row = rows[0];
	if (row === undefined)
		throw new Error(`ontology record ${ONTOLOGY_SECTION}/${sectionId} missing`);
	return row;
}

const componentValue = (record: OntologyRecordSlice, componentTipo: string): unknown =>
	record.misc?.[componentTipo]?.[0]?.value;

/** One planned component write (misc json or relation locators). */
interface PlannedWrite {
	sectionId: number;
	componentTipo: string;
	/** items as stored: [{id:1, value}] for misc json, locator[] for relation. */
	items: unknown[];
	note: string;
}

const plan: PlannedWrite[] = [];
const preImage: Record<string, unknown> = {};

function planMiscValue(
	sectionId: number,
	componentTipo: string,
	value: unknown,
	note: string,
): void {
	plan.push({ sectionId, componentTipo, items: [{ id: 1, value }], note });
}

// ---------------------------------------------------------------------------
// Build the plan from the LIVE records.
// ---------------------------------------------------------------------------
const rec201 = await readRecord(201);
const rec203 = await readRecord(203);
const rec629 = await readRecord(629);
preImage['numisdata0/201'] = { misc: rec201.misc?.ontology18 };
preImage['numisdata0/203'] = {
	ontology16: rec203.misc?.ontology16,
	ontology17: rec203.misc?.ontology17,
	ontology18: rec203.misc?.ontology18,
};
preImage['numisdata0/629'] = {
	ontology17: rec629.misc?.ontology17,
	ontology18: rec629.misc?.ontology18,
};

// The live inline coins config on numisdata201 (fold source of truth).
const props201 = structuredClone(componentValue(rec201, 'ontology18')) as {
	tool_config?: Record<string, { ddo_map?: Record<string, unknown>[] }>;
} | null;
const ddoMap = props201?.tool_config?.[TOOL_NAME]?.ddo_map;
if (!Array.isArray(ddoMap)) throw new Error(`numisdata201 carries no ${TOOL_NAME} ddo_map`);
const coinsEntry = ddoMap.find((entry) => entry.role === 'coins');
if (coinsEntry === undefined) throw new Error('ddo_map has no coins role');
const coinsProperties = coinsEntry.properties as
	| { css?: unknown; view?: unknown; source?: unknown }
	| undefined;

// 1. numisdata203 → v7 shape (fold the inline coins config).
if (coinsProperties?.source !== undefined) {
	// FIRST run: the inline copy still exists — fold it.
	planMiscValue(
		203,
		'ontology18',
		{ alias_of: 'numisdata77', view: coinsProperties.view ?? 'mosaic' },
		'v7 shape: retire max_records/look_inside/edit_view*; view from the inline copy',
	);
	planMiscValue(
		203,
		'ontology17',
		coinsProperties.source,
		'coins source folded VERBATIM from the ddo_map inline copy (sqo_config.limit 1)',
	);
	planMiscValue(
		203,
		'ontology16',
		coinsProperties.css ?? null,
		'the working tool-grid css (v5 400px skin parked in the pre-image)',
	);
} else {
	console.log('numisdata201 coins entry carries no inline properties — step 1/2 already applied?');
}

// 2. numisdata201 → re-point coins at the alias, drop the inline copy.
if (props201?.tool_config?.[TOOL_NAME] !== undefined) {
	const repointed = ddoMap.map((entry) =>
		entry.role === 'coins'
			? {
					mode: entry.mode ?? 'edit',
					role: 'coins',
					tipo: 'numisdata203',
					section_id: entry.section_id ?? 'self',
					section_tipo: entry.section_tipo ?? 'numisdata3',
				}
			: legends && typeof entry.role === 'string' && LEGEND_ROLE_ALIASES[entry.role] !== undefined
				? { ...entry, tipo: LEGEND_ROLE_ALIASES[entry.role] }
				: entry,
	);
	const newProps201 = structuredClone(props201) as Record<string, unknown>;
	(newProps201.tool_config as Record<string, { ddo_map: unknown[] }>)[TOOL_NAME] = {
		...(newProps201.tool_config as Record<string, object>)[TOOL_NAME],
		ddo_map: repointed,
	} as { ddo_map: unknown[] };
	planMiscValue(
		201,
		'ontology18',
		newProps201,
		`ddo_map re-point: coins → numisdata203 (inline properties DELETED)${legends ? ' + legend roles → aliases' : ''}`,
	);
}

// 3. numisdata629 → v7 shape (no re-point; numisdata625 out of scope).
{
	const props629 = componentValue(rec629, 'ontology18') as { alias_of?: unknown } | null;
	if (props629 !== null && typeof props629 === 'object' && 'max_records' in props629) {
		planMiscValue(
			629,
			'ontology18',
			{ alias_of: 'numisdata77', view: 'mosaic' },
			'v7 shape; countermark renderer out of scope (ledgered)',
		);
		// EMPTY items (not value:null!) — the parser overlays properties.source
		// for ANY defined value incl. null, and a null source would wholesale-
		// replace the target's; an empty slot is skipped and the alias inherits.
		plan.push({
			sectionId: 629,
			componentTipo: 'ontology17',
			items: [],
			note: 'source REMOVED — inherits the target wholesale (its v5 source had no request_config)',
		});
	}
}

// 4. numisdata573/627 → component_autocomplete (standalone defs, not aliases).
for (const sectionId of [573, 627]) {
	const record = await readRecord(sectionId);
	const modelLocator = record.relation?.ontology6?.[0] as { section_id?: unknown } | undefined;
	preImage[`numisdata0/${sectionId}`] = { ontology6: record.relation?.ontology6 };
	if (String(modelLocator?.section_id) === '164') {
		plan.push({
			sectionId,
			componentTipo: 'ontology6',
			items: AUTOCOMPLETE_MODEL_LOCATOR,
			note: 're-model component_alias → component_autocomplete (dd0/164 → dd0/530)',
		});
	}
}

// 5. --legends reshape (drop retired keys from the six legend/type aliases).
if (legends) {
	for (const aliasTipo of Object.values(LEGEND_ROLE_ALIASES)) {
		const sectionId = Number(aliasTipo.replace('numisdata', ''));
		const record = await readRecord(sectionId);
		const current = componentValue(record, 'ontology18') as Record<string, unknown> | null;
		preImage[`numisdata0/${sectionId}`] = { ontology18: record.misc?.ontology18 };
		if (current !== null && typeof current === 'object') {
			const aliasOf = current.alias_of;
			planMiscValue(
				sectionId,
				'ontology18',
				{ alias_of: aliasOf },
				'v7 shape (retired keys dropped; overrides inherit the target)',
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Print the plan.
// ---------------------------------------------------------------------------
console.log(
	`component_alias migration — ${execute ? 'EXECUTE' : 'DRY-RUN'}${legends ? ' (+legends)' : ''}\n`,
);
for (const write of plan) {
	console.log(`numisdata0/${write.sectionId} ${write.componentTipo} — ${write.note}`);
	console.log(`  new: ${JSON.stringify(write.items).slice(0, 240)}…\n`);
}
if (plan.length === 0) {
	console.log('Nothing to do — migration already applied.');
	process.exit(0);
}

// ---------------------------------------------------------------------------
// Validation stage (runs in dry-run too): simulate the post-migration merge.
// ---------------------------------------------------------------------------
{
	const plannedOf = (sectionId: number, componentTipo: string): unknown =>
		(
			plan.find((w) => w.sectionId === sectionId && w.componentTipo === componentTipo)?.items as
				| { value?: unknown }[]
				| undefined
		)?.[0]?.value;

	// numisdata203's would-be effective properties: blob + css/source overlays,
	// merged over the target numisdata77 (top-level wholesale — alias.ts).
	const targetProps =
		(
			(await sql.unsafe(`SELECT properties FROM dd_ontology WHERE tipo = 'numisdata77'`)) as {
				properties: Record<string, unknown>;
			}[]
		)[0]?.properties ?? {};
	const aliasProps: Record<string, unknown> = {
		...((plannedOf(203, 'ontology18') as Record<string, unknown>) ?? {}),
	};
	const plannedCss = plannedOf(203, 'ontology16');
	const plannedSource = plannedOf(203, 'ontology17');
	if (plannedCss != null) aliasProps.css = plannedCss;
	if (plannedSource != null) aliasProps.source = plannedSource;
	const { alias_of: _a, ...overrides } = aliasProps;
	const merged = { ...targetProps, ...overrides };

	for (const retired of ['max_records', 'look_inside', 'edit_view']) {
		if (retired in merged)
			throw new Error(`validation: retired key '${retired}' survives the merge`);
	}
	const { buildRequestConfigForElement } = await import(
		'../src/core/relations/request_config/build.ts'
	);
	const parsed = await buildRequestConfigForElement(merged, {
		ownerTipo: 'numisdata203',
		ownerSectionTipo: 'numisdata3',
		mode: 'edit',
		ownerIsSection: false,
	});
	const show = parsed[0]?.show;
	const limit = (show?.sqo_config as { limit?: unknown } | undefined)?.limit;
	if (!Array.isArray(show?.ddo_map) || show.ddo_map.length === 0) {
		throw new Error('validation: merged coins config parses to an EMPTY show.ddo_map');
	}
	if (limit !== 1) throw new Error(`validation: merged sqo_config.limit is ${limit}, expected 1`);
	console.log(
		`validation OK: merged numisdata203 config → ${show.ddo_map.length} show children, sqo_config.limit ${limit}\n`,
	);
}

// ---------------------------------------------------------------------------
// Execute.
// ---------------------------------------------------------------------------
const preImagePath = `${import.meta.dir}/../.claude_migration_component_alias_preimage.json`;
if (!execute) {
	console.log(`dry-run complete (${plan.length} writes planned). Re-run with --execute to apply.`);
	process.exit(0);
}

await Bun.write(preImagePath, JSON.stringify(preImage, null, '\t'));
console.log(`pre-image written: ${preImagePath}`);

const { saveComponentData } = await import('../src/core/section/record/save_component.ts');
const { setRecordsInDdOntology } = await import('../src/core/ontology/ontology_write.ts');

const touchedIds = new Set<number>();
for (const write of plan) {
	const outcome = await saveComponentData({
		componentTipo: write.componentTipo,
		sectionTipo: ONTOLOGY_SECTION,
		sectionId: write.sectionId,
		lang: 'lg-nolan',
		changedData: [{ action: 'set_data', id: null, value: write.items }],
		userId: -1,
	});
	if (!outcome.ok) {
		throw new Error(
			`write FAILED at numisdata0/${write.sectionId} ${write.componentTipo}: ${outcome.message} — earlier writes stand; restore from the pre-image`,
		);
	}
	touchedIds.add(write.sectionId);
	console.log(`saved numisdata0/${write.sectionId} ${write.componentTipo}`);
}
for (const sectionId of touchedIds) {
	const response = await setRecordsInDdOntology({
		sectionTipo: ONTOLOGY_SECTION,
		sectionId,
		userId: -1,
	});
	if (response.result !== true) {
		throw new Error(`dd_ontology re-derive FAILED for ${sectionId}: ${response.errors.join('; ')}`);
	}
	console.log(`re-derived dd_ontology for numisdata${sectionId}`);
}
console.log('\nmigration applied. Run: bun test test/unit/component_alias_numisdata203.test.ts');
process.exit(0);
