/**
 * tool_pdf_extractor server module — extract text/html from a record's PDF.
 * Read-only: level>=1 on the record.
 */

import { resolveMediaToolContext } from '../../../src/core/media/tool_support.ts';
import { extractPdfCore } from '../../../src/core/media/tools/pdf_extract.ts';
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
		get_pdf_data: { permission: 'record', minLevel: 1, handler: getPdfData },
	},
};
