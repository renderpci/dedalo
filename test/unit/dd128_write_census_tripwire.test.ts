/**
 * TRIPWIRE — EVERY DOOR THAT CAN WRITE A dd128 COMPONENT CONSULTS THE OWN-RECORD LEVEL
 * RULE (P1-2, SEC-03), or is an ENUMERATED exemption with a written reason.
 *
 * `resolveOwnUserRecordPermission` forces level 1 on dd244 always, and on
 * dd1725/dd515/dd132/dd330 for a non-global-admin, so a user cannot hand themselves a
 * profile, the developer flag, a new username or a different section_id. Its own
 * docblock says missing the DOWNGRADE half is a privilege-escalation hole — and it was a
 * HELPER three doors remembered to call. Every other write door read the RAW matrix
 * level, so a principal holding level 2 on `(dd128, dd1725)` — the departmental
 * user-manager role the downgrade exists to neutralise — was refused by the human save
 * door and SUCCEEDED through `tool_propagate_component_data` and through MCP
 * `set_field`, whose helper took no `sectionId` at all.
 *
 * The rule is now part of the RESOLUTION (`getRecordComponentPermission`), and this gate
 * is what makes forgetting it VISIBLE rather than silent.
 *
 * THE CENSUS IS TOTAL BY DERIVATION, NOT BY HAND. The door set is derived at run time
 * from the callers of the record-write primitives across `src/` and the tools' `server/`
 * trees. A new caller that is not in the table below fails this gate — which is the
 * whole point: the previous shape of this invariant was a rule stated in a docblock,
 * and thirteen doors did not know about it.
 *
 * WHAT THE VERDICTS MEAN, and what is mechanically checked for each:
 *
 *   consults      — the file resolves a record-addressed component level through
 *                   `getRecordComponentPermission`. CHECKED: the symbol is present.
 *   engine        — a write PRIMITIVE. Its docblock states that authorization is the
 *                   caller's responsibility; putting the rule here would authorize
 *                   nothing (there is no principal) — the callers above are the doors.
 *   section-level — the door's gate carries no COMPONENT tipo (a create, a duplicate, a
 *                   whole-record delete, a batch with no single record). The
 *                   per-component rule has nothing to say about it and cannot be
 *                   consulted even in principle.
 *   system        — no principal at all: propagation, provisioning, installer,
 *                   fixtures, the update transform. These run as the engine, not as a
 *                   user; a permission rule would have no actor to judge.
 *   not-dd128     — the write target section is hard-bound to something that is not the
 *                   users section, so no dd128 component can be reached through it.
 *   self          — the write is the ACTOR'S OWN account, already proved by a
 *                   credential in this same call (a verified password, a one-time code).
 *   PENDING       — a door that CAN write a dd128 component and does NOT yet consult the
 *                   rule. Each row names the finding. CHECKED: the symbol is ABSENT, so
 *                   fixing one FAILS this gate and forces the row to move to `consults`
 *                   — a fix cannot land silently. The list is SHRINK-ONLY.
 *
 * PENDING IS NOT AN EXCUSE, IT IS A LEDGER. Every row in it is a real residual of
 * SEC-03, left open because the file is outside the change that wrote this gate; the
 * count is pinned so the set can only get smaller.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

/**
 * The five modules that OWN record writes. Everything below derives from these, so the
 * primitive list underneath is not a hand-kept enumeration that a new writer can slip
 * past: `the primitive list is DERIVED, not enumerated` (below) reads their exports and
 * fails when one appears that is neither a primitive nor a declared non-writer.
 *
 * WHY THIS EXISTS. The census walks all of `src/` and `tools/*​/server/`, so it is total
 * over FILES — but only over files that call one of the primitives, and that list was
 * typed by hand. A sixth record-write export added to any of these modules would have
 * been invisible to a gate whose describe() block says the census is TOTAL. It found one
 * on its first run: `persistModifiedStamp`.
 */
const WRITE_MODULES = [
	'src/core/section/record/save_component.ts',
	'src/core/section_record/record_write.ts',
	'src/core/section/record/create_record.ts',
	'src/core/section/record/duplicate_record.ts',
	'src/core/section/record/delete_record.ts',
];

/**
 * Exports of a WRITE_MODULE that are NOT record-write primitives. Each needs a reason:
 * the point of the derivation is that classifying a new export is a decision somebody
 * has to make in this file, not an omission nobody notices.
 */
const NON_PRIMITIVE_EXPORTS: Record<string, string> = {
	isInstalledDataLang: 'a language predicate; reads config, writes nothing.',
	installedDataLangs: 'a language accessor; reads config, writes nothing.',
	ontologyTldRefusal: 'builds a refusal message from an ontology node; writes nothing.',
	isLangSlicedModel: 'a model-descriptor predicate; writes nothing.',
	isMonovalueModel: 'a model-descriptor predicate; writes nothing.',
	normalizeItemId: 'a value normalizer over an in-memory item; writes nothing.',
	getIdFromKey: 'parses an id out of a key string; writes nothing.',
	applyUpdate: 'the in-memory merge that PRODUCES the value a primitive then persists.',
	buildModifiedAuditWrites: 'builds the audit column payload; the caller persists it.',
	virtualDateNow: 'the ALS-scoped clock for a record being created; writes nothing.',
	buildRecordMetadata: 'assembles the new record’s metadata object; writes nothing.',
	auditUserLocator: 'builds the dd_modified_by locator value; writes nothing.',
	auditDateItem: 'builds the dd_modified_date item; writes nothing.',
	unnamedRemoveRefusal:
		'a PURE PREDICATE over a changed_data array (P0-8, 2026-08-30): it answers with a refusal message when a `remove` names no item, and writes nothing at all. It is exported so the in-memory temporal door can refuse exactly what the persisted door refuses — one law, two doors — which is the opposite of a second write path.',
	persistModifiedStamp:
		'DOES write the matrix, but only the modified-by/modified-date audit columns of a record a primitive is already writing. It can never carry a dd131/dd244/dd133 value, so it is not an account transition and adding it to the primitive list would widen the door set to every save path twice over.',
};

