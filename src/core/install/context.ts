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
 * `hierarchies`/`hierarchy_typologies`/`install_checked_default`/`core_hierarchies`,
 * `update_servers`.
 */

import { existsSync } from 'node:fs';
import { currentApplicationLang } from '../resolve/request_lang.ts';
import { DEDALO_VERSION } from '../update/version.ts';
import {
	CORE_HIERARCHIES,
	defaultOptionalHierarchies,
	offeredHierarchies,
	readHierarchyJson,
} from './hierarchy_meta.ts';
import { runInitTest } from './init_test.ts';
import { OFFICIAL_CODE_SERVER, OFFICIAL_ONTOLOGY_SERVER } from './install_plan.ts';
import { INSTALL_DEFAULT_LANG_CODES, INSTALL_LANG_CATALOG } from './lang_catalog.ts';
import { SEED_DUMP_PATH } from './paths.ts';
import { buildInstallServerInfo } from './server_info.ts';

/** The installer element tipo (dd1590 in the ontology; pinned by the client). */
export const INSTALLER_TIPO = 'dd1590';

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
			// THE shared default (hierarchies.json install_checked_default ∩ vendored)
			// — the CLI's default reads the same function (install_plan.ts).
			install_checked_default: defaultOptionalHierarchies(),
			// Always activated by the seed restore, never a choice: the client shows
			// them as fixed rows, not checkboxes (A7, WC-2026-10-08-install-plan-update-servers-core-lg).
			core_hierarchies: CORE_HIERARCHIES.map(({ tld, label }) => ({ tld, label })),
			// The update-server box (A3): ticked = the official master; unticked =
			// air-gapped (`[]`). The shared `code` is not sent — persist_config writes it.
			update_servers: {
				default: true,
				official: {
					ontology: { name: OFFICIAL_ONTOLOGY_SERVER.name, url: OFFICIAL_ONTOLOGY_SERVER.url },
					code: { name: OFFICIAL_CODE_SERVER.name, url: OFFICIAL_CODE_SERVER.url },
				},
			},
			// LANGUAGES: the curated labelled catalog the wizard offers (code→label),
			// the default working languages pre-checked (the rest optional), plus the
			// default interface/data lang hints. The picked
			// set drives DEDALO_APPLICATION_LANGS + PROJECTS_DEFAULT_LANGS (mandatory).
			available_langs: INSTALL_LANG_CATALOG,
			install_checked_langs: [...INSTALL_DEFAULT_LANG_CODES],
			application_lang_default: INSTALL_DEFAULT_LANG_CODES[0] ?? 'lg-eng',
			data_lang_default: INSTALL_DEFAULT_LANG_CODES[0] ?? 'lg-eng',
		},
	};
}
