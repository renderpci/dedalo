/**
 * THE AUTHORIZATION-DOOR MATRIX — closure Step 3's step gate.
 *
 * ONE behavioural matrix over every door this step owns, with the door list
 * DERIVED from the registries that already exist (no fourth census):
 *
 *   - READ_DOOR_POSTURE (security/read_door.ts) — its `mutating` rows, its
 *     `component` rows (DELEGATED only when test/helpers/read_door_probes.ts
 *     lists them — read_door_acl_native proves each of those legs completed;
 *     the `gate` label alone is not evidence), and
 *     every row of the two media classes (dd_component_av_api / _3d_api);
 *   - every loaded tool's apiActions of kind record / record_tipo / tipo /
 *     targets, plus tool_transcription's record doors (permission:null,
 *     gated in-handler);
 *   - the MCP TOOL_REGISTRY search / count tools and every `write` tool;
 *   - `mcpApiActions` (the agent door).
 *
 * An empty derivation throws. Every derived door is either PROBED here, or
 * DELEGATED (a `component` row naming READ_DOOR_GATE AND listed in
 * READ_DOOR_PROBED), or listed in the shrink-only
 * NOT_YET_PROBED with its reason — a new door that is none of the three is RED.
 *
 * THE IDENTITIES (authz_door_fixture, asserted through the real resolver first):
 *   NO_SECTION   the components at 2, the SECTION at an explicit 0
 *   NO_COMPONENT the section at 2, the COMPONENT at an explicit 0
 *   OUT_OF_SCOPE every grant, the record in a project it does not hold
 *   NO_TOOL      every grant, tool_assistant NOT authorized
 *   DD1725       a (dd128, dd1725) user-manager on their OWN account
  *   ADMIN_ID0    a GLOBAL ADMIN addressing a non-positive record id (SEC-05) —
 *                ALWAYS on the scratch section (test3/-1), never root's dd128/-1:
 *                a regressed door would WRITE (or delete) what the cell aims at,
 *                and the refusal rule is id-generic (root's own record is probed
 *                gate-only, write_door_native leg b)

 *   READ_ONLY    the section and components at 1 — may search, may not create
 *   ADMIN_CAPPED the SUPERUSER on a consultation-only section (Activity dd542):
 *                the cap is the only thing that can refuse it
  *   NO_SOURCE    the transcript writable (2), the AV SOURCE at 0 (TOOLS-06)
 *   TRANSCRIBER  the transcript writable (2), the AV at READ (1) — the typical
 *                transcriber profile: every transcription door serves it past
 *                the gate (one level on the AV for every WAV-deriving path)
 *   READ_COMPONENT the section writable (2), every media component and both
 *                transcripts at READ (1): past a write door's section floor, so
 *                ONLY the level-2 pair can refuse it — the column that separates
 *                a write action from one authorized in read mode (media writes,
 *                the transcript write, a record_tipo/tipo write kind)
 *   READ_SECTION the mirror: the section at READ (1), every media component
 *                WRITABLE (2) — past a write door's pair, so ONLY the section
 *                floor can refuse it (the media writes keep HEAD's floor 2)

 *   CONTROL      every grant, in scope (the tool-granted twin at the agent door)
 * — and CONTROL is the anti-vacuity column: a door that refuses everything is
 * red on it.
 *
 * A REFUSAL MUST BE THE RIGHT ONE. A DD1725 cell (and any cell a probe pins in
 * `refusalTipo`) counts as refused ONLY when the door answered `perm.denied`
 * naming the pinned component: a grammar refusal (`request.invalid*`) or a
 * denial on ANOTHER component (a second gate further down) would let the rule
 * under test disappear with the cell still green. Where the door speaks through
 * an opaque channel (a tool PermissionCheck sentence, a wire envelope — the
 * coordinates are log-only there) the code must still be `perm.denied`, and
 * the probe's only target IS the pinned pair.
 *
 * `DD128_PROBED` (test/helpers/authz_door_probes.ts) — the doors whose DD1725
 * leg proves a census file `delegates` — is read by the dd128 write census; this
 * matrix asserts that every door it lists IS probed here with a DD1725 column
 * that answers `refused`. The census checks the membership, the matrix the
 * outcome (a helper, because a TEST file imported by another registers its
 * tests twice).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { TOOL_REGISTRY } from '../../src/ai/mcp/registry.ts';
import {
	duplicateRecord,
	findOrCreate,
	portalUnlink,
	setField,
} from '../../src/ai/mcp/tools/fields_write.ts';
import { uploadMedia } from '../../src/ai/mcp/tools/media.ts';
import { searchSectionRecords } from '../../src/ai/mcp/tools/records_read.ts';
import {
	createRecord,
	deleteRecord,
	saveComponentValue,
} from '../../src/ai/mcp/tools/records_write.ts';
import { countRecords, searchRecords } from '../../src/ai/mcp/tools/search.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { ActionHandler, ApiRequestContext } from '../../src/core/api/handler_context.ts';
import { component3dApiActions } from '../../src/core/api/handlers/dd_component_3d_api.ts';
import { componentAvApiActions } from '../../src/core/api/handlers/dd_component_av_api.ts';
import { componentTextAreaApiActions } from '../../src/core/api/handlers/dd_component_text_area_api.ts';
import { mcpApiActions } from '../../src/core/api/handlers/dd_mcp_api.ts';
import { resolveMediaActionContext } from '../../src/core/api/handlers/media_action_context.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { type Principal, resolvePrincipal } from '../../src/core/security/permissions.ts';
import { READ_DOOR_GATE, READ_DOOR_POSTURE } from '../../src/core/security/read_door.ts';
import { createSession, getSession, type Session } from '../../src/core/security/session_store.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { loadToolModules } from '../../src/core/tools/loader.ts';
import type {
	GatedToolActionSpec,
	ToolActionContext,
	ToolActionSpec,
} from '../../src/core/tools/module.ts';
import { assertActionPermission } from '../../src/core/tools/security.ts';
import {
	AUTHZ_3D,
	AUTHZ_AV,
	AUTHZ_PROJECT_P,
	AUTHZ_SECTION,
	AUTHZ_TEXT,
	AUTHZ_TEXT_AREA,
	AUTHZ_USER_MANAGER_PROFILE_ID,
	AUTHZ_USER_MANAGER_USER_ID,
	type AuthzIdentities,
	assertAuthzDoorContrast,
	authzProjectLocator,
	createDoorRecord,
	installAuthzDoorFixture,
	removeAuthzDoorFixture,
	resolveAuthzIdentities,
} from '../helpers/authz_door_fixture.ts';
import { DD128_PROBED } from '../helpers/authz_door_probes.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import { READ_DOOR_PROBED } from '../helpers/read_door_probes.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

type IdentityKey =
	| 'NO_SECTION'
	| 'NO_COMPONENT'
	| 'OUT_OF_SCOPE'
	| 'NO_TOOL'
	| 'DD1725'
	| 'ADMIN_ID0'
	| 'READ_ONLY'
	| 'ADMIN_CAPPED'
	| 'NO_SOURCE'
	| 'TRANSCRIBER'
	| 'READ_COMPONENT'
	| 'READ_SECTION'
	| 'CONTROL';
type Verdict = 'refused' | 'served';
interface Outcome {
	verdict: Verdict;
	detail: string;
	/** The refusal's registry code (tool sentences mapped back to theirs). */
	code?: string;
	/** The refused component, when the channel carries coordinates. */
	tipo?: string;
	/** True when the channel cannot carry coordinates (tool check / wire envelope). */
	opaque?: boolean;
}
interface Probe {
	expect: Partial<Record<IdentityKey, Verdict>>;
	/** The component a refused cell must be denied ON (DD1725 defaults to dd1725). */
	refusalTipo?: Partial<Record<IdentityKey, string>>;
	run: (identity: IdentityKey) => Promise<Outcome>;
}

const USERS = 'dd128';
const MATRIX_TEXT = 'zzauthz matrix text';

// --- outcome classification ----------------------------------------------------

/** A DOOR refusal: an authorization or target-grammar code. Anything else is past the door. */
function isDoorRefusalCode(code: string): boolean {
	return (
		code.startsWith('perm.') || code === 'tool.not_authorized' || code.startsWith('request.invalid')
	);
}

