// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/

/**
* PRESET_SCOPE
* The scoping key that identifies WHICH search a saved/temp preset belongs to.
*
* Kept as a standalone, dependency-free leaf module (no client/browser imports)
* so the rule can be unit-tested in isolation — test/unit/search_preset_scope.test.ts.
*/



/**
* PRESET_SCOPE_TIPO
* Resolve the section a preset is scoped to: the section actually being SEARCHED
* (self.target_section_tipo, the same source the search field list is built from),
* NOT the caller's own section_tipo.
*
* The two diverge whenever the searched section differs from the host section —
* an ontology/thesaurus browser, or a relation/portal/autocomplete picker opened
* from inside another section. Keying by the caller made those searches collide
* with the host section's own list preset (e.g. an `ontologytype0` filter saved
* under the Activity `dd542` key, then surfacing in the Activity search panel).
*
* Falls back to self.section_tipo for legacy callers that never set a target.
*
* @param {Object} self - Search instance exposing target_section_tipo / section_tipo.
* @returns {string} The scoping section tipo.
*/
export const preset_scope_tipo = function(self) {

	// t. First (primary) searched section. target_section_tipo is normally an
	// array of tipo strings (sqo.section_tipo), but tolerate [{tipo}] shapes too.
	const t = Array.isArray(self.target_section_tipo) ? self.target_section_tipo[0] : null

	return (typeof t === 'string' ? t : t?.tipo) || self.section_tipo
}//end preset_scope_tipo
