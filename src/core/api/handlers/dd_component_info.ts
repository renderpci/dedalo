/**
 * dd_component_info handlers (PHP core/api/v1/common/class.dd_component_info.php,
 * API_ACTIONS = ['get_widget_data'] — SEC-024 allowlist).
 *
 * The single-widget compute channel of the component_info framework: the
 * byte-identical client's widget_common.js build(autoload=true) POSTs
 * {action:'get_widget_data', dd_api:'dd_component_info', source:{tipo,
 * section_tipo, section_id, mode}, options:{widget_name}} — the delivery
 * path for ASYNC widgets (user_activity) and any lazily-built widget slot.
 *
 * PHP contract preserved: failures ride as HTTP 200 + {result:false,
 * msg:[…], errors:[]} with the PHP message bytes; success is
 * {result: widget_data, msg:'OK. Request done successfully', errors:[]}.
 * TS is STRONGER on one axis (spec §3 permits stronger only): the record is
 * AUTHZ-01 gated via principalCanAccessRecord before any compute — PHP
 * computes for any coordinates a logged-in user names.
 */

import { getNode } from '../../ontology/resolver.ts';
import { currentDataLang } from '../../resolve/request_lang.ts';
import type { ActionHandler } from '../handler_context.ts';
import { requirePrincipal } from '../handler_context.ts';

interface WidgetDefWire {
	widget_name?: string;
	path?: string;
	ipo?: unknown[];
}

/** dd_component_info action handlers, keyed by action (registered in dispatch.ts). */
export const componentInfoApiActions: Record<string, ActionHandler> = {
	get_widget_data: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const source = (rqo.source ?? {}) as {
			tipo?: unknown;
			section_tipo?: unknown;
			section_id?: unknown;
			mode?: unknown;
		};
		const options = (rqo.options ?? {}) as { widget_name?: unknown };
		const tipo = String(source.tipo ?? '');
		const sectionTipo = String(source.section_tipo ?? '');
		const sectionId = source.section_id as number | string;
		const mode = String(source.mode ?? 'list');
		const widgetName = String(options.widget_name ?? '');

		// AUTHZ-01 (TS-stronger): a widget computes OVER a record — gate the
		// record like every other door reading by (tipo, id).
		const { principalCanAccessRecord } = await import('../../security/record_scope.ts');
		if (!(await principalCanAccessRecord(sectionTipo, Number(sectionId), principal))) {
			return {
				status: 200,
				body: { result: false, msg: [' Forbidden record'], errors: ['forbidden'] },
			};
		}

		// The component's ontology widget definitions (PHP resolves the instance
		// in mode 'list' / lang NOLAN — only properties are needed here).
		const node = await getNode(tipo);
		const widgets = (node?.properties as { widgets?: WidgetDefWire[] } | null)?.widgets;
		if (!Array.isArray(widgets) || widgets.length === 0) {
			// PHP: ' Empty defined widgets for dd_component_info : <label> [<tipo>] <widgets>'
			const { termByTipo } = await import('../../ontology/labels.ts');
			const { currentApplicationLang } = await import('../../resolve/request_lang.ts');
			const label = await termByTipo(tipo, currentApplicationLang());
			return {
				status: 200,
				body: {
					result: false,
					msg: [` Empty defined widgets for dd_component_info : ${label} [${tipo}] `],
					errors: [],
				},
			};
		}

		// PHP array_find by widget_name — first match.
		const widgetDef = widgets.find((widget) => widget.widget_name === widgetName);
		if (widgetDef === undefined) {
			return {
				status: 200,
				body: {
					result: false,
					msg: [` Empty widget_obj for widget ${widgetName}`],
					errors: [],
				},
			};
		}

		// Registry compute (fail-loud on unknown/unported — the dispatch
		// Throwable catch degrades those to the client's result:false envelope).
		// This channel computes ASYNC widgets too: it is their only delivery.
		const { getInfoWidget, widgetComputeData } = await import(
			'../../components/component_info/widgets/registry.ts'
		);
		const descriptor = getInfoWidget(widgetName);
		const ipo = Array.isArray(widgetDef.ipo) ? widgetDef.ipo : [];
		const widgetData = await widgetComputeData(descriptor)(ipo, {
			sectionTipo,
			sectionId,
			mode,
			lang: currentDataLang(),
			userId: principal.userId,
			isAdmin: principal.isGlobalAdmin,
		});

		return {
			status: 200,
			body: { result: widgetData, msg: 'OK. Request done successfully', errors: [] },
		};
	},
};
