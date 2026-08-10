/**
 * OBJECT IDENTIFICATION — the contract.
 *
 * The problem: catalogues repeat themselves. A coin showing Athena with a palm
 * and a star is the same type as another coin showing Athena with a palm and a
 * star; an amphora with a given rim profile is the same typology as another
 * with that profile. Identification decomposes an object into its elements and
 * matches those elements against the rest of the corpus.
 *
 * THE ONE IDEA THAT MAKES THIS CHEAP: an element is not a special kind of data.
 * It is whatever a component path resolves to — a thesaurus term through a
 * portal, a legend reached through the object's Type, a literal form code, a
 * date. So a CRITERION IS AN SQO PATH, which means the picker (the search
 * panel's recursive field list), the storage pattern (a preset's saved filter)
 * and the query engine (conform's LATERAL join chain) already exist and are not
 * rebuilt here.
 *
 *   [ {section_tipo: 'numisdata4', component_tipo: 'numisdata161'},   // Coin → Type
 *     {section_tipo: 'numisdata3', component_tipo: 'numisdata40'} ]   // Type → Legend
 *
 * WHY PROFILES ARE RECORDS, NOT CONFIG: one object section holds ceramics,
 * iron and wood, with and without iconography, with and without legends. What
 * identifies each is different, and it is CURATORIAL knowledge — it changes as
 * a collection is studied. A profile is therefore an ordinary editable record
 * selected by what the object IS, not by where it is stored.
 */

/** One hop of a criterion path (the SQO `path` step shape). */
export interface CriterionPathStep {
	section_tipo: string;
	component_tipo: string;
}

/**
 * What a criterion contributes to identity.
 *
 * `identifying` participates in the identity decision; `descriptive` is
 * reported alongside a match but never drives it (weight, findspot, condition);
 * `ignored` is retained in the profile so a curator can switch it back on
 * without re-picking the field.
 */
export type CriterionRole = 'identifying' | 'descriptive' | 'ignored';

/**
 * How two values are compared.
 *
 * These are deliberately explicit rather than inferred from the component
 * model: the same portal can mean "must be the exact same term" in one
 * collection and "anywhere in this branch" in another, and only a curator knows
 * which.
 */
export type MatchMode =
	/** The same linked record (locator equality) — the strictest relation test. */
	| 'same_locator'
	/** The same term OR a descendant of it (hierarchy-aware). */
	| 'same_term'
	/** Text equality after normalization (case, accents, whitespace). */
	| 'normalized_text'
	/** Numbers within `tolerance` of each other (weights, diameters, dies per mm). */
	| 'numeric_tolerance'
	/** Date ranges that overlap (or fall within `tolerance` years). */
	| 'date_overlap'
	/** Visual similarity from the image index — NOT an SQO leaf. */
	| 'image_similarity';

/** One identifying (or descriptive) feature of an object. */
export interface Criterion {
	/** Stable id, so a score breakdown can name the criterion it came from. */
	id: string;
	/** Curator-facing label ("Type › Obverse legend"). */
	label: string;
	/** The picked field path — an SQO `path`, from the object section outward. */
	path: CriterionPathStep[];
	role: CriterionRole;
	/**
	 * Relative contribution to the weighted score. IGNORED WHEN `required`, and
	 * that is not a tidy-up: a required criterion is the pool GATE, so every
	 * candidate that gets scored already agrees on it. Counting its weight would
	 * add the same constant to both sides of the ratio — a required legend of
	 * weight 6 beside a deity of weight 1 would score a candidate that shares the
	 * legend and differs on the deity at 6/7 = 0.857, i.e. "the same coin type",
	 * where the honest answer is 0/1. The gate decides MEMBERSHIP; the weights
	 * rank within it. Enforced in `match.ts` scoreCandidate, gated by
	 * `identify_match.test.ts` ("a required criterion is a gate, not a weight").
	 */
	weight: number;
	mode: MatchMode;
	/**
	 * A candidate missing this criterion is not a match AT ALL — the
	 * decision-tree gate. Required criteria build the candidate pool; the rest
	 * only rank it.
	 */
	required: boolean;
	/** Mode-specific slack: grams, years, or a similarity floor in [0,1]. */
	tolerance?: number;
}

/** Score thresholds, all in [0,1] of the achievable identifying weight. */
export interface ProfileThresholds {
	/** At or above this, the engine calls it the same type. */
	sameType: number;
	/** At or above this, it is worth a curator's attention. */
	candidate: number;
}

