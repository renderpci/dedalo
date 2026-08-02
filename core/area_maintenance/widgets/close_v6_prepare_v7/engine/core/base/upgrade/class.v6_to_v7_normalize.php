<?php declare(strict_types=1);
/**
* CLASS V6_TO_V7_NORMALIZE
*
* Structural repair + finding classification for the v6→v7 data migration.
*
* WHY THIS EXISTS
* v6_to_v7::reformat_matrix_data() used to report every imperfection in the legacy
* `datos` blob as an ERROR, in a flat list of formatted strings. On a real install that
* produced hundreds of lines the operator could not act on, most of them the SAME
* mechanical defect repeated across rows — and, worse, indistinguishable from the few
* findings that genuinely need a human decision.
*
* Two things are separated here:
*
*   1. REPAIR. A small registry of provably-safe structural transformations, applied
*      IN MEMORY inside process_matrix_row_data(). The legacy `datos` column is never
*      rewritten: the repaired shape flows straight into the v7 columns. Because the
*      review pass (save=false) and the migration (save=true) are the same function,
*      what the deep preflight reports is exactly what the migration will do.
*
*   2. CLASSIFICATION. Every finding carries a severity:
*        'fixed'  — repaired automatically; informational, needs no action
*        'notice' — cannot be migrated and will be dropped; nothing to repair
*        'error'  — needs a human decision before migrating
*      Only 'error' feeds v6_to_v7's $response->errors, so only 'error' makes the
*      review fail. That is what turns an unreadable wall into a short verdict.
*
* MEMORY
* Findings are aggregated into GROUPS as they are produced (code + tipo + model), never
* accumulated per row: one defect repeated across two million rows is one group with a
* count of two million, not two million objects. $response->errors is still filled for
* backward compatibility, but is capped (see ERRORS_CAP).
*
* Relates to: v6_to_v7 (process_matrix_row_data, migrate_component_data),
*             run/phase1_backup_pre_update.php (renders the groups as the run verdict).
*
* All methods are static. The class is never instantiated.
*
* @package Dédalo
* @subpackage close_v6_prepare_v7
*/
class v6_to_v7_normalize {

	/** Repaired automatically. Informational only; never fails a review. */
	public const SEVERITY_FIXED  = 'fixed';

	/** Cannot be migrated; the value is dropped. Reported, but does not fail a review. */
	public const SEVERITY_NOTICE = 'notice';

	/** Needs a human decision. Fails the review (exit 6). */
	public const SEVERITY_ERROR  = 'error';

	/**
	* Master switch for the repair rules, driven by the runner's --no-auto-fix flag.
	*
	* When false, no repair is attempted and the affected findings are reported as
	* errors with their legacy wording — i.e. the pre-auto-fix picture, for diagnosis.
	* The real migration (phase 2) always runs with this TRUE: turning it off there
	* would discard the very values the preflight promised to repair.
	*
	* @var bool $auto_fix
	*/
	public static bool $auto_fix = true;

	/**
	* Aggregated findings, keyed by code|tipo|model. Reset by reset() at the start of
	* each reformat pass and read by get_report().
	* @var array<string,stdClass> $groups
	*/
	private static array $groups = [];

	/**
	* Hard ceiling on the legacy flat $response->errors list. The groups carry the full
	* picture with a bounded footprint; this list only exists so callers that still read
	* ->errors keep working, and it must not be allowed to grow without limit on a large
	* database. Overflow is counted, never silently dropped (see $errors_overflow).
	*/
	public const ERRORS_CAP = 5000;

	/**
	* Number of error strings suppressed by ERRORS_CAP. Reported by get_report() so a
	* truncated list is never mistaken for a complete one.
	* @var int $errors_overflow
	*/
	private static int $errors_overflow = 0;

	/**
	* Max length of the offending-value sample kept per group. Long enough to recognise
	* the value, short enough that a group stays cheap.
	*/
	private const SAMPLE_WIDTH = 220;

	/**
	* Language keys as v6 wrote them inside a component's `dato` map: 'lg-spa',
	* 'lg-nolan', … Used by the MISSING_DATO_ENVELOPE rule as its safety guard.
	*
	* Anchored with \z, NOT $: PCRE's `$` also matches before a trailing newline, so a
	* corrupt key "lg-spa\n" would pass the guard and be propagated all the way into the
	* v7 `lang` property.
	*/
	private const LANG_KEY_PATTERN = '/^lg-[a-z]{2,5}\z/';