/**
 * The record-write primitives. A file that calls one of these WRITES A RECORD, which is
 * the only definition of "door" that cannot be gamed by renaming a handler.
 */
const WRITE_PRIMITIVES = [
	'saveComponentData(',
	'persistRecordKeys(',
	'persistRecordColumns(',
	'createSectionRecord(',
	'duplicateSectionRecord(',
	'deleteSectionRecord(',
	'deleteSectionData(',
	'deletePortalLocator(',
];

/** The resolver that carries the rule. */
const RULE_SYMBOL = 'getRecordComponentPermission';

type Verdict =
	| 'consults'
	| 'engine'
	| 'section-level'
	| 'system'
	| 'not-dd128'
	| 'self'
	| 'PENDING';

interface CensusRow {
	verdict: Verdict;
	reason: string;
}

const CENSUS: Record<string, CensusRow> = {
	// --- CONSULTS ---------------------------------------------------------
	'src/core/api/handlers/dd_core_api.ts': {
		verdict: 'consults',
		reason:
			'the human save door — the ONE door that already consulted the rule, now through the shared resolver so its number and every other door’s are the same number.',
	},
	'src/ai/mcp/tools/fields_write.ts': {
		verdict: 'consults',
		reason:
			'MCP set_field / portal_link / portal_unlink. Its assertWritePermission helper took no sectionId, which is why the audit called the rule unconsultable here even in principle; the signature now requires one.',
	},
	'src/ai/mcp/tools/records_write.ts': {
		verdict: 'consults',
		reason:
			'MCP save_component / create_record / delete_record — same helper, same signature change; the section-level calls pass null explicitly.',
	},
	'tools/tool_propagate_component_data/server/index.ts': {
		verdict: 'consults',
		reason:
			'THE SEC-03 offender: its per-row re-authorization holds row.section_id and read the raw matrix level, so a self-targeted propagate of dd1725/dd515 succeeded where the human save door refused.',
	},

	// --- ENGINES ----------------------------------------------------------
	'src/core/section/record/save_component.ts': {
		verdict: 'engine',
		reason:
			'THE write engine. Its docblock states authorization is the caller’s responsibility and it holds no principal; the doors above are where the rule can be judged.',
	},
	'src/core/section_record/record_write.ts': {
		verdict: 'engine',
		reason: 'the matrix key/column write chokepoint — no principal, no permission concept.',
	},
	'src/core/section/record/create_record.ts': {
		verdict: 'engine',
		reason: 'record creation primitive; a create addresses no existing record.',
	},
	'src/core/section/record/delete_record.ts': {
		verdict: 'engine',
		reason:
			'record delete primitive; it carries its own non-positive-id refusal (both modes) and no component tipo.',
	},
	'src/core/section/record/duplicate_record.ts': {
		verdict: 'engine',
		reason: 'record duplication primitive; whole-record, no component tipo.',
	},

	// --- SECTION-LEVEL ----------------------------------------------------
	'src/core/ts_object/ts_api.ts': {
		verdict: 'section-level',
		reason:
			'thesaurus tree add_child / delete: its gate is getPermissions(sectionTipo, sectionTipo) and its writes are whole records — no component pair exists to downgrade.',
	},
	'src/core/section/record/temporal.ts': {
		verdict: 'section-level',
		reason:
			'WC-059 temporal instances address no matrix record (the section_id is a client sentinel), so there is no record for the own-record rule to match.',
	},
	'tools/tool_hierarchy/server/tool_hierarchy.ts': {
		verdict: 'section-level',
		reason:
			'hierarchy provisioning behind permission:’section’, writing hierarchy sections; no caller-supplied component pair.',
	},

	// --- SYSTEM (no principal) -------------------------------------------
	'src/core/section/record/observers.ts': {
		verdict: 'system',
		reason:
			'the observer mirror propagation. It runs as the engine after a committed save, with no actor to judge; gating it would make a mirror depend on who happened to trigger it.',
	},
	'src/core/update/transform/portalize.ts': {
		verdict: 'system',
		reason: 'a code-update data transform, run by the updater as userId -1.',
	},
	'src/core/install/hierarchy_activate.ts': {
		verdict: 'system',
		reason: 'installer/activation path — no request, no principal.',
	},
	'src/core/ontology/ontology_write.ts': {
		verdict: 'system',
		reason: 'the dd_ontology write driver; its targets are ontology sections, never dd128.',
	},
	'src/core/ontology/hierarchy_provision.ts': {
		verdict: 'system',
		reason: 'hierarchy provisioning; ontology/hierarchy sections only.',
	},
	'src/core/ontology/data_io.ts': {
		verdict: 'system',
		reason: 'ontology import/export of the `<tld>0` info sections.',
	},
	'src/core/test_data/synthetic_hierarchy_fixture.ts': {
		verdict: 'system',
		reason: 'a repo-owned test fixture builder; it runs under the test-database marker guard.',
	},
	'src/core/area_maintenance/user_stats.ts': {
		verdict: 'system',
		reason:
			'writes its own hard-bound stats section as userId -1; the maintenance area is already global-admin/developer gated.',
	},
	'src/core/area_maintenance/widgets/export_hierarchy.ts': {
		verdict: 'system',
		reason: 'maintenance-area hierarchy export; hard-bound hierarchy/lang sections.',
	},

	// --- NOT dd128 --------------------------------------------------------
	'src/core/security/section_permissions.ts': {
		verdict: 'not-dd128',
		reason:
			'writes dd774 on a PROFILE record (dd234). It is the door that CREATES the (dd128, dd1725) grant this whole item is about, but it never writes dd128 itself.',
	},

	// --- SELF (credential already proved in this call) ---------------------
	'src/core/security/auth.ts': {
		verdict: 'self',
		reason:
			'the login-time password COST UPGRADE: the actor’s own dd133, rewritten with the same plaintext they proved they knew a millisecond earlier. It is also the one caller of runWithoutAccountRevocation.',
	},
	'src/core/security/password_reset.ts': {
		verdict: 'self',
		reason:
			'self-service recovery writes the requester’s own dd133 after a one-time emailed code; the account is re-validated (exists + dd131 active) at confirm time.',
	},

	// --- PENDING (real SEC-03 residuals) ----------------------------------
	'src/core/relations/save.ts': {
		verdict: 'PENDING',
		reason:
			'SEC-03 residual + a NEW observation (2026-08-28): deletePortalLocator gates SECTION-level only — getSectionPermissions(sectionTipo) >= 2 — with NO component level check and NO per-record scope check, so a level-2 grant on (dd128, dd128) removes dd131/dd244/dd1725 locators from ANY user record, the caller’s own included.',
	},
	'src/core/api/handlers/dd_component_portal_api.ts': {
		verdict: 'PENDING',
		reason:
			'the wire door onto the deletePortalLocator hole above: it coerces the id and delegates, adding no level, component or record gate of its own.',
	},
	'src/core/components/component_text_area/tag_delete.ts': {
		verdict: 'PENDING',
		reason:
			'the tag-delete write path; its door (api/handlers/dd_component_text_area_api.ts) reads the raw matrix level and puts isRecordInScope inside `if (!principal.isGlobalAdmin)`. dd128 carries dd135, so the pair is reachable.',
	},
	'src/core/tools/translation.ts': {
		verdict: 'PENDING',
		reason:
			'takes section_tipo + component_tipo from caller options and gates on the raw getPermissions of that pair.',
	},
	'src/core/tools/import_execute.ts': {
		verdict: 'PENDING',
		reason:
			'the import executor writes caller-declared (section, component) pairs; its gate is the declarative tool gate, which reads the raw level.',
	},
	'src/core/tools/import_csv_execute.ts': {
		verdict: 'PENDING',
		reason: 'the CSV import executor — same caller-declared pair, same raw-level gate.',
	},
	'src/core/tools/transcription_asr.ts': {
		verdict: 'PENDING',
		reason:
			'writes the transcription ddo’s (section, component) pair behind the declarative tipo gate.',
	},
	'src/core/media/ingest/companion_writes.ts': {
		verdict: 'PENDING',
		reason:
			'media-ingest companion writes take sectionTipo/componentTipo from their input; the ingest doors gate at the raw level.',
	},
	'tools/tool_import_files/server/index.ts': {
		verdict: 'PENDING',
		reason: 'caller-supplied (section_tipo, component_tipo) behind the declarative tipo gate.',
	},
	'tools/tool_import_dedalo_csv/server/index.ts': {
		verdict: 'PENDING',
		reason: 'caller-supplied section/component import behind the declarative tipo gate.',
	},
	'tools/tool_posterframe/server/index.ts': {
		verdict: 'PENDING',
		reason: 'declarative record_tipo gate — raw level on a caller-supplied pair.',
	},
	'tools/tool_tc/server/index.ts': {
		verdict: 'PENDING',
		reason: 'declarative record_tipo gate — raw level on a caller-supplied pair.',
	},
	'tools/tool_update_cache/server/index.ts': {
		verdict: 'PENDING',
		reason:
			'gated at permission:’section’ yet its handlers rewrite COMPONENTS, so a section-level grant admits a component write the per-component rule never sees.',
	},
	'tools/tool_time_machine/server/bulk_revert.ts': {
		verdict: 'PENDING',
		reason:
			'SEC-03, named: the per-row gate holds row.section_id and reads the raw level of (row.section_tipo, row.tipo).',
	},
	'tools/tool_time_machine/server/tool_time_machine.ts': {
		verdict: 'PENDING',
		reason:
			'apply_value restore: its level check is the inherited declarative tipo gate; it scopes the record but never consults the component rule.',
	},
	'tools/tool_time_machine/server/dataframe_restore.ts': {
		verdict: 'PENDING',
		reason: 'the dataframe half of the same restore path, writing through persistRecordKeys.',
	},
};

