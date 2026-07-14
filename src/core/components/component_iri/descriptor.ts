/**
 * component_iri — IRI/URL value (PHP core/component_iri). Stores its items in
 * the dedicated `iri` column; CLASS-translatable, and (unlike the string family)
 * honors the requested lang as-is on read rather than nolan-forcing.
 */
import type { ComponentModel } from '../types.ts';

export const component_iri: ComponentModel = {
	model: 'component_iri',
	flatValue: 'iri',
	column: 'iri',
	classSupportsTranslation: true,
	searchBuilder: 'iri',
	// PHP component_iri_json ALWAYS pairs with its dd560 label dataframe
	// (hardcoded DEDALO_COMPONENT_IRI_LABEL_DATAFRAME).
	fixedDataframeTipos: ['dd560'],
	importConform: 'iri',
};
