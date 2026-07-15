/**
 * HIERARCHY STATE — the single source of truth for "is this hierarchy usable?",
 * and the single writer that makes it so.
 *
 * WHY THIS EXISTS. The PHP-inherited design had THREE writers, each establishing a
 * DIFFERENT subset of the same invariant, and none of them checking the end state:
 *
 *   - tool_hierarchy "Generate" → provisioned the ontology and MINTED a new root term,
 *     skipping that step whenever the hierarchy45 locator was merely PRESENT;
 *   - the installer's activation → set the flags and LINKED a hard-coded `<tld>1`/1;
 *   - the ontology-main writer → its own literal locators.
 *
 * The seed ships a preset hierarchy45 locator on 158 of 269 hierarchy records, pointing
 * at `<tld>1`/1 — a record that does not exist until that tld's thesaurus is imported.
 * So "is the locator set?" answered YES while the target did not exist: the root term
 * was never created, the tree had nothing to hang children on, and the hierarchy could
 * not be activated at all (live: Albania, 2026-07-14). The same class of bug hid in the
 * model root, which PHP pinned to the literal `<tld>2`/2 — an id that exists in almost
 * no install.
 *
 * THE RULE THAT REPLACES ALL OF IT: never ask whether a locator is set; ask whether its
 * TARGET RECORD EXISTS. A dangling locator is treated as ABSENT, which repairs every one
 * of those 158 seed presets without touching the seed. And never hard-code a record id —
 * resolve the root, or create it.
 *
 * THE INVARIANT (what `inspect` checks and `ensure` converges to):
 *   registry      the hierarchy1 record exists
 *   tld           hierarchy6 is a safe tld
 *   typology      hierarchy9 names a typology (>= 1) — provisioning refuses without it
 *   source        hierarchy109 names a real section — the template the virtual sections
 *                 clone. DEFAULTED to hierarchy20 (thesaurus) when unset, never
 *                 OVERWRITTEN: it is the operator's "Real section tipo", and a hierarchy
 *                 built on another section is legitimate
 *   active        hierarchy4 → dd64/1, with a FULL locator (a bare one — no
 *                 from_component_tipo — is invisible to the jsonb @> containment behind
 *                 every portal's target_sections)
 *   thesaurus     hierarchy125 → dd64/1|2
 *   ontology      dd_ontology has `<tld>0|1|2`, and matrix_ontology has the two `<tld>0`
 *                 node records
 *   targets       hierarchy53 = `<tld>1`, hierarchy58 = `<tld>2`
 *   root_term     hierarchy45 → an EXISTING record in `<tld>1`
 *   root_model    hierarchy59 → an EXISTING record in `<tld>2`
 *
 * A root the engine creates is NAMED after the hierarchy (hierarchy5, all languages) —
 * it is the node the whole tree descends from, and an empty one at the top of the tree is
 * alarming and useless. The term component is resolved from the target section's
 * `section_map` (`hierarchy52`: `{thesaurus:{term:'hierarchy25', …}}`), never hard-coded:
 * a hierarchy on a non-hierarchy20 section names a different component. Fill-only — an
 * existing term (imported, or operator-edited) is never overwritten.
 *
 * `ensure` is idempotent: run it twice, get the same DB. `rebuild` = teardown + ensure,
 * and the teardown is ontology-only — the TERMS in `<tld>1` are never touched.
 *
 * SINGLE WRITER: nothing outside this module may call generateVirtualSection or write a
 * root-term locator. Guarded by test/unit/hierarchy_single_writer_tripwire.test.ts.
 */