/**
 * Doors that gate a dd128 component write WITHOUT calling a write primitive themselves —
 * the derivation above cannot see them, so they are named. The declarative gate is the
 * important one: every tool action that declares `permission: 'tipo'` or
 * `'record_tipo'` inherits it, which is how one un-consulting function became the level
 * gate for a dozen tools at once.
 */
const EXTRA_ROWS: Record<string, CensusRow> = {
	'src/core/tools/security.ts': {
		verdict: 'PENDING',
		reason:
			'THE declarative tool gate every tool inherits. Kind ’tipo’ and kind ’record_tipo’ both read the raw getPermissions of a caller-supplied pair, and ’record_tipo’ already parses a section_id it does not pass on. Fixing this one closes most of the PENDING rows above at once.',
	},
	'src/core/api/handlers/dd_component_text_area_api.ts': {
		verdict: 'PENDING',
		reason:
			'the tag-delete wire door: raw level, then isRecordInScope INSIDE `if (!principal.isGlobalAdmin)` — the SEC-05 shape as well as the SEC-03 one.',
	},
};

/** PINNED. Shrink-only: this may go DOWN, never up. */
const PENDING_COUNT = 18;

function walk(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) walk(path, acc);
		else if (path.endsWith('.ts') && !path.endsWith('.d.ts')) acc.push(path);
	}
	return acc;
}

