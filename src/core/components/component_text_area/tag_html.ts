/**
 * TEXT_AREA TAG → HTML — TR::add_tag_img_on_the_fly (shared/class.TR.php
 * :254-437) twin: Dédalo bracket tags embedded in a stored text value
 * ([geo..], [note..], [svg..], …) rendered to the `<img>`/`<reference>` HTML
 * the client expects. Lives in core (next to tag_grammar/tag_render/
 * tag_endpoint) because BOTH consumers need it and core must never import
 * src/diffusion/**:
 * - the list read path (component_text_area emit hook — PHP get_list_value
 *   :1928 converts before truncating);
 * - diffusion's parse_tag_to_html custom fn (src/diffusion/resolve/ddo_fns.ts
 *   re-exports and layers its html_entity_decode pass on top).
 */

import { config } from '../../../config/config.ts';
import { mediaTypeOf } from '../../concepts/media.ts';

/** A tag-embedded svg locator ({'section_tipo':…} with single quotes). */
export interface SvgTagLocator {
	section_tipo?: unknown;
	section_id?: unknown;
	component_tipo?: unknown;
	[extra: string]: unknown;
}

/**
 * The published svg file URL for a tag locator — PHP component_svg::
 * get_url_from_locator (:426-462) + get_url (:233-250): DEDALO_MEDIA_URL +
 * folder + '/' + default quality + '/' + `${component_tipo}_${section_tipo}_
 * ${section_id}.svg`. PURE twin: the PHP ontology-model guards (component_tipo
 * must be a component, section_tipo a section) become shape checks — a
 * malformed locator yields null exactly like the PHP guard path.
 */
export function svgUrlFromTagLocator(locator: SvgTagLocator): string | null {
	const { component_tipo, section_tipo, section_id } = locator;
	if (typeof component_tipo !== 'string' || component_tipo === '') return null;
	if (typeof section_tipo !== 'string' || section_tipo === '') return null;
	if (section_id === undefined || section_id === null || section_id === '') return null;
	const spec = mediaTypeOf('component_svg');
	if (spec === null) return null;
	const imageId = `${component_tipo}_${section_tipo}_${section_id}`;
	return `/dedalo/${config.mediaDir}${spec.folder}/${spec.defaultQuality}/${imageId}.${spec.defaultExtension}`;
}