import { compareLocators } from '../concepts/locator.ts';
import { updateMatrixKeyData } from '../db/matrix_write.ts';
import { sql } from '../db/postgres.ts';
import { applyAddNewElement } from '../relations/save.ts';
import { generateVirtualSection } from './hierarchy_provision.ts';
import { deleteOntologyByTld } from './ontology_delete.ts';
import {
	HIERARCHY_ACTIVE,
	HIERARCHY_ACTIVE_IN_THESAURUS,
	HIERARCHY_GENERAL_TERM,
	HIERARCHY_GENERAL_TERM_MODEL,
	HIERARCHY_SOURCE_REAL_SECTION,
	HIERARCHY_TARGET_SECTION,
	HIERARCHY_TARGET_SECTION_MODEL,
	HIERARCHY_TERM,
	HIERARCHY_TLD,
	HIERARCHY_TYPOLOGY,
	RELATION_TYPE_CHILDREN,
	RELATION_TYPE_LINK,
	SI_NO_NO,
	SI_NO_SECTION,
	SI_NO_YES,
	THESAURUS_SECTION,
} from './ontology_tipos.ts';
import { getColumnNameByModel, getMatrixTableFromTipo, getModelByTipo } from './resolver.ts';
import { getSectionMapValue } from './section_map.ts';
import { safeTld } from './tld.ts';

/** The hierarchy registry section + its table. */
export const HIERARCHY_SECTION = 'hierarchy1';
const HIERARCHY_MAIN_TABLE = 'matrix_hierarchy_main';

export type HierarchyCheckId =
	| 'registry'
	| 'tld'
	| 'typology'
	| 'source'
	| 'active'
	| 'thesaurus'
	| 'ontology'
	| 'targets'
	| 'root_term'
	| 'root_model';

export interface HierarchyCheck {
	id: HierarchyCheckId;
	/** Short human label — the client renders these as the status checklist. */
	label: string;
	ok: boolean;
	/** What is actually there (or what is missing). Shown next to a failed check. */
	detail: string;
}

export interface HierarchyState {
	section_id: number;
	tld: string | null;
	typology: number | null;
	/** Every check passed → the hierarchy is browsable in the thesaurus. */
	usable: boolean;
	checks: HierarchyCheck[];
}

export interface EnsureOptions {
	/** Flag the hierarchy active (hierarchy4 → YES). Default true — that is the point. */
	activate?: boolean;
	/** hierarchy125. Default: keep the stored value, else true. */
	activeInThesaurus?: boolean;
}

export interface EnsureResult {
	result: boolean;
	msg: string;
	errors: string[];
	/** The state AFTER the writes — what the client re-renders its checklist from. */
	state: HierarchyState;
	/** What ensure actually had to change (empty on a no-op re-run). */
	applied: string[];
}

/* ------------------------------------------------------------------ reads */

interface RegistryRow {
	relation: Record<string, Record<string, unknown>[]> | null;
	string: Record<string, { value?: unknown }[]> | null;
}

async function readRegistry(sectionId: number): Promise<RegistryRow | null> {
	const rows = (await sql.unsafe(
		`SELECT relation, string FROM "${HIERARCHY_MAIN_TABLE}"
		 WHERE section_tipo = $1 AND section_id = $2`,
		[HIERARCHY_SECTION, sectionId],
	)) as RegistryRow[];
	return rows[0] ?? null;
}

const literal = (row: RegistryRow | null, tipo: string): string =>
	String(row?.string?.[tipo]?.[0]?.value ?? '');

const locator = (row: RegistryRow | null, tipo: string): Record<string, unknown> | null =>
	row?.relation?.[tipo]?.[0] ?? null;

/** Does a record exist? The question the old code never asked. */
async function recordExists(sectionTipo: string, sectionId: number): Promise<boolean> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) return false;
	const rows = (await sql.unsafe(
		`SELECT 1 FROM "${table}" WHERE section_tipo = $1 AND section_id = $2 LIMIT 1`,
		[sectionTipo, sectionId],
	)) as unknown[];
	return rows.length > 0;
}

/** The lowest-numbered record of a section — the root, by Dédalo's import convention. */
async function lowestRecordId(sectionTipo: string): Promise<number | null> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) return null;
	const rows = (await sql.unsafe(
		`SELECT min(section_id) AS id FROM "${table}" WHERE section_tipo = $1`,
		[sectionTipo],
	)) as { id: number | null }[];
	const id = rows[0]?.id;
	return id === null || id === undefined ? null : Number(id);
}

