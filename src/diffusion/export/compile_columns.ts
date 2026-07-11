/**
 * compileExportPlan — the SECOND schema front-end of the diffusion plan
 * compiler (DIFFUSION_SPEC §6, DIFFUSION_PLAN D8/P6): an ar_ddo_to_export
 * column set → PublicationPlan.
 *
 * Each export column (a ddo whose `path` lists {section_tipo, component_tipo,
 * model, name} steps, user/DOM order) compiles to ONE FieldPlan:
 * - sourceChain re-expresses the path as shared ResolveSteps — every
 *   non-terminal step is a 'relation-hop', the terminal step a 'component'
 *   (even for relation models: the export projection decides leaf expansion),
 *   with PHP resolve_chain parent linkage (step.parent = previous step tipo);
 * - models resolve through the ontology (getModelByTipo) with the declared
 *   ddo model as fallback — the same formula the legacy walker applied at
 *   runtime, hoisted to compile time;
 * - NO parser transforms, NO SQL identifier chokepoint (export column keys
 *   are NDJSON protocol identities like 'numisdata6_numisdata16', they never
 *   reach a SQL string), NO policies;
 * - export-specific metadata rides FieldPlan.exportColumn (ExportColumnMeta,
 *   the ONE additive plan-type extension of P6): the ar_ddo_to_export ordinal
 *   (column identity = user DOM order — a skipped/invalid ddo still consumes
 *   its ordinal, exactly like the legacy `index` loop), the VERBATIM ddo path
 *   (the protocol col line's `path` payload), and the effective
 *   value_with_parents flag (request global || per-ddo; inert in TS — the
 *   legacy path never implemented it — carried for the ledgered PHP feature).
 *
 * INVALID steps are kept, not dropped: a step without component_tipo compiles
 * with tipo '' and the walk/projection reproduce the legacy per-branch skip
 * predicates byte-for-byte (value keys off the FIRST step, dedalo_raw off the
 * LAST — they disagree on partially-invalid paths, deliberately).
 */

import { getModelByTipo } from '../../core/ontology/resolver.ts';
import type { FieldPlan, PublicationPlan, ResolveStep } from '../plan/types.ts';

/** One raw ar_ddo_to_export entry (client wire shape, verbatim). */
export interface ExportDdoInput {
	path?: {
		section_tipo?: string;
		component_tipo?: string;
		model?: string;
		name?: string;
		[extra: string]: unknown;
	}[];
	/** Per-column parents checkbox (render_tool_export.js PARENTS_MODEL gate). */
	value_with_parents?: boolean;
	[extra: string]: unknown;
}

export interface CompileExportOptions {
	/** The request-global value_with_parents checkbox. */
	valueWithParents?: boolean;
}

/**
 * Compile one export request's column set into a PublicationPlan (one
 * SectionPlan for the target section, one FieldPlan per export ddo).
 */
export async function compileExportPlan(
	arDdoToExport: ExportDdoInput[],
	targetSectionTipo: string,
	options: CompileExportOptions = {},
): Promise<PublicationPlan> {
	const fields: FieldPlan[] = [];

	for (let ordinal = 0; ordinal < arDdoToExport.length; ordinal++) {
		const ddo = arDdoToExport[ordinal];
		const path = Array.isArray(ddo?.path) ? ddo.path : [];

		const sourceChain: ResolveStep[] = [];
		let parentTipo: string | undefined;
		for (let position = 0; position < path.length; position++) {
			const rawStep = path[position] ?? {};
			const tipo = typeof rawStep.component_tipo === 'string' ? rawStep.component_tipo : '';
			const model =
				(tipo === '' ? null : await getModelByTipo(tipo)) ?? String(rawStep.model ?? '');
			const sectionTipo =
				typeof rawStep.section_tipo === 'string' && rawStep.section_tipo !== ''
					? rawStep.section_tipo
					: '';
			const isLeaf = position === path.length - 1;
			const step: ResolveStep = isLeaf
				? { kind: 'component', tipo, model, sectionTipo }
				: { kind: 'relation-hop', tipo, model, sectionTipo };
			if (parentTipo !== undefined) step.parent = parentTipo;
			sourceChain.push(step);
			parentTipo = tipo;
		}

		const firstRaw = path[0] ?? {};
		const columnName = `${String(firstRaw.section_tipo ?? targetSectionTipo)}_${String(firstRaw.component_tipo ?? '')}`;
		const leafModel =
			sourceChain[sourceChain.length - 1]?.kind === 'system'
				? ''
				: ((sourceChain[sourceChain.length - 1] as { model?: string } | undefined)?.model ?? '');

		const field: FieldPlan = {
			id: `export_${ordinal}`,
			columnName,
			sourceChain,
			transform: [],
			column: { fieldModel: leafModel },
			policy: {},
			exportColumn: {
				ordinal,
				path: path as Record<string, unknown>[],
			},
		};
		const effectiveParents = options.valueWithParents === true || ddo?.value_with_parents === true;
		if (effectiveParents && field.exportColumn !== undefined) {
			field.exportColumn.valueWithParents = true;
		}
		fields.push(field);
	}

	return {
		planId: `export:${targetSectionTipo}`,
		elementTipo: `tool_export:${targetSectionTipo}`,
		format: 'export',
		serviceName: null,
		target: { kind: 'files', serviceName: 'tool_export' },
		sections: [
			{
				sectionTipo: targetSectionTipo,
				tableName: targetSectionTipo,
				tableTipo: targetSectionTipo,
				fields,
			},
		],
		recursion: { maxLevels: 0 },
		langPolicy: { langs: [], mainLang: null },
		warnings: [],
	};
}