/** The tool envelope's sentences, mapped back to the write door's codes (tools/security.ts toCheck). */
const TOOL_SENTENCE_CODES: Readonly<Record<string, string>> = {
	'insufficient permissions on target': 'perm.denied',
	'record is out of the user scope': 'perm.out_of_scope',
};

function checkOutcome(check: { msg?: string; errors?: string[] }): Outcome {
	const msg = check.msg ?? '';
	const code =
		TOOL_SENTENCE_CODES[msg] ?? (check.errors?.[0] === 'invalid_request' ? 'request.invalid' : msg);
	return { verdict: 'refused', detail: `${check.errors?.[0] ?? ''}: ${msg}`, code, opaque: true };
}

function envelopeOutcome(value: { status: number; body?: { error?: { code?: string } } }): Outcome {
	const code = value.body?.error?.code ?? '';
	if (code !== '' && isDoorRefusalCode(code)) {
		return { verdict: 'refused', detail: code, code, opaque: true };
	}
	return { verdict: 'served', detail: code === '' ? `status ${value.status}` : code };
}

function errorOutcome(error: DedaloError): Outcome {
	if (!isDoorRefusalCode(error.code)) {
		return { verdict: 'served', detail: `past the door: ${error.code}` };
	}
	const tipo = error.coordinates?.tipo;
	return {
		verdict: 'refused',
		detail: `${error.code}${tipo === undefined ? '' : ` on ${String(tipo)}`}`,
		code: error.code,
		...(tipo === undefined ? {} : { tipo: String(tipo) }),
	};
}

async function outcomeOf(run: () => Promise<unknown>): Promise<Outcome> {
	try {
		const value = await run();
		// assertActionPermission answers a PermissionCheck.
		if (
			value !== null &&
			typeof value === 'object' &&
			'ok' in value &&
			(value as { ok: unknown }).ok === false
		) {
			return checkOutcome(value as { msg?: string; errors?: string[] });
		}
		// A dispatch result carries an envelope.
		if (value !== null && typeof value === 'object' && 'status' in value && 'body' in value) {
			return envelopeOutcome(value as { status: number; body?: { error?: { code?: string } } });
		}
		return { verdict: 'served', detail: 'resolved' };
	} catch (error) {
		if (error instanceof DedaloError) return errorOutcome(error);
		throw error;
	}
}

/**
 * The cell's verdict against the design: the verdict itself, and — for a
 * refused cell with a pinned component — `perm.denied` ON that component.
 */
function cellMismatch(probe: Probe, identity: IdentityKey, expected: Verdict, outcome: Outcome) {
	if (outcome.verdict !== expected) return `expected ${expected}, got ${outcome.verdict}`;
	if (expected !== 'refused') return null;
	const pinned = probe.refusalTipo?.[identity] ?? (identity === 'DD1725' ? 'dd1725' : undefined);
	if (pinned === undefined) return null;
	if (outcome.code !== 'perm.denied')
		return `expected perm.denied ON ${pinned}, got ${outcome.code}`;
	if (outcome.opaque !== true && outcome.tipo !== pinned) {
		return `expected perm.denied ON ${pinned}, got it ON ${outcome.tipo ?? '(none)'}`;
	}
	return null;
}

// --- disposable records (the lifecycle doors' CONTROL leg) --------------------

/** Records a probe may delete or mint (duplicate) — swept tolerantly in afterAll. */
const disposable: { sectionTipo: string; sectionId: number }[] = [];

/** An engine-built test3 record in project P that the CONTROL's delete may consume. */
async function disposableRecord(): Promise<number> {
	await assertTestDatabase('authz_door_matrix_native: disposable record');
	const sectionId = await createSectionRecord(AUTHZ_SECTION, -1, new Date(), undefined, {
		filterData: [authzProjectLocator()],
	});
	disposable.push({ sectionTipo: AUTHZ_SECTION, sectionId });
	const saved = await saveComponentData({
		componentTipo: 'test101',
		sectionTipo: AUTHZ_SECTION,
		sectionId,
		lang: 'lg-nolan',
		changedData: [{ action: 'set_data', key: null, value: [authzProjectLocator()] } as never],
		userId: -1,
	});
	if (!saved.ok) throw new Error(`disposable record: membership save failed (${saved.message})`);
	return sectionId;
}

/**
 * SAFETY for the multi-delete probe: the SQO must select AT MOST the one pinned
 * record (none on a section the probe does not write) — verified with the
 * engine's own assembler BEFORE the delete is sent, so a sanitizer that dropped
 * the pin can never turn the CONTROL leg into a whole-section delete.
 */
async function assertSqoPinsAtMostOne(
	sqo: Record<string, unknown>,
	sectionTipo: string,
	pinned: number,
): Promise<void> {
	const { sanitizeClientSqo } = await import('../../src/core/concepts/sqo.ts');
	const { buildSearchSql } = await import('../../src/core/search/sql_assembler.ts');
	const { sql } = await import('../../src/core/db/postgres.ts');
	const built = await buildSearchSql(sanitizeClientSqo(structuredClone(sqo)), { idsOnly: true });
	const rows = (await sql.unsafe(built.sql, built.params as (string | number | null)[])) as {
		section_tipo: string;
		section_id: number | string;
	}[];
	const other = rows.filter(
		(row) => row.section_tipo !== sectionTipo || Number(row.section_id) !== pinned,
	);
	if (other.length > 0 || rows.length > 1) {
		throw new Error(
			`authz matrix: the multi-delete SQO selects ${rows.length} row(s), not just ${sectionTipo}/${pinned} — refusing to send it`,
		);
	}
}

async function sweepDisposable(): Promise<void> {
	await assertTestDatabase('authz_door_matrix_native: sweep');
	const { deleteMatrixRecord } = await import('../../src/core/db/matrix_write.ts');
	const { sql } = await import('../../src/core/db/postgres.ts');
	const { getMatrixTableFromTipo } = await import('../../src/core/ontology/resolver.ts');
	// A REGRESSED ADMIN_ID0 cell may have written the scratch section's
	// non-positive id (no genuine record ever holds one): swept, tolerantly.
	const scratchTable = await getMatrixTableFromTipo(AUTHZ_SECTION);
	if (scratchTable === null) throw new Error(`no matrix table for ${AUTHZ_SECTION}`);
	for (const sectionId of [-1, 0]) {
		await deleteMatrixRecord(scratchTable, AUTHZ_SECTION, sectionId);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[AUTHZ_SECTION, sectionId],
		);
	}
	while (disposable.length > 0) {
		const record = disposable.pop() as { sectionTipo: string; sectionId: number };
		const table = await getMatrixTableFromTipo(record.sectionTipo);
		if (table === null) throw new Error(`no matrix table for ${record.sectionTipo}`);
		// Tolerant: the CONTROL's delete legitimately consumed some of these.
		await deleteMatrixRecord(table, record.sectionTipo, record.sectionId);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[record.sectionTipo, record.sectionId],
		);
	}
}

// --- identity plumbing ---------------------------------------------------------

let ids: AuthzIdentities;
let superuser: Principal;
let recordId = 0;
const sessions = new Map<number, Session>();

/** Activity — a consultation-only section: the superuser's level there caps at read. */
const CONSULTATION_ONLY = 'dd542';

function principalOf(identity: IdentityKey): Principal {
	switch (identity) {
		case 'NO_SECTION':
			return ids.componentOnly;
		case 'NO_COMPONENT':
			return ids.sectionOnly;
		case 'OUT_OF_SCOPE':
			return ids.outOfScope;
		case 'NO_TOOL':
			return ids.control;
		case 'DD1725':
			return ids.userManager;
		case 'ADMIN_ID0':
			return ids.dd128Admin;
		case 'READ_ONLY':
			return ids.level1;
		case 'ADMIN_CAPPED':
			return superuser;
		case 'NO_SOURCE':
			return ids.textOnly;
		case 'TRANSCRIBER':
			return ids.transcriber;
		case 'READ_COMPONENT':
			return ids.readComponent;
		case 'READ_SECTION':
			return ids.readSection;

		case 'CONTROL':
			return ids.control;
	}
}

