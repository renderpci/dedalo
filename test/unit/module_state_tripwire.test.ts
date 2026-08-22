/**
 * Static tripwire for the §4 request-isolation invariant: NO request-carrying
 * mutable state at module scope in a long-lived Bun process.
 *
 * This is the enforcement the invariant lacked (biome only bans `var`; the rule
 * otherwise lived in prose). It is a TRIPWIRE, not a full purity proof: it flags
 * every module-level `let`/`var` against a small allowlist of known
 * request-INDEPENDENT lazy-init/boot caches, so a NEW top-level mutable binding
 * fails the build and forces a decision — either it is request-independent
 * (add it to the allowlist with a one-line justification) or it must be made
 * request-scoped (an AsyncLocalStorage scope, or a cache keyed by full identity
 * incl. user/lang). It also forbids capturing a request-scoped accessor into a
 * module-level binding (the classic bleed shortcut) AND capturing
 * config.menu.applicationLang/dataLang into a module-level binding (the S2-11
 * defect class: freezes the install default where PHP uses the per-request
 * lang).
 *
 * CACHE-FACTORY GATE (WS-B, DEC-13 rule 1): a module-level MUTABLE
 * `const … = new Map()/new Set()` cache must be created through
 * ontology/cache_factory.ts (createOntologyCache / createDataCache), which
 * hub/event-registers it BY CONSTRUCTION — the audit showed "modules remember
 * to register" fails in practice (S1-09: ≥16 of ~20 unregistered). Justified
 * non-factory module Maps/Sets live in ALLOWLISTED_MODULE_MAPSET, each entry
 * with a LIFECYCLE justification (who clears it, and when — DEC-12
 * refinement). Declarations typed ReadonlyMap/ReadonlySet are exempt (frozen
 * dispatch/constant tables, not caches). Key correctness (every identity the
 * value depends on is in the key) remains proven behaviorally by
 * concurrency_interleave.test.ts, not statically.
 *
 * MUTATED-CONST GATE (evasion-hole hardening, 2026-07-07): a module-level
 * `const NAME = {…}` / `const NAME: T[] = […]` is just as mutable as a `let` —
 * the audit proved the `let`-only scan blind to it (process_health.ts
 * poisonState, server.ts dbHealth shipped through it). The scan flags a
 * column-0 const OBJECT/ARRAY literal only when the SAME FILE later mutates it
 * (property/index assignment, ++/--, push/pop/shift/unshift/splice/fill/
 * copyWithin, set/add/delete, `delete NAME.x`) — so the many legitimate frozen
 * constant tables stay exempt with zero annotation burden (an unmutated const
 * literal is constant in practice; `as const`/Object.freeze shapes can never
 * be mutated so they never trip). Known request-INDEPENDENT process state
 * lives in ALLOWLISTED_MODULE_CONST with the same justification bar as the
 * `let` list. Module-level `new WeakMap()`/`new WeakSet()` joins the Map/Set
 * factory gate unconditionally (a module WeakMap is always a cache).
 * Residual (accepted) blind spot: mutation via an aliased reference or from
 * ANOTHER file (`import { x } …; x.y = 1`) — cross-file mutation of an
 * imported binding's properties is rare and reviewable.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const SRC_DIR = join(import.meta.dir, '..', '..', 'src');

/**
 * Known, reviewed module-level `let` bindings — all request-INDEPENDENT
 * (boot/install-stable lazy caches or one-time init flags; audited safe). Keyed
 * `<path-relative-to-src>:<name>`. Adding a new top-level `let` requires adding
 * it here WITH justification that it carries no request identity.
 */
