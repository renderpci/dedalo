/**
 * tool_pdf_extractor server module — extract text/html from a record's PDF.
 *
 * Read-only. The declarative 'record' gate asserts level>=1 on the SECTION plus
 * the caller's per-record projects scope; PHP asserts on the (section_tipo,
 * component_tipo) PAIR instead (assert_tipo_permission(…, 1)), which a
 * section-level check does not imply when the component carries its own dd774
 * grant. Both halves are enforced here — the declarative gate for the record,
 * the handler for the component pair.
 */

import { resolveMediaToolContext } from '../../../src/core/media/tool_support.ts';
import { extractPdfCore } from '../../../src/core/media/tools/pdf_extract.ts';
import { getPermissions } from '../../../src/core/security/permissions.ts';
import type {
	ToolActionContext,
	ToolResponse,
	ToolServerModule,
} from '../../../src/core/tools/module.ts';

async function getPdfData(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const method = ctx.options.method === 'html' ? 'html' : 'text';
		if (ctx.options.method !== 'text' && ctx.options.method !== 'html') {
			return { result: false, msg: "method must be 'text' or 'html'", errors: ['bad method'] };
		}
		// PHP assert_tipo_permission(section_tipo, component_tipo, 1).
		const componentTipo = String(ctx.options.tipo ?? ctx.options.component_tipo ?? '');
		const sectionTipo = String(ctx.options.section_tipo ?? '');
		if (
			componentTipo === '' ||
			sectionTipo === '' ||
			(await getPermissions(ctx.principal, sectionTipo, componentTipo)) < 1
		) {
			return {
				result: false,
				msg: 'Error. Insufficient permissions on the target component',
				errors: ['unauthorized'],
			};
		}
		const { spec, identity, pathOpts } = await resolveMediaToolContext(ctx.options);
		if (spec.model !== 'component_pdf') {
			return { result: false, msg: 'pdf extractor is pdf-only', errors: ['not a pdf'] };
		}
		const text = await extractPdfCore(spec, identity, pathOpts, {
			method,
			pageIn: ctx.options.page_in != null ? Number(ctx.options.page_in) : null,
			pageOut: ctx.options.page_out != null ? Number(ctx.options.page_out) : null,
		});
		// PHP htmlentities-encodes the result; the client decodes for display.
		return { result: text, msg: 'ok', errors: [] };
	} catch (error) {
		return { result: false, msg: (error as Error).message, errors: [(error as Error).message] };
	}
}

export const tool: ToolServerModule = {
	name: 'tool_pdf_extractor',
	apiActions: {
		get_pdf_data: { permission: 'record_tipo', minLevel: 1, handler: getPdfData },
	},
};