/** The tld's ontology: the three dd_ontology nodes + the two `<tld>0` node records. */
async function ontologyPresent(tld: string): Promise<{ ok: boolean; detail: string }> {
	const nodes = (await sql.unsafe(
		'SELECT tipo FROM dd_ontology WHERE tipo IN ($1, $2, $3) ORDER BY tipo',
		[`${tld}0`, `${tld}1`, `${tld}2`],
	)) as { tipo: string }[];
	const records = (await sql.unsafe(
		'SELECT section_id FROM matrix_ontology WHERE section_tipo = $1 ORDER BY section_id',
		[`${tld}0`],
	)) as { section_id: number }[];
	const haveNodes = nodes.map((node) => node.tipo);
	const haveRecords = records.map((record) => Number(record.section_id));
	const ok = haveNodes.length === 3 && haveRecords.includes(1) && haveRecords.includes(2);
	return {
		ok,
		detail: ok
			? `${haveNodes.join(', ')} + ${haveRecords.length} node record(s)`
			: `nodes: [${haveNodes.join(', ') || 'none'}], ${tld}0 records: [${haveRecords.join(', ') || 'none'}]`,
	};
}

/** A root locator is OK only when its TARGET RECORD EXISTS (the whole bug, in one line). */
async function rootTermCheck(
	row: RegistryRow | null,
	componentTipo: string,
	targetSectionTipo: string,
): Promise<{ ok: boolean; detail: string }> {
	const current = locator(row, componentTipo);
	if (current === null) {
		return { ok: false, detail: 'not set' };
	}
	const targetTipo = String(current.section_tipo ?? '');
	const targetId = Number(current.section_id);
	if (targetTipo !== targetSectionTipo || !Number.isFinite(targetId)) {
		return { ok: false, detail: `points at ${targetTipo || '?'}/${current.section_id ?? '?'}` };
	}
	if (!(await recordExists(targetTipo, targetId))) {
		return { ok: false, detail: `DANGLING → ${targetTipo}/${targetId} does not exist` };
	}
	return { ok: true, detail: `${targetTipo}/${targetId}` };
}

/**
 * Does a si/no flag locator say YES? Through compareLocators — the locator law (S2-04):
 * section_id is LOOSE-numeric (a stored '05' must match 5), which an inline `===` gets
 * wrong. Matches on the (section_tipo, section_id) pair only; `type` and
 * `from_component_tipo` are shape, not identity, and are checked separately where they
 * matter.
 */
const siNoIsYes = (candidate: Record<string, unknown> | null, yes: boolean): boolean =>
	candidate !== null &&
	compareLocators(
		candidate as never,
		{ section_tipo: SI_NO_SECTION, section_id: yes ? SI_NO_YES : SI_NO_NO } as never,
		['section_tipo', 'section_id'],
	);

/** Is this locator the full, portal-visible shape (bare = invisible to the @> filter)? */
function activeCheck(row: RegistryRow | null): { ok: boolean; detail: string } {
	const current = locator(row, HIERARCHY_ACTIVE);
	if (current === null) return { ok: false, detail: 'not set' };
	if (!siNoIsYes(current, true)) return { ok: false, detail: 'No' };
	if (current.from_component_tipo === undefined) {
		return { ok: false, detail: 'Yes, but the locator is BARE (invisible to the portals)' };
	}
	return { ok: true, detail: 'Yes' };
}

