/**
 * SECTION — the main structure of Dédalo (spec engineering/SECTION_SPEC.md §2, §3).
 *
 * A section is the definition of a data schema — the analogue of an SQL table:
 * a named set of fields (components), defined in the ontology (model 'section'),
 * organized by hierarchy relations. It is instantiated as a section_record
 * (section_record.ts) under a section_id that, combined with the section_tipo,
 * is the base of every locator (locator.ts).
 *
 * A section node's ontology children partition into FIVE families, dispatched
 * by model (SECTION_SPEC §2):
 *   - Fields        component_*                     the data schema
 *   - Groupers      section_group/section_group_div/section_tab/tab   edit-DOM organizers
 *   - List-defs     section_list/relation_list/indexation_list/
 *                   time_machine_list/section_list_thesaurus           per-view selections
 *   - Buttons       button_*                        action definitions
 *   - Markers       section_map                     role→component-tipo map per scope
 *
 * Section is a PEER of component_portal in the resolution machinery: it uses the
 * same structure-context build and the same subdatum expansion (subdatum.ts).
 *
 * PHP reference: core/section/class.section.php. The primary ontology-traversal
 * entry point is get_ar_children_tipo_by_model_name_in_section (:868); the
 * traversal law (doc :824-835) is encoded in TRAVERSAL_RECURSES_MODELS below.
 *
 * WHERE THE ENGINE LIVES: this module is the PURE contract home — the family
 * partition, the grouper registry, the traversal law, and the Activity special
 * cases. The I/O-bearing engine (children-by-model queries, virtual resolution,
 * context build, permissions) lives in src/core/section/ (section.ts, context.ts,
 * buttons.ts, groupers.ts, read.ts), and the section context stamping lives in
 * src/core/section/context.ts (invoked from resolve/structure_context.ts).
 */

/**
 * The grouper models (PHP common::$groupers, class.common.php:457-462). Groupers
 * organize components in EDIT mode; components are ontology children of the
 * grouper. List mode drops them from the show map.
 */
export const GROUPER_MODELS: readonly string[] = [
	'section_group',
	'section_group_div',
	'section_tab',
	'tab',
];

/**
 * Legacy grouper alias (PHP common::$ar_temp_map_models, class.common.php:430):
 * section_group_div renders as a section_group (with add_label=false, :3892).
 */
export const GROUPER_MODEL_ALIASES: Readonly<Record<string, string>> = {
	section_group_div: 'section_group',
};

/** True when a model is a grouper (either canonical or legacy alias). */
export function isGrouperModel(model: string): boolean {
	return GROUPER_MODELS.includes(model);
}

/**
 * The five list-definition models (SECTION_SPEC §7). Each is a first-level
 * section child that DEFINES which components resolve in a given view — it holds
 * no records of its own.
 */
export const LIST_DEFINITION_MODELS: readonly string[] = [
	'section_list',
	'relation_list',
	'indexation_list',
	'time_machine_list',
	'section_list_thesaurus',
];

/**
 * The traversal law (PHP get_ar_children_tipo_by_model_name_in_section,
 * class.section.php:955-976): a requested model name CONTAINING 'component'
 * recurses through groupers to find components; other models are first-level
 * only; when more than one model name is requested the traversal is always
 * recursive. Encode as: recurse when any requested model contains 'component'
 * OR more than one model is requested.
 */
export function traversalRecurses(requestedModels: readonly string[]): boolean {
	if (requestedModels.length > 1) return true;
	return requestedModels.some((model) => model.includes('component'));
}

/**
 * The audit component tipos every section stamps (PHP section::get_metadata_
 * definition_tipos, class.section.php:1866). created_* on new_record,
 * modified_* on update_record (section_record::build_modification_data :1622/:1636).
 */
export const AUDIT_TIPOS = {
	createdByUser: 'dd200',
	createdDate: 'dd199',
	modifiedByUser: 'dd197',
	modifiedDate: 'dd201',
} as const;

/**
 * The Activity section (dd542) is special-cased throughout PHP: create refused
 * (section:452), permissions capped at 1 (:1929), save blocked except search_*
 * ids (dd_core_api:1330), modification_data skipped (section_record:1584). The
 * TS engine must honor every one of these.
 */
export const ACTIVITY_SECTION_TIPO = 'dd542';

/** Max permission the Activity section ever grants a caller (PHP :1929). */
export const ACTIVITY_SECTION_PERMISSION_CAP = 1;

/** The Time Machine section (dd15) — the audit-history log, consultation-only. */
export const TIME_MACHINE_SECTION_TIPO = 'dd15';

/**
 * The BULK PROCESS section (dd800) and its two descriptive components (PHP
 * dd_tipos.php DEDALO_BULK_PROCESS_*). One record per bulk run (a CSV import,
 * a component propagation); every TM row the run writes carries its section_id
 * in matrix_time_machine.bulk_process_id, which is what lets the Time Machine
 * revert a whole import as ONE operation instead of row by row.
 */
export const BULK_PROCESS_TIPOS = {
	section: 'dd800',
	/** Human label of the run (component_input_text). */
	label: 'dd796',
	/** Source file name of the run (component_input_text). */
	file: 'dd797',
} as const;

/**
 * CONSULTATION-ONLY (read-only) sections — records a user may READ but NEVER
 * modify: the system logs (Activity dd542, Time Machine dd15) and any future
 * section that must be strictly read-only. This is the SINGLE source of truth;
 * to make a new section consultation-only, add its tipo here.
 *
 * Read-only is enforced at two independent layers, both keyed on this set:
 *   1. SECTION-level permission cap — getSectionPermissions (permissions.ts)
 *      caps the level at read (1), so the create/duplicate/delete API gates
 *      (which require the section-level level >= 2) refuse, AND the client
 *      renders the section read-only (its `disabled_component` path fires when
 *      the emitted permission < 2). No client change is needed.
 *   2. Write-ENGINE backstops — createSectionRecord / duplicateSectionRecord /
 *      deleteSectionRecord|Data / saveComponentData hard-refuse a write to
 *      these sections regardless of any component-level grant. This is the belt
 *      to the permission suspenders and covers EVERY write door in one place
 *      (client API, MCP tools, agent change-plan, and any future caller).
 *
 * PHP parity: dd15 (common::get_permissions admin-only, class.common.php:627)
 * and dd542 (section::get_section_permissions cap :1929 + the dd_core_api save
 * refusal :1330 + the section::create_record refusal :452). The
 * consultation_only_sections_tripwire test pins this invariant.
 *
 * NOTE (deliberate hardening, documented in engineering/WIRE_CONTRACT.md): PHP gates
 * duplicate/delete on the UNcapped common::get_permissions, so a misconfigured
 * profile that granted level >= 2 on one of these sections could delete/copy a
 * record in the oracle. The TS engine backstops close that hole — strictly
 * safer, observably identical under normal data (no profile grants these write).
 */
export const CONSULTATION_ONLY_SECTIONS: ReadonlySet<string> = new Set([
	TIME_MACHINE_SECTION_TIPO, // dd15
	ACTIVITY_SECTION_TIPO, // dd542
]);

/** True when a section is consultation-only (read-only for every caller). */
export function isConsultationOnlySection(sectionTipo: string): boolean {
	return CONSULTATION_ONLY_SECTIONS.has(sectionTipo);
}