const ALLOWLISTED_MODULE_LET = new Set<string>([
	// Process-lifecycle latches (audit S2-17/S3-46, WS-E): request-INDEPENDENT
	// by construction — shuttingDown is the signal-handler idempotency latch,
	// lastPurgeAt throttles the daily residue purge on the sweeper cadence.
	'server.ts:shuttingDown',
	'diffusion/jobs/scheduler.ts:lastPurgeAt',
	// section_id deprecation-counter observer (D10 of the WC entry
	// WC-2026-08-10-section-id-int-canonical): wired ONCE at boot to
	// api/counters incrementCounter (the
	// registerOpsGauge inversion — concepts/ is a pure leaf and cannot import
	// api/). Carries no request identity: the per-door SOURCE string is code-
	// authored, never user data.
	'core/concepts/section_id.ts:coercionObserver',
	// The graceful-shutdown entry point injected ONCE by startServer so a planned
	// restart drains like a SIGTERM (core/install must not import the process
	// root). Boot-stable process wiring — carries no request identity.
	'core/install/restart.ts:gracefulShutdown',
	// "Is curl on PATH" memo for the AI-model downloader: a fact about the HOST
	// (boot-stable, request-independent), probed once per process on first
	// download. Never cleared — the binary set does not change under a running
	// server, and a wrong stale value only changes WHICH transport fetches.
	'core/ai/model_fetch.ts:curlChecked',
	// Registry-pairing cache GENERATION counter (2026-08-14): bumped by every
	// invalidation of the hierarchy53→hierarchy58 map so a build that began
	// before the bump refuses to install its stale snapshot (the populate/
	// invalidate TOCTOU the pairing map would otherwise have). A monotonic
	// integer compared only for equality — ontology/registry-derived, never
	// request identity; the DATA it guards is the same ontology-scoped fact for
	// every user, session and language.
	'core/ontology/model_section.ts:pairingEpoch',
	// Ontology-update single-flight latch (UPDATE_PROCESS Phase 2, WC-023):
	// two concurrent ontology imports must never interleave DELETEs — ops
	// state, never request identity; set/cleared around one admin operation.
	'core/ontology/ontology_update.ts:updateInFlight',
	// Pool-saturation gauge (WS-E observability): process-wide slot accounting
	// decremented/incremented around every pool acquire — ops state, never
	// request identity; read by the counters endpoint.
	'core/db/postgres.ts:availablePoolSlots',
	'core/tools/loader.ts:loadedTools',
	'core/tools/loader.ts:collisions',
	'core/tools/loader.ts:loadingPromise',
	// Lang-INDEPENDENT registry row data only (S1-13): the per-request label is
	// resolved per call in getElementTools, which also builds a fresh
	// simpleContext per call — nothing cache-owned reaches a caller.
	'core/tools/registry.ts:registeredToolsCache',
	// The RAW rows the line above (and every other registry reader) is built
	// from — same lifecycle, cleared by the same resetRegistryCache(). Raw rows
	// only: the lang-dependent label is resolved per request by the callers, so
	// nothing lang-bearing is cache-owned.
	'core/tools/registry.ts:activeToolRowsCache',
	'core/tools/paths.ts:rootsCache',
	'core/tools/config.ts:defaultConfigCache',
	'core/tools/config.ts:installConfigCache',
	// One-second memo of WHICH job pfiles exist on disk (media/jobs.ts). Request-
	// INDEPENDENT by construction: it caches a DIRECTORY LISTING of a private
	// tree, never a record, a user or a language. The in-memory registry is read
	// FIRST and is never memoized, so anything this process owns stays current;
	// this only bounds the repeated blocking readdir the activity tray put on the
	// request path. Deliberately not the parsed bodies — a stale body could report
	// a dead job as running.
	'core/media/jobs.ts:mirrorScan',
	'core/section/locks.ts:tableReady',
	// Bootstrap memo for the temporal scratch table (WC-079): a boolean, no
	// request identity. Cleared only by a process restart, which is correct —
	// CREATE TABLE IF NOT EXISTS is idempotent and the DDL cannot un-apply.
	'core/section/record/temporal_store.ts:tableReady',
	'core/resolve/environment.ts:pgVersionCache',
	'core/resolve/environment.ts:projectsLangsCache',
	'core/diffusion_bridge/diffusion_map.ts:mapCache',
	'core/diffusion_bridge/diffusion_map.ts:targetsCache',
	'core/relations/select_lang.ts:resolvedLangsCache',
	'core/area/color.ts:crcTable',
	'core/section_record/save_event.ts:ragRecordHook',
	// Media-ingest registration seam (ragRecordHook precedent, same shape and
	// same lifecycle): a single boot-registered function slot notifying that a
	// record's media changed on disk. An upload does not go through the record
	// save path — files_info is written directly and fires no save event — so
	// without this seam new media is never noticed. It holds a FUNCTION, set
	// once at boot from initRagHooks; request identity can never land in it,
	// and the event it carries states its own identity explicitly precisely
	// because the upload path has no ALS scope open.
	'core/media/ingest/ingest_event.ts:mediaIngestHook',
	// S2-20 inversion seam: the component registry registers its model lookup
	// (alias/column fields) into the ontology resolver at module load — a
	// boot-stable function slot (same shape as ragRecordHook above), never
	// request identity.
	'core/ontology/resolver.ts:componentModelFieldsLookup',
	'core/search/search_related.ts:relationTablesCache',
	'core/db/dd_ontology.ts:activeTldsCache',
	// Same shape/lifecycle as activeTldsCache: ontology CONTENT (which TLDs carry
	// nodes beyond their bare `<tld>0` registry root), carries no request
	// identity, hub-cleared by the same registerOntologyCacheClearer callback.
	'core/db/dd_ontology.ts:populatedTldsCache',
	// GeoIP country reader (section Activity dd542 IP→country). A boot-stable,
	// request-INDEPENDENT in-memory database loaded once from a static .mmdb file
	// (mmdb-lib Reader) and shared read-only across requests — derives from a
	// downloaded file, never from ontology/records/session/lang/principal. Same
	// lifecycle as the static-asset gzip cache; not a cache-factory resource.
	'core/geoip/reader.ts:reader',
	'core/media/engine/ffmpeg.ts:cachedAudioCodec',
	// Diffusion job service (DIFFUSION_SPEC §4.2) — all request-INDEPENDENT
	// process state: a table-bootstrap memo plus the scheduler's process-wide
	// timers/latch. No request identity (user/session/lang) ever lands here;
	// per-run state lives in the durable dedalo_ts_diffusion_jobs rows.
	'diffusion/jobs/schema.ts:ensured',
	'diffusion/jobs/scheduler.ts:schedulerTimer',
	'diffusion/jobs/scheduler.ts:sweeperTimer',
	'diffusion/jobs/scheduler.ts:ticking',
	// Diffusion plan compiler (DIFFUSION_SPEC §4.1): a lazily-imported parser
	// classifier memo and the ontology-revision counter that keys the plan
	// cache — both request-INDEPENDENT (ontology/install-stable, bumped only
	// by the core cache-invalidation hub on ontology writes).
	'diffusion/plan/compile.ts:registryClassifier',
	'diffusion/plan/cache.ts:ontologyRevision',
	// Native-delete registration seam (ragRecordHook precedent): holds a
	// boot-registered executor function, never request identity.
	'core/diffusion_bridge/diffusion_delete.ts:nativeSqlDeleteExecutor',
	// Native media-index registration seam (S2-31, same pattern as the delete
	// executor above): boot-registered marker-store ops functions, never
	// request identity.
	'core/diffusion_bridge/diffusion_delete.ts:nativeMediaIndexOps',
	// Scheduler pause switch (admin flow control via the diffusion_server_control
	// widget) — process-wide operational state, no request identity.
	'diffusion/jobs/scheduler.ts:paused',
	// Drain latch (the same widget's quiesce action) — makes drainAndResume
	// idempotent across two admins and lets resumeScheduler abort an in-flight
	// wait. Process-wide operational state, no request identity.
	'diffusion/jobs/scheduler.ts:draining',
	// Login-timing decoy hash (foundation audit AUTHZ-03): a memoized Argon2id
	// hash of a random string, verified against on the no-user / legacy-hash
	// failure paths so login timing never reveals whether an account exists.
	// Request-INDEPENDENT — a fixed process-global decoy, never user/session state.
	'core/security/auth.ts:decoyHashPromise',
	// Media-index test seam (S2-31 port): guarded temp-dir-only base override,
	// set/cleared by the marker-store tests around each case — never request
	// identity (the production base is install-static config.media.rootPath).
	'diffusion/targets/mediastore/media_index.ts:baseOverrideForTests',
	// Media-protection test seam (Rule A port): the same guarded temp-dir-only shape as
	// the marker-store seam above — it refuses any non-temp path, so a test can never
	// point the auth-marker writer or the rule-file writer at a real media tree. Set and
	// cleared around each case; never request identity (the production paths are
	// install-static: config.media.rootPath and <private>/).
	'core/media/protection.ts:pathOverridesForTests',
	// Today's media-auth cookie value (WC-051). ONE value per install per DAY — every
	// user holds the identical cookie, so it carries no request identity and cannot
	// bleed between principals. Lifecycle: keyed by day so it self-invalidates at
	// midnight, refreshed by initMediaAuthCookie on any rotation this process performs,
	// and cleared by overrideMediaProtectionPathsForTests. It exists to keep the
	// per-request cookie re-issue a string compare instead of a JSON store read.
	'core/media/protection.ts:cachedAuthCookie',
	// The external subsystem's ONE settings door (src/external/settings.ts). Holds
	// OPERATOR settings only — the frozen config is built at import, and `bun test`
	// shares one module graph, so a test cannot state a scenario any other way
	// (the core/media/protection.ts:pathOverridesForTests precedent, same shape and
	// same lifecycle: null in production, set and cleared around one case).
	// Request identity can never land in it: its type is the operator config.
	'external/settings.ts:overridesForTests',
]);