/** Read the full state of ONE hierarchy. Pure — no writes, safe to call on every render. */
export async function inspectHierarchy(sectionId: number): Promise<HierarchyState> {
	const row = await readRegistry(sectionId);
	const checks: HierarchyCheck[] = [];
	const add = (id: HierarchyCheckId, label: string, ok: boolean, detail: string) =>
		checks.push({ id, label, ok, detail });

	if (row === null) {
		add('registry', 'Hierarchy record', false, `${HIERARCHY_SECTION}/${sectionId} not found`);
		return { section_id: sectionId, tld: null, typology: null, usable: false, checks };
	}
	add('registry', 'Hierarchy record', true, `${HIERARCHY_SECTION}/${sectionId}`);

	const rawTld = literal(row, HIERARCHY_TLD).trim().toLowerCase();
	const tld = safeTld(rawTld);
	add('tld', 'TLD', tld !== null, tld ?? `invalid or empty ('${rawTld}')`);

	const typologyLocator = locator(row, HIERARCHY_TYPOLOGY);
	const typology = typologyLocator ? Math.trunc(Number(typologyLocator.section_id)) : 0;
	add(
		'typology',
		'Typology',
		Number.isInteger(typology) && typology >= 1,
		typology >= 1 ? String(typology) : 'not set (provisioning refuses without it)',
	);

	// The source section is OPERATOR DATA, not a constant. hierarchy109 names the REAL
	// section the virtual ones are cloned from; the tool exposes it as an editable field
	// ("Real section tipo"), and a thesaurus hierarchy just happens to use hierarchy20.
	// So the check is "does it name a section that EXISTS", not "is it hierarchy20" —
	// asserting the constant would let `ensure` silently rewrite a hierarchy built on some
	// other section (live: hierarchy1/266 'Exposición' points at `actv1`, which is in no
	// ontology — that record needs an operator, not a rewrite).
	const source = literal(row, HIERARCHY_SOURCE_REAL_SECTION);
	const sourceModel = source === '' ? null : await getModelByTipo(source);
	add(
		'source',
		'Source section',
		sourceModel === 'section',
		source === ''
			? `not set (defaults to ${THESAURUS_SECTION})`
			: sourceModel === 'section'
				? source
				: `'${source}' is not a section (model: ${sourceModel ?? 'unknown tipo'})`,
	);

	const active = activeCheck(row);
	add('active', 'Active', active.ok, active.detail);

	const thesaurusLocator = locator(row, HIERARCHY_ACTIVE_IN_THESAURUS);
	add(
		'thesaurus',
		'Active in thesaurus',
		thesaurusLocator !== null,
		thesaurusLocator === null ? 'not set' : siNoIsYes(thesaurusLocator, true) ? 'Yes' : 'No',
	);

	if (tld === null) {
		// Every remaining check is tld-derived; report them as blocked, not as false negatives.
		for (const [id, label] of [
			['ontology', 'Ontology'],
			['targets', 'Target sections'],
			['root_term', 'General term'],
			['root_model', 'General term model'],
		] as [HierarchyCheckId, string][]) {
			add(id, label, false, 'blocked: no valid TLD');
		}
		return { section_id: sectionId, tld: null, typology, usable: false, checks };
	}

	const ontology = await ontologyPresent(tld);
	add('ontology', 'Ontology', ontology.ok, ontology.detail);

	const target = literal(row, HIERARCHY_TARGET_SECTION);
	const targetModel = literal(row, HIERARCHY_TARGET_SECTION_MODEL);
	const targetsOk = target === `${tld}1` && targetModel === `${tld}2`;
	add(
		'targets',
		'Target sections',
		targetsOk,
		targetsOk ? `${target} / ${targetModel}` : `${target || '—'} / ${targetModel || '—'}`,
	);

	const rootTerm = await rootTermCheck(row, HIERARCHY_GENERAL_TERM, `${tld}1`);
	add('root_term', 'General term', rootTerm.ok, rootTerm.detail);
	const rootModel = await rootTermCheck(row, HIERARCHY_GENERAL_TERM_MODEL, `${tld}2`);
	add('root_model', 'General term model', rootModel.ok, rootModel.detail);

	return {
		section_id: sectionId,
		tld,
		typology,
		usable: checks.every((check) => check.ok),
		checks,
	};
}

/* ----------------------------------------------------------------- writes */

