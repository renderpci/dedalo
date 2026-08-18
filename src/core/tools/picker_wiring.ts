/**
 * TOOL PICKER WIRING — which ddo_map ROLE publishes picks into which other
 * role, per tool.
 *
 * WHY IT EXISTS. A tool's `properties.tool_config.<tool>.ddo_map` wires a whole
 * working surface: a transcription, a media player, status controls, an
 * inverse-reference list, a thesaurus, and — in some tools — a SECTION the
 * operator picks records from, published into a relation component that stores
 * the links. Only that last pair is a link declaration. The map itself does not
 * say which pair it is; the tool's own JS does, statically, in a handful of
 * `linker` wirings — two spellings, both live: the direct assignment
 * (`tool_indexation.js:501` `people_section.linker = self.indexing_component`,
 * and `:753` for the lazy path) and `attach_picker`'s `linker` option
 * (`tool_indexation.js:526`, `tool_cataloging.js:316`). The table below is
 * TOTAL over them, including the pairs that grant nothing — see the entries.
 *
 * The write door needs that fact: `relations/picker_constraint.ts` reads it to
 * decide whether a tool-declared section is a legitimate target of a caller
 * whose own request_config never names it (WC-2026-08-14-…-target-validation,
 * addendum 2026-08-17). Deriving it instead by CROSS-PRODUCT — every section in
 * a map becomes a target of every relation component in it — over-grants: the
 * live tool_indexation map would hand its people section to
 * `references_component` (rsc1368), a display surface no pick ever reaches, and
 * a forged save could then park a person locator there. A guess that widens a
 * write gate is not an answer; the wiring is a FACT, so it is declared.
 *
 * THE JS REMAINS THE BEHAVIOUR. This table does not drive the client — it
 * MIRRORS it, and `test/unit/tool_picker_wiring_tripwire.test.ts` fails when the
 * two disagree in either direction (a `linker` wiring in either spelling with no
 * entry here, or an entry naming a role the tool's JS never wires). Adding a
 * picker to a tool is therefore two lines that CI keeps married, never a silent
 * grant and never a silent refusal.
 *
 * A tool absent from this table declares no picker link — the ordinary case,
 * and the safe one: its caller keeps exactly the targets its own request_config
 * resolves.
 */

/** One declared pair inside a tool's ddo_map. */
export interface ToolPickerWiring {
	/** The role browsed for records (a `model: 'section'` ddo). */
	readonly sourceRole: string;
	/** The role the picks are published into (a relation component). */
	readonly linkerRole: string;
}

export const TOOL_PICKER_WIRING: Readonly<Record<string, readonly ToolPickerWiring[]>> = {
	tool_indexation: [
		// tool_indexation.js:501 (eager) / :753 (lazy) — the people picker, and
		// the ONE pair that produces a grant on a live install (rsc197 → rsc860).
		{ sourceRole: 'people_section', linkerRole: 'indexing_component' },
		// tool_indexation.js:526 — the thesaurus panel, wired into the same
		// component through attach_picker's `linker` option. Declared because it
		// IS a wiring (the tripwire reads both spellings), not because it grants:
		// an `area_thesaurus` ddo is an area, never a `model: 'section'` source,
		// so the index pairs nothing for it. A thesaurus target is already named
		// by the caller's own request_config, which is why nothing was missing.
		{ sourceRole: 'area_thesaurus', linkerRole: 'indexing_component' },
	],
	// tool_cataloging.js:316 — the same options shape, same roles. Also
	// grant-free today for the same reason (its source role is the area), and
	// no live install carries a `tool_config.tool_cataloging` at all. Declared
	// so the table stays TOTAL over the tree's real wirings: an undeclared one
	// is how a picker silently starts refusing the day someone configures it.
	tool_cataloging: [{ sourceRole: 'area_thesaurus', linkerRole: 'indexing_component' }],
};