/**
 * Known, reviewed module-level MUTABLE `new Map()`/`new Set()` declarations
 * NOT created through ontology/cache_factory.ts (the WS-B factory gate,
 * DEC-13 rule 1). Every entry must state its LIFECYCLE: who clears it, and
 * when (DEC-12 refinement). ReadonlyMap/ReadonlySet-typed declarations are
 * exempt from the scan — annotate frozen constant tables instead of listing
 * them here. A NEW module-level cache belongs in the factory, not in this
 * list.
 */
const ALLOWLISTED_MODULE_MAPSET = new Set<string>([
	// --- invalidation/registration infrastructure (the channels the factory
	// registers into; registration-only, grow with module loads, never cleared
	// by design) --------------------------------------------------------------
	'core/ontology/cache_invalidation.ts:registeredClearers',
	'core/section_record/save_event.ts:sectionDataListeners',
	// Registry-pairing invalidation channel (2026-08-14): the inversion that
	// lets relations/datalist.ts drop option lists derived from a
	// hierarchy53→hierarchy58 pairing without ontology/ importing relations/.
	// Same class as the two channels above — registration-only, grows with
	// module loads, never cleared by design, and its members are code-authored
	// callbacks that carry no request identity.
	'core/ontology/model_section.ts:pairingChangeListeners',
	// dd1758 activity-table seam: the scratch-table bootstrap latch (the
	// diffusion/jobs/schema.ts:ensured twin), keyed by RESOLVED table name —
	// the table is resolved per call now, so one latch per name. A
	// process-lifecycle DDL memo, only ever populated under the test-only
	// DIFFUSION_ACTIVITY_TABLE override; no request identity. Cleared by
	// nobody on purpose: a created table stays created for the process, and a
	// failed bootstrap deletes its own entry so the next call retries.
	'core/diffusion_bridge/diffusion_delete.ts:activityTableEnsured',
	// section_id coercion WARN sampler (WC-2026-08-10-section-id-int-canonical
	// D10): per-door tallies deciding which coercions log (first + every
	// 1000th). Process-lifetime like api/counters itself, request-independent
	// (keys are code-authored door names); cleared only by the test seam
	// resetSectionIdCoercionStateForTests.
	'core/concepts/section_id.ts:warnCounts',
	// File-processor registry (SEC-053 fail-closed, EMPTY until crop_50 is
	// ported): registration-only like the two channels above — a Readonly type
	// would outlaw the registerFileProcessor door it exists to provide.
	'core/tools/import_files_match.ts:FILE_PROCESSORS',
	// (The former "frozen constant tables" block — 17 Sets — was annotated
	// ReadonlySet at the declarations 2026-07-10 and removed from this list:
	// the type system now enforces what the exemption merely asserted.)
	// --- process-lifetime OPS state (not content caches; lifecycle: process
	// restart, or the stated owner) ------------------------------------------
	// Background tool-job registry (S2-16): keyed by job id; terminal entries
	// pruned by its own retention sweep; ops visibility state.
	'core/tools/background.ts:jobs',
	// Request/gauge counters (WS-E observability): monotonic ops metrics,
	// never cleared by design.
	'core/api/counters.ts:counters',
	'core/api/counters.ts:gaugeProviders',
	// Activity providers (the job tray's read model): the SAME inversion as
	// gaugeProviders above and with the same lifecycle — subsystems register at
	// BOOT because core/api may not import src/diffusion, and the map is written
	// once per process and read-only thereafter. It holds FUNCTIONS, not data:
	// nothing request-derived is stored, so there is nothing to leak between
	// requests and nothing to invalidate.
	'core/api/activity.ts:activityProviders',
	// Diffusion MariaDB pool cache: one pool per DSN for the process lifetime;
	// closed on shutdown by the graceful-drain path.
	'diffusion/targets/mariadb/db.ts:poolCache',
	// Target-DB reachability verdicts for the INFO panels (WC-065
	// connection_status): { result, msg } keyed by database name. NOT a content
	// cache and not ontology/record-derived — it memoizes a remote server's
	// LIVENESS, which no write event invalidates, so neither cache_factory
	// lifecycle applies. Lifecycle: every entry self-expires 10s after it was
	// written (checked on read), and the whole map is cleared by
	// closeAllTargetPools (tests / shutdown). No request identity: a target
	// database name is install state.
	'diffusion/targets/mariadb/db.ts:probeStatusMemo',
	// Media-index per-key mutation chains (S2-31 port, oracle with_key_lock):
	// a serialization primitive, NOT a content cache — each entry is deleted
	// in the finally of the very chain it serializes (self-draining); keys are
	// marker names, never request identity.
	'diffusion/targets/mediastore/media_index.ts:keyLocks',
	// --- content caches with a NON-hub invalidation contract (lifecycle
	// documented at the declaration site) -------------------------------------
	// Install-static media type specs (concepts/media.ts): derived from code
	// constants, not from dd_ontology or record data — nothing invalidates it
	// because nothing can change it at runtime.
	'core/concepts/media.ts:specCache',
	// "Can this ImageMagick, under OUR hardened policy, write a .<ext> file"
	// (engine/imagemagick.ts:canWriteImageFormat). A fact about the HOST — the
	// installed delegates plus the shipped policy.xml — probed once per process
	// with a real 1x1 encode. Key is a file extension, value a boolean promise:
	// request identity cannot land in it. Lifecycle: process restart, and that is
	// correct — neither the binary's delegates nor the shipped policy can change
	// under a running server (the engine/ffmpeg.ts:cachedAudioCodec precedent).
	'core/media/engine/imagemagick.ts:writableFormatCache',
	// Tool filesystem-root resolution: cleared by resetPathsCache via
	// invalidateAllToolCaches on TS-side tool writes; COEX restart rule for
	// PHP-side writes (tools/cache.ts header).
	'core/tools/paths.ts:rootResolutionCache',
	// Static-asset gzip bytes: derived from FILES on disk (not ontology/record
	// data — the factory is the wrong lifecycle). Entries self-evict when the
	// stat-derived ETag diverges (client re-sync); bounded by the servable
	// client tree; process-lifetime otherwise (static_asset.ts header).
	'core/api/static_asset.ts:gzipCache',
	// Diffusion publication plans: revision-keyed (ontologyRevision bumped by
	// the hub via plan/cache.ts registration) — its own documented scheme, not
	// a clear-on-fire Map.
	'diffusion/plan/cache.ts:planCache',
	// --- external record services (src/external) -----------------------------
	// Circuit state per (service, ORIGIN). Deliberately NOT factory-built: the
	// factory's clearer fires after EVERY dd_ontology write, so an unrelated
	// cataloguing save would reset an open circuit and re-open the flood at a
	// failing third party (v6 kept this in $_SESSION, which additionally bled
	// between users). Lifecycle: TIME ONLY — a success deletes its entry, and
	// every access prunes entries untouched for 10 cooldowns. Keys are a service
	// name and a host; never session/user/lang.
	'external/breaker.ts:breakerStates',
	// Per-(service, origin) parallelism bound at the one outbound door. NOT a
	// content cache — slot accounting. Lifecycle: SELF-DRAINING, deleted the
	// moment the last holder releases with nobody waiting (the media_index
	// keyLocks precedent).
	'external/transport.ts:concurrencySlots',
	// In-flight fetch coalescing, keyed by the row cache key. A serialization
	// primitive, not a cache: each entry is deleted in the `finally` of the very
	// fetch it coalesces. The ROW cache beside it IS factory-built.
	'external/cache.ts:inFlight',
	// In-flight SEARCH coalescing, keyed by (service, section, method, url). Same
	// serialization-primitive lifecycle as cache.ts:inFlight — deleted in the
	// `finally` of the very fetch it coalesces. There is no factory cache beside
	// this one on purpose: a search is user-typed and high-cardinality, so its
	// results are deliberately NOT cached (src/external/search.ts header).
	'external/search.ts:inFlightSearches',
]);