const write = (
	sectionId: number,
	column: 'relation' | 'string',
	tipo: string,
	value: unknown,
): Promise<void> =>
	updateMatrixKeyData(HIERARCHY_MAIN_TABLE, HIERARCHY_SECTION, sectionId, column, tipo, value);

const siNoLocator = (componentTipo: string, yes: boolean) => [
	{
		id: 1,
		type: RELATION_TYPE_LINK,
		section_id: String(yes ? SI_NO_YES : SI_NO_NO),
		section_tipo: SI_NO_SECTION,
		from_component_tipo: componentTipo,
	},
];

/** The canonical root-term locator ITEM (the component's stored value is [this]). */
const rootLocatorItem = (componentTipo: string, targetSectionTipo: string, targetId: number) => ({
	id: 1,
	// dd48 (Child): the general term is the ROOT CHILD of the hierarchy. Nothing
	// resolves ON the type (area/tree.ts keys on section_tipo+section_id only), but
	// PHP's activation and ontology_write both stamp Child — so we stamp Child.
	type: RELATION_TYPE_CHILDREN,
	section_id: String(targetId),
	section_tipo: targetSectionTipo,
	from_component_tipo: componentTipo,
});

/**
 * Give a root term the hierarchy's own NAME (hierarchy5 → e.g. "Albania").
 *
 * A root term is the node every other term in the hierarchy descends from, so an unnamed
 * one shows up as an empty row at the top of the tree — alarming and useless.
 *
 * The term component is NOT hard-coded to hierarchy25: a section declares which of its
 * components carries the term in its `section_map` (`hierarchy52` = the thesaurus map,
 * `{thesaurus: {term: 'hierarchy25', model: 'hierarchy27', …}}`), and a hierarchy built on
 * a real section other than hierarchy20 will name a different one. `getSectionMapValue`
 * already resolves the map through a VIRTUAL section to its real one and applies the scope
 * fallback, so `<tld>1` and `<tld>2` both answer correctly.
 *
 * FILL-ONLY, NEVER OVERWRITE. A root that already carries a term is left exactly as it is —
 * it may be an imported root, or one an operator renamed, and neither is ours to clobber.
 * That is also what makes this safe to run on every ensure (it backfills the roots created
 * before this existed) instead of only at creation.
 *
 * The name is copied VERBATIM from hierarchy5 — every language item it holds — so the root
 * reads "Albania" in English and "Albània" in Catalan, exactly like the hierarchy.
 * Non-fatal by contract: an unnamed root is ugly, not broken.
 */
async function nameRootTerm(
	targetSectionTipo: string,
	rootSectionId: number,
	row: RegistryRow | null,
): Promise<{ named: boolean; error: string | null }> {
	const nameItems = row?.string?.[HIERARCHY_TERM];
	if (!Array.isArray(nameItems) || nameItems.length === 0) {
		return { named: false, error: `the hierarchy has no name (${HIERARCHY_TERM})` };
	}
	const termTipo = await getSectionMapValue(targetSectionTipo, 'thesaurus', 'term');
	if (typeof termTipo !== 'string' || termTipo === '') {
		return {
			named: false,
			error: `no term component in the section_map of '${targetSectionTipo}'`,
		};
	}
	const termModel = await getModelByTipo(termTipo);
	const column = termModel === null ? null : getColumnNameByModel(termModel);
	if (column === null) {
		return {
			named: false,
			error: `no matrix column for the term component '${termTipo}' (${termModel})`,
		};
	}
	const table = await getMatrixTableFromTipo(targetSectionTipo);
	if (table === null) {
		return { named: false, error: `no matrix table for '${targetSectionTipo}'` };
	}

	// Already named? Leave it alone.
	const rows = (await sql.unsafe(
		`SELECT "${column}"->$3 AS term FROM "${table}" WHERE section_tipo = $1 AND section_id = $2`,
		[targetSectionTipo, rootSectionId, termTipo],
	)) as { term: { value?: unknown }[] | null }[];
	const current = rows[0]?.term;
	const hasTerm =
		Array.isArray(current) && current.some((item) => String(item?.value ?? '').trim() !== '');
	if (hasTerm) return { named: false, error: null };

	await updateMatrixKeyData(
		table,
		targetSectionTipo,
		rootSectionId,
		column,
		termTipo,
		structuredClone(nameItems),
	);
	return { named: true, error: null };
}

