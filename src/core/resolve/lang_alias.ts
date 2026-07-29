/**
 * LANGUAGE EQUIVALENCES — the one home of "these lg-* codes are the same
 * language under different names" (Català === Valencià being the shipped case).
 *
 * v6 PHP encoded this as scattered hardcoded branches: lang::get_label_lang
 * ('lg-vlca' reads 'lg-cat' translations — applied to UI labels and ontology
 * terms via RecordObj_dd), plus the vlca→'ca' alpha-2 case. In TS the classes
 * are DECLARED once (DEDALO_LANG_EQUIVALENCES, config catalog) and consumed
 * through the two views below — adding an equivalence for another install
 * (nob/nno, …) is configuration, not code.
 *
 * The two views are deliberately different, matching what each consumer means:
 *
 *   - translationLangOf: DIRECTIONAL. The first member of a class is the
 *     canonical TRANSLATION source (translations are authored there); the other
 *     members read it. A Valencian interface shows the Catalan ontology term —
 *     never the reverse, because nothing is authored in vlca.
 *   - equivalentLangsOf: SYMMETRIC. Record DATA belongs to whichever member the
 *     cataloguer worked in, so every member prefers its siblings as fallback in
 *     both directions: a Catalan menu shows the Valencian-only transcript, and
 *     vice versa, before the install default applies.
 *
 * Pure functions over the boot-frozen config — no module caches, no request
 * state.
 */

import { config } from '../../config/config.ts';

/**
 * The canonical translation-source lang for `lang`, or null when `lang` is not
 * a NON-canonical member of any class (PHP lang::get_label_lang semantics:
 * 'lg-vlca' → 'lg-cat'; 'lg-cat' → null — it already IS the source).
 */
export function translationLangOf(lang: string): string | null {
	for (const group of config.lang.equivalences) {
		const canonical = group[0];
		if (canonical !== undefined && canonical !== lang && group.includes(lang)) {
			return canonical;
		}
	}
	return null;
}

/**
 * The OTHER members of `lang`'s equivalence class, in declared order, excluding
 * `lang` itself — [] when it belongs to none. Symmetric: data written in any
 * member is first-choice fallback for every other member.
 */
export function equivalentLangsOf(lang: string): string[] {
	for (const group of config.lang.equivalences) {
		if (group.includes(lang)) {
			return group.filter((code) => code !== lang);
		}
	}
	return [];
}