/**
 * The record target an identity probes: its own dd128 account (DD1725), a
 * non-positive id ON THE SCRATCH SECTION (ADMIN_ID0 — never root's record, which
 * a regressed door would overwrite), or the scratch record.
 */
function recordTarget(identity: IdentityKey, componentTipo: string) {
	if (identity === 'DD1725') {
		return { section_tipo: USERS, tipo: 'dd1725', section_id: AUTHZ_USER_MANAGER_USER_ID };
	}
	if (identity === 'ADMIN_ID0')
		return { section_tipo: AUTHZ_SECTION, tipo: componentTipo, section_id: -1 };
	return { section_tipo: AUTHZ_SECTION, tipo: componentTipo, section_id: recordId };
}

function sessionFor(principal: Principal): Session {
	let session = sessions.get(principal.userId);
	if (session === undefined) {
		const token = createSession(
			principal.userId,
			`zzauthz_${principal.userId}`,
			principal.isGlobalAdmin,
		);
		session = getSession(token) as Session;
		sessions.set(principal.userId, session);
	}
	return session;
}

const handlerContext = (principal: Principal): ApiRequestContext =>
	({
		requestId: 'authz-matrix',
		clientIp: '127.0.0.1',
		session: sessionFor(principal),
		csrfCandidate: null,
		principal,
	}) as ApiRequestContext;

const dispatchContext = (principal: Principal) => {
	const session = sessionFor(principal);
	return {
		requestId: crypto.randomUUID(),
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session.csrfToken,
	};
};

// --- the probes ----------------------------------------------------------------

const FULL: Partial<Record<IdentityKey, Verdict>> = {
	NO_SECTION: 'refused',
	NO_COMPONENT: 'refused',
	OUT_OF_SCOPE: 'refused',
	ADMIN_ID0: 'refused',
	CONTROL: 'served',
};

/** A tool action's DECLARATIVE gate — the door the dispatch runs before the handler. */
function toolKindProbe(spec: GatedToolActionSpec, key: string): Probe {
	const kind = spec.permission;
	const writes = (spec.minLevel ?? 2) >= 2;
	// A `record` door whose effect is ONE COMPONENT (RECORD_KIND_EFFECT) is the
	// open hole: its component cells are NOT certified here — the OPEN canary
	// below measures them as the hole they are, never as the design.
	const componentEffect = RECORD_KIND_EFFECT[key]?.effect === 'component';
	const expectations: Partial<Record<IdentityKey, Verdict>> =
		kind === 'record'
			? // A section-kind door: the component is not its question — which is
				// only correct for a door whose EFFECT is section-wide (the
				// RECORD_KIND_EFFECT census classifies every one of them).
				{
					NO_SECTION: 'refused',
					...(componentEffect ? {} : { NO_COMPONENT: 'served', READ_COMPONENT: 'served' }),
					OUT_OF_SCOPE: 'refused',
					ADMIN_ID0: 'refused',
					CONTROL: 'served',
				}
			: {
					...FULL,
					// The dd128 own-record DOWNGRADE forces the manager's OWN dd1725 to
					// READ (1): a write door refuses it, a READ door (minLevel 1) serves
					// it — reading one's own profile assignment is the rule, not a leak.
					DD1725: writes ? 'refused' : 'served',
					// The section at 2, the AV at 1: only a WRITE-level pair refuses it.
					READ_COMPONENT: writes ? 'refused' : 'served',
				};
	return {
		expect: expectations,
		...(kind !== 'record' && writes ? { refusalTipo: { READ_COMPONENT: AUTHZ_AV } } : {}),
		run: (identity) => {
			const target = recordTarget(identity, AUTHZ_AV);
			const options =
				kind === 'record'
					? { section_tipo: target.section_tipo, section_id: target.section_id }
					: target;
			return outcomeOf(() =>
				assertActionPermission(spec as ToolActionSpec, options, principalOf(identity)),
			);
		},
	};
}

/**
 * The `section` kind's DECLARATIVE gate (authorizeSectionTarget): the section
 * level, consultation-capped, then the scope of a NAMED record — the component
 * is not its question. Probed with a named record so the scope half runs.
 */
function sectionKindProbe(spec: GatedToolActionSpec): Probe {
	const writes = (spec.minLevel ?? 2) >= 2;
	return {
		expect: {
			NO_SECTION: 'refused',
			NO_COMPONENT: 'served',
			OUT_OF_SCOPE: 'refused',
			ADMIN_ID0: 'refused',
			READ_ONLY: writes ? 'refused' : 'served',
			CONTROL: 'served',
		},
		run: (identity) => {
			const target = recordTarget(identity, AUTHZ_AV);
			return outcomeOf(() =>
				assertActionPermission(
					spec as ToolActionSpec,
					{ section_tipo: target.section_tipo, section_id: target.section_id },
					principalOf(identity),
				),
			);
		},
	};
}

/**
 * The `developer` kind: the developer flag is the whole gate (no section or
 * record target — module.ts). CONTROL is the SUPERUSER (a developer); every
 * fixture identity is a non-developer and is refused.
 */
function developerKindProbe(spec: GatedToolActionSpec): Probe {
	return {
		expect: { NO_SECTION: 'refused', ADMIN_ID0: 'refused', CONTROL: 'served' },
		run: (identity) =>
			outcomeOf(() =>
				assertActionPermission(
					spec as ToolActionSpec,
					{},
					identity === 'CONTROL' ? superuser : principalOf(identity),
				),
			),
	};
}

function mediaProbe(
	handler: ActionHandler,
	action: string,
	model: 'component_av' | 'component_3d',
	tipo: string,
	minLevel: 1 | 2,
): Probe {
	return {
		// READ_COMPONENT (section 2, the component 1): a WRITE action is refused
		// ON the component — the pair half, which the section floor cannot
		// answer for it — and a READ action serves it. READ_SECTION (section 1,
		// the component 2) is the mirror: only the section floor at 2 refuses a
		// write (media_action_context_native pins the refusal on the SECTION half).
		expect: {
			...FULL,
			READ_COMPONENT: minLevel === 2 ? 'refused' : 'served',
			READ_SECTION: minLevel === 2 ? 'refused' : 'served',
		},
		...(minLevel === 2 ? { refusalTipo: { READ_COMPONENT: tipo } } : {}),
		run: (identity) => {
			const principal = principalOf(identity);
			const source = recordTarget(identity, tipo);
			const rqo = {
				action,
				source,
				options:
					action === 'move_file_to_dir'
						? {
								target_dir: 'posterframe',
								file_data: { name: 'a.jpg', key_dir: 'no_such_key', tmp_name: 'no_such_tmp' },
							}
						: {},
			} as unknown as Rqo;
			// A SERVED cell probes the gate itself (no media effect: CONTROL, and
			// READ_COMPONENT / READ_SECTION on a read action); every other identity
			// goes through the real handler, which must refuse before any effect.
			return outcomeOf(() =>
				identity === 'CONTROL' ||
				((identity === 'READ_COMPONENT' || identity === 'READ_SECTION') && minLevel === 1)
					? resolveMediaActionContext(
							rqo,
							handlerContext(principal),
							minLevel,
							model,
							`matrix:${action}`,
						)
					: handler(rqo, handlerContext(principal)),
			);
		},
	};
}

