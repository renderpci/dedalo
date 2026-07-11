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
 * The curated, labelled language catalog offered by the wizard (the config.ts
 * default applicationLangs map / sample.env). A labelled dropdown needs display
 * names, and the full 639-code matrix_langs dump has none; exotic codes are
 * added by hand post-install. Insertion order is the presentation order.
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
});

/** All catalog codes in presentation order (the default "all checked" set). */
export const INSTALL_LANG_CODES: readonly string[] = Object.freeze(
	Object.keys(INSTALL_LANG_CATALOG),
);

export interface LangConfigInput {
	/** Working-language codes (array or comma string). Default: the whole catalog. */
	langs?: string[] | string;
	/** Default interface (application) language. Default: first picked code. */
	appLangDefault?: string;
	/** Default data language. Default: first picked code. */
	dataLangDefault?: string;
}

export interface DerivedLangConfig {
	/** code→label map for the picked set (DEDALO_APPLICATION_LANGS). */
	applicationLangs: Record<string, string>;
	/** ordered codes (DEDALO_PROJECTS_DEFAULT_LANGS / PROJECTS_DEFAULT_LANGS). */
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
 * The picked set drives BOTH the map and the code list, so they can never
 * disagree. An empty set defaults to the whole catalog; the interface/data
 * defaults fall back to the first picked code when absent or out-of-set.
 */
export function deriveLangConfig(input: LangConfigInput): DerivedLangConfig {
	const errors: string[] = [];
	// ABSENT (undefined) → default to the whole catalog so a frontend that never
	// collects langs still produces a bootable config. An EXPLICIT empty set
	// (operator unchecked everything) is an error — never silently ship "all".
	let codes: string[];
	if (input.langs === undefined) {
		codes = [...INSTALL_LANG_CODES];
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

	const applicationLangs: Record<string, string> = {};
	for (const code of valid) applicationLangs[code] = INSTALL_LANG_CATALOG[code] as string;

	const first = valid[0] ?? INSTALL_LANG_CODES[0] ?? 'lg-eng';
	const pickDefault = (candidate: string | undefined, label: string): string => {
		if (candidate === undefined || candidate === '') return first;
		if (!valid.includes(candidate)) {
			errors.push(`the ${label} language '${candidate}' is not in the selected set`);
			return first;
		}
		return candidate;
	};
	const applicationLangsDefault = pickDefault(input.appLangDefault, 'default interface');
	const dataLangDefault = pickDefault(input.dataLangDefault, 'default data');

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
