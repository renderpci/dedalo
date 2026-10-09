/**
 * Install-time language catalog + derivation (DEC-19 lang config).
 *
 * The owner rule (config.ts: "LANGUAGE definitions are install configuration —
 * a missing/malformed value must refuse boot, never fall back to a hardcoded
 * list") makes four lang keys mandatory once the server is configured. The
 * installer therefore collects a working-language set and writes them; this
 * module is the ONE source of truth both frontends (browser wizard via
 * config_persist, and the CLI env-preset) share.
 *
 * PURE — no config.ts import (the CLI calls it BEFORE config is imported, to set
 * the lang env vars so config resolves without throwing at import time).
 */

import { isValidLang } from '../concepts/ontology.ts';

/**
 * The labelled language catalog the installer offers — EXACTLY the languages the
 * UI-label subsystem ships a translation for (src/core/labels/catalog/lg-*.json;
 * gate: test/unit/install_lang_catalog.test.ts). A labelled dropdown needs
 * display names (endonyms), and the full 639-code matrix_langs dump has none.
 * Insertion order is the presentation order.
 *
 * EVERY catalog language becomes an INTERFACE language of a new install
 * (DEDALO_APPLICATION_LANGS), so a user can switch the UI to any translated
 * language at any time; only the WORKING (data) languages are a choice.
 */
export const INSTALL_LANG_CATALOG: Readonly<Record<string, string>> = Object.freeze({
	'lg-eng': 'English',
	'lg-spa': 'Castellano',
	'lg-cat': 'Català',
	'lg-eus': 'Euskara',
	'lg-fra': 'Français',
	'lg-por': 'Português',
	'lg-deu': 'Deutsch',
	'lg-ita': 'Italiano',
	'lg-ell': 'Ελληνικά',
	'lg-nep': 'नेपाली',
	'lg-ara': 'العربية',
	'lg-ben': 'বাংলা',
	'lg-chi': '中文',
	'lg-hin': 'हिन्दी',
	'lg-jpn': '日本語',
	'lg-kor': '한국어',
	'lg-rus': 'Русский',
	'lg-urd': 'اردو',
});

/** All catalog codes in presentation order (every language the installer OFFERS). */
export const INSTALL_LANG_CODES: readonly string[] = Object.freeze(
	Object.keys(INSTALL_LANG_CATALOG),
);

/**
 * THE default working (data) languages (pre-ticked in the wizard, taken by the
 * CLI and install.sh when no language is given): English + Spanish. Every other
 * catalog language is an OPTIONAL working language — offered, never on by
 * default (each one adds a lang tab to every translatable field). Interface
 * languages are not chosen: they are always the whole catalog.
 */
export const INSTALL_DEFAULT_LANG_CODES: readonly string[] = Object.freeze(['lg-eng', 'lg-spa']);

export interface LangConfigInput {
	/** Working-language codes (array or comma string). Default: INSTALL_DEFAULT_LANG_CODES. */
	langs?: string[] | string;
	/** Default interface (application) language — any catalog code. Default: first picked code. */
	appLangDefault?: string;
	/** Default data language. Default: first picked code. */
	dataLangDefault?: string;
}

export interface DerivedLangConfig {
	/** code→label map of the WHOLE catalog (DEDALO_APPLICATION_LANGS — the interface languages). */
	applicationLangs: Record<string, string>;
	/** ordered picked working codes (DEDALO_PROJECTS_DEFAULT_LANGS / PROJECTS_DEFAULT_LANGS). */
	projectsDefaultLangs: string[];
	/** DEDALO_APPLICATION_LANGS_DEFAULT + DEDALO_APPLICATION_LANG. */
	applicationLangsDefault: string;
	/** DEDALO_DATA_LANG_DEFAULT + DEDALO_DATA_LANG. */
	dataLangDefault: string;
	/** DEDALO_STRUCTURE_LANG — the ontology structure lang (upstream accepts lg-spa only). */
	structureLang: string;
	/** Non-empty when the input is unusable (empty set / default ∉ set / bad code). */
	errors: string[];
}

/** Normalize the `langs` input to an ordered, de-duped code array. */
function toCodeArray(langs: string[] | string | undefined): string[] {
	const raw = Array.isArray(langs) ? langs : typeof langs === 'string' ? langs.split(',') : [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const entry of raw) {
		const code = String(entry).trim();
		if (code !== '' && !seen.has(code)) {
			seen.add(code);
			out.push(code);
		}
	}
	return out;
}

/**
 * Derive the full lang config from the operator's picks, validating as it goes.
 * The picked set is the WORKING (data) languages; the interface languages are
 * the whole catalog, so the picked set is always a subset of them. An absent set
 * takes INSTALL_DEFAULT_LANG_CODES; the interface default may be any catalog
 * language, the data default must be picked; both fall back to the first picked
 * code when absent (and refuse when out of their set).
 */
export function deriveLangConfig(input: LangConfigInput): DerivedLangConfig {
	const errors: string[] = [];
	// ABSENT (undefined) → the default working languages, so a frontend that never
	// collects langs still produces a bootable config. An EXPLICIT empty set
	// (operator unchecked everything) is an error — never silently pick for them.
	let codes: string[];
	if (input.langs === undefined) {
		codes = [...INSTALL_DEFAULT_LANG_CODES];
	} else {
		codes = toCodeArray(input.langs);
		if (codes.length === 0) errors.push('at least one language must be selected');
	}

	// Validate every code: well-formed AND a known catalog member.
	const valid: string[] = [];
	for (const code of codes) {
		if (!isValidLang(code)) {
			errors.push(`invalid language code '${code}'`);
		} else if (INSTALL_LANG_CATALOG[code] === undefined) {
			errors.push(`unsupported language '${code}' (not in the install catalog)`);
		} else {
			valid.push(code);
		}
	}

	// Interface languages = the whole catalog, whatever the working set.
	const applicationLangs: Record<string, string> = { ...INSTALL_LANG_CATALOG };

	const first = valid[0] ?? INSTALL_LANG_CODES[0] ?? 'lg-eng';
	const pickDefault = (
		candidate: string | undefined,
		allowed: readonly string[],
		refusal: (code: string) => string,
	): string => {
		if (candidate === undefined || candidate === '') return first;
		if (!allowed.includes(candidate)) {
			errors.push(refusal(candidate));
			return first;
		}
		return candidate;
	};
	const applicationLangsDefault = pickDefault(
		input.appLangDefault,
		INSTALL_LANG_CODES,
		(code) => `the default interface language '${code}' is not in the install catalog`,
	);
	const dataLangDefault = pickDefault(
		input.dataLangDefault,
		valid,
		(code) => `the default data language '${code}' is not in the selected set`,
	);

	return {
		applicationLangs,
		projectsDefaultLangs: valid,
		applicationLangsDefault,
		dataLangDefault,
		// The ontology structure lang is fixed: upstream ontology exports are lg-spa.
		structureLang: 'lg-spa',
		errors,
	};
}