function transcriptionProbe(
	handler: ToolActionSpec['handler'],
	optionsOf: (target: ReturnType<typeof recordTarget>) => Record<string, unknown>,
	/** The action WRITES the transcript: its DD1725 leg aims the write at the manager's own dd1725. */
	writesTranscript = false,
	/**
	 * The transcript this action AUTHORS (automatic_transcription's
	 * transcription_ddo, build_subtitles_file's VTT source): READ_COMPONENT holds
	 * it at 1 and must be refused ON it — the write level of that leg.
	 */
	authoredTranscript?: string,
	/**
	 * The action is the SHARED per-record WAV's lifecycle
	 * (create_ / delete_transcribable_audio_file): the SECTION at write (2), so
	 * the READ_ONLY viewer (section 1, AV 1) is refused — ON the AV pair's
	 * coordinates, by the section half.
	 */
	sharedWavLifecycle = false,
): Probe {
	return {
		// automatic_transcription also READS its media SOURCE (TOOLS-06): NO_SOURCE
		// passes the transcript's write gate and must be denied ON the AV.
		// TRANSCRIBER (AV at 1) is served past the gate by EVERY transcription door:
		// deriving a throwaway WAV / audio from the AV is a READ of it.
		expect: {
			...FULL,
			TRANSCRIBER: 'served',
			READ_COMPONENT: authoredTranscript === undefined ? 'served' : 'refused',
			// A transcript-authoring door refuses the viewer on the transcript; the
			// shared WAV's create / delete on the section half; the status poll serves it.
			READ_ONLY: authoredTranscript !== undefined || sharedWavLifecycle ? 'refused' : 'served',
			...(writesTranscript ? { DD1725: 'refused', NO_SOURCE: 'refused' } : {}),
		},
		refusalTipo: {
			...(writesTranscript ? { NO_SOURCE: AUTHZ_AV } : {}),
			...(authoredTranscript === undefined ? {} : { READ_COMPONENT: authoredTranscript }),
			...(sharedWavLifecycle ? { READ_ONLY: AUTHZ_AV } : {}),
		},
		run: (identity) => {
			const principal = principalOf(identity);
			const target = recordTarget(identity, AUTHZ_AV);
			const options = optionsOf(target);
			if (identity === 'DD1725' && writesTranscript) {
				// The own-record rule, not a missing pair grant: the transcript's
				// WRITE target is the manager's OWN (dd128, dd1725), which the profile
				// grants at 2 and the downgrade forces to 1.
				options.transcription_ddo = {
					component_tipo: target.tipo,
					section_tipo: target.section_tipo,
					section_id: target.section_id,
				};
			}
			const context = {
				principal,
				userId: principal.userId,
				options,
				background: false,
			};
			return outcomeOf(() => handler(context as ToolActionContext));
		},
	};
}

function mcpSearchProbe(run: (principal: Principal) => Promise<unknown>): Probe {
	return {
		expect: { NO_SECTION: 'refused', CONTROL: 'served' },
		run: (identity) => outcomeOf(() => run(principalOf(identity))),
	};
}

function mcpWriteProbe(
	run: (
		principal: Principal,
		target: { section_tipo: string; tipo: string; section_id: number },
	) => Promise<unknown>,
): Probe {
	return {
		// dd128's own-record DOWNGRADE already holds at the MCP doors (P1-2); the
		// leg stays so the delegation cannot lose it.
		expect: { ...FULL, DD1725: 'refused' },
		run: (identity) => {
			const target = recordTarget(identity, AUTHZ_TEXT);
			return outcomeOf(() => run(principalOf(identity), target));
		},
	};
}

function agentProbe(action: string, options: Record<string, unknown>): Probe {
	return {
		expect: { NO_TOOL: 'refused', CONTROL: 'served' },
		run: (identity) => {
			const principal = identity === 'CONTROL' ? ids.toolGranted : principalOf(identity);
			return outcomeOf(() =>
				dispatchRqo(
					{ action, dd_api: 'dd_mcp_api', options } as unknown as Rqo,
					dispatchContext(principal) as never,
				),
			);
		},
	};
}

// --- the census ------------------------------------------------------------------

const MEDIA_CLASSES = {
	dd_component_av_api: { actions: componentAvApiActions, model: 'component_av', tipo: AUTHZ_AV },
	dd_component_3d_api: { actions: component3dApiActions, model: 'component_3d', tipo: AUTHZ_3D },
} as const;

const TRANSCRIPTION_OPTIONS: Record<
	string,
	(t: ReturnType<typeof recordTarget>) => Record<string, unknown>
> = {
	create_transcribable_audio_file: (t) => ({
		media_ddo: { component_tipo: AUTHZ_AV, section_tipo: t.section_tipo, section_id: t.section_id },
	}),
	delete_transcribable_audio_file: (t) => ({
		media_ddo: { component_tipo: AUTHZ_AV, section_tipo: t.section_tipo, section_id: t.section_id },
	}),
	automatic_transcription: (t) => ({
		media_ddo: { component_tipo: AUTHZ_AV, section_tipo: t.section_tipo, section_id: t.section_id },
		transcription_ddo: {
			component_tipo: AUTHZ_TEXT_AREA,
			section_tipo: t.section_tipo,
			section_id: t.section_id,
		},
		source_lang: 'lg-eng',
		transcriber_quality: 'audio',
		transcriber_engine: 'babel_transcriber',
	}),
	check_server_transcriber_status: (t) => ({
		media_ddo: { component_tipo: AUTHZ_AV, section_tipo: t.section_tipo, section_id: t.section_id },
		transcriber_engine: 'babel_transcriber',
		pid: 123,
	}),
	build_subtitles_file: (t) => ({
		section_tipo: t.section_tipo,
		component_tipo: AUTHZ_TEXT_AREA,
		section_id: t.section_id,
		lang: 'lg-eng',
		max_charline: 40,
	}),
};

/** The transcript each transcription door AUTHORS (write level 2) — every other door only reads. */
const TRANSCRIPT_AUTHORED: Readonly<Record<string, string>> = {
	automatic_transcription: AUTHZ_TEXT_AREA,
	build_subtitles_file: AUTHZ_TEXT_AREA,
};

/**
 * EVERY `record`-kind tool action, classified by its EFFECT. The `record` kind
 * asks the section level and the record scope, NEVER the component — correct
 * only for a door whose effect is section-wide (or addresses no component of the
 * payload). A handler that writes or reads ONE component named by the payload
 * (`tipo` / `component_tipo`) must declare `record_tipo`: on the `record` kind a
 * profile explicitly denied that component acts on it through the section grant
 * (the WRITE-DOOR / SEC-2-media hole). A `record`-kind action missing here is
 * RED; a listed key that is no longer a `record`-kind action is RED (stale).
 * `component` entries are the OPEN holes — shrink-only through
 * {@link RECORD_KIND_COMPONENT_CEILING}, each with an OPEN canary below.
 */
const RECORD_KIND_EFFECT: Readonly<
	Record<string, { effect: 'section' | 'component'; reason: string }>
> = {
	'tool:tool_posterframe:get_ar_identifying_image': {
		effect: 'section',
		reason:
			"reads the records that REFERENCE the target record (inverse references, each hit scoped to the caller's projects) — no component of the payload is read or written",
	},
	'tool:tool_dev_template:write_demo': {
		effect: 'section',
		reason:
			"the exemplar's section-level demo: echoes the record coordinates and writes nothing (its component twin, component_write_demo, is record_tipo)",
	},
};

/** The pinned number of OPEN `component` entries above (lower it when one is re-declared record_tipo). */
const RECORD_KIND_COMPONENT_CEILING = 0;

/**
 * SHRINK-ONLY. A door the matrix does not probe YET, with the reason. An entry
 * that is no longer a derived door, or that has become probed, is RED (stale);
 * and the COUNT is pinned by {@link NOT_YET_PROBED_CEILING} — silencing a new
 * ungated door by adding a line here needs a second, visible edit.
 */
