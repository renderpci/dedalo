/**
 * Shared machinery of the move_* migration widgets (move_lang / move_locator /
 * move_tld / move_to_portal / move_to_table): the static explanation body
 * (byte-equal to PHP) + the TS-owned definition-file listing + the
 * ownership-gated transform EXECUTE (UPDATE_PROCESS Phase 5, WC-025).
 *
 * DRY RUN IS REQUIRED before an execute: the client passes
 * `{files_selected, dry_run}`; `dry_run` must be exactly false to mutate, and
 * the response reports the deltas either way. Definition files live under the
 * TS-owned config.ops.transformDefinitionsDir (never the PHP tree).
 */

import {
	type WidgetHandler,
	type WidgetModule,
	type WidgetResponse,
	type WidgetSpec,
	engineDenied,
	gated,
} from './support.ts';

const MOVE_WIDGET_BODIES: Record<string, string> = {
	move_lang:
		'Convert map items (e.g., hierarchy89) between translatable and non-translatable components (or vice-versa).<br>\n\t\t\t\t\t   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_lang.<br>\n\t\t\t\t\t   Note: This process can be very time-consuming, as it iterates through all relevant records in the database.',
	move_locator:
		'Move locator defined map items from source (ex. rsc194) to target (ex. rsc197) adding new section_id based in the last section_id of destiny.<br>\n\t\t\t\t\t   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_locator.<br>\n\t\t\t\t\t   Note: this can be a very long process because it has to go through all the records in all the tables.',
	move_tld:
		'Move TLD defined map items from source (ex. numisdata279) to target (ex. tchi1).<br>\n\t\t\t\t\t   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_tld.<br>\n\t\t\t\t\t   Note: this can be a very long process because it has to go through all the records in all the tables.',
	move_to_portal:
		'Move data from a section to another linked section and link together with a portal (e.g. "Use and function" components behind qdp443 to section rsc1340).<br>\n\t\t\t\t\t   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_to_portal.<br>\n\t\t\t\t\t   Note: this can be a very long process because it has to go through all the records in all the tables.',
	move_to_table:
		'Move data from a table to another (e.g. move utoponymy1 to matrix_hierarchy).<br>\n\t\t\t\t\t   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_to_table.<br>',
};

/** Resolve one widget's executor (lazy — avoids loading the whole engine per boot). */
async function executorFor(
	id: string,
): Promise<
	(
		items: unknown,
		recorder: import('../../update/transform/report.ts').TransformRecorder,
	) => Promise<void>
> {
	switch (id) {
		case 'move_tld': {
			const { executeChangesInTipos } = await import('../../update/transform/tipos.ts');
			return executeChangesInTipos;
		}
		case 'move_locator': {
			const { executeChangesInLocators } = await import('../../update/transform/locators.ts');
			return executeChangesInLocators;
		}
		case 'move_to_portal': {
			const { executePortalize } = await import('../../update/transform/portalize.ts');
			return executePortalize;
		}
		case 'move_to_table': {
			const { executeMoveToTable } = await import('../../update/transform/tables.ts');
			return executeMoveToTable;
		}
		case 'move_lang': {
			const { executeMoveLang } = await import('../../update/transform/lang.ts');
			return executeMoveLang;
		}
		default:
			throw new Error(`no transform executor for ${id}`);
	}
}

function moveWidgetGetValue(widget: string): WidgetHandler {
	return async () => {
		const { listDefinitionFiles } = await import('../../update/transform/definitions.ts');
		const files = listDefinitionFiles(
			widget as import('../../update/transform/definitions.ts').MoveWidgetId,
		);
		return {
			result: { body: MOVE_WIDGET_BODIES[widget] ?? '', files },
			msg: 'OK. Request done successfully',
			errors: [],
		};
	};
}

/** The OPEN (owned) transform run — dry-run mandatory before an execute. */
function moveWidgetRun(id: string): WidgetHandler {
	return async (options): Promise<WidgetResponse> => {
		const { runTransform } = await import('../../update/transform/engine.ts');
		const executor = await executorFor(id);
		const report = await runTransform(
			id as import('../../update/transform/definitions.ts').MoveWidgetId,
			options,
			executor,
		);
		// The client reads result/msg/errors; the counts/sample/dryRun ride along
		// as diagnostic fields (the widget renders the envelope generically).
		return {
			result: report.result,
			msg: report.msg,
			errors: report.errors,
			dry_run: report.dryRun,
			counts: report.counts,
			sample: report.sample,
		} as unknown as WidgetResponse;
	};
}

/**
 * Build one move_* widget module (spec + ownership-gated transform EXECUTE +
 * definition panel). Closed (coexisting) keeps the frozen engine_denied; open
 * runs the transform engine (dry-run first — WC-025).
 */
export function buildMoveWidget(id: string, spec: WidgetSpec): WidgetModule {
	return {
		spec,
		apiActions: {
			[id]: gated(
				`${id}.${id}`,
				engineDenied(`${id}.${id}`, 'the bulk transform is driven by PHP-tree definition files'),
				moveWidgetRun(id),
			),
		},
		getValue: moveWidgetGetValue(id),
	};
}
