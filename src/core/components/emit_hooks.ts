/**
 * COMPONENT EMIT-HOOK REGISTRY (audit S2-24) — the per-model emit-time
 * dispatch of the shared emission path (section/read.ts emitDdoData).
 *
 * A descriptor names its hook as DATA (`emitHook: 'media'` — see
 * components/types.ts EmitHookId); THIS map is the only place the binding
 * becomes behavior, and the implementations live in the models' component
 * homes (component_info/emit.ts, …) or their engine home (media/
 * component_emit.ts for the shared media family). Same pattern as
 * relations/registry.ts RESOLVER_IMPLEMENTATIONS: the static imports here are
 * safe because no hook module imports this registry or section/read.ts back
 * (the SCC tripwire enforces it).
 *
 * Hook surface (all optional — a hook declares only what it needs):
 * - `emitItem`: fully OWNS the ddo's emission (media, section_id) — the
 *   generic path returns after calling it;
 * - `transformValue`: adjusts the resolved literal value before the item
 *   builds (info live-compute fallback, text_area list truncation);
 * - `decorateItem`: decorates the built literal item before it is pushed
 *   (filter_records datalist backstop, security_access ACL payload,
 *   text_area's unconditional fallback_value key).
 */

import type { Ddo } from '../concepts/ddo.ts';
import type { MatrixRecord } from '../db/matrix.ts';
import { mediaEmitHook } from '../media/component_emit.ts';
import type { DataItem, EmissionContext } from '../resolve/component_data.ts';
import { filterRecordsEmitHook } from './component_filter_records/emit.ts';
import { infoEmitHook } from './component_info/emit.ts';
import { sectionIdEmitHook } from './component_section_id/emit.ts';
import { securityAccessEmitHook } from './component_security_access/emit.ts';
import { textAreaEmitHook } from './component_text_area/emit.ts';
import { getComponentModel } from './registry.ts';
import type { EmitHookId } from './types.ts';

/** Everything a hook may need from the emission point (a slice of emitDdoData's state). */
export interface EmitHookContext {
	/** The ddo being resolved. */
	ddo: Ddo;
	/** The host record. */
	record: MatrixRecord;
	/** The host row identity. */
	row: { section_tipo: string; section_id: number };
	/** Canonical model of the ddo (post alias map). */
	model: string;
	/** Effective mode of THIS ddo (ddo.mode ?? the request default). */
	ddoMode: string;
	/** Instance lang of THIS ddo (nolan-forced for non-translatables). */
	ddoLang: string;
	/** The request-level default mode. */
	defaultMode: string;
	/** The request-level default lang. */
	defaultLang: string;
	/** The calling element (section or component) — parent_tipo stamp. */
	callerTipo: string;
	/** The per-read emission context: items array + stamp ledger (S2-29). */
	emission: EmissionContext;
}

/** One model's emit-time particularity (see the module doc for the surface). */
export interface ComponentEmitHook {
	emitItem?(context: EmitHookContext): Promise<void>;
	transformValue?(
		value: unknown[] | null,
		context: EmitHookContext,
	): Promise<unknown[] | null> | unknown[] | null;
	decorateItem?(item: DataItem, context: EmitHookContext): Promise<void> | void;
}

/** Hook-ID → implementation (see the module doc). */
const EMIT_HOOKS: Readonly<Record<EmitHookId, ComponentEmitHook>> = {
	section_id: sectionIdEmitHook,
	media: mediaEmitHook,
	info: infoEmitHook,
	text_area: textAreaEmitHook,
	filter_records: filterRecordsEmitHook,
	security_access: securityAccessEmitHook,
};

/** The emit hook a model's descriptor declares, or undefined (generic path). */
export function getEmitHook(model: string): ComponentEmitHook | undefined {
	const hookId = getComponentModel(model)?.emitHook;
	return hookId === undefined ? undefined : EMIT_HOOKS[hookId];
}