/** Every file under scan that calls a record-write primitive. */
function deriveWriteDoors(): string[] {
	const files = [
		...walk(join(ROOT, 'src')),
		...walk(join(ROOT, 'tools')).filter((path) => path.includes('/server/')),
	];
	const doors: string[] = [];
	for (const file of files) {
		const source = readFileSync(file, 'utf8');
		if (WRITE_PRIMITIVES.some((primitive) => source.includes(primitive))) {
			doors.push(relative(ROOT, file));
		}
	}
	return doors.sort();
}

const derived = deriveWriteDoors();
const allRows: Record<string, CensusRow> = { ...CENSUS, ...EXTRA_ROWS };

describe('the dd128 write-door census is TOTAL', () => {
	test('the derivation actually found doors (the scan is not silently empty)', () => {
		// Without this, a broken walk() would make every assertion below vacuous.
		expect(derived.length).toBeGreaterThan(20);
		expect(derived).toContain('src/core/api/handlers/dd_core_api.ts');
	});

	test('every derived write door has a census row', () => {
		const missing = derived.filter((file) => allRows[file] === undefined);
		expect(
			missing,
			`New record-write door(s) with no census row:\n  ${missing.join('\n  ')}\nAdd a row to CENSUS with a verdict and a written reason. If it can write a dd128 component, the verdict is 'consults' and the door must call ${RULE_SYMBOL}.`,
		).toEqual([]);
	});

	test('no census row names a file that is no longer a write door (stale rows)', () => {
		const derivedSet = new Set(derived);
		const stale = Object.keys(CENSUS).filter((file) => !derivedSet.has(file));
		expect(
			stale,
			`Census row(s) for files that no longer call a write primitive:\n  ${stale.join('\n  ')}`,
		).toEqual([]);
	});

	test('every row carries a real reason, not a placeholder', () => {
		for (const [file, row] of Object.entries(allRows)) {
			expect(row.reason.length, `${file}: the reason is too short to be a reason`).toBeGreaterThan(
				40,
			);
		}
	});

	test('the EXTRA rows name real files', () => {
		for (const file of Object.keys(EXTRA_ROWS)) {
			expect(() => statSync(join(ROOT, file)), `${file} does not exist`).not.toThrow();
		}
	});
});

describe('the verdicts are true of the source, not just of the table', () => {
	test("every 'consults' door really calls the resolver", () => {
		for (const [file, row] of Object.entries(allRows)) {
			if (row.verdict !== 'consults') continue;
			const source = readFileSync(join(ROOT, file), 'utf8');
			expect(
				source.includes(RULE_SYMBOL),
				`${file} is marked 'consults' but never calls ${RULE_SYMBOL}`,
			).toBe(true);
		}
	});

	test("every 'PENDING' door really does NOT — so a fix cannot land silently", () => {
		for (const [file, row] of Object.entries(allRows)) {
			if (row.verdict !== 'PENDING') continue;
			const source = readFileSync(join(ROOT, file), 'utf8');
			expect(
				source.includes(RULE_SYMBOL),
				`${file} now calls ${RULE_SYMBOL} — move its row from PENDING to 'consults' and lower PENDING_COUNT.`,
			).toBe(false);
		}
	});

	test('the PENDING list is SHRINK-ONLY', () => {
		const pending = Object.values(allRows).filter((row) => row.verdict === 'PENDING').length;
		expect(
			pending,
			`PENDING grew (${pending} > ${PENDING_COUNT}). A new door that can write a dd128 component must CONSULT the rule, not join the backlog.`,
		).toBeLessThanOrEqual(PENDING_COUNT);
		// And the pin stays honest: if the list shrank, lower it.
		expect(
			pending,
			`PENDING shrank to ${pending} — lower PENDING_COUNT to match, so the ratchet keeps biting.`,
		).toBe(PENDING_COUNT);
	});
});