const NOT_YET_PROBED: Readonly<Record<string, string>> = {
	'dd_component_portal_api:delete_locator':
		'SEC-2 deletePortalLocator — a SEPARATE run after Step 2 owns relations/save.ts',
	'dd_diffusion_api:diffuse':
		'diffusion subsystem door (Step 6) — not a record/component write door of this step',
	'dd_diffusion_api:cancel_process': 'diffusion subsystem door (Step 6)',
	'dd_diffusion_api:rebuild_media_index': 'diffusion subsystem door (Step 6)',
	'dd_diffusion_api:sweep_published_langs': 'diffusion subsystem door (Step 6)',
	'dd_diffusion_api:retry_pending_deletions': 'diffusion subsystem door (Step 6)',
	'dd_area_maintenance_api:lock_components_actions':
		'maintenance-area lock state — the dd88 admin gate, no record addressed',
	'dd_error_report_api:receive_report':
		'pre-authentication report intake — no record, no grant to test',
	'dd_ts_api:add_child': 'thesaurus tree write (Step 5 tree integrity owns the tree doors)',
	'dd_ts_api:update_parent_data': 'thesaurus tree write (Step 5)',
	'dd_ts_api:save_order': 'thesaurus tree write (Step 5)',
	'dd_utils_api:update_lock_components_state': 'session UI lock state — no record write',
	'dd_utils_api:stop_process': 'process control — the job owner check, not a record door',
	'dd_utils_api:change_lang': 'session language — no record',
	'dd_utils_api:delete_uploaded_file': "the caller's own upload staging — no record",
	'dd_utils_api:install': 'installer — its own install-state gate',
	'dd_utils_api:login': 'session lifecycle — pre-authentication',
	'dd_utils_api:request_password_reset': 'session lifecycle — pre-authentication',
	'dd_utils_api:confirm_password_reset': 'session lifecycle — pre-authentication',
	'dd_utils_api:quit': 'session lifecycle',
	'dd_utils_api:join_chunked_files_uploaded': "the caller's own upload staging — no record",
	'mcp:dedalo_portal_link': 'MCP portal link — needs a portal fixture on the scratch record',
	'tool:tool_dev_template:scoped_batch_demo':
		'targets kind: the extractor reads an action-specific payload shape',
	'tool:tool_hierarchy:generate_virtual_section':
		'targets kind: extractor-specific payload (hierarchy records)',
	'tool:tool_hierarchy:inspect_hierarchy':
		'targets kind: extractor-specific payload (hierarchy records)',
	'tool:tool_import_files:get_media_section_match':
		'targets kind: extractor-specific payload (import mapping)',
	'tool:tool_import_files:get_media_section_match_from_souce':
		'targets kind: extractor-specific payload (import mapping)',
	'tool:tool_import_files:import_files': 'targets kind: extractor-specific payload (import batch)',
	'tool:tool_import_marc21:import_files': 'targets kind: extractor-specific payload (import batch)',
	'tool:tool_import_zotero:import_files': 'targets kind: extractor-specific payload (import batch)',
	'tool:tool_update_cache:update_cache':
		'targets kind: extractor-specific payload (component list)',
	// section_list kind — the batch's section targets ride an action-specific payload.
	'tool:tool_dev_template:batch_demo': 'section_list kind: extractor-specific payload',
	'tool:tool_identify:cluster': 'section_list kind: extractor-specific payload (cluster scope)',
	'tool:tool_import_dedalo_csv:import_files':
		'section_list kind: extractor-specific payload (import batch)',
	'tool:tool_import_dedalo_csv:validate_import':
		'section_list kind: extractor-specific payload (import batch)',
	'tool:tool_import_rdf:get_rdf_data': 'section_list kind: extractor-specific payload (rdf import)',
	'tool:tool_update_cache:get_component_list':
		'section_list kind: extractor-specific payload (component list)',
	// permission: null — gated IN the handler (the named exemption; its
	// gatedInHandler prose is pinned by tool_permission_census_tripwire).
	'tool:tool_lang:automatic_translation':
		'OPEN record-WRITING door gated in-handler (assertTranslationPermissions: a raw getPermissions pair + the record kind, src/core/tools/translation.ts) — not yet on the write door, not probed (outside lane 2)',
	'tool:tool_lang_multi:automatic_translation':
		'OPEN record-WRITING door — the same in-handler assertTranslationPermissions as tool_lang (outside lane 2)',
	'tool:tool_propagate_component_data:propagate_component_data':
		'OPEN record-WRITING batch door gated in-handler (raw getPermissions pair up front + per-row re-authorization) — not probed (tools/tool_propagate_component_data is outside lane 2)',
	'tool:tool_error_report:send_report': 'global-admin check in-handler — no record target',
	'tool:tool_dev_template:status': 'UNGATED constant literal — no record, no write',
	'tool:tool_import_dedalo_csv:get_csv_files':
		"the caller's own staging directory (importDir(ctx.userId)) — no record",
	'tool:tool_import_dedalo_csv:delete_csv_file':
		"the caller's own staging directory (importDir(ctx.userId)) — no record",
	'tool:tool_import_dedalo_csv:process_uploaded_file':
		"the caller's own staging directory (importDir(ctx.userId)) — no record",
	'tool:tool_media_versions:get_job_status': 'job-ownership rule (mayStreamJob) — no record door',
	'tool:tool_upload:get_job_status': 'job-ownership rule (mayStreamJob) — no record door',
	'tool:tool_transcription:get_model_sources': 'install configuration read — no record',
	'tool:tool_transcription:download_model': 'global-admin model store write — no record',
	'tool:tool_transcription:verify_model': 'global-admin model store read — no record',
	'tool:tool_transcription:repair_model': 'global-admin model store write — no record',
	'tool:tool_sitebuilder:get_status':
		'assertPublisher (developer/global admin) — daemon door, no record',
	'tool:tool_sitebuilder:list_sites': 'assertPublisher — daemon door, no record',
	'tool:tool_sitebuilder:create_site': 'assertPublisher — daemon door, no record',
	'tool:tool_sitebuilder:delete_site': 'assertPublisher — daemon door, no record',
	'tool:tool_sitebuilder:session_start': 'assertPublisher — daemon door, no record',
	'tool:tool_sitebuilder:session_message': 'assertPublisher + assertSessionOwner — no record',
	'tool:tool_sitebuilder:session_stop': 'assertPublisher + assertSessionOwner — no record',
	'tool:tool_sitebuilder:session_history': 'assertPublisher — daemon door, no record',
	'tool:tool_sitebuilder:session_stream': 'assertPublisher + assertSessionOwner — no record',
	'tool:tool_sitebuilder:build': 'assertPublisher — daemon door, no record',
	'tool:tool_sitebuilder:get_build': 'assertPublisher — daemon door, no record',
	'tool:tool_sitebuilder:preview': 'assertPublisher — daemon door, no record',
	'tool:tool_sitebuilder:publish': 'assertPublisher — daemon door, no record',
	'tool:tool_sitebuilder:get_audit': 'assertPublisher — daemon door, no record',
};

/**
 * The pinned size of NOT_YET_PROBED (lower it when a door becomes probed; never
 * raise it silently). Raised 31 → 65 VISIBLY in review r9, when the census became
 * total over the tool registry (every apiActions entry, not only the
 * record-addressed kinds): 28 in-handler `permission: null` doors and 6
 * `section_list` doors that were simply never counted.
 */
const NOT_YET_PROBED_CEILING = 65;

interface Census {
	probes: Map<string, Probe>;
	delegated: Set<string>;
	derived: Set<string>;
	/** Every loaded `record`-kind tool action (RECORD_KIND_EFFECT must classify each). */
	recordKind: Set<string>;
}

