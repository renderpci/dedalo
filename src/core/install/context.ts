/**
 * The synthetic installer element context (DEC-19). The wizard client mounts on
 * a `start` context entry with `model:'installer'`, then fires
 * `get_install_context` and renders entirely from the returned element's
 * `.properties`. On a fresh machine there is NO ontology to resolve, so this
 * context is built by hand (NOT buildStructureContext) — it carries exactly the
 * property fields render_installer.js reads.
 *
 * Client-contract fields (see the wizard wire contract): `needs_config` (true →
 * the modern collect/persist flow), `init_test` (the progression GATE),
 * `server_info` (cosmetic grid), `db_config` prefill, `db_data_version` ([] hides
 * the unsupported v5/v6 "To update" button), `target_file_path`(+`_exists`),
 * `hierarchies`/`hierarchy_typologies`/`install_checked_default`.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { currentApplicationLang } from '../resolve/request_lang.ts';
import { DEDALO_VERSION } from '../update/version.ts';
import { runInitTest } from './init_test.ts';
import { INSTALL_LANG_CATALOG, INSTALL_LANG_CODES } from './lang_catalog.ts';
import { HIERARCHY_IMPORT_DIR, SEED_DUMP_PATH } from './paths.ts';
import { buildInstallServerInfo } from './server_info.ts';

/** The installer element tipo (dd1590 in the ontology; pinned by the client). */
export const INSTALLER_TIPO = 'dd1590';

/** Default-checked hierarchies (PHP install_checked_default). */
const INSTALL_CHECKED_DEFAULT = ['es', 'fr', 'lg', 'ts', 'utoponymy'];

interface HierarchyMeta {
	tld: string;
	label: string;
	typology: number;
	active_in_thesaurus: boolean;
}

/** Read a JSON file from the vendored hierarchy dir, or a fallback on absence. */
function readHierarchyJson<T>(fileName: string, fallback: T): T {
	try {
		const path = join(HIERARCHY_IMPORT_DIR, fileName);
		if (!existsSync(path)) return fallback;
		return JSON.parse(readFileSync(path, 'utf8')) as T;
	} catch {
		return fallback;
	}
}

/** The tlds we can actually install = the vendored `<tld>1.copy.gz` data files. */
function availableHierarchyTlds(): Set<string> {
	try {
		if (!existsSync(HIERARCHY_IMPORT_DIR)) return new Set();
		return new Set(
			readdirSync(HIERARCHY_IMPORT_DIR)
				.filter((name) => /^[a-z]+1\.copy\.gz$/.test(name))
				.map((name) => name.replace(/1\.copy\.gz$/, '')),
		);
	} catch {
		return new Set();
	}
}

/** The hierarchies the wizard should offer: metadata ∩ vendored data files. */
function offeredHierarchies(): HierarchyMeta[] {
	const meta = readHierarchyJson<HierarchyMeta[]>('hierarchies.json', []);
	const available = availableHierarchyTlds();
	if (available.size === 0) return []; // no data files vendored → nothing to offer
	return meta.filter((entry) => available.has(entry.tld));
}

/** Pre-checked defaults, restricted to what is actually installable. */
function effectiveDefaults(): string[] {
	const available = availableHierarchyTlds();
	return INSTALL_CHECKED_DEFAULT.filter((tld) => available.has(tld));
}

/** The full synthetic installer element the client mounts and renders from. */
export function buildInstallContext(): Record<string, unknown> {
	const lang = currentApplicationLang();
	return {
		model: 'installer',
		tipo: INSTALLER_TIPO,
		section_tipo: INSTALLER_TIPO,
		mode: 'edit',
		lang,
		properties: {
			needs_config: true,
			version: DEDALO_VERSION,
			init_test: runInitTest(),
			server_info: buildInstallServerInfo(),
			// Prefill blanks/defaults — the client strips known placeholders.
			db_config: { db_name: '', user_name: '', hostname: 'localhost', port: '5432', socket: '' },
			dedalo_entity: '',
			// [] → the client hides the v5/v6 "To update" button (unsupported path).
			db_data_version: [],
			target_file_path: SEED_DUMP_PATH,
			target_file_path_exists: existsSync(SEED_DUMP_PATH),
			hierarchies: offeredHierarchies(),
			hierarchy_typologies: readHierarchyJson('hierarchies_typologies.json', []),
			install_checked_default: effectiveDefaults(),
			// LANGUAGES: the curated labelled catalog the wizard offers (code→label),
			// all pre-checked, plus the default interface/data lang hints. The picked
			// set drives DEDALO_APPLICATION_LANGS + PROJECTS_DEFAULT_LANGS (mandatory).
			available_langs: INSTALL_LANG_CATALOG,
			install_checked_langs: [...INSTALL_LANG_CODES],
			application_lang_default: INSTALL_LANG_CODES[0] ?? 'lg-eng',
			data_lang_default: INSTALL_LANG_CODES[0] ?? 'lg-eng',
		},
	};
}