	/**
	* v6 sidecar properties: descriptive metadata written NEXT TO the value, never the
	* value itself ('inf' is a label string like "Created date [component_date]", 'info'
	* is {label, modelo}). They are ignored when deciding whether a value carries data,
	* and dropped when one is repaired.
	*
	* Deliberately does NOT include 'valor' / 'valor_list' / 'dataframe': those are
	* derived copies of the real value, and a value carrying one WITHOUT a `dato` is an
	* unknown shape that must be reported, not quietly discarded.
	*/
	private const SIDECAR_KEYS = ['inf', 'info'];



	/**
	* RESET
	* Clears the aggregation state. Called once at the start of a reformat pass so a
	* second pass in the same process (review then migrate) does not inherit the first
	* pass's counts.
	* @return void
	*/
	public static function reset() : void {

		self::$groups			= [];
		self::$errors_overflow	= 0;
	}//end reset



	/**
	* COMPONENT_VALUE
	* Normalizes ONE v6 component value that arrived without a usable `dato` property.
	*
	* Called from v6_to_v7::process_matrix_row_data() at the point where the old code
	* raised "Bad component data (literal without v6 'dato' property)". Records its own
	* finding in every branch, so the caller only has to act on the return value.
	*
	* Rules, in order:
	*
	*   EMPTY_COMPONENT_VALUE   the value carries nothing at all ({} , or a `dato` that
	*                           decoded to null/empty). There is no data to migrate and
	*                           nothing to repair — skipping it is already the correct
	*                           behaviour, so this is reported as 'fixed', not as a defect.
	*
	*   MISSING_DATO_ENVELOPE   the value IS the lang map, stored without its wrapper:
	*                             {"lg-nolan":[{start:{…}}]}
	*                           instead of
	*                             {"dato":{"lg-nolan":[{start:{…}}]}}
	*                           Repaired by wrapping. The guard is that EVERY key must
	*                           look like a v6 language key — one non-language key means
	*                           this is some other shape and the rule must not touch it.
	*
	*   UNKNOWN_COMPONENT_SHAPE anything else. Not repairable; reported as an error with
	*                           the legacy wording plus a sample of the offending value.
	*
	* @param string $tipo - component tipo, e.g. 'dd199'
	* @param mixed $value - the raw v6 component value (normally stdClass)
	* @param string $table
	* @param ?string $section_tipo
	* @param mixed $section_id
	* @param ?string $model - resolved ontology model, or null when it does not resolve
	* @param object $response - v6_to_v7 response, by reference (errors[] / findings[])
	* @return object|false - the repaired value (guaranteed to carry `dato`), or false
	*                        when there is nothing to migrate
	*/
	public static function component_value(
		string $tipo,
		mixed $value,
		string $table,
		?string $section_tipo,
		mixed $section_id,
		?string $model,
		object $response
	) : object|false {

		$ctx = [
			'table'			=> $table,
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'tipo'			=> $tipo,
			'model'			=> $model,
			'stored_model'	=> self::stored_model($value)
		];

		// Legacy wording, kept verbatim so --no-auto-fix reproduces the old report exactly.
		$legacy_msg = "Bad component data (literal without v6 'dato' property). table: '$table'"
			. " section_tipo: '$section_tipo' section_id: '$section_id' component_tipo: '$tipo'";

		// --no-auto-fix: report as before and repair nothing.
		if (self::$auto_fix !== true) {
			self::add($response, 'MISSING_DATO_ENVELOPE', self::SEVERITY_ERROR, $ctx, $legacy_msg, $value);
			return false;
		}

		// Not an object (array/scalar/null): outside every rule's domain.
		if (!is_object($value)) {
			self::add($response, 'UNKNOWN_COMPONENT_SHAPE', self::SEVERITY_ERROR, $ctx, $legacy_msg, $value);
			return false;
		}

		$vars = get_object_vars($value);

		// What is left once everything that CANNOT be a value is removed.
		//
		// Reaching this function means isset($value->dato) was false, so a `dato` key that
		// is nonetheless present decoded to null: it carries nothing and must not, by
		// itself, make the object look empty — the payload may still be sitting in the
		// sibling language keys. Treating "has a dato key" as "is empty" would discard
		// {"dato":null,"lg-spa":[…]} silently, which is data loss reported as a success.
		$payload = $vars;
		unset($payload['dato']);
		foreach (self::SIDECAR_KEYS as $sidecar) {
			unset($payload[$sidecar]);
		}

		// rule: EMPTY_COMPONENT_VALUE
		// Nothing but an empty `dato` and/or descriptive metadata: there is no data to
		// migrate and nothing to repair, so skipping is already correct behaviour.
		if (empty($payload)) {
			self::add(
				$response,
				'EMPTY_COMPONENT_VALUE',
				self::SEVERITY_FIXED,
				$ctx,
				"Empty component value skipped (nothing to migrate). tipo: '$tipo'",
				$value
			);
			return false;
		}

		// rule: MISSING_DATO_ENVELOPE
		// The guard is deliberately ALL keys, not any: a single non-language key means
		// the object is something else and must not be wrapped.
		// NOTE json_decode returns a numeric object key as an INT, so the (string) cast is
		// what makes a key like "0" testable at all — and it correctly fails the pattern.
		$all_lang = true;
		foreach (array_keys($payload) as $key) {
			if (preg_match(self::LANG_KEY_PATTERN, (string)$key) !== 1) {
				$all_lang = false;
				break;
			}
		}
		if ($all_lang === true) {
			self::add(
				$response,
				'MISSING_DATO_ENVELOPE',
				self::SEVERITY_FIXED,
				$ctx,
				"Missing 'dato' envelope — value wrapped as {dato:{…}}. tipo: '$tipo'"
					. ' langs: ' . implode(', ', array_keys($payload)),
				$value
			);
			// wraps the PAYLOAD, not the original: an empty `dato` and any sidecar
			// metadata are dropped with it, since neither survives into v7.
			return (object)['dato' => (object)$payload];
		}

		// no rule matched
		self::add(
			$response,
			'UNKNOWN_COMPONENT_SHAPE',
			self::SEVERITY_ERROR,
			$ctx,
			$legacy_msg . ' keys: ' . implode(', ', array_keys($payload)),
			$value
		);

		return false;
	}//end component_value



