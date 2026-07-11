/**
 * tool_posterframe server module (PHP tool_posterframe).
 *
 * create_identifying_image: extract a frame from an AV record at a timecode and
 *   store it as the identifying image of a NEW record created through a portal on
 *   the host record. Two permission targets (PHP asserts both): READ on the AV
 *   source, WRITE on the portal — the AV read is the declarative record/1 gate,
 *   the portal write is asserted imperatively in the handler.
 * get_ar_identifying_image: for a section record, return the identifying-image
 *   descriptors of every record that inversely references it.
 *
 * The media half (frame extract + derivative regen) lives in the tested
 * posterframe core; this module wires the DB portal-create + ontology walk.
 */

import { config } from '../../../src/config/config.ts';
import { mediaTypeOf } from '../../../src/core/concepts/media.ts';
import { resolveMediaPathOptions } from '../../../src/core/media/ontology_path.ts';
import type { MediaIdentity } from '../../../src/core/media/path.ts';
import { resolveMediaToolContext } from '../../../src/core/media/tool_support.ts';
import { createIdentifyingImageCore } from '../../../src/core/media/tools/posterframe.ts';
import { termByTipo } from '../../../src/core/ontology/labels.ts';
import {
	getNode,
	getOrderedSubtree,
	getTranslatableByTipo,
} from '../../../src/core/ontology/resolver.ts';
import { getMainRelatedSectionTipo } from '../../../src/core/relations/request_config/implicit.ts';
import { findInverseReferences } from '../../../src/core/search/search_related.ts';
import { saveComponentData } from '../../../src/core/section/record/save_component.ts';
import { getPermissions } from '../../../src/core/security/permissions.ts';
import type {
	ToolActionContext,
	ToolResponse,
	ToolServerModule,
} from '../../../src/core/tools/module.ts';

interface ItemValue {
	component_portal?: string;
	component_image?: string;
	section_id?: number | string;
	section_tipo?: string;
}

function fail(message: string): ToolResponse {
	return { result: false, msg: `Error. ${message}`, errors: [message] };
}

/**
 * All component_portal tipos declared in a section's ontology subtree
 * (virtual-unaware structural walk). Canonical accessor (S2-19/T3): the
 * section-bounded subtree walk lives in ontology/resolver.ts.
 */
async function portalTiposInSection(sectionTipo: string): Promise<string[]> {
	const nodes = await getOrderedSubtree(sectionTipo);
	return nodes.filter((node) => node.model === 'component_portal').map((node) => node.tipo);
}

/**
 * create_identifying_image — declarative gate covers the AV source (record/1);
 * the portal WRITE gate is imperative here (PHP asserts level 2 on the portal).
 */
