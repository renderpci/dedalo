/**
 * component_text_area `features` context (PHP component_text_area_json.php:145-171,
 * built for the edit-mode context). The client editor reads `context.features`
 * to wire notes/reference insertion and the AV-timecode / draw / geo keyboard
 * interactions WITHOUT extra API calls. In particular `features.av_player
 * .av_insert_tc_code` ('F2') is the key the edit view binds to `build_tag`
 * (view_default_edit_text_area.js:1189) — without it F2 is dead, so the
 * draw/geo layer_selector (which build_tag opens via the sibling's key_up_f2
 * subscription) never renders.
 *
 * Values are the PHP install defaults (config: DEDALO_NOTES_SECTION_TIPO rsc326,
 * DEDALO_NOTES_PUBLICATION_TIPO rsc399, DEDALO_TS_REFERENCES_SECTION_TIPO rsc425,
 * DEDALO_TS_REFERENCES_COMPONENT_TIPO rsc426). A per-install override of those
 * constants is LEDGERED (the TS config catalog does not yet carry them), same
 * convention as media_features.ts.
 */

import { getModelByTipo } from '../ontology/resolver.ts';

/** PHP DEDALO_* install-default tipos for the text_area feature bag. */
const NOTES_SECTION_TIPO = 'rsc326';
const NOTES_PUBLICATION_TIPO = 'rsc399';
const REFERENCES_SECTION_TIPO = 'rsc425';
const REFERENCES_COMPONENT_TIPO = 'rsc426';

/** The client-facing text_area `features` object (PHP context->features). */
export interface TextAreaFeatures {
	notes_section_tipo: string;
	notes_publication_tipo: string;
	references_section_tipo: string;
	references_component_tipo: string;
	references_component_model: string | null;
	av_player: {
		av_play_pause_code: string;
		av_insert_tc_code: string;
		av_rewind_seconds: number;
	};
}

/**
 * Build a text_area's edit-mode `features` context (PHP
 * component_text_area_json.php). `references_component_model` is resolved from
 * the ontology exactly like PHP's ontology_node::get_model_by_tipo.
 */
export async function buildTextAreaFeatures(): Promise<TextAreaFeatures> {
	const referencesComponentModel = await getModelByTipo(REFERENCES_COMPONENT_TIPO);
	return {
		notes_section_tipo: NOTES_SECTION_TIPO,
		notes_publication_tipo: NOTES_PUBLICATION_TIPO,
		references_section_tipo: REFERENCES_SECTION_TIPO,
		references_component_tipo: REFERENCES_COMPONENT_TIPO,
		references_component_model: referencesComponentModel,
		av_player: {
			av_play_pause_code: 'Escape',
			av_insert_tc_code: 'F2',
			av_rewind_seconds: 3,
		},
	};
}
