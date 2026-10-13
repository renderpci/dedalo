/**
 * tool_pdf_extractor server module — extract text/html from a record's PDF.
 *
 * Read-only. The declarative 'record' gate asserts level>=1 on the SECTION plus
 * the caller's per-record projects scope; PHP asserts on the (section_tipo,
 * component_tipo) PAIR instead (assert_tipo_permission(…, 1)), which a
 * section-level check does not imply when the component carries its own dd774
 * grant. Both halves are enforced here — the declarative gate for the record,
 * the handler for the component pair.
 *
 * The answer is `{value, render_class}` (pdf_payload.ts — CLIENT-2, 2026-10-11;
 * engineering/wire_contract/WC-2026-10-11-pdf-extractor-render-class.md).
 */

import { DedaloError, ok } from '../../../src/core/errors/index.ts';
import { resolveMediaToolContext } from '../../../src/core/media/tool_support.ts';
import { extractPdfCore } from '../../../src/core/media/tools/pdf_extract.ts';
import { getPermissions } from '../../../src/core/security/permissions.ts';
import {
	type ToolActionContext,
	type ToolResponse,
	type ToolServerModule,
	toolRequestId,
} from '../../../src/core/tools/module.ts';
import { answerPdfPayload, pdfPayloadRequest } from './pdf_payload.ts';

async function getPdfData(ctx: ToolActionContext): Promise<ToolResponse> {
	// method allowlist + offset, refused before any permission or filesystem work.
	const request = pdfPayloadRequest(ctx.options);
	// PHP assert_tipo_permission(section_tipo, component_tipo, 1).
	const componentTipo = String(ctx.options.tipo ?? ctx.options.component_tipo ?? '');
	const sectionTipo = String(ctx.options.section_tipo ?? '');
	if (
		componentTipo === '' ||
		sectionTipo === '' ||
		(await getPermissions(ctx.principal, sectionTipo, componentTipo)) < 1
	) {
		throw new DedaloError('perm.denied', {
			coordinates: { tool: 'tool_pdf_extractor', section_tipo: sectionTipo, tipo: componentTipo },
		});
	}
	const { spec, identity, pathOpts } = await resolveMediaToolContext(ctx.options);
	if (spec.model !== 'component_pdf') {
		throw new DedaloError('tool.unsupported_target', {
			publicMessage: 'The PDF extractor is pdf-only',
			coordinates: { model: spec.model },
		});
	}
	const text = await extractPdfCore(spec, identity, pathOpts, {
		method: request.method,
		pageIn: ctx.options.page_in != null ? Number(ctx.options.page_in) : null,
		pageOut: ctx.options.page_out != null ? Number(ctx.options.page_out) : null,
	});
	// {value, render_class}: the text method verbatim, the html method shaped
	// and sanitized here (pdf_payload.ts). Nothing is entity-encoded and the
	// client re-parses nothing — it renders by the class this answer names.
	return ok(answerPdfPayload(text, request), { requestId: toolRequestId(ctx) });
}

export const tool: ToolServerModule = {
	name: 'tool_pdf_extractor',
	apiActions: {
		get_pdf_data: { permission: 'record_tipo', minLevel: 1, handler: getPdfData },
	},
};