async function createIdentifyingImage(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const itemValue = (ctx.options.item_value ?? {}) as ItemValue;
		const currentTime = String(ctx.options.current_time ?? '');
		const portalComponentTipo = String(itemValue.component_portal ?? '');
		const imageComponentTipo = String(itemValue.component_image ?? '');
		const hostSectionTipo = String(itemValue.section_tipo ?? '');
		const hostSectionId = Number(itemValue.section_id);
		if (portalComponentTipo === '' || imageComponentTipo === '' || hostSectionTipo === '') {
			return fail(
				'Missing required parameters: item_value.component_portal/component_image/section_tipo',
			);
		}

		// Portal WRITE gate (PHP assert_tipo_permission(portal, level 2)).
		const portalLevel = await getPermissions(ctx.principal, hostSectionTipo, portalComponentTipo);
		if (portalLevel < 2) return fail('insufficient permissions on the portal target');

		// AV source context (declarative record/1 gate already ran on options.section_tipo/section_id).
		const avContext = await resolveMediaToolContext(ctx.options);
		if (avContext.spec.model !== 'component_av')
			return fail('source component is not component_av');

		// Resolve the portal's target section, then create + persist a new record
		// through the portal (PHP add_new_element + Save).
		const portalTargetSectionTipo = await getMainRelatedSectionTipo(portalComponentTipo);
		if (portalTargetSectionTipo === null) return fail('portal has no target section');
		const saveResult = (await saveComponentData({
			componentTipo: portalComponentTipo,
			sectionTipo: hostSectionTipo,
			sectionId: hostSectionId,
			lang: 'lg-nolan',
			changedData: [{ action: 'add_new_element', id: null, value: portalTargetSectionTipo }],
			userId: ctx.userId,
		})) as { ok: boolean; message: string; created_section_id?: number };
		if (!saveResult.ok || saveResult.created_section_id == null) {
			return fail(`unable to create portal record element: ${saveResult.message}`);
		}
		const newSectionId = saveResult.created_section_id;

		// Build the IMAGE target context on the new record.
		const imageSpec = mediaTypeOf('component_image');
		if (imageSpec === null) return fail('component_image media spec unavailable');
		const translatable = await getTranslatableByTipo(imageComponentTipo);
		const imageIdentity: MediaIdentity = {
			componentTipo: imageComponentTipo,
			sectionTipo: portalTargetSectionTipo,
			sectionId: newSectionId,
			lang: translatable ? config.menu.dataLang : null,
		};
		const imagePathOpts = await resolveMediaPathOptions(
			imageComponentTipo,
			portalTargetSectionTipo,
		);

		const outcome = await createIdentifyingImageCore(
			{ spec: avContext.spec, identity: avContext.identity, pathOpts: avContext.pathOpts },
			{ spec: imageSpec, identity: imageIdentity, pathOpts: imagePathOpts },
			currentTime,
		);
		if (!outcome.created) return fail('posterframe could not be created (no video stream?)');

		return {
			result: true,
			msg: 'OK. Posterframe created successfully',
			errors: [],
			section_id: newSectionId,
			files_info: outcome.filesInfo,
		};
	} catch (error) {
		return fail((error as Error).message);
	}
}

/** get_ar_identifying_image — descriptors for records inversely referencing this one. */
async function getArIdentifyingImage(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const sectionTipo = String(ctx.options.section_tipo ?? '');
		const sectionId = Number(ctx.options.section_id);
		if (sectionTipo === '' || !Number.isInteger(sectionId) || sectionId <= 0) {
			return fail('section_tipo and a positive section_id are required');
		}

		const hits = await findInverseReferences(
			[{ section_tipo: sectionTipo, section_id: sectionId }],
			{
				order: 'section_id',
			},
		);
		const descriptors: Record<string, unknown>[] = [];
		for (const hit of hits) {
			const descriptor = await identifyingImageFromSection(hit.section_tipo, hit.section_id);
			if (descriptor !== null) descriptors.push(descriptor);
		}
		return {
			result: descriptors.length > 0 ? descriptors : false,
			msg: 'OK. Request done',
			errors: [],
		};
	} catch (error) {
		return fail((error as Error).message);
	}
}

/** First portal in the section whose ontology properties declare an identifying_image. */
async function identifyingImageFromSection(
	sectionTipo: string,
	sectionId: number,
): Promise<Record<string, unknown> | null> {
	const portalTipos = await portalTiposInSection(sectionTipo);
	for (const portalTipo of portalTipos) {
		const node = await getNode(portalTipo);
		const props = (node?.properties ?? null) as { identifying_image?: string } | null;
		const identifyingImage = props?.identifying_image;
		if (typeof identifyingImage === 'string' && identifyingImage !== '') {
			return {
				section_id: sectionId,
				section_tipo: sectionTipo,
				component_portal: portalTipo,
				component_image: identifyingImage,
				label: await termByTipo(sectionTipo, config.menu.applicationLang),
			};
		}
	}
	return null;
}

export const tool: ToolServerModule = {
	name: 'tool_posterframe',
	apiActions: {
		create_identifying_image: {
			permission: 'record',
			minLevel: 1,
			handler: createIdentifyingImage,
		},
		get_ar_identifying_image: { permission: 'record', minLevel: 1, handler: getArIdentifyingImage },
	},
};
