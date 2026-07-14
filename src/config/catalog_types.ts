/**
 * CONFIG CATALOG — the type of an entry.
 *
 * The catalog (`src/config/catalog/`) is the SINGLE SOURCE OF TRUTH for every env key
 * the engine reads: its type, its one default, its scope, and its operator-facing prose.
 * Three artifacts are GENERATED from it and gated byte-for-byte by
 * `test/unit/config_docs_tripwire.test.ts`:
 *
 *   install/sample.env            the copy-paste census (installer drops a copy at
 *                                 ../private/sample.env)
 *   docs/config/config.md         the settings reference
 *   docs/config/config_db.md      the database settings reference
 *
 * WHY THIS EXISTS. Before it, defaults were inline literals at ~160 call sites, the key
 * list lived in migration_map.ts, and the prose lived in config.md — three copies, one
 * gated edge. The result: 110 keys the engine read were documented NOWHERE, two keys were
 * documented that the engine never read, and `DEDALO_HOST` had two different defaults
 * depending on which file you landed in. A doc you cannot regenerate is a doc that lies.
 *
 * IMPORT RULE. This module and everything under `catalog/` may import `env.ts`, and must
 * NEVER import `config.ts`: building the frozen config throws on a half-configured box,
 * and the generator has to run on exactly such a box (a fresh clone, CI). Same rule
 * `migration_map.ts` states for the same reason.
 */

/** The SEMANTIC type of the value — not the reader's return type. */
export type ConfigType =
	| 'string'
	| 'number'
	| 'boolean'
	| 'string_list' // JSON array OR comma list
	| 'json_array' // strictly JSON (a value may legitimately contain commas)
	| 'string_map' // JSON object of string → string
	| 'server_list' // [{name,url,code}]
	| 'tool_roots' // [{path,url}]
	| 'media_access_mode'; // the one bespoke enum

/**
 * Who the key is FOR. Only `operator` and `secret` reach the generated artifacts —
 * everything else is in the catalog so the totality gate stays honest, not because an
 * administrator would ever set it.
 */
export type ConfigScope =
	| 'operator' // an administrator sets this
	| 'secret' // an administrator sets this; the template emits a placeholder, never a value
	| 'environment' // injected by the platform (INVOCATION_ID, JOURNAL_STREAM)
	| 'internal' // an engine guard, not a setting (NODE_TLS_REJECT_UNAUTHORIZED)
	| 'test_seam'; // a seam the test suite redirects (DEDALO_TS_STATE_PATH)

/**
 * Reads another key's RESOLVED value, for a default that derives from one
 * (`DEDALO_AV_FFMPEG_PATH` = `<DEDALO_BINARY_BASE>/ffmpeg`). It is passed IN rather than
 * imported so `catalog/` never has to reach into the readers — which would be a cycle.
 */
export type CatalogGet = (key: string) => string;

/** A default the engine COMPUTES at boot rather than reading from a literal. */
export type ComputedDefault = (get: CatalogGet) => unknown;

export interface CatalogEntry {
	readonly type: ConfigType;
	readonly scope: ConfigScope;

	/**
	 * The ONE default. `undefined` + `required` means the boot refuses without it.
	 * A function is a default the engine derives (`<install>/media`, `<BINARY_BASE>/ffmpeg`,
	 * platform-dependent paths) — those MUST also carry `defaultDoc`, or the generated
	 * census would print `[Function]` at an operator.
	 */
	readonly default?: unknown | ComputedDefault;
	/** Human rendering of a computed default. REQUIRED when `default` is a function. */
	readonly defaultDoc?: string;

	/** Missing key refuses the boot (outside install mode, where `installSentinel` stands in). */
	readonly required?: true;
	/** The value a required key takes while the install wizard is running. */
	readonly installSentinel?: unknown;
	/** One of the exactly-4 keys whose absence means "this is a fresh box". */
	readonly installGate?: true;

	/**
	 * Does an EMPTY value mean "unset, use the default"? The readers disagree by family:
	 * `readEnv(k,'x')` returns '' for an empty key, while readNumber/readListEnv treat ''
	 * as unset. Declare it, or a boot silently changes behavior. `DB_PASSWORD` must be
	 * `false` — an empty password is MEANINGFUL (trust/peer auth), not an absent one.
	 */
	readonly emptyIsUnset?: boolean;
	/** Numeric floor/ceiling the reader applies (so the census can print it). */
	readonly clamp?: { readonly min?: number; readonly max?: number };

	// --- operator-facing documentation ---

	/** The `###` heading in the settings reference, e.g. 'Defining host'. */
	readonly heading: string;
	/** The type as PRINTED, free-form: 'string', 'int || false', 'array of objects'. */
	readonly typeLabel: string;
	/** Whatever trails the type label: '*deprecated; use X*', '(optional)'. */
	readonly typeSuffix?: string;

	/**
	 * The operator-facing prose (markdown; may contain tables and a ```bash example).
	 *
	 * MUST BE PHP-FREE. `docs_current_engine_tripwire` bans the substring /php/i anywhere
	 * under docs/ outside a set-equality allowlist that config.md is NOT on. This field is
	 * rendered straight into docs/, so a stray mention turns that gate red with an error
	 * about the *product manual*, giving no hint it came from here. Legacy spellings belong
	 * in `phpAlias`, which only ever reaches install/sample.env.
	 */
	readonly doc: string;

	/**
	 * The legacy spelling `env.ts` PHP_KEY_ALIASES still honours. TEMPLATE-ONLY: rendered
	 * into install/sample.env (outside docs/), NEVER into the manual. See the note on `doc`.
	 */
	readonly phpAlias?: string;

	/**
	 * The exact placeholder the shipped template carries, which a real install must replace.
	 * `check_config.ts` reads these — so the widget and the template cannot disagree about
	 * what "still on the sample value" means.
	 */
	readonly placeholder?: {
		readonly value: string;
		/** An empty value is legitimate anyway (DB_PASSWORD under trust/peer auth). */
		readonly emptyIsValid?: boolean;
	};

	/**
	 * Why a key that is NOT read anywhere in src/ is nonetheless in the catalog (read by
	 * scripts/, tools/, or the OS). A named exemption with a reason — never a silent pass.
	 */
	readonly consumer?: string;
}