/**
 * Make `componentTipo` point at a REAL, NAMED root record in `targetSectionTipo`:
 *   - the stored target exists → keep it (re-stamped to the canonical locator shape);
 *   - the section has records  → link its lowest id (the imported root);
 *   - the section is empty     → CREATE the root.
 * Then NAME the root after the hierarchy, if it has no term yet.
 * Never trusts the stored locator, and never hard-codes an id.
 */
async function ensureRootTerm(
	sectionId: number,
	componentTipo: string,
	targetSectionTipo: string,
	row: RegistryRow | null,
): Promise<{ changed: string[]; error: string | null }> {
	const changed: string[] = [];

	// --- 1. resolve the root record ----------------------------------------
	let rootId: number | null = null;
	const current = locator(row, componentTipo);
	const currentId = Number(current?.section_id);
	if (
		current !== null &&
		String(current.section_tipo) === targetSectionTipo &&
		Number.isFinite(currentId) &&
		(await recordExists(targetSectionTipo, currentId))
	) {
		rootId = currentId;
		// Re-stamp the locator: the seed's are dd151 and some are bare. Equality through
		// compareLocators (S2-04 locator law — loose-numeric section_id), over the FULL quad:
		// a locator naming the right record with the wrong type / no from_component_tipo is
		// still the wrong SHAPE.
		const wanted = rootLocatorItem(componentTipo, targetSectionTipo, rootId);
		const same = compareLocators(current as never, wanted as never, [
			'section_tipo',
			'section_id',
			'type',
			'from_component_tipo',
		]);
		if (!same) {
			await write(sectionId, 'relation', componentTipo, [wanted]);
			changed.push(`${componentTipo}: locator normalized`);
		}
	} else {
		const existingRoot = await lowestRecordId(targetSectionTipo);
		if (existingRoot !== null) {
			rootId = existingRoot;
			await write(sectionId, 'relation', componentTipo, [
				rootLocatorItem(componentTipo, targetSectionTipo, rootId),
			]);
			changed.push(`${componentTipo}: linked the existing root ${targetSectionTipo}/${rootId}`);
		} else {
			// The section is empty — mint the root the tree hangs its children on.
			const outcome = await applyAddNewElement(
				[],
				targetSectionTipo,
				componentTipo,
				HIERARCHY_SECTION,
				sectionId,
			);
			if (outcome === null) {
				return {
					changed,
					error: `${componentTipo}: could not create a root in ${targetSectionTipo}`,
				};
			}
			rootId = outcome.sectionId;
			await write(sectionId, 'relation', componentTipo, [
				rootLocatorItem(componentTipo, targetSectionTipo, rootId),
			]);
			changed.push(`${componentTipo}: created the root ${targetSectionTipo}/${rootId}`);
		}
	}

	// --- 2. name it ---------------------------------------------------------
	// Runs on EVERY branch, not just creation: the roots minted before this existed are
	// unnamed, and backfilling them is exactly what an idempotent converge is for. Existing
	// names are never touched (nameRootTerm is fill-only).
	const named = await nameRootTerm(targetSectionTipo, rootId, row);
	if (named.error !== null) {
		// Non-fatal: the root EXISTS and the hierarchy is usable; it is just unnamed.
		changed.push(`${componentTipo}: root left unnamed (${named.error})`);
	} else if (named.named) {
		changed.push(
			`${componentTipo}: named the root ${targetSectionTipo}/${rootId} after the hierarchy`,
		);
	}
	return { changed, error: null };
}

/**
 * Converge ONE hierarchy to the invariant. THE only writer. Idempotent: the second run
 * reports `applied: []`. Safe on a live hierarchy — it never deletes anything.
 */