/** Mutation shapes for a named binding: assignment, ++/--, mutating methods. */
/**
 * Known, reviewed module-level `const` OBJECT/ARRAY literals that the owning
 * file MUTATES — all request-INDEPENDENT process/ops state (the `const`
 * spelling of ALLOWLISTED_MODULE_LET). Keyed `<path>:<name>`. A new entry
 * needs the same justification bar: no request identity (user/session/lang)
 * may ever land in it.
 */
const ALLOWLISTED_MODULE_CONST = new Set<string>([
	// Process-poison latch (first-load TDZ race detector): process-lifecycle
	// health state flipped once on a fatal init race — never request identity.
	'core/api/process_health.ts:poisonState',
	// DB reachability memo for /health: a timestamped ok/checkedAt pair on the
	// probe cadence — ops state, same class as availablePoolSlots above.
	'server.ts:dbHealth',
	// Request-latency aggregate (WS-E observability): monotonic count/total/max
	// ops metrics fed by access_log — never cleared by design, no identity.
	'core/api/counters.ts:latency',
	// Pool-saturation wait queue (S2-32): process-wide FIFO of pending pool
	// acquirers, drained by releasePoolSlot — slot accounting, not request data.
	'core/db/postgres.ts:poolSlotWaiters',
]);

/** Mutation shapes for a named binding: assignment, ++/--, mutating methods. */
function mutationPatterns(name: string): RegExp[] {
	return [
		// Property/index assignment incl. compound ops (`=` but not `==`/`===`).
		new RegExp(
			`\\b${name}(?:\\.[\\w.]+|\\[[^\\]]*\\])\\s*(?:=(?!=)|\\+=|-=|\\*=|\\/=|%=|\\*\\*=|&&=|\\|\\|=|\\?\\?=)`,
		),
		// Increment/decrement on a property or index.
		new RegExp(`\\b${name}(?:\\.[\\w.]+|\\[[^\\]]*\\])(?:\\+\\+|--)`),
		// Mutating array methods (sort/reverse at module init are ordering, not state).
		new RegExp(`\\b${name}\\.(?:push|pop|shift|unshift|splice|fill|copyWithin)\\(`),
		// Map/Set/WeakMap/WeakSet-style mutation on an object-typed const.
		new RegExp(`\\b${name}\\.(?:set|add|delete|clear)\\(`),
		// delete operator.
		new RegExp(`\\bdelete\\s+${name}[.[]`),
	];
}

