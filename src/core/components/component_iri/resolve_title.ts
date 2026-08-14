/**
 * component_iri::resolve_title — ONE definition of the label rule.
 *
 * ORACLE: v6 core/component_iri/class.component_iri.php:518-547. The published
 * title of an iri item is its LABEL DATAFRAME (the dd560 frame paired to the
 * item), resolved to the frame target's label component — NOT the `title` key
 * stored beside the iri.
 *
 *     $dataframe_label = $component_dataframe_label->get_value();   // :540
 *     $title = $dataframe_label ?? $value->title ?? null;           // :543
 *
 * THE `??` NEVER FALLS THROUGH, and that is the whole subtlety. `get_value()`
 * returns the EMPTY STRING (not null) when the item has no frame — measured
 * against the live v6 install on a record whose id_key pairs with nothing:
 *
 *     resolve_title({id:99, title:'STORED TITLE'})  =>  ""      (not 'STORED TITLE')
 *
 * so `'' ?? $value->title` is `''`, and both callers' `!empty($current_title)`
 * gate then drops it. The stored `title` is therefore DEAD on every resolved
 * path: an item with no frame publishes its iri alone. The ":542 fallback to
 * data item value (old values)" comment in v6 describes an intent the code does
 * not implement. Reading `title` as a fallback publishes a stale string that v6
 * never emits, which is exactly the bug this module exists to prevent — the
 * diffusion resolver shipped it briefly before this was measured.
 *
 * WHAT LIVES HERE vs WHAT DOES NOT: this module owns the RULE — which frames
 * pair with which item, which components carry the label, and the fact that no
 * label means no title. It does NOT own the FIELD ORDER, because that belongs
 * to the caller and the two v6 callers disagree:
 *
 *   get_diffusion_value (:672-692)  →  "title, iri"   (publication)
 *   get_grid_value      (:466-483)  →  "iri, title"   (grid / tool_export)
 *
 * Nor does it own record I/O: each caller has its own loading seam (the export
 * path's parity `opts.loadRecord`, the diffusion resolver's run-scoped record
 * cache), so the label READ is injected as `readLabel`.
 */

import type { MatrixRecord } from '../../db/matrix.ts';
import { getNode } from '../../ontology/resolver.ts';
import { readComponentItems } from '../../resolve/component_data.ts';
import { getComponentModel } from '../registry.ts';

/** A label frame paired to one iri item. */
export interface IriLabelFrame {
	/** The frame's target record — where the label lives. */
	sectionTipo: string;
	sectionId: number | string;
	/** Components on that record whose values form the label. */
	labelTipos: string[];
	/** The frame component itself (dd560), for provenance/logging. */
	frameTipo: string;
}

/** Reads one frame's label. Null/empty ⇒ the item publishes no title. */
export type IriLabelReader = (frame: IriLabelFrame) => Promise<string | null>;

/**
 * The label components a frame node declares — its own
 * `source.request_config[].show.ddo_map` (dd560 declares dd1715).
 *
 * The frame tipo itself comes from the component descriptor
 * (`fixedDataframeTipos`, mirroring PHP's hardcoded
 * DEDALO_COMPONENT_IRI_LABEL_DATAFRAME constant), so neither tipo is spelled
 * out here. Both are `dd`-tld core nodes and stable across installs; reading
 * them from the ontology is not portability insurance, it is having one place
 * that knows the answer. `getNode` is memoized.
 */
async function frameLabelTipos(frameTipo: string): Promise<string[]> {
	const properties = (await getNode(frameTipo))?.properties as
		| { source?: { request_config?: { show?: { ddo_map?: { tipo?: unknown }[] } }[] } }
		| null
		| undefined;
	const tipos: string[] = [];
	for (const config of properties?.source?.request_config ?? []) {
		collectDdoTipos(config, tipos);
	}
	return tipos;
}

/** One request_config's shown ddo tipos, appended in order, deduplicated. */
function collectDdoTipos(
	config: { show?: { ddo_map?: { tipo?: unknown }[] } },
	into: string[],
): void {
	for (const ddo of config.show?.ddo_map ?? []) {
		if (typeof ddo.tipo === 'string' && !into.includes(ddo.tipo)) into.push(ddo.tipo);
	}
}

