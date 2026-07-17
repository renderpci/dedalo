/**
 * update_ontology widget (UPDATE_PROCESS Phase 2) — panel + the ontology
 * import EXECUTE. Panel (PHP widgets/update_ontology::get_value): probe the
 * configured ONTOLOGY_SERVERS (+ the 'Local files' pseudo-server when this
 * instance is an ontology master), the installed-snapshot metadata from the
 * dd1 root node, the instance TLD list, and the destructive-action confirm
 * bytes. EXECUTE: ownership-gated — closed (coexisting) keeps the frozen
 * engine_denied envelope; open runs the staged/validated/recoverable import
 * pipeline (core/ontology/ontology_update.ts, WC-023).
 * export_to_translate / rebuild_lang_files stay closed-by-design: the TS
 * engine has no generated JS lang files (labels are repo catalogs, WC-033 —
 * they ride code deploys) and the translation-export CSV workflow is
 * superseded by the per-lang catalog diff (scripts/labels_fill.ts).
 */

import { config } from '../../../config/config.ts';
import { readEnv } from '../../../config/env.ts';
import { readString } from '../../../config/readers.ts';
import { publicOrigin } from '../../resolve/public_origin.ts';
import type { Principal } from '../../security/permissions.ts';
import { type WidgetModule, type WidgetResponse, engineDenied, gated } from './support.ts';

/**
 * update_ontology panel (PHP get_value — response bytes preserved; the
 * legacy STRUCTURE_SERVER_URL/CODE fallback is not carried: TS installs are
 * v7-configured).
 */
async function updateOntologyGetValue(): Promise<WidgetResponse> {
	const { checkRemoteServer } = await import('../../ontology/data_io_import.ts');
	const { readDdOntologyRow } = await import('../../db/dd_ontology.ts');
	const { getLabels } = await import('../../labels/catalog.ts');

	const servers: Record<string, unknown>[] = config.ontologyIo.servers.map((server) => ({
		...server,
	}));
	if (config.ontologyIo.isOntologyServer === true) {
		servers.push({
			name: 'Local files',
			url: `${publicOrigin()}/dedalo/core/api/v1/json/`,
			code: 'localhost',
		});
	}
	// Probe each server (PHP: sequential 5 s checks; localhost forced reachable).
	for (const server of servers) {
		const probe = await checkRemoteServer(server as { name: string; url: string; code: string });
		server.msg = probe.msg;
		server.errors = probe.errors;
		server.response_code = probe.code;
		server.result = probe.result;
		if (
			server.code === 'localhost' &&
			typeof server.result === 'object' &&
			server.result !== null
		) {
			(server.result as { result?: unknown }).result = true;
		}
	}

	// TLD list: the configured active TLDs, always unioned with the core pair.
	const activeOntologyTlds = [
		...new Set([...config.ontologyIo.activeOntologyTlds, 'ontology', 'ontologytype']),
	];

	// Installed-snapshot metadata from the dd1 root node properties.
	const rootRow = (await readDdOntologyRow('dd1')) as {
		properties?: Record<string, unknown>;
	} | null;
	const properties = rootRow?.properties ?? {};
	const currentOntology = {
		date: properties.date ?? null,
		host: properties.host ?? null,
		entity: properties.entity ?? null,
		entity_label: properties.entity_label ?? null,
		version: properties.version ?? null,
	};

	const labels = await getLabels(config.lang.structureLang);
	return {
		result: {
			servers,
			current_ontology: currentOntology,
			active_ontology_tlds: activeOntologyTlds,
			body: `${labels.update_ontology ?? 'Update ontology'} is disabled for ${config.entity}`,
			confirm_text:
				'!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! WARNING !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n' +
				'!!!!!!!!!!!!!! DELETING ACTUAL ONTOLOGY !!!!!!!!!!!!!!!!!!!!!!!!!!!\n' +
				'Are you sure you want to overwrite the current Ontology data?\n' +
				'You will lose all changes made to the local Ontology.',
		},
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

/** The OPEN (owned) branch: the staged/recoverable import (WC-023). */
async function updateOntologyOwned(
	options: Record<string, unknown>,
	principal: Principal,
): Promise<WidgetResponse> {
	const { updateOntology } = await import('../../ontology/ontology_update.ts');
	const outcome = await updateOntology(options, principal.userId);
	// The client reads root_info off the envelope (render_update_ontology.js).
	return outcome as unknown as WidgetResponse;
}

export const widget: WidgetModule = {
	spec: {
		id: 'update_ontology',
		category: 'config',
		label: { kind: 'label', key: 'update_ontology' },
	},
	apiActions: {
		// Ownership-gated (UPDATE_PROCESS Phase 2). Closed: frozen engine_denied.
		update_ontology: gated(
			'update_ontology.update_ontology',
			engineDenied(
				'update_ontology.update_ontology',
				'it replaces the shared dd_ontology from the PHP install ontology files',
			),
			updateOntologyOwned,
		),
		export_to_translate: engineDenied(
			'update_ontology.export_to_translate',
			'it writes translation export files into the PHP install',
		),
		rebuild_lang_files: engineDenied(
			'update_ontology.rebuild_lang_files',
			'it regenerates the PHP tree JS lang files',
		),
	},
	getValue: updateOntologyGetValue,
};