export async function ensureHierarchy(
	sectionId: number,
	userId: number,
	options: EnsureOptions = {},
): Promise<EnsureResult> {
	const applied: string[] = [];
	const errors: string[] = [];
	const fail = async (msg: string): Promise<EnsureResult> => ({
		result: false,
		msg,
		errors: [...errors, msg],
		state: await inspectHierarchy(sectionId),
		applied,
	});

	let row = await readRegistry(sectionId);
	if (row === null) return fail(`hierarchy record ${HIERARCHY_SECTION}/${sectionId} not found`);

	const tld = safeTld(literal(row, HIERARCHY_TLD).trim().toLowerCase());
	if (tld === null) return fail('the hierarchy has no valid TLD (hierarchy6) — cannot provision');

	const typologyLocator = locator(row, HIERARCHY_TYPOLOGY);
	const typology = typologyLocator ? Math.trunc(Number(typologyLocator.section_id)) : 0;
	if (!Number.isInteger(typology) || typology < 1) {
		return fail('the hierarchy has no typology (hierarchy9) — cannot provision');
	}

	// 1. the template the virtual sections clone. MUST precede provisioning.
	// DEFAULT it when unset — never OVERWRITE it. hierarchy109 is the operator's choice of
	// real section ("Real section tipo" in the tool form); a thesaurus hierarchy uses
	// hierarchy20, but a hierarchy built on another section is legitimate, and rewriting it
	// to the thesaurus template would quietly change what the hierarchy IS. A source that
	// names a non-existent section is an operator error we REFUSE to paper over.
	const currentSource = literal(row, HIERARCHY_SOURCE_REAL_SECTION);
	if (currentSource === '') {
		await write(sectionId, 'string', HIERARCHY_SOURCE_REAL_SECTION, [
			{ id: 1, lang: 'lg-nolan', value: THESAURUS_SECTION },
		]);
		applied.push(`source section set to ${THESAURUS_SECTION}`);
	} else if ((await getModelByTipo(currentSource)) !== 'section') {
		return fail(
			`the source section '${currentSource}' (hierarchy109) is not a section — fix "Real section tipo" first`,
		);
	}

	// 2. the flags. A FULL active locator, or the portals cannot see the hierarchy.
	const active = activeCheck(row);
	if (options.activate !== false && !active.ok) {
		await write(sectionId, 'relation', HIERARCHY_ACTIVE, siNoLocator(HIERARCHY_ACTIVE, true));
		applied.push('flagged active');
	}
	const thesaurusLocator = locator(row, HIERARCHY_ACTIVE_IN_THESAURUS);
	const wantThesaurus =
		options.activeInThesaurus ??
		(thesaurusLocator === null ? true : siNoIsYes(thesaurusLocator, true));
	if (
		thesaurusLocator === null ||
		!siNoIsYes(thesaurusLocator, wantThesaurus) ||
		thesaurusLocator.from_component_tipo === undefined
	) {
		await write(
			sectionId,
			'relation',
			HIERARCHY_ACTIVE_IN_THESAURUS,
			siNoLocator(HIERARCHY_ACTIVE_IN_THESAURUS, wantThesaurus),
		);
		applied.push(`active in thesaurus: ${wantThesaurus ? 'Yes' : 'No'}`);
	}

	// 3. the ontology. generateVirtualSection re-reads the record, so the flags above
	// must already be committed — they are (updateMatrixKeyData writes immediately).
	const ontology = await ontologyPresent(tld);
	if (!ontology.ok) {
		const provision = await generateVirtualSection({
			section_tipo: HIERARCHY_SECTION,
			section_id: sectionId,
			userId,
		});
		// "already generated" is the precondition firing on a PARTIAL ontology (e.g. the
		// node records exist but a dd_ontology node was purged). Surface it — a rebuild
		// is the honest fix, and silently proceeding would leave a half-built hierarchy.
		if (!provision.result) {
			return fail(
				provision.msg.includes('already generated')
					? `the ontology of '${tld}' is INCOMPLETE (${ontology.detail}) — use Rebuild`
					: `provisioning failed: ${provision.errors.join('; ')}`,
			);
		}
		applied.push(`provisioned the ontology (${tld}0, ${tld}1, ${tld}2)`);
	}

	// 4. the target sections. generateVirtualSection writes them; when it was skipped
	// (ontology already present) they may still be missing on an older record.
	row = await readRegistry(sectionId);
	if (literal(row, HIERARCHY_TARGET_SECTION) !== `${tld}1`) {
		await write(sectionId, 'string', HIERARCHY_TARGET_SECTION, [
			{ id: 1, lang: 'lg-nolan', value: `${tld}1` },
		]);
		applied.push(`target section set to ${tld}1`);
	}
	if (literal(row, HIERARCHY_TARGET_SECTION_MODEL) !== `${tld}2`) {
		await write(sectionId, 'string', HIERARCHY_TARGET_SECTION_MODEL, [
			{ id: 1, lang: 'lg-nolan', value: `${tld}2` },
		]);
		applied.push(`target model section set to ${tld}2`);
	}

	// 5. the roots — resolve-or-create, never trust the stored locator.
	row = await readRegistry(sectionId);
	for (const [componentTipo, targetSectionTipo] of [
		[HIERARCHY_GENERAL_TERM, `${tld}1`],
		[HIERARCHY_GENERAL_TERM_MODEL, `${tld}2`],
	] as [string, string][]) {
		const outcome = await ensureRootTerm(sectionId, componentTipo, targetSectionTipo, row);
		if (outcome.error !== null) errors.push(outcome.error);
		applied.push(...outcome.changed);
	}

	const state = await inspectHierarchy(sectionId);
	return {
		result: state.usable && errors.length === 0,
		msg: state.usable
			? applied.length === 0
				? 'Already consistent — nothing to do'
				: `Hierarchy '${tld}' is ready`
			: `Hierarchy '${tld}' is still incomplete`,
		errors,
		state,
		applied,
	};
}