async function deriveCensus(): Promise<Census> {
	const probes = new Map<string, Probe>();
	const delegated = new Set<string>();
	const derived = new Set<string>();
	const recordKind = new Set<string>();

	// 1. READ_DOOR_POSTURE — mutating + component rows, and every media row.
	for (const [key, posture] of READ_DOOR_POSTURE) {
		const [api, action] = key.split(':') as [string, string];
		const media = MEDIA_CLASSES[api as keyof typeof MEDIA_CLASSES];
		if (media !== undefined) {
			derived.add(key);
			const handler = media.actions[action];
			if (handler === undefined) throw new Error(`posture row ${key} names no handler`);
			probes.set(
				key,
				mediaProbe(
					handler,
					action,
					media.model,
					media.tipo,
					posture.posture === 'mutating' ? 2 : 1,
				),
			);
			continue;
		}
		if (posture.posture === 'mutating') derived.add(key);
		if (posture.posture === 'component') {
			derived.add(key);
			// DELEGATED only on EVIDENCE, never on the label: the row names the read
			// door gate AND read_door_acl_native registers a leg for it that runs to
			// completion (test/helpers/read_door_probes.ts — its own last test
			// asserts the completed set equals READ_DOOR_PROBED).
			if (posture.gate === READ_DOOR_GATE && READ_DOOR_PROBED.has(key)) delegated.add(key);
		}
	}

	// 2. tool apiActions — EVERY action of every loaded tool is a derived door,
	// whatever its kind (an in-handler `permission: null` door that writes a
	// record is exactly what a kind-filtered walk would miss). The declarative
	// kinds the matrix can drive generically are probed; transcription's
	// in-handler doors are probed through TRANSCRIPTION_OPTIONS; everything else
	// must be in NOT_YET_PROBED with its reason, or the totality test is RED.
	const transcriptionActions = new Set<string>();
	for (const [toolName, loaded] of await loadToolModules()) {
		for (const [action, spec] of Object.entries(loaded.module.apiActions)) {
			const key = `tool:${toolName}:${action}`;
			derived.add(key);
			if (toolName === 'tool_transcription') transcriptionActions.add(action);
			if (
				spec.permission === 'record' ||
				spec.permission === 'record_tipo' ||
				spec.permission === 'tipo'
			) {
				if (spec.permission === 'record') recordKind.add(key);
				probes.set(key, toolKindProbe(spec, key));
			} else if (spec.permission === 'section') {
				probes.set(key, sectionKindProbe(spec));
			} else if (spec.permission === 'developer') {
				probes.set(key, developerKindProbe(spec));
			} else if (toolName === 'tool_transcription' && TRANSCRIPTION_OPTIONS[action] !== undefined) {
				probes.set(
					key,
					transcriptionProbe(
						spec.handler,
						TRANSCRIPTION_OPTIONS[action],
						action === 'automatic_transcription',
						TRANSCRIPT_AUTHORED[action],
						action === 'create_transcribable_audio_file' ||
							action === 'delete_transcribable_audio_file',
					),
				);
			}
		}
	}
	// No stale probe: every TRANSCRIPTION_OPTIONS key is a live tool_transcription action.
	const staleTranscription = Object.keys(TRANSCRIPTION_OPTIONS).filter(
		(action) => !transcriptionActions.has(action),
	);
	if (staleTranscription.length > 0) {
		throw new Error(
			`TRANSCRIPTION_OPTIONS names no tool_transcription action: ${staleTranscription.join(', ')}`,
		);
	}

	// 3. MCP TOOL_REGISTRY — search / count + every write tool.
	for (const spec of TOOL_REGISTRY) {
		const key = `mcp:${spec.name}`;
		if (spec.write === true || /^dedalo_(search|count)_/.test(spec.name)) derived.add(key);
	}
	probes.set(
		'mcp:dedalo_search_section',
		mcpSearchProbe((p) => searchSectionRecords(p, { section_tipo: AUTHZ_SECTION })),
	);
	probes.set(
		'mcp:dedalo_search_records',
		mcpSearchProbe((p) => searchRecords(p, { section_tipo: AUTHZ_SECTION })),
	);
	probes.set(
		'mcp:dedalo_count_records',
		mcpSearchProbe((p) => countRecords(p, { section_tipo: AUTHZ_SECTION })),
	);
	probes.set(
		'mcp:dedalo_set_field',
		mcpWriteProbe((p, t) =>
			setField(p, {
				section_tipo: t.section_tipo,
				section_id: t.section_id,
				field: t.tipo,
				// dd1725 is a RELATION field: its value is a locator — the manager's
				// OWN profile, already assigned — so a door that let the DD1725 leg
				// through would WRITE (served), never trip a value-grammar refusal.
				value:
					t.tipo === 'dd1725'
						? { section_tipo: 'dd234', section_id: AUTHZ_USER_MANAGER_PROFILE_ID }
						: MATRIX_TEXT,
				lang: 'lg-eng',
				mode: 'replace',
			}),
		),
	);
	// portal_unlink — the file's SECOND dd128-reachable writer (it authorizes
	// itself, then calls deletePortalLocator; it does not go through setField).
	// DD1725 aims it at the manager's OWN dd1725 locator (its own profile): the
	// write door's own-record downgrade must refuse it before the locator is
	// looked up. Every other refused identity is refused by the door before any
	// lookup; the CONTROL is served PAST the door (the literal field holds no
	// such locator: resource.not_found — nothing is unlinked).
	probes.set(
		'mcp:dedalo_portal_unlink',
		mcpWriteProbe((p, t) =>
			portalUnlink(p, {
				section_tipo: t.section_tipo,
				section_id: t.section_id,
				field: t.tipo,
				target:
					t.tipo === 'dd1725'
						? { section_tipo: 'dd234', section_id: AUTHZ_USER_MANAGER_PROFILE_ID }
						: { section_tipo: AUTHZ_SECTION, section_id: recordId },
			}),
		),
	);
	probes.set(
		'mcp:dedalo_save_component',
		mcpWriteProbe((p, t) =>
			saveComponentValue(p, {
				section_tipo: t.section_tipo,
				tipo: t.tipo,
				section_id: t.section_id,
				lang: 'lg-eng',
				action: 'update',
				value: { id: 1, lang: 'lg-eng', value: MATRIX_TEXT },
			}),
		),
	);

	// The MCP record-lifecycle + media doors (closure Step 3: authorizeSectionTarget
	// / authorizeRecordAccess). Every identity that could DESTROY or MINT acts on
	// a DISPOSABLE record, and every id a probe mints is swept — a regressed door
	// must never take the shared record, or leave a row behind.
	const mcpSection = (identity: IdentityKey) =>
		identity === 'ADMIN_CAPPED' ? CONSULTATION_ONLY : AUTHZ_SECTION;
	// A section-level shortfall names the SECTION itself: the cap refuses ON
	// dd542, the read-only level ON test3 — never a grammar or a search refusal.
	const SECTION_LEVEL_PINS: Partial<Record<IdentityKey, string>> = {
		READ_ONLY: AUTHZ_SECTION,
		ADMIN_CAPPED: CONSULTATION_ONLY,
	};
	probes.set('mcp:dedalo_create_record', {
		refusalTipo: SECTION_LEVEL_PINS,
		// A create names no record: NO_SECTION / READ_ONLY are short on the section
		// level; the superuser is refused only by the consultation cap.
		expect: {
			NO_SECTION: 'refused',
			READ_ONLY: 'refused',
			ADMIN_CAPPED: 'refused',
			CONTROL: 'served',
		},
		run: (identity) =>
			outcomeOf(async () => {
				const created = await createRecord(principalOf(identity), {
					section_tipo: mcpSection(identity),
				});
				disposable.push({ sectionTipo: mcpSection(identity), sectionId: created.section_id });
				return created;
			}),
	});
	const lifecycleRecord = async (identity: IdentityKey) =>
		identity === 'ADMIN_ID0'
			? { section_tipo: AUTHZ_SECTION, section_id: -1 }
			: { section_tipo: AUTHZ_SECTION, section_id: await disposableRecord() };
	const LIFECYCLE: Partial<Record<IdentityKey, Verdict>> = {
		NO_SECTION: 'refused',
		READ_ONLY: 'refused',
		OUT_OF_SCOPE: 'refused',
		ADMIN_ID0: 'refused',
		CONTROL: 'served',
	};
	probes.set('mcp:dedalo_delete_record', {
		expect: LIFECYCLE,
		run: async (identity) => {
			const target = await lifecycleRecord(identity);
			return outcomeOf(() => deleteRecord(principalOf(identity), target));
		},
	});
	probes.set('mcp:dedalo_duplicate_record', {
		expect: LIFECYCLE,
		run: async (identity) => {
			const target = await lifecycleRecord(identity);
			return outcomeOf(async () => {
				const copy = await duplicateRecord(principalOf(identity), target);
				disposable.push({ sectionTipo: copy.section_tipo, sectionId: copy.section_id });
				return copy;
			});
		},
	});
	probes.set('mcp:dedalo_upload_media', {
		// The write door on (section, media component, record). CONTROL is served
		// PAST the door: its source is a path the deployment refuses
		// (mcp.media_path_disabled / resource.not_found) — nothing is staged.
		expect: { ...FULL, DD1725: 'refused' },
		run: (identity) => {
			const target = recordTarget(identity, AUTHZ_AV);
			return outcomeOf(() =>
				uploadMedia(principalOf(identity), {
					section_tipo: target.section_tipo,
					section_id: target.section_id,
					field: target.tipo,
					source: { kind: 'path', path: '/zzauthz/no/such/file.mp4' },
				}),
			);
		},
	});
	// find_or_create — the SEARCH half (NO_SECTION: the section read grant) and
	// the CREATE half: a match nobody holds forces the create branch, where
	// READ_ONLY (may search, may not create) and the capped superuser are refused.
	// CONTROL completes a create: the SUPERUSER, because a test3 record is born
	// with no project (record_defaults' FILTER_EXCLUDED_SECTIONS) and the fill
	// step after the create is then out of any non-admin's scope.
	// NO_COMPONENT (the section at 2, the match field at 0): refused BEFORE the
	// create, ON the match field — the field pre-flight (review r8); the record
	// count + sequence half is mcp_record_door_native.
	probes.set('mcp:dedalo_find_or_create', {
		refusalTipo: { ...SECTION_LEVEL_PINS, NO_COMPONENT: AUTHZ_TEXT },
		expect: {
			NO_SECTION: 'refused',
			NO_COMPONENT: 'refused',
			READ_ONLY: 'refused',
			ADMIN_CAPPED: 'refused',
			CONTROL: 'served',
		},
		run: (identity) =>
			outcomeOf(async () => {
				const found = await findOrCreate(
					identity === 'CONTROL' ? superuser : principalOf(identity),
					{
						section_tipo: mcpSection(identity),
						match: [
							{
								field: identity === 'ADMIN_CAPPED' ? 'dd544' : AUTHZ_TEXT,
								value: `zzauthz foc ${crypto.randomUUID()}`,
								lang: 'lg-eng',
							},
						],
					},
				);
				if (found.created)
					disposable.push({ sectionTipo: found.section_tipo, sectionId: found.section_id });
				return found;
			}),
	});

	// 4. the agent door.
	for (const action of Object.keys(mcpApiActions)) {
		const key = `dd_mcp_api:${action}`;
		derived.add(key);
		probes.set(
			key,
			agentProbe(
				action,
				action === 'mcp_proxy'
					? { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }
					: action.startsWith('agent_chat')
						? { question: 'zzauthz matrix', model: 'zzstub' }
						: action === 'agent_apply'
							? { plan: { ops: [] }, plan_hash: 'zzauthz-not-a-hash' }
							: {},
			),
		);
	}

	// 5. the human doors this step delegates.
	probes.set('dd_core_api:save', {
		// save's section floor is 0 — the NAMED exception (PHP component_common::save
		// parity + subdatum inline editing): NO_SECTION is SERVED there, by design.
		expect: {
			NO_SECTION: 'served',
			NO_COMPONENT: 'refused',
			OUT_OF_SCOPE: 'refused',
			DD1725: 'refused',
			ADMIN_ID0: 'refused',
			CONTROL: 'served',
		},
		run: (identity) => {
			const target = recordTarget(identity, AUTHZ_TEXT);
			const rqo = {
				action: 'save',
				dd_api: 'dd_core_api',
				prevent_lock: true,
				source: {
					typo: 'source',
					type: 'component',
					tipo: target.tipo,
					section_tipo: target.section_tipo,
					section_id: String(target.section_id),
					mode: 'edit',
					lang: 'lg-eng',
				},
				data: {
					section_id: String(target.section_id),
					section_tipo: target.section_tipo,
					tipo: target.tipo,
					lang: 'lg-eng',
					changed_data: [
						{ action: 'update', id: null, value: { lang: 'lg-eng', value: MATRIX_TEXT } },
					],
				},
			} as unknown as Rqo;
			return outcomeOf(() => dispatchRqo(rqo, dispatchContext(principalOf(identity)) as never));
		},
	});
	// The record-lifecycle doors delegated to authorizeSectionTarget (closure Step
	// 3): the SECTION level (consultation-capped) + the record scope with the
	// non-positive-id refusal ahead of the admin bypass. A whole-record door: the
	// component is not its question (no NO_COMPONENT column). EVERY identity that
	// could destroy or mint acts on its OWN disposable record (swept after) — a
	// regressed door must never consume the shared record, or it would bury the
	// real red cell under the cascade of every later door's CONTROL.
	const lifecycleTarget = async (identity: IdentityKey) =>
		identity === 'ADMIN_ID0'
			? { section_tipo: AUTHZ_SECTION, section_id: -1 }
			: { section_tipo: AUTHZ_SECTION, section_id: await disposableRecord() };
	probes.set('dd_core_api:duplicate', {
		expect: {
			NO_SECTION: 'refused',
			OUT_OF_SCOPE: 'refused',
			ADMIN_ID0: 'refused',
			CONTROL: 'served',
		},
		run: (identity) =>
			outcomeOf(async () => {
				const result = await dispatchRqo(
					{
						action: 'duplicate',
						dd_api: 'dd_core_api',
						source: { ...(await lifecycleTarget(identity)), model: 'section' },
					} as unknown as Rqo,
					dispatchContext(principalOf(identity)) as never,
				);
				const newId = Number((result.body as { data?: unknown }).data);
				if (result.status === 200 && Number.isInteger(newId) && newId > 0) {
					disposable.push({ sectionTipo: AUTHZ_SECTION, sectionId: newId });
				}
				return result;
			}),
	});
	probes.set('dd_core_api:delete', {
		expect: {
			NO_SECTION: 'refused',
			OUT_OF_SCOPE: 'refused',
			ADMIN_ID0: 'refused',
			CONTROL: 'served',
		},
		run: (identity) =>
			outcomeOf(async () => {
				const target = await lifecycleTarget(identity);
				return dispatchRqo(
					{
						action: 'delete',
						dd_api: 'dd_core_api',
						source: { ...target, delete_mode: 'delete_record', model: 'section' },
					} as unknown as Rqo,
					dispatchContext(principalOf(identity)) as never,
				);
			}),
	});

	probes.set('dd_core_api:create', {
		refusalTipo: SECTION_LEVEL_PINS,
		expect: {
			NO_SECTION: 'refused',
			READ_ONLY: 'refused',
			ADMIN_CAPPED: 'refused',
			CONTROL: 'served',
		},
		run: (identity) =>
			outcomeOf(async () => {
				const sectionTipo = mcpSection(identity);
				const result = await dispatchRqo(
					{
						action: 'create',
						dd_api: 'dd_core_api',
						source: { section_tipo: sectionTipo, model: 'section' },
					} as unknown as Rqo,
					dispatchContext(principalOf(identity)) as never,
				);
				const newId = Number((result.body as { data?: unknown }).data);
				if (result.status === 200 && Number.isInteger(newId) && newId > 0) {
					disposable.push({ sectionTipo, sectionId: newId });
				}
				return result;
			}),
	});
	// THE SQO MULTI-DELETE (a global-admin operation): the section target is
	// consultation-capped like every section-level write — a global admin's SQO
	// over Activity is refused (ADMIN_CAPPED), a non-admin's over test3 too
	// (NO_SECTION: the level; READ_ONLY: the level); the CONTROL is the superuser's
	// SQO pinned to ONE disposable record (filter_by_locators), and the pin is
	// VERIFIED to match exactly that record before anything is sent.
	probes.set('dd_core_api:delete#sqo', {
		refusalTipo: SECTION_LEVEL_PINS,
		expect: {
			NO_SECTION: 'refused',
			READ_ONLY: 'refused',
			ADMIN_CAPPED: 'refused',
			CONTROL: 'served',
		},
		run: (identity) =>
			outcomeOf(async () => {
				const sectionTipo = mcpSection(identity);
				// ADMIN_CAPPED pins an id no Activity row holds: the SQO selects NOTHING,
				// so only the door's cap can refuse it (the delete engine's own backstop
				// never runs on zero targets) — the door itself is what this cell measures.
				const pinned = identity === 'ADMIN_CAPPED' ? 2_000_000_001 : await disposableRecord();
				const sqo = {
					section_tipo: [sectionTipo],
					filter_by_locators: [{ section_tipo: sectionTipo, section_id: pinned }],
					limit: 1,
				};
				await assertSqoPinsAtMostOne(sqo, sectionTipo, pinned);
				return dispatchRqo(
					{
						action: 'delete',
						dd_api: 'dd_core_api',
						source: { section_tipo: sectionTipo, delete_mode: 'delete_record', model: 'section' },
						sqo,
					} as unknown as Rqo,
					dispatchContext(identity === 'CONTROL' ? superuser : principalOf(identity)) as never,
				);
			}),
	});

	const deleteTag = componentTextAreaApiActions.delete_tag;
	if (deleteTag === undefined)
		throw new Error('dd_component_text_area_api:delete_tag is not registered');
	probes.set('dd_component_text_area_api:delete_tag', {
		// DD1725: the tag delete aimed at the manager's OWN (dd128, dd1725) — the
		// write door's own-record downgrade refuses it. NO_SECTION is SERVED: the
		// tag delete is the save door's twin (the same inline-edit write on the
		// same component) and carries its named floor-0 exception (review r8).
		expect: { ...FULL, NO_SECTION: 'served', DD1725: 'refused' },
		run: (identity) => {
			const target = recordTarget(identity, AUTHZ_TEXT_AREA);
			const rqo = {
				action: 'delete_tag',
				source: {
					tipo: target.tipo,
					section_tipo: target.section_tipo,
					section_id: target.section_id,
				},
				options: { tag_id: '5', type: 'index' },
			} as unknown as Rqo;
			return outcomeOf(() => deleteTag(rqo, handlerContext(principalOf(identity))));
		},
	});

	if (derived.size === 0 || probes.size === 0) {
		throw new Error('authz door matrix derived ZERO doors — the registry walk is broken');
	}
	return { probes, delegated, derived, recordKind };
}