describe('the rule is part of the resolution, not a helper', () => {
	test('getRecordComponentPermission applies the own-record rule before the matrix', async () => {
		const { getRecordComponentPermission, getPermissions, resolveOwnUserRecordPermission } =
			await import('../../src/core/security/permissions.ts');
		// A non-global-admin looking at their OWN user record: the raw matrix level and
		// the resolved one must DISAGREE, or this gate proves nothing.
		const self = { userId: 424242, isGlobalAdmin: false, isDeveloper: false };
		expect(resolveOwnUserRecordPermission(self, 'dd128', 'dd1725', 424242)).toBe(1);
		expect(await getRecordComponentPermission(self, 'dd128', 'dd1725', 424242)).toBe(1);
		// Someone ELSE's record falls through to the matrix, unchanged.
		expect(await getRecordComponentPermission(self, 'dd128', 'dd1725', 424243)).toBe(
			await getPermissions(self, 'dd128', 'dd1725'),
		);
		// dd244 is downgraded even for a global admin (PHP: unconditional).
		const admin = { userId: 424244, isGlobalAdmin: true, isDeveloper: false };
		expect(await getRecordComponentPermission(admin, 'dd128', 'dd244', 424244)).toBe(1);
		// The UPGRADE half survives: the self-service profile editor must keep working.
		expect(await getRecordComponentPermission(self, 'dd128', 'dd133', 424242)).toBe(2);
	});

	test('the MCP write helpers take a sectionId at all (the audit’s "not even in principle")', () => {
		for (const file of ['src/ai/mcp/tools/fields_write.ts', 'src/ai/mcp/tools/records_write.ts']) {
			const source = readFileSync(join(ROOT, file), 'utf8');
			expect(source).toContain('async function assertWritePermission(');
			// The signature must carry the record address, or the rule is unreachable
			// from inside the helper no matter what the call sites hold.
			const signature = /async function assertWritePermission\([\s\S]*?\): Promise<void>/.exec(
				source,
			);
			expect(signature?.[0] ?? '', `${file}: assertWritePermission has no sectionId`).toContain(
				'sectionId',
			);
		}
	});
});