/** The identification rules for one kind of object. */
export interface IdentificationProfile {
	id: string;
	label: string;
	/** Object sections this profile can be applied to. */
	sectionTipos: string[];
	/**
	 * Where canonical Type records live, when this collection has them
	 * (`numisdata3` for coins). Null for corpora with no published typology —
	 * a photo archive clusters, but has nothing to promote INTO.
	 */
	typeSectionTipo: string | null;
	/**
	 * The media component whose THUMB stands for the object in a result list —
	 * typically the record's main photograph. Null when the profile declares none.
	 *
	 * Identification is a VISUAL task: a curator deciding whether two coins share
	 * a die reads the breakdown, but looks at the pictures. The tool cannot guess
	 * this component, because the candidate's section is arbitrary and nothing on
	 * the wire says which of its media components is "the" image — so the profile,
	 * which is already the curatorial statement of what this kind of object IS,
	 * declares it. Absent, results simply carry no thumbnail (never a broken one).
	 */
	previewComponent: string | null;
	criteria: Criterion[];
	thresholds: ProfileThresholds;
	/**
	 * Identity requires the identifying criteria to match EXACTLY — same set,
	 * no extras on either side. This is the die-study case: two coins struck
	 * from one die carry the same elements in the same positions, and a
	 * weighted score that tolerates a missing attribute would merge distinct
	 * dies. Off by default: it is brittle whenever one cataloguer records more
	 * detail than another.
	 */
	exactSetIdentity: boolean;
}

/** A value read from a record at a criterion's path. */
export type CriterionValue =
	| { kind: 'locators'; locators: ValueLocator[] }
	| { kind: 'text'; values: string[] }
	| { kind: 'number'; values: number[] }
	| { kind: 'date'; ranges: Array<{ from: number; to: number }> };

/**
 * The locator fields identity compares on (the transient `id` is never one).
 *
 * KEPT UNION (WC-2026-08-10-section-id-int-canonical): a criterion path reads
 * RAW stored relation items, and an identification criterion legitimately lands
 * on an EXTERNAL remote id ('001338683', 'Q42') — path_read skips those for the
 * record hop and criteria.ts emits them verbatim into the SQO `q`, which is only
 * possible while the non-int leg survives in the type.
 */
export interface ValueLocator {
	section_tipo: string;
	section_id: number | string;
	[key: string]: unknown;
}

/** How one criterion fared for one candidate — the unit of explanation. */
export interface CriterionOutcome {
	criterionId: string;
	label: string;
	/** null when neither side holds a value: absent, not disagreeing. */
	agreed: boolean | null;
	/**
	 * The criterion's DECLARED weight — what the curator authored — and 0 for a
	 * `descriptive` one, which is shown but never scored. It is not always the
	 * contribution to this pair's score: a `required` criterion carries its
	 * declared weight here while contributing nothing to the ratio (see
	 * {@link Criterion.weight}), because it gated the candidate in instead.
	 */
	weight: number;
	/** Curator-facing detail: what matched, or what differed. */
	detail: string;
	/**
	 * This criterion is the profile's GATE ({@link Criterion.required}), so its
	 * declared `weight` above is NOT part of the score ratio — it decided
	 * membership instead. Present only when true, so an ordinary outcome keeps its
	 * shape.
	 *
	 * On the wire because `weight` alone cannot say it: a reader seeing a required
	 * criterion's declared weight would credit it with a contribution it never
	 * made, and a curator who zeroed that weight to "signal" the exclusion would
	 * make the profile's gate render as its weakest, purely descriptive criterion.
	 * The marker is the honest way to say "not scored, and not because it does not
	 * matter" — it is the one thing every scored candidate had to agree on.
	 */
	required?: true;
	/**
	 * The caller has no read grant on the components this criterion touches, so it
	 * was NOT compared and its value is NOT quoted: `agreed` is null and `detail`
	 * is a constant. Present only when true, so an ordinary outcome keeps its
	 * shape. The score alongside it is computed over the remaining criteria —
	 * `MatchReport.restrictedCriteria` says so for the run as a whole.
	 */
	restricted?: true;
}

/** One scored candidate. */
export interface MatchResult {
	sectionTipo: string;
	sectionId: number;
	/** Share of achievable identifying weight that agreed, in [0,1]. */
	score: number;
	verdict: 'same_type' | 'candidate' | 'weak';
	/** Per-criterion breakdown. Never omitted: an unexplained score is noise. */
	outcomes: CriterionOutcome[];
}