/**
 * The label frames of one component_iri on one record, keyed by the STORED ITEM
 * ID they pair with (v6 `section_id_key` = `$value->id`).
 *
 * A frame belongs to this component only when its `main_component_tipo` says
 * so: one relation-column slice holds the frames of every main that declares
 * the same frame node.
 */
export async function iriLabelFrames(
	record: MatrixRecord,
	iriTipo: string,
): Promise<Map<string, IriLabelFrame>> {
	const frames = new Map<string, IriLabelFrame>();
	for (const frameTipo of getComponentModel('component_iri')?.fixedDataframeTipos ?? []) {
		for (const [idKey, frame] of await framesOfTipo(record, frameTipo, iriTipo)) {
			frames.set(idKey, frame);
		}
	}
	return frames;
}

/** This component's frames stored under ONE frame node. @see iriLabelFrames */
async function framesOfTipo(
	record: MatrixRecord,
	frameTipo: string,
	iriTipo: string,
): Promise<Map<string, IriLabelFrame>> {
	const frames = new Map<string, IriLabelFrame>();
	const stored = readComponentItems(record, frameTipo, 'component_dataframe') ?? [];
	if (stored.length === 0) return frames;
	const labelTipos = await frameLabelTipos(frameTipo);
	if (labelTipos.length === 0) return frames;
	for (const item of stored) {
		const paired = pairedFrame(item, iriTipo, labelTipos, frameTipo);
		if (paired !== null) frames.set(paired.idKey, paired.frame);
	}
	return frames;
}

/**
 * One stored dataframe item, read as this component's label frame — or `null`
 * when it is not one.
 *
 * Extracted from the loop above rather than inlined: every line of it is a
 * GUARD, and a guard chain inside a nested loop is what put that function at
 * cyclomatic 15, over the ratchet's cap for a new file
 * (`engineering/crap_complexity_baseline.json`). The guards are unchanged and in
 * the same order — a stored frame is only ours when its `main_component_tipo`
 * names this component, and every locator field must be present and of the right
 * type before it can be trusted.
 */
function pairedFrame(
	item: unknown,
	iriTipo: string,
	labelTipos: string[],
	frameTipo: string,
): { idKey: string; frame: IriLabelFrame } | null {
	if (item === null || typeof item !== 'object') return null;
	const entry = item as Record<string, unknown>;
	if (entry.main_component_tipo !== iriTipo) return null;
	const locator = frameLocator(entry);
	if (locator === null) return null;

	return {
		idKey: locator.idKey,
		frame: {
			sectionTipo: locator.sectionTipo,
			sectionId: locator.sectionId,
			labelTipos,
			frameTipo,
		},
	};
}

/** A dataframe id: v6 wrote both, so both are accepted, and neither is coerced here. */
function isIdLike(value: unknown): value is number | string {
	return typeof value === 'number' || typeof value === 'string';
}

/**
 * The three stored fields that address the frame's record, validated together —
 * they are one fact, and reading them as one is what keeps `pairedFrame` under
 * the complexity cap. `id_key` is stringified because it is a Map key upstream;
 * `section_id` is NOT, because it is a locator field (WC-2026-08-10: section_id
 * stays the type it was stored as).
 */
function frameLocator(
	entry: Record<string, unknown>,
): { sectionTipo: string; sectionId: number | string; idKey: string } | null {
	const sectionTipo = entry.section_tipo;
	const sectionId = entry.section_id;
	const idKey = entry.id_key;
	if (typeof sectionTipo !== 'string' || !isIdLike(sectionId) || !isIdLike(idKey)) return null;

	return { sectionTipo, sectionId, idKey: String(idKey) };
}

/**
 * Resolved title per stored item id. An id is ABSENT from the map when the item
 * has no frame or the frame resolves to nothing — meaning "publish no title",
 * which is v6's behaviour and NOT the same as falling back to `item.title`.
 *
 * Callers place the resulting title in their own field order and never consult
 * the stored `title` themselves.
 */
export async function resolveIriTitles(
	record: MatrixRecord,
	iriTipo: string,
	readLabel: IriLabelReader,
): Promise<Map<string, string>> {
	const titles = new Map<string, string>();
	for (const [idKey, frame] of await iriLabelFrames(record, iriTipo)) {
		const label = await readLabel(frame);
		// v6's !empty() gate: an empty label is no label.
		if (label !== null && label !== '') titles.set(idKey, label);
	}
	return titles;
}
