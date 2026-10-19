/**
 * PUBLICATION HISTORY of one record — read side of the dd1758 ledger.
 *
 * Publication is no longer stamped on the record (the legacy dd271/dd1223
 * dd1224/dd1225 components): every publish / unpublish run INSERTs a row into
 * `matrix_activity_diffusion` (logDiffusionActivity, diffusion_delete.ts). The
 * inspector asks "when was this record first / last published, by whom, and is
 * it still published?" — answered here, beside the writer, so ONE module family
 * owns the ledger's row shape.
 *
 * ONE statement, three LIMIT-1 probes (first publish, last publish, last action
 * of any kind): the record locator rides the kept `relation` GIN
 * (dual-typed section_id, the containment law) and the ledger's own
 * section_id orders by insertion. Never a scan of the record's whole history.
 *
 * (!) RETENTION: with DEDALO_DIFFUSION_LEDGER_RETENTION_DAYS > 0 settled rows
 * are pruned (pruneSettledLedgerRows), so `first` is then "the oldest kept
 * publication", not necessarily the first ever.
 */

import { sql } from '../db/postgres.ts';
import { relationProbeGroups } from '../search/containment.ts';
import { userRecordId } from '../security/user_identity.ts';
import {
	activityTable,
	DIFFUSION_ACTION,
	DIFFUSION_ACTION_KEY,
	diffusionActionContains,
	ensureDiffusionActivityTable,
} from './diffusion_delete.ts';

/** One ledger event, reduced to what a reader may show. */
export interface PublicationEvent {
	/** dd1761 `start` (a virtual dd_date object, Dédalo wall-clock). */
	date: Record<string, unknown> | null;
	/** dd1762 user id, null when the run had no user. */
	userId: number | null;
}

export type PublicationState = 'published' | 'unpublished' | 'pending';

export interface PublicationHistory {
	first: PublicationEvent | null;
	last: PublicationEvent | null;
	/** The latest action of ANY kind; null when the record never reached the ledger. */
	state: PublicationState | null;
}

interface LedgerRow {
	probe: string;
	action: unknown;
	user: unknown;
	date: unknown;
}

const STATE_BY_ACTION: Record<number, PublicationState> = {
	[DIFFUSION_ACTION.published]: 'published',
	[DIFFUSION_ACTION.unpublished]: 'unpublished',
	[DIFFUSION_ACTION.unpublishPending]: 'pending',
};

/** The action id of a dd1767 locator: the explicit key, else the legacy section_id. */
export function decodeLedgerAction(locator: unknown): number | null {
	if (locator === null || typeof locator !== 'object') return null;
	const entry = locator as Record<string, unknown>;
	const raw = entry[DIFFUSION_ACTION_KEY] ?? entry.section_id;
	const action = Number(raw);
	return Number.isInteger(action) ? action : null;
}

function toEvent(row: LedgerRow | undefined): PublicationEvent | null {
	if (row === undefined) return null;
	const start = (row.date as { start?: unknown } | null)?.start;
	return {
		date: start !== null && typeof start === 'object' ? (start as Record<string, unknown>) : null,
		userId: userRecordId((row.user as { section_id?: unknown } | null)?.section_id),
	};
}

/** First / last publication and current state of one record. */
export async function readPublicationHistory(
	sectionTipo: string,
	sectionId: number,
): Promise<PublicationHistory> {
	await ensureDiffusionActivityTable();
	const params: string[] = [];
	const bind = (payload: string): string => {
		params.push(payload);
		return `$${params.length}`;
	};
	const recordVariants = (
		relationProbeGroups('dd1763', [{ section_tipo: sectionTipo, section_id: sectionId }])[0] ?? []
	).map((payload) => `relation @> ${bind(payload)}::text::jsonb`);
	const recordPredicate = `(${recordVariants.join(' OR ')})`;
	const published = diffusionActionContains('relation', DIFFUSION_ACTION.published, bind);
	const table = activityTable();
	const probe = (name: string, extra: string, order: 'ASC' | 'DESC'): string =>
		`(SELECT '${name}' AS probe, relation->'dd1767'->0 AS action, relation->'dd1762'->0 AS "user",
		        date->'dd1761'->0 AS date
		   FROM "${table}"
		  WHERE section_tipo = 'dd1758' AND ${recordPredicate}${extra}
		  ORDER BY section_id ${order} LIMIT 1)`;
	const rows = (await sql.unsafe(
		[
			probe('first', ` AND ${published}`, 'ASC'),
			probe('last', ` AND ${published}`, 'DESC'),
			probe('latest', '', 'DESC'),
		].join(' UNION ALL '),
		params,
	)) as LedgerRow[];
	const byProbe = new Map(rows.map((row) => [row.probe, row]));
	const latestAction = decodeLedgerAction(byProbe.get('latest')?.action);
	return {
		first: toEvent(byProbe.get('first')),
		last: toEvent(byProbe.get('last')),
		state: latestAction === null ? null : (STATE_BY_ACTION[latestAction] ?? null),
	};
}