function scanSrc(): {
	moduleLet: string[];
	accessorCapture: string[];
	configLangCapture: string[];
	moduleMapSet: string[];
	moduleConstMutated: string[];
} {
	const glob = new Glob('**/*.ts');
	const moduleLet: string[] = [];
	const accessorCapture: string[] = [];
	const configLangCapture: string[] = [];
	const moduleMapSet: string[] = [];
	const moduleConstMutated: string[] = [];
	// Column-0 declarations only = module scope (anything inside a function/block
	// is indented with tabs in this codebase's style).
	const letRe = /^(?:export )?(?:let|var) (\w+)/;
	const captureRe =
		/^(?:export )?(?:const|let|var) \w+ *= *current(?:Principal|Session|ApplicationLang|DataLang)\(/;
	// S2-11 defect class: module-level capture of the install-default langs.
	const configLangRe =
		/^(?:export )?(?:const|let|var) \w+ *= *config\.menu\.(?:applicationLang|dataLang)\b/;
	// WS-B factory gate: module-level mutable Map/Set — Weak variants included
	// (a module-level WeakMap/WeakSet is always a cache); Readonly-typed exempt.
	const mapSetRe =
		/^(?:export )?(?:const|let|var) (\w+)(?::\s*([^=]+?))?\s*= new (?:Weak)?(?:Map|Set)\b/;
	// Mutated-const gate: column-0 const OBJECT/ARRAY literal (type annotation
	// tolerated, incl. `=>` inside it). Flagged only if the file mutates it.
	const constObjRe = /^(?:export )?const (\w+)(?::\s*(?:[^=\n]|=>)+?)?\s*= [{[]/;
	for (const rel of glob.scanSync(SRC_DIR)) {
		const content = readFileSync(join(SRC_DIR, rel), 'utf8');
		const lines = content.split('\n');
		for (const line of lines) {
			const m = line.match(letRe);
			if (m) moduleLet.push(`${rel}:${m[1]}`);
			if (captureRe.test(line)) accessorCapture.push(rel);
			if (configLangRe.test(line)) configLangCapture.push(rel);
			const ms = line.match(mapSetRe);
			if (ms && !(ms[2] ?? '').includes('Readonly')) moduleMapSet.push(`${rel}:${ms[1]}`);
			const co = line.match(constObjRe);
			if (co && mutationPatterns(co[1] as string).some((re) => re.test(content))) {
				moduleConstMutated.push(`${rel}:${co[1]}`);
			}
		}
	}
	return { moduleLet, accessorCapture, configLangCapture, moduleMapSet, moduleConstMutated };
}

describe('module-state tripwire (§4 request isolation)', () => {
	const { moduleLet, accessorCapture, configLangCapture, moduleMapSet, moduleConstMutated } =
		scanSrc();

	test('no NEW module-level let/var carrying request state (allowlist known-safe caches)', () => {
		const unexpected = moduleLet.filter((entry) => !ALLOWLISTED_MODULE_LET.has(entry));
		if (unexpected.length > 0) {
			throw new Error(
				`New top-level \`let\`/\`var\` binding(s) found:\n  ${unexpected.join('\n  ')}\nIf request-INDEPENDENT (boot/install-stable), add to ALLOWLISTED_MODULE_LET with a justification. If it could carry request identity (user/session/lang), make it request-scoped instead (see core/security/request_context.ts).`,
			);
		}
		expect(unexpected).toEqual([]);
	});

	test('allowlist stays honest — no stale entries for bindings that no longer exist', () => {
		const present = new Set(moduleLet);
		const stale = [...ALLOWLISTED_MODULE_LET].filter((entry) => !present.has(entry));
		expect(stale).toEqual([]);
	});

	test('no module-level binding captures a request-scoped accessor', () => {
		expect(accessorCapture).toEqual([]);
	});

	test('no module-level binding captures config.menu.applicationLang/dataLang (S2-11)', () => {
		// The per-request lang must be read at call time via currentDataLang()/
		// currentApplicationLang() — a module capture freezes the install
		// default for every session (see ts_object/term_resolver, WS-B item 4).
		expect(configLangCapture).toEqual([]);
	});

	test('no NEW module-level Map/Set cache outside the cache factory (WS-B/DEC-13)', () => {
		const unexpected = moduleMapSet.filter((entry) => !ALLOWLISTED_MODULE_MAPSET.has(entry));
		if (unexpected.length > 0) {
			throw new Error(
				`Module-level mutable Map/Set declaration(s) outside the cache factory:\n  ${unexpected.join('\n  ')}\nCreate caches via createOntologyCache/createDataCache (src/core/ontology/cache_factory.ts) so they are invalidation-registered by construction. A frozen constant table should be typed ReadonlyMap/ReadonlySet. Anything else needs an ALLOWLISTED_MODULE_MAPSET entry WITH a lifecycle justification (who clears it, and when).`,
			);
		}
		expect(unexpected).toEqual([]);
	});

	test('Map/Set allowlist stays honest — no stale entries', () => {
		const present = new Set(moduleMapSet);
		const stale = [...ALLOWLISTED_MODULE_MAPSET].filter((entry) => !present.has(entry));
		expect(stale).toEqual([]);
	});

	test('no NEW mutated module-level const object/array (the `const` spelling of `let` state)', () => {
		const unexpected = moduleConstMutated.filter((entry) => !ALLOWLISTED_MODULE_CONST.has(entry));
		if (unexpected.length > 0) {
			throw new Error(
				`Module-level \`const\` object/array literal(s) MUTATED by their own file:\n  ${unexpected.join('\n  ')}\nThis is module-level mutable state with a const badge. If request-INDEPENDENT (process/ops state), add to ALLOWLISTED_MODULE_CONST with a justification. If it could carry request identity (user/session/lang), make it request-scoped (see core/security/request_context.ts) or a factory-built cache (core/ontology/cache_factory.ts).`,
			);
		}
		expect(unexpected).toEqual([]);
	});

	test('mutated-const allowlist stays honest — no stale entries', () => {
		const present = new Set(moduleConstMutated);
		const stale = [...ALLOWLISTED_MODULE_CONST].filter((entry) => !present.has(entry));
		expect(stale).toEqual([]);
	});
});

/**
 * The transaction ALS's ONE escape hatch. `runDetachedFromTransaction` exits the
 * transaction + deferred-action stores, which is exactly right for a background
 * job (it outlives its submitter, whose handle expires at COMMIT — S2-14) and
 * exactly wrong for anything else: work wrapped in it loses read-your-writes and
 * cannot be rolled back with the request. Freeze the caller set so a future
 * "avoid holding the transaction" refactor has to argue its case here.
 * Contract + rationale: engineering/REQUEST_ISOLATION.md.
 */
describe('runDetachedFromTransaction — frozen caller set', () => {
	const ALLOWED_IMPORTERS = new Set([
		// The job manager: submit() runs inside a request, the worker must not.
		'src/core/media/jobs.ts',
	]);

	test('only the job manager imports the transaction-ALS escape hatch', () => {
		const glob = new Glob('**/*.ts');
		const importers: string[] = [];
		// src/ AND tools/: a tool handler imports postgres.ts directly (e.g.
		// tool_import_files pulls `sql` from it), so a src-only census would leave
		// the whole tool layer free to detach its writes.
		for (const [root, prefix] of [
			[SRC_DIR, 'src/'],
			[join(SRC_DIR, '..', 'tools'), 'tools/'],
		] as [string, string][]) {
			for (const rel of glob.scanSync(root)) {
				if (`${prefix}${rel}` === 'src/core/db/postgres.ts') continue; // its home
				if (readFileSync(join(root, rel), 'utf8').includes('runDetachedFromTransaction')) {
					importers.push(`${prefix}${rel}`);
				}
			}
		}
		const unexpected = importers.filter((rel) => !ALLOWED_IMPORTERS.has(rel));
		if (unexpected.length > 0) {
			throw new Error(
				`runDetachedFromTransaction used outside the job-manager submit path:\n  ${unexpected.join('\n  ')}\nDetaching hides a write from the ambient transaction: it cannot be rolled back and cannot read the transaction's own uncommitted rows. Only work that OUTLIVES the request (a supervised background job) may detach. See engineering/REQUEST_ISOLATION.md.`,
			);
		}
		expect(unexpected).toEqual([]);
		// Allowlist stays honest — a stale entry means the rule guards nothing.
		expect([...ALLOWED_IMPORTERS].filter((rel) => !importers.includes(rel))).toEqual([]);
	});
});