/** htmlspecialchars(ENT_QUOTES) twin — the SEC-028 attribute escaping. */
function esc(value: string | undefined): string {
	return (value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

export interface TagRenderOptions {
	/** PHP $options->tag_url default '../component_text_area/tag'. */
	tagUrl?: string;
	/** svg tag URL resolver — defaults to the pure grammar twin above. */
	svgUrl?: (locator: SvgTagLocator) => string | null;
}

/**
 * TR::add_tag_img_on_the_fly (shared/class.TR.php :254-437) — Dédalo text tags
 * to `<img>`/`<reference>` HTML, all attribute captures escaped (SEC-028).
 * Patterns are byte-ports of TR::get_mark_pattern with IDENTICAL group
 * numbering (the PHP patterns carry an outer capture around the whole tag).
 * Replacement order matches PHP exactly: indexIn, indexOut, referenceIn,
 * referenceOut, tc, svg, draw, geo, page, person, note, lang.
 */
export function addTagImgOnTheFly(text: string, options: TagRenderOptions = {}): string {
	const tagUrl = `${options.tagUrl ?? '../component_text_area/tag'}/?id=`;
	const svgUrl = options.svgUrl ?? svgUrlFromTagLocator;
	let out = text;

	// INDEX IN (groups: 2 type, 3 state, 4 id, 6 label, 7 data)
	out = out.replace(
		/(\[(index)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])/g,
		(_m, _g1, g2: string, g3: string, g4: string, _g5, g6?: string, g7?: string) => {
			const [e2, e3, e4, e6, e7] = [esc(g2), esc(g3), esc(g4), esc(g6), esc(g7)];
			const id = `[${e2}-${e3}-${e4}-${e6}]`;
			return `<img id="${id}" src="${tagUrl}${id}" class="index" data-type="indexIn" data-tag_id="${e4}" data-state="${e3}" data-label="${e6}" data-data="${e7}">`;
		},
	);

	// INDEX OUT
	out = out.replace(
		/(\[\/(index)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])/g,
		(_m, _g1, g2: string, g3: string, g4: string, _g5, g6?: string, g7?: string) => {
			const [e2, e3, e4, e6, e7] = [esc(g2), esc(g3), esc(g4), esc(g6), esc(g7)];
			const id = `[/${e2}-${e3}-${e4}-${e6}]`;
			return `<img id="${id}" src="${tagUrl}${id}" class="index" data-type="indexOut" data-tag_id="${e4}" data-state="${e3}" data-label="${e6}" data-data="${e7}">`;
		},
	);

	// REFERENCE IN
	out = out.replace(
		/(\[(reference)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])/g,
		(_m, _g1, _g2, g3: string, g4: string, _g5, g6?: string, g7?: string) => {
			const [e3, e4, e6, e7] = [esc(g3), esc(g4), esc(g6), esc(g7)];
			return `<reference id="reference_${e4}" class="reference" data-type="reference" data-tag_id="${e4}" data-state="${e3}" data-label="${e6}" data-data="${e7}">`;
		},
	);

	// REFERENCE OUT
	out = out.replace(
		/(\[\/(reference)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])/g,
		'</reference>',
	);

	// TC (groups: 1 full tag, 2 timecode value)
	out = out.replace(
		/(\[TC_([0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}(\.[0-9]{1,3})?)_TC\])/g,
		(_m, g1: string, g2: string) => {
			const [e1, e2] = [esc(g1), esc(g2)];
			return `<img id="${e1}" src="${tagUrl}${e1}" class="tc" data-type="tc" data-tag_id="${e1}" data-state="n" data-label="${e2}" data-data="${e2}">`;
		},
	);

	// SVG (groups: 2 type, 3 state, 4 id, 6 label, 7 locator data) — the data
	// is a locator with single quotes; on parse failure PHP's callback returns
	// null and the tag is removed (preg_replace_callback null → '').
	out = out.replace(
		/(\[(svg)-([a-z])-([0-9]{1,6})(-([^-]{0,22}))?-data:(.*?):data\])/g,
		(_m, _g1, g2: string, g3: string, g4: string, _g5, g6: string | undefined, g7: string) => {
			const locatorText = g7.replace(/'/g, '"');
			let locator: SvgTagLocator | null = null;
			try {
				const parsed: unknown = JSON.parse(locatorText);
				if (parsed !== null && typeof parsed === 'object') locator = parsed as SvgTagLocator;
			} catch {
				locator = null;
			}
			if (locator === null) return '';
			const url = svgUrl(locator);
			// PHP: $data = str_replace('"','\'',$_7) — safe single-quote form.
			const data = g7.replace(/"/g, "'");
			const [e2, e3, e4, e6] = [esc(g2), esc(g3), esc(g4), esc(g6)];
			return `<img id="[${e2}-${e3}-${e4}-${e6}]" src="${esc(url ?? '')}" class="svg" data-type="svg" data-tag_id="${e4}" data-state="${e3}" data-label="${e6}" data-data="${esc(data)}">`;
		},
	);

	// DRAW / GEO / NOTE / LANG share the svg-shaped pattern (label optional,
	// data mandatory): groups 2 type, 3 state, 4 id, 6 label, 7 data.
	const spriteTag =
		(kind: string) =>
		(
			_m: string,
			_g1: string,
			g2: string,
			g3: string,
			g4: string,
			_g5: string | undefined,
			g6: string | undefined,
			g7: string,
		): string => {
			const [e2, e3, e4, e6, e7] = [esc(g2), esc(g3), esc(g4), esc(g6), esc(g7)];
			const id = `[${e2}-${e3}-${e4}-${e6}]`;
			return `<img id="${id}" src="${tagUrl}${id}" class="${kind}" data-type="${kind}" data-tag_id="${e4}" data-state="${e3}" data-label="${e6}" data-data="${e7}">`;
		};
	out = out.replace(
		/(\[(draw)-([a-z])-([0-9]{1,6})(-([^-]{0,22}))?-data:(.*?):data\])/g,
		spriteTag('draw'),
	);
	out = out.replace(
		/(\[(geo)-([a-z])-([0-9]{1,6})(-([^-]{0,22}))?-data:(.*?):data\])/g,
		spriteTag('geo'),
	);

	// PAGE (index-shaped pattern: label+data optional as a block)
	out = out.replace(
		/(\[(page)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])/g,
		(_m, _g1, g2: string, g3: string, g4: string, _g5, g6?: string, g7?: string) => {
			const [e2, e3, e4, e6, e7] = [esc(g2), esc(g3), esc(g4), esc(g6), esc(g7)];
			const id = `[${e2}-${e3}-${e4}-${e6}]`;
			return `<img id="${id}" src="${tagUrl}${id}" class="page" data-type="page" data-tag_id="${e4}" data-state="${e3}" data-label="${e6}" data-data="${e7}">`;
		},
	);

	// PERSON (groups: 2 type, 3 state, 4 id, 5 label, 6 data — no optional wrap)
	out = out.replace(
		/(\[(person)-([a-z])-([0-9]{0,6})-([^-]{0,22})-data:(.*?):data\])/g,
		(_m, _g1, g2: string, g3: string, g4: string, g5: string, g6: string) => {
			const [e2, e3, e4, e5, e6] = [esc(g2), esc(g3), esc(g4), esc(g5), esc(g6)];
			const id = `[${e2}-${e3}-${e4}-${e5}]`;
			return `<img id="${id}" src="${tagUrl}${id}" class="person" data-type="person" data-tag_id="${e4}" data-state="${e3}" data-label="${e5}" data-data="${e6}">`;
		},
	);

	out = out.replace(
		/(\[(note)-([a-z])-([0-9]{1,6})(-([^-]{0,22}))?-data:(.*?):data\])/g,
		spriteTag('note'),
	);
	out = out.replace(
		/(\[(lang)-([a-z])-([0-9]{1,6})(-([^-]{0,22}))?-data:(.*?):data\])/g,
		spriteTag('lang'),
	);

	return out;
}