	/**
	* ADD
	* Records one finding: aggregates it into its group and, for 'error' severity only,
	* appends the legacy string to $response->errors so the existing
	* `result = empty($errors)` contract keeps its meaning.
	*
	* @param object $response - v6_to_v7 response (by handle; stdClass is a reference type)
	* @param string $code
	* @param string $severity - one of the SEVERITY_* constants
	* @param array $ctx - table / section_tipo / section_id / tipo / model / stored_model
	* @param string $msg - human-readable line
	* @param mixed $sample - the offending value, truncated into the group
	* @return void
	*/
	public static function add(
		object $response,
		string $code,
		string $severity,
		array $ctx,
		string $msg,
		mixed $sample = null
	) : void {

		$tipo	= (string)($ctx['tipo'] ?? '');
		$model	= (string)($ctx['model'] ?? '');
		$key	= $code . '|' . $tipo . '|' . $model;

		if (!isset(self::$groups[$key])) {
			self::$groups[$key] = (object)[
				'code'			=> $code,
				'severity'		=> $severity,
				'tipo'			=> $tipo,
				'model'			=> $model,
				'stored_model'	=> $ctx['stored_model'] ?? null,
				'msg'			=> $msg,
				'count'			=> 0,
				'tables'		=> [],			// table => count
				// sampled ONLY here, on first sight of the group: encoding the offending
				// value on every occurrence would cost a json_encode per row, which is
				// exactly what the aggregation exists to avoid.
				'sample'		=> self::sample($sample),
				'sample_ref'	=> trim(($ctx['table'] ?? '') . '/' . ($ctx['section_tipo'] ?? '') . '/' . ($ctx['section_id'] ?? ''), '/')
			];
		}

		$group = self::$groups[$key];
		$group->count++;

		// The table spread is worth keeping: it is bounded by the migration's table list.
		// A per-section_tipo map is NOT — for a finding keyed on 'relations' it would grow
		// to one entry per section tipo in the database, and nothing reads it.
		$table = (string)($ctx['table'] ?? '');
		if ($table !== '') {
			$group->tables[$table] = ($group->tables[$table] ?? 0) + 1;
		}

		// backward compatibility: only errors reach ->errors, so notices and repaired
		// values no longer fail the review.
		if ($severity === self::SEVERITY_ERROR) {
			if (count($response->errors ?? []) < self::ERRORS_CAP) {
				$response->errors[] = $msg;
			}else{
				self::$errors_overflow++;
			}
		}
	}//end add



	/**
	* MERGE
	* Folds the findings produced by a nested call (migrate_component_data builds its own
	* response object) into the caller's response, stamping the context the nested call
	* did not have — the table name.
	*
	* @param object $response - caller's response
	* @param object $nested - the nested response, carrying ->findings
	* @param string $table
	* @return void
	*/
	public static function merge(object $response, object $nested, string $table) : void {

		$findings = $nested->findings ?? null;
		if (empty($findings) || !is_array($findings)) {
			return;
		}

		foreach ($findings as $finding) {
			$ctx = (array)($finding->ctx ?? []);
			$ctx['table'] = $ctx['table'] ?? $table;
			self::add(
				$response,
				(string)$finding->code,
				(string)$finding->severity,
				$ctx,
				(string)$finding->msg,
				$finding->sample ?? null
			);
		}
	}//end merge