describe('the three record-lifecycle doors refuse a non-positive id ahead of the admin bypass', () => {
	const doorSource = readFileSync(join(ROOT, 'src/core/api/handlers/dd_core_api.ts'), 'utf8');

	test('save, duplicate and delete all go through assertRecordWriteTarget', () => {
		const calls = doorSource.match(/assertRecordWriteTarget\(/g) ?? [];
		// One import + one call per door, three doors.
		expect(calls.length).toBeGreaterThanOrEqual(3);
		for (const operation of ['save', 'duplicate', 'delete']) {
			expect(
				new RegExp(`assertRecordWriteTarget\\([^;]*?'${operation}'`, 's').test(doorSource),
				`no assertRecordWriteTarget call tagged '${operation}'`,
			).toBe(true);
		}
	});

	test('none of them still scopes INSIDE an isGlobalAdmin guard (the SEC-05 shape)', () => {
		// The exact inlining that made root writable: the admin bypass above the
		// non-positive-id refusal, so for an admin the refusal never ran.
		const inlined = /if\s*\(!principal\.isGlobalAdmin\)\s*\{[\s\S]{0,400}?isRecordInScope\(/.exec(
			doorSource,
		);
		expect(
			inlined?.[0] ?? null,
			'dd_core_api still inlines the admin bypass above the refusal',
		).toBeNull();
	});
});

describe('the revocation trigger set is stated ONCE', () => {
	test('the transition set lives in security/revocation.ts and nowhere else', async () => {
		const { ACCOUNT_TRANSITION_COMPONENTS } = await import('../../src/core/security/revocation.ts');
		expect([...ACCOUNT_TRANSITION_COMPONENTS].sort()).toEqual(['dd131', 'dd132', 'dd133', 'dd244']);
		// A second COPY of the set would drift silently — the files would then disagree
		// about what an account transition IS. Individual tipos may of course appear
		// elsewhere (permissions.ts names dd132 in its own self-elevation rule); what may
		// not appear anywhere else is all FOUR together, which is the set.
		const owner = 'src/core/security/revocation.ts';
		for (const file of walk(join(ROOT, 'src'))) {
			const relPath = relative(ROOT, file);
			if (relPath === owner) continue;
			const source = readFileSync(file, 'utf8');
			const carriesAll = [...ACCOUNT_TRANSITION_COMPONENTS].every((tipo) =>
				source.includes(`'${tipo}'`),
			);
			expect(
				carriesAll,
				`${relPath} spells out all four transition tipos — that set belongs to ${owner} alone`,
			).toBe(false);
		}
	});

	test('the two SECTION constants agree between the chokepoint and the seam', async () => {
		// record_write.ts gates on the section tipos INLINE so the hot path of every
		// ordinary write pays two string compares and no import. That is a second copy,
		// and this is what stops it drifting.
		const { USERS_SECTION_TIPO, PROFILES_SECTION_TIPO } = await import(
			'../../src/core/security/revocation.ts'
		);
		const source = readFileSync(join(ROOT, 'src/core/section_record/record_write.ts'), 'utf8');
		const declared =
			/SECURITY_REACTIVE_SECTIONS: ReadonlySet<string> = new Set\(\[([^\]]*)\]\)/.exec(source);
		expect(
			declared,
			'record_write.ts no longer declares SECURITY_REACTIVE_SECTIONS',
		).not.toBeNull();
		const tipos = [...(declared?.[1] ?? '').matchAll(/'([a-z0-9]+)'/g)].map((match) => match[1]);
		expect(tipos.sort()).toEqual([PROFILES_SECTION_TIPO, USERS_SECTION_TIPO].sort());
	});
});

// ---------------------------------------------------------------------------
// THE REACH CENSUS (reviewer must-fix 3) — every write door reaches the seam
// ---------------------------------------------------------------------------

/**
 * A record-write primitive reaches the revocation seam in ONE of three ways, and which
 * one it is decides what this gate has to check of the primitive's CALLERS.
 *
 *   chokepoint — the primitive itself fires the reaction. `persistRecordKeys` and
 *                `persistRecordColumns` host it (record_write.ts, beside fireSaveEvent),
 *                and `saveComponentData` funnels into them plus fires it itself on the
 *                one atomic-insert branch that bypasses them. Nothing is asked of the
 *                caller: this is the point of moving the seam here.
 *   callee     — a different function owns it. `deletePortalLocator` writes with a
 *                direct updateMatrixKeyData and then calls invalidatePermissionsForWrite
 *                post-commit itself, so its callers inherit the reach.
 *   n/a        — the primitive cannot BE an account transition. A create addresses no
 *                existing account; a duplicate writes a NEW record and leaves the source
 *                untouched.
 *   caller     — the primitive holds no principal and no component tipo, so only the
 *                door can decide. The two record-DELETE primitives are the whole class:
 *                deleting a user record is SEC-08, and delete_record.ts cannot know it.
 *
 * Only the `caller` class needs a per-file verdict below.
 */
const PRIMITIVE_REACH: Record<string, 'chokepoint' | 'callee' | 'n/a' | 'caller'> = {
	'saveComponentData(': 'chokepoint',
	'persistRecordKeys(': 'chokepoint',
	'persistRecordColumns(': 'chokepoint',
	'createSectionRecord(': 'n/a',
	'duplicateSectionRecord(': 'n/a',
	'deletePortalLocator(': 'callee',
	'deleteSectionRecord(': 'caller',
	'deleteSectionData(': 'caller',
};

/** Any of these in a file's source means it reaches the seam explicitly. */
const SEAM_SYMBOLS = [
	'revokeDeletedAccountAccess',
	'reactToRecordComponentWrite',
	'scheduleAccountTransitionRevocation',
	'invalidatePermissionsForWrite',
	'invalidateSecurityCachesForSection',
];

/** Doors that call a CALLER-owned primitive but can never address a dd128 record. */
const REACH_EXEMPT: Record<string, string> = {
	'src/core/section/record/delete_record.ts':
		'the delete ENGINE — it DEFINES both primitives, holds no principal and no component tipo, and its own docblock puts authorization on the caller. Putting the seam here would revoke on an ontology delete too.',
	'src/core/test_data/synthetic_hierarchy_fixture.ts':
		'a repo-owned test fixture builder that deletes its own scratch hierarchy records under the test-database marker guard; it names no users section.',
	'tools/tool_hierarchy/server/tool_hierarchy.ts':
		'hierarchy provisioning behind permission:’section’ — it deletes hierarchy section records, never a dd128 one.',
};

/**
 * Doors that CAN delete or unlink a dd128 credential and do NOT reach the seam. Each row
 * names the finding; the list is SHRINK-ONLY and a door that starts reaching FAILS this
 * gate, so a fix cannot land silently.
 */
const REACH_PENDING: Record<string, string> = {
	'src/ai/mcp/tools/fields_write.ts':
		'MCP portal_unlink reaches deletePortalLocator, which DOES fire the seam in relations/save.ts — but only when its own section/level gate lets the call through, and that gate is the SEC-03 hole this file’s CENSUS row also names. Listed so the pair is visible in one place.',
};

/** PINNED. Shrink-only. */
const REACH_PENDING_COUNT = 1;

describe('every record-write door REACHES the revocation seam', () => {
	const callerOwned = Object.entries(PRIMITIVE_REACH)
		.filter(([, kind]) => kind === 'caller')
		.map(([primitive]) => primitive);

	test('the primitive list is DERIVED, not enumerated — a new writer cannot slip past', () => {
		// The one hand-typed link under a describe() that says TOTAL. Every export of a
		// record-write module is either a primitive or a declared non-writer; anything
		// else fails here, with the module and the name.
		const unclassified: string[] = [];
		for (const module of WRITE_MODULES) {
			const source = readFileSync(join(ROOT, module), 'utf8');
			for (const match of source.matchAll(/^export (?:async )?function ([A-Za-z0-9_]+)/gm)) {
				const name = match[1];
				if (name === undefined) continue;
				if (WRITE_PRIMITIVES.includes(`${name}(`)) continue;
				if (NON_PRIMITIVE_EXPORTS[name] !== undefined) continue;
				unclassified.push(`${module}: ${name}`);
			}
		}
		expect(
			unclassified,
			`Export(s) of a record-write module classified as neither a write primitive nor a non-writer:\n  ${unclassified.join('\n  ')}\nAdd it to WRITE_PRIMITIVES (and give it a PRIMITIVE_REACH verdict), or to NON_PRIMITIVE_EXPORTS with a reason.`,
		).toEqual([]);
	});

	test('every declared non-writer is still an export of a write module', () => {
		// Shrink the other way too: a stale exemption is a hole that reads as coverage.
		const exported = new Set<string>();
		for (const module of WRITE_MODULES) {
			const source = readFileSync(join(ROOT, module), 'utf8');
			for (const match of source.matchAll(/^export (?:async )?function ([A-Za-z0-9_]+)/gm)) {
				if (match[1] !== undefined) exported.add(match[1]);
			}
		}
		for (const [name, reason] of Object.entries(NON_PRIMITIVE_EXPORTS)) {
			expect(exported.has(name), `${name} is no longer exported by a write module`).toBe(true);
			expect(reason.length, `${name}: the reason is too short to be a reason`).toBeGreaterThan(30);
		}
	});

	test('the primitive table covers every primitive the census derives from', () => {
		// Without this, adding a primitive to WRITE_PRIMITIVES would widen the door set
		// and silently leave the new class unclassified for the reach.
		expect(Object.keys(PRIMITIVE_REACH).sort()).toEqual([...WRITE_PRIMITIVES].sort());
	});

	test('the CHOKEPOINT really fires the reaction (or every "chokepoint" verdict is a lie)', () => {
		const source = readFileSync(join(ROOT, 'src/core/section_record/record_write.ts'), 'utf8');
		expect(source).toContain('reactToRecordComponentWrite');
		// Both halves: the per-key door AND the whole-column door (the Time Machine's
		// full-record restore, which was the one shape that reached nothing at all).
		const calls = source.match(/reactToSecurityWrite\(/g) ?? [];
		expect(
			calls.length,
			'reactToSecurityWrite is not called from both write doors',
		).toBeGreaterThanOrEqual(3);
	});

	test('the revocation is on the COMMIT-ONLY lane, and the cache clear is not', () => {
		const seam = readFileSync(join(ROOT, 'src/core/security/revocation.ts'), 'utf8');
		// A revocation is destructive and non-idempotent; deferPostTransaction replays on
		// ROLLBACK by contract. The lane is asserted behaviourally in
		// account_revocation_native.test.ts; this is the structural ratchet beside it.
		expect(seam).toMatch(/registerCommitAction\(revoke\)/);
		expect(seam).toMatch(/deferPostTransaction\(clearCaches\)/);
		// And the door that queues on the DEFERRED lane must take the cache half only.
		const save = readFileSync(join(ROOT, 'src/core/section/record/save_component.ts'), 'utf8');
		expect(save).toContain('deferPostTransaction(invalidate)');
		expect(save).toContain('clearSecurityCachesForWrite(');
		expect(
			/const invalidate = \(\): void =>\s*invalidatePermissionsForWrite\(/.test(save),
			'save_component queues the FULL reaction on the rollback-replaying lane again',
		).toBe(false);
	});

	test('every caller-owned delete door reaches the seam, or carries a row', () => {
		const unreached: string[] = [];
		for (const file of derived) {
			const source = readFileSync(join(ROOT, file), 'utf8');
			if (!callerOwned.some((primitive) => source.includes(primitive))) continue;
			if (SEAM_SYMBOLS.some((symbol) => source.includes(symbol))) continue;
			if (REACH_EXEMPT[file] !== undefined) continue;
			if (REACH_PENDING[file] !== undefined) continue;
			unreached.push(file);
		}
		expect(
			unreached,
			`Record-DELETE door(s) that reach no revocation seam and carry no row:\n  ${unreached.join('\n  ')}\nDeleting a dd128 record must end that account's sessions and media markers (SEC-08): call revokeDeletedAccountAccess, or add a REACH_EXEMPT row saying why the door can never address dd128.`,
		).toEqual([]);
	});

	test('no REACH row names a file that is no longer a write door, or that now reaches', () => {
		const derivedSet = new Set(derived);
		for (const [file, reason] of Object.entries({ ...REACH_EXEMPT, ...REACH_PENDING })) {
			expect(derivedSet.has(file), `${file} is no longer a derived write door`).toBe(true);
			expect(reason.length, `${file}: the reason is too short to be a reason`).toBeGreaterThan(40);
		}
	});

	test('the REACH PENDING list is SHRINK-ONLY', () => {
		const pending = Object.keys(REACH_PENDING).length;
		expect(pending).toBeLessThanOrEqual(REACH_PENDING_COUNT);
		expect(
			pending,
			`REACH_PENDING shrank to ${pending} — lower REACH_PENDING_COUNT so the ratchet keeps biting.`,
		).toBe(REACH_PENDING_COUNT);
	});
});

// ---------------------------------------------------------------------------
// THE BEHAVIOURAL LEG (GATE-24, engineering/TRIPWIRES.md:72)
// ---------------------------------------------------------------------------
//
// "A GATE WHOSE ONLY ASSERTION IS A SOURCE SUBSTRING IS NOT A GATE FOR AN
// AUTHORIZATION DECISION." Everything above this line reads source text; it keeps the
// census honest, but it cannot tell you that the refusal WORKS. So this block builds the
// audit's precondition — a real principal whose profile grants level 2 on
// `(dd128, dd1725)`, the departmental user-manager role the downgrade exists to
// neutralise — and DRIVES the SEC-03 offender, `tool_propagate_component_data`, at that
// principal's OWN user record. Before P1-2 this exact call succeeded and the human save
// door refused the same write.
//
// Generic `test` TLD (AGENTS.md): the situation is BUILT here — a scratch dd234 profile
// and a scratch dd128 user, inserted through the counter-allocating writer and swept in
// afterAll. dd128/dd234/dd774/dd1725 are seed-shipped and have no `test` twin.

import { afterAll, beforeAll } from 'bun:test';
import {
	deleteMatrixRecord,
	insertMatrixRecordWithCounter,
} from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	clearPermissionsCache,
	clearPrincipalCache,
	clearUserProjectsCache,
	type Principal,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';
import { tool as propagateTool } from '../../tools/tool_propagate_component_data/server/index.ts';

const CENSUS_TAG = `dd128census_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
/** dd800 — the bulk-process section the tool anchors every batch to. */
const BULK_PROCESS_SECTION = 'dd800';
const PROJECT_ID = 990001;

let managerId = 0;
let managerProfileId = 0;
let manager: Principal;

/** The dd1725 profile-select locator the propagate would write. */
function profileLocator(profileId: number) {
	return {
		id: 1,
		type: 'dd151',
		section_id: String(profileId),
		section_tipo: 'dd234',
		from_component_tipo: 'dd1725',
	};
}

beforeAll(async () => {
	// The grant the audit describes: level 2 on the users SECTION and on the PROFILE
	// component of it. Nothing else — no global-admin flag, no developer flag.
	managerProfileId = await insertMatrixRecordWithCounter('matrix_profiles', 'dd234', {
		misc: {
			dd774: [
				{ id: 1, tipo: 'dd128', section_tipo: 'dd128', value: 2 },
				{ id: 2, tipo: 'dd1725', section_tipo: 'dd128', value: 2 },
			],
		},
		relation: { dd1067: [] },
		data: { label: CENSUS_TAG, section_tipo: 'dd234' },
	});
	managerId = await insertMatrixRecordWithCounter('matrix_users', 'dd128', {
		relation: {
			dd1725: [profileLocator(managerProfileId)],
			dd170: [
				{
					id: 1,
					type: 'dd151',
					section_id: String(PROJECT_ID),
					section_tipo: 'dd153',
					from_component_tipo: 'dd170',
				},
			],
		},
		string: { dd132: [{ id: 1, lang: 'lg-nolan', value: CENSUS_TAG }] },
		data: { label: CENSUS_TAG, section_tipo: 'dd128', created_by_user_id: -1 },
	});
	clearPermissionsCache();
	clearPrincipalCache();
	clearUserProjectsCache();
	manager = await resolvePrincipal(managerId);
}, 60000);

afterAll(async () => {
	if (managerId !== 0) await deleteMatrixRecord('matrix_users', 'dd128', managerId);
	if (managerProfileId !== 0)
		await deleteMatrixRecord('matrix_profiles', 'dd234', managerProfileId);
	// The tool anchors every batch to a dd800 bulk-process record (its label rides in
	// the dd796 string, not in data.label). Sweep by the run tag through the ontology's
	// own table resolution — dd800 lives in matrix_notes, and hardcoding that here would
	// be a second copy of a mapping the ontology owns.
	{
		const { getMatrixTableFromTipo } = await import('../../src/core/ontology/resolver.ts');
		const table = await getMatrixTableFromTipo(BULK_PROCESS_SECTION);
		if (table !== null) {
			await sql.unsafe(
				`DELETE FROM "${table}" WHERE section_tipo = $1 AND string->'dd796' @> $2::text::jsonb`,
				[BULK_PROCESS_SECTION, JSON.stringify([{ value: CENSUS_TAG }])],
			);
		}
	}
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2', [
		'dd128',
		managerId,
	]);
	clearPermissionsCache();
	clearPrincipalCache();
	clearUserProjectsCache();
});

describe('the refusal WORKS, not just the census (GATE-24 behavioural leg)', () => {
	test('the precondition is real: level 2 on (dd128, dd1725) and NOT a global admin', async () => {
		// Without this the refusal below could come from the tool's own up-front gate
		// rather than from the own-record rule, and the test would prove nothing.
		const { getPermissions } = await import('../../src/core/security/permissions.ts');
		expect(manager.isGlobalAdmin).toBe(false);
		expect(manager.isDeveloper).toBe(false);
		expect(await getPermissions(manager, 'dd128', 'dd1725')).toBe(2);
	});

	test('tool_propagate_component_data REFUSES a self-targeted dd1725 write', async () => {
		const handler = propagateTool.apiActions?.propagate_component_data?.handler;
		if (handler === undefined) throw new Error('propagate_component_data has no handler');

		const before = await readProfileLocators(managerId);

		const response = await handler({
			principal: manager,
			userId: managerId,
			background: false,
			requestId: CENSUS_TAG,
			options: {
				section_tipo: 'dd128',
				component_tipo: 'dd1725',
				action: 'replace',
				lang: 'lg-nolan',
				total: 1,
				bulk_process_label: CENSUS_TAG,
				// The caller's OWN record — the whole point of the finding.
				sqo: {
					section_tipo: ['dd128'],
					filter_by_locators: [{ section_tipo: 'dd128', section_id: managerId }],
				},
				// A profile they do not have: the escalation the downgrade prevents.
				propagate_data_value: [profileLocator(managerProfileId + 1)],
			},
		});

		// The batch never fails as a whole — a per-record refusal is payload. The SHAPE
		// that matters is: it saw the record, and it refused to write it.
		const data = (response as { data?: { errors?: string[]; records?: number } }).data;
		expect(data?.records, 'the SQO matched no record — the refusal would be vacuous').toBe(1);
		expect(data?.errors ?? []).toEqual([
			`section_id ${String(managerId)}: no write permission on dd128/dd1725`,
		]);
		// And the record is BYTE-UNCHANGED: nothing partial, nothing stamped.
		expect(await readProfileLocators(managerId)).toEqual(before);
	});

	test('the SAME call on someone ELSE’s record is not refused by the own-record rule', async () => {
		// The counterfactual. The own-record rule is a DOWNGRADE on the actor's own
		// record only; a refusal that applied everywhere would prove nothing about
		// SEC-03 and would break every legitimate user-manager role.
		const { getRecordComponentPermission, getPermissions } = await import(
			'../../src/core/security/permissions.ts'
		);
		expect(await getRecordComponentPermission(manager, 'dd128', 'dd1725', managerId)).toBe(1);
		expect(await getRecordComponentPermission(manager, 'dd128', 'dd1725', managerId + 7)).toBe(
			await getPermissions(manager, 'dd128', 'dd1725'),
		);
	});
});

/** The dd1725 locators stored on a user record, for the byte-unchanged assertion. */
async function readProfileLocators(userId: number): Promise<unknown> {
	const rows = (await sql.unsafe(
		"SELECT relation->'dd1725' AS locators FROM matrix_users WHERE section_tipo = $1 AND section_id = $2",
		['dd128', userId],
	)) as { locators: unknown }[];
	return rows[0]?.locators ?? null;
}