/**
 * Tear the tld's ONTOLOGY down and rebuild it. The `<tld>1` TERMS are NOT touched —
 * deleteOntologyByTld only removes the dd_ontology nodes, the ontology_main row and the
 * `<tld>0` node records — so `ensure` relinks the surviving root afterwards.
 */
export async function rebuildHierarchy(
	sectionId: number,
	userId: number,
	deleteRecord: (sectionTipo: string, sectionId: number) => Promise<unknown>,
	options: EnsureOptions = {},
): Promise<EnsureResult> {
	const row = await readRegistry(sectionId);
	const tld = safeTld(literal(row, HIERARCHY_TLD).trim().toLowerCase());
	if (row === null || tld === null) {
		return {
			result: false,
			msg: 'cannot rebuild: the hierarchy record has no valid TLD',
			errors: ['invalid tld'],
			state: await inspectHierarchy(sectionId),
			applied: [],
		};
	}
	const teardown = await deleteOntologyByTld(tld, deleteRecord);
	if (!teardown.result) {
		return {
			result: false,
			msg: `teardown of '${tld}' failed — nothing was rebuilt`,
			errors: teardown.errors,
			state: await inspectHierarchy(sectionId),
			applied: [],
		};
	}
	const ensured = await ensureHierarchy(sectionId, userId, options);
	return {
		...ensured,
		applied: [`tore down the ontology of '${tld}'`, ...ensured.applied],
	};
}

/** Every hierarchy1 record's state — the maintenance overview. */
export async function inspectAllHierarchies(): Promise<HierarchyState[]> {
	const rows = (await sql.unsafe(
		`SELECT section_id FROM "${HIERARCHY_MAIN_TABLE}" WHERE section_tipo = $1 ORDER BY section_id`,
		[HIERARCHY_SECTION],
	)) as { section_id: number }[];
	const states: HierarchyState[] = [];
	for (const row of rows) {
		states.push(await inspectHierarchy(Number(row.section_id)));
	}
	return states;
}