	/**
	* DEFER
	* Queues a finding on a response that is NOT the top-level one (migrate_component_data
	* returns its own object and does not know the table). merge() replays these into the
	* real aggregation once the caller supplies the missing context.
	*
	* @param object $response
	* @param string $code
	* @param string $severity
	* @param array $ctx
	* @param string $msg
	* @param mixed $sample
	* @return void
	*/
	public static function defer(
		object $response,
		string $code,
		string $severity,
		array $ctx,
		string $msg,
		mixed $sample = null
	) : void {

		if (!isset($response->findings) || !is_array($response->findings)) {
			$response->findings = [];
		}

		// The sample is carried RAW and truncated later, by add(), and only for the first
		// occurrence of a group. Encoding here would mean a json_encode per row for a
		// defect that repeats across the whole table. The finding is consumed by merge()
		// immediately after this call returns, so nothing is retained.
		$response->findings[] = (object)[
			'code'		=> $code,
			'severity'	=> $severity,
			'ctx'		=> $ctx,
			'msg'		=> $msg,
			'sample'	=> $sample
		];

		// Deliberately does NOT touch $response->errors. Every caller of a deferring
		// function decides on ->result, which the deferring function sets explicitly, and
		// merge() is what puts the string on the PARENT's error list. Writing it here too
		// would double-count it the moment the parent merges.
	}//end defer



	/**
	* GET_REPORT
	* The aggregated verdict, ordered by severity (errors first, then notices, then the
	* repaired ones) and by count within each severity.
	*
	* @return object {
	*   fixed: int, notices: int, errors: int, errors_overflow: int,
	*   auto_fix: bool, groups: array<int,stdClass>
	* }
	*/
	public static function get_report() : object {

		$groups = array_values(self::$groups);

		$rank = [
			self::SEVERITY_ERROR	=> 0,
			self::SEVERITY_NOTICE	=> 1,
			self::SEVERITY_FIXED	=> 2
		];
		usort($groups, static function(object $a, object $b) use ($rank) : int {
			$by_severity = ($rank[$a->severity] ?? 9) <=> ($rank[$b->severity] ?? 9);
			return ($by_severity !== 0)
				? $by_severity
				: ($b->count <=> $a->count);
		});

		$totals = [
			self::SEVERITY_FIXED	=> 0,
			self::SEVERITY_NOTICE	=> 0,
			self::SEVERITY_ERROR	=> 0
		];
		foreach ($groups as $group) {
			$totals[$group->severity] = ($totals[$group->severity] ?? 0) + $group->count;
		}

		return (object)[
			'fixed'				=> $totals[self::SEVERITY_FIXED],
			'notices'			=> $totals[self::SEVERITY_NOTICE],
			'errors'			=> $totals[self::SEVERITY_ERROR],
			'errors_overflow'	=> self::$errors_overflow,
			'auto_fix'			=> self::$auto_fix,
			'groups'			=> $groups
		];
	}//end get_report



	/**
	* STORED_MODEL
	* The model name the ROW itself recorded when the value was written, dug out of the
	* v6 sidecar properties (`info.modelo`, or the legacy `inf` string
	* "Traducciones [component_project_langs]").
	*
	* This is the single most useful fact when the ontology model and the stored shape
	* disagree: it tells the operator what the value used to be, which the current
	* ontology can no longer say.
	*
	* @param mixed $value
	* @return string|null
	*/
	public static function stored_model(mixed $value) : ?string {

		if (!is_object($value)) {
			return null;
		}

		// modern sidecar: { info: { label: …, modelo: 'component_input_text' } }
		if (isset($value->info->modelo) && is_string($value->info->modelo) && $value->info->modelo !== '') {
			return $value->info->modelo;
		}

		// legacy sidecar: { inf: 'Traducciones [component_project_langs]' }
		if (isset($value->inf) && is_string($value->inf)
			&& preg_match('/\[([a-z0-9_]+)\]/', $value->inf, $matches) === 1) {
			return $matches[1];
		}

		return null;
	}//end stored_model



	/**
	* SAMPLE
	* A short, printable rendering of an offending value, for the group's example.
	* @param mixed $value
	* @return string
	*/
	private static function sample(mixed $value) : string {

		if ($value === null) {
			return '';
		}

		$encoded = is_string($value)
			? $value
			: (string)json_handler::encode($value);

		return mb_strimwidth($encoded, 0, self::SAMPLE_WIDTH, '…');
	}//end sample



}//end class v6_to_v7_normalize