describe.if(DB_READY)('Step 3 — the authorization-door matrix', () => {
	let census: Census;
	let provider: ReturnType<typeof Bun.serve> | null = null;
	const savedEnv: Record<string, string | undefined> = {};
	const ENV_KEYS = [
		'DEDALO_AGENT_HTTP_ENABLED',
		'DEDALO_AGENT_ALLOW_WRITE',
		'DEDALO_AGENT_MODELS',
		'ANTHROPIC_API_KEY',
	];

	beforeAll(async () => {
		for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
		// The agent door's model endpoint is a local stand-in: no probe may reach
		// a real provider.
		provider = Bun.serve({
			port: 0,
			hostname: '127.0.0.1',
			fetch: () =>
				Response.json({
					choices: [
						{ index: 0, message: { role: 'assistant', content: 'zzauthz' }, finish_reason: 'stop' },
					],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				}),
		});
		process.env.DEDALO_AGENT_HTTP_ENABLED = 'true';
		delete process.env.DEDALO_AGENT_ALLOW_WRITE;
		delete process.env.ANTHROPIC_API_KEY;
		process.env.DEDALO_AGENT_MODELS = JSON.stringify([
			{
				id: 'zzstub',
				label: 'zzauthz stub',
				provider: 'openai_compatible',
				model: 'zzstub-native',
				endpoint: `http://127.0.0.1:${provider.port}/v1/chat/completions`,
				egress: 'local',
			},
		]);
		await installAuthzDoorFixture();
		recordId = await createDoorRecord(AUTHZ_SECTION, AUTHZ_PROJECT_P, [
			{ tipo: AUTHZ_TEXT, lang: 'lg-eng', value: [{ id: 1, lang: 'lg-eng', value: MATRIX_TEXT }] },
		]);
		ids = await resolveAuthzIdentities();
		superuser = await resolvePrincipal(-1);
		census = await deriveCensus();
	});

	afterAll(async () => {
		await sweepDisposable();
		provider?.stop(true);
		for (const key of ENV_KEYS) {
			if (savedEnv[key] === undefined) delete process.env[key];
			else process.env[key] = savedEnv[key];
		}
		await removeAuthzDoorFixture();
	});

	test('the contrast is live (guards every cell)', async () => {
		await assertAuthzDoorContrast(ids);
	});

	test('the census is TOTAL: every derived door is probed, delegated, or NOT_YET_PROBED', () => {
		// FLOOR: the walk really read the registries (posture rows, tools, MCP, agent).
		expect(census.derived.size).toBeGreaterThan(60);
		expect(census.probes.size).toBeGreaterThan(40);
		const unclassified = [...census.derived].filter(
			(key) =>
				!census.probes.has(key) && !census.delegated.has(key) && NOT_YET_PROBED[key] === undefined,
		);
		expect(unclassified).toEqual([]);
	});

	test('READ_DOOR_PROBED names only rows that CLAIM the proof: posture `component` gated by READ_DOOR_GATE, or a `mutating` row whose search half is probed (a downgraded row cannot under-claim a proven door)', () => {
		expect(READ_DOOR_PROBED.size).toBeGreaterThan(0);
		for (const key of READ_DOOR_PROBED) {
			const posture = READ_DOOR_POSTURE.get(key);
			const claims =
				posture?.posture === 'mutating' ||
				(posture?.posture === 'component' &&
					(posture as { gate?: string }).gate === READ_DOOR_GATE);
			expect({ key, posture: posture?.posture, claims }).toMatchObject({
				key,
				claims: true,
			});
			// …and the matrix classifies it as covered: DELEGATED (a component row the
			// matrix does not drive itself) or PROBED here (the media rows).
			expect({ key, covered: census.delegated.has(key) || census.probes.has(key) }).toEqual({
				key,
				covered: true,
			});
		}
	});

	test('RECORD_KIND_EFFECT is TOTAL over the `record`-kind tool actions, with no stale key', () => {
		expect(census.recordKind.size).toBeGreaterThan(0);
		expect([...census.recordKind].sort()).toEqual(Object.keys(RECORD_KIND_EFFECT).sort());
	});

	test('RECORD_KIND_EFFECT: the OPEN component-effect `record` doors are shrink-only (pinned count)', () => {
		const open = Object.entries(RECORD_KIND_EFFECT).filter(([, row]) => row.effect === 'component');
		expect(open.length).toBe(RECORD_KIND_COMPONENT_CEILING);
	});

	test('OPEN canary: every component-effect `record` door STILL lets NO_COMPONENT through (red once fixed — then drop its row and lower the ceiling)', async () => {
		for (const [key, row] of Object.entries(RECORD_KIND_EFFECT)) {
			if (row.effect !== 'component') continue;
			const probe = census.probes.get(key);
			if (probe === undefined) throw new Error(`${key} is not probed`);
			// The hole, measured: the section-only gate serves a caller holding the
			// component at an explicit 0. A fix (record_tipo) refuses it here.
			expect({ key, noComponent: (await probe.run('NO_COMPONENT')).verdict }).toEqual({
				key,
				noComponent: 'served',
			});
		}
	});

	test('NOT_YET_PROBED is shrink-only: no stale entry (every key a derived, unprobed door)', () => {
		const stale = Object.keys(NOT_YET_PROBED).filter(
			(key) => !census.derived.has(key) || census.probes.has(key),
		);
		expect(stale).toEqual([]);
	});

	test('NOT_YET_PROBED is shrink-only: its size is the pinned ceiling (growth needs a second, visible edit)', () => {
		expect(Object.keys(NOT_YET_PROBED).length).toBe(NOT_YET_PROBED_CEILING);
	});

	test('DD128_PROBED: every door a census `delegates` row stands on is probed here, with a refused DD1725 leg', () => {
		const files = Object.keys(DD128_PROBED);
		expect(files.length).toBeGreaterThan(0);
		for (const [file, doors] of Object.entries(DD128_PROBED)) {
			expect(doors.length, `${file} names no door`).toBeGreaterThan(0);
			for (const door of doors) {
				expect({ file, door, probed: census.probes.has(door) }).toEqual({
					file,
					door,
					probed: true,
				});
				expect({ file, door, dd1725: census.probes.get(door)?.expect.DD1725 }).toEqual({
					file,
					door,
					dd1725: 'refused',
				});
			}
		}
	});

	test('every probe has the CONTROL column (anti-vacuity) and at least one refusal column', () => {
		for (const [key, probe] of census.probes) {
			expect({ key, control: probe.expect.CONTROL }).toEqual({ key, control: 'served' });
			expect(Object.values(probe.expect).includes('refused')).toBe(true);
		}
	});

	test('the matrix: every probed door answers every identity as the design says', async () => {
		const wrong: string[] = [];
		let cells = 0;
		for (const [key, probe] of [...census.probes.entries()].sort(([a], [b]) =>
			a.localeCompare(b),
		)) {
			for (const [identity, expected] of Object.entries(probe.expect) as [IdentityKey, Verdict][]) {
				cells++;
				const outcome = await probe.run(identity);
				const mismatch = cellMismatch(probe, identity, expected, outcome);
				if (mismatch !== null) wrong.push(`${key} × ${identity}: ${mismatch} (${outcome.detail})`);
			}
		}
		// FLOOR: the matrix really ran (a probe table that emptied would pass `wrong`).
		expect(cells).toBeGreaterThan(150);
		expect(wrong).toEqual([]);
	});
});
