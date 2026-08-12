<?php
/**
 * PUBLICATION PARITY COMPARATOR — v6 reference vs v7 result.
 *
 * Compares two whole-element publication snapshots (as produced by harness_dump_db.php /
 * run_v6_diffusion_full.php) table by table, column by column, and classifies every column
 * into an explicit verdict. It is deliberately pessimistic: anything it cannot prove equal is
 * reported, and anything it can only prove equal AFTER a normalisation is reported as such —
 * never laundered into a plain MATCH.
 *
 * (compare_tables.php is left untouched for its existing single-record numisdata-era callers.)
 *
 * Usage:
 *   php compare_publication.php <v6.json> <v7.json> [options]
 *
 * Options:
 *   --schema6=FILE --schema7=FILE   structure dumps (harness_dump_db.php --schema)
 *   --tables=a,b                    restrict to these MariaDB table names
 *   --ignore-cols=id                columns to skip entirely (default: id)
 *   --normalize=media,json,numeric,ws   enable normalisers (default: none — raw comparison)
 *   --allow-null-empty              treat NULL vs '' as equal (default: it is a MISMATCH)
 *   --examples=5                    examples printed per column (default 5)
 *   --example-width=200             truncation width for example values (default 200)
 *   --run-info6=FILE --run-info7=FILE   run metadata, echoed in the summary
 *   --json=report.json              write the same report machine-readably
 *   --quiet                         summary only
 *
 * Exit: 0 something was actually compared and every column is MATCH/NORMALIZED/UNTESTED
 *     · 1 mismatches, a timestamp divergence, or NOTHING COMPARED
 *     · 2 input error
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DESIGN NOTES (each of these is a bug this comparator was written to stop hiding)
 *
 * ROW KEY = section_id|lang, extended with |tld when the tables carry a tld column.
 *   v6's own unique key on thesaurus-shaped tables is (section_id,lang,tld); the v7 table has
 *   PRIMARY KEY(section_id,lang). Keying on the v6 key means a v7-side row COLLAPSE (several
 *   v6 tld rows landing on one v7 row) shows up as rows-only-in-v6, i.e. a real finding,
 *   instead of silently comparing one arbitrary survivor.
 *
 * THE PUBLICATION TIMESTAMP IS COMPARED FROM THE RUN INFO, NOT FROM A COLUMN. v6 only ever adds
 *   a `dd_tm` column to time-machine CLONE tables (class.diffusion_mysql.php:439 gates it on
 *   table_type==='tm', :686-695 names them tm_<table>), and those are excluded by name below;
 *   there is no dd_tm producer in v7 at all. So dd_tm cannot serve as the timestamp witness.
 *   Instead --run-info6/--run-info7 are compared directly: v6 publishes FIRST and records the
 *   diffusion::get_publication_unix_timestamp() it actually used, the orchestrator feeds that
 *   value to v7 via --run-started-at, and a difference here is reported as a finding. Without
 *   that guard the four mht nodes fed by process_dato='diffusion::get_publication_unix_timestamp'
 *   (actv104, rsc712, rsc1209, hierarchy78) would differ on EVERY row.
 *   Only `id` is ignored by default (v6 has an AUTO_INCREMENT id column, v7 has none).
 *
 * NOTHING COMPARED IS NEVER PARITY. Zero tables compared, or zero rows compared, is reported as
 *   NOTHING COMPARED and exits non-zero. mismatch_total counts only real mismatches, so without
 *   this an empty-vs-empty pair (a publisher that silently wrote nothing) is indistinguishable
 *   from "everything matched". Same rule as the column-level UNTESTED verdict, applied at table
 *   and dataset level.
 *
 * MISSING TABLE == PRESENT-BUT-EMPTY TABLE. v7's ensureSchema pre-creates a table for every
 *   section; v6 creates a table only when it writes its first row. So "absent on one side,
 *   zero rows on the other" is a schema-shape difference, reported under SCHEMA-ONLY, not a
 *   data mismatch.
 *
 * A COLUMN POPULATED IN ZERO v6 ROWS IS *UNTESTED*, NEVER MATCH. Green on empty==empty proves
 *   nothing about the migrated chain for that column.
 *
 * NULL_VS_EMPTY IS ITS OWN CATEGORY and is NOT normalised away: NULL and '' are different
 *   values to every downstream consumer. It counts as a mismatch unless --allow-null-empty.
 *
 * tm_% TABLES ARE EXCLUDED BY NAME (time-machine shadow tables, not publication output).
 */

// NOTE: harness_canonical_json.php is deliberately NOT loaded. Its diffusion_canonical_json()
// casts objects to arrays, which is right for the ontology grammar but would launder an
// object-vs-array divergence here; the `json` normaliser below uses its own type-preserving
// canonicaliser instead.

// ─────────────────────────────────────────────────────────────────────────────
// ARGS
// ─────────────────────────────────────────────────────────────────────────────

	$v6_file		= null;
	$v7_file		= null;
	$schema6_file	= null;
	$schema7_file	= null;
	$run_info6_file	= null;
	$run_info7_file	= null;
	$json_out		= null;
	$only_tables	= [];
	$ignore_cols	= ['id'];
	$accepted_file	= __DIR__ . '/accepted_differences.json';
	$normalizers	= [];
	$allow_null_empty	= false;
	$examples_max	= 5;
	$example_width	= 200;
	$quiet			= false;

	$VALID_NORMALIZERS = ['media', 'json', 'numeric', 'ws'];

	foreach (array_slice($argv, 1) as $a) {
		if (str_starts_with($a, '--schema6=')) {
			$schema6_file = substr($a, 10);
		} elseif (str_starts_with($a, '--schema7=')) {
			$schema7_file = substr($a, 10);
		} elseif (str_starts_with($a, '--run-info6=')) {
			$run_info6_file = substr($a, 12);
		} elseif (str_starts_with($a, '--run-info7=')) {
			$run_info7_file = substr($a, 12);
		} elseif (str_starts_with($a, '--tables=')) {
			$only_tables = array_values(array_filter(array_map('trim', explode(',', substr($a, 9)))));
		} elseif (str_starts_with($a, '--ignore-cols=')) {
			$ignore_cols = array_values(array_filter(array_map('trim', explode(',', substr($a, 14)))));
		} elseif (str_starts_with($a, '--accepted=')) {
			$accepted_file = substr($a, 11);
		} elseif (str_starts_with($a, '--normalize=')) {
			$normalizers = array_values(array_filter(array_map('trim', explode(',', substr($a, 12)))));
		} elseif (str_starts_with($a, '--examples=')) {
			$examples_max = max(0, (int)substr($a, 11));
		} elseif (str_starts_with($a, '--example-width=')) {
			$example_width = max(20, (int)substr($a, 16));
		} elseif (str_starts_with($a, '--json=')) {
			$json_out = substr($a, 7);
		} elseif ($a === '--allow-null-empty') {
			$allow_null_empty = true;
		} elseif ($a === '--quiet') {
			$quiet = true;
		} elseif (str_starts_with($a, '--')) {
			fwrite(STDERR, "compare_publication: unknown option '$a'\n");
			exit(2);
		} elseif ($v6_file === null) {
			$v6_file = $a;
		} elseif ($v7_file === null) {
			$v7_file = $a;
		} else {
			fwrite(STDERR, "compare_publication: unexpected argument '$a'\n");
			exit(2);
		}
	}

	if (empty($v6_file) || empty($v7_file)) {
		fwrite(STDERR, "compare_publication: usage: php compare_publication.php <v6.json> <v7.json> [options]\n");
		exit(2);
	}

	$bad_normalizers = array_diff($normalizers, $VALID_NORMALIZERS);
	if (!empty($bad_normalizers)) {
		fwrite(STDERR, 'compare_publication: unknown normaliser(s): ' . implode(', ', $bad_normalizers)
			. ' (valid: ' . implode(', ', $VALID_NORMALIZERS) . ")\n");
		exit(2);
	}

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPTED DIFFERENCES
// A decision record, not a convenience: each entry says "the published bytes differ and the
// websites are still correct", with the reason. Accepted columns are still compared and still
// REPORTED (verdict ACCEPTED, reason printed) — they only stop counting towards the exit code.
// --accepted=none disables the whole file, which is how a decision gets re-checked.
// ─────────────────────────────────────────────────────────────────────────────

	$unordered_json_cols	= [];
	$accepted_cols			= [];
	if ($accepted_file !== 'none') {
		if (!is_file($accepted_file)) {
			fwrite(STDERR, "compare_publication: accepted-differences file not found: $accepted_file\n");
			fwrite(STDERR, "  pass --accepted=none to run with no acceptances.\n");
			exit(2);
		}
		$accepted_raw = json_decode((string)file_get_contents($accepted_file), true);
		if (!is_array($accepted_raw)) {
			fwrite(STDERR, "compare_publication: cannot parse $accepted_file\n");
			exit(2);
		}
		$unordered_json_cols	= $accepted_raw['unordered_json_columns'] ?? [];
		$accepted_cols			= $accepted_raw['accepted_columns'] ?? [];
	}

	/**
	 * Multiset comparison of two JSON arrays: same elements, order ignored.
	 * Used ONLY for columns declared unordered, and only after the ordered
	 * comparison has already failed — so a column that matches outright is
	 * never reported as merely accepted.
	 */
	$json_multiset_equal = function($a, $b) : bool {
		if (!is_string($a) || !is_string($b)) return false;
		$da = json_decode($a, true);
		$db = json_decode($b, true);
		if (!is_array($da) || !is_array($db)) return false;
		if (count($da) !== count($db)) return false;
		$norm = function(array $arr) : array {
			$out = array_map(function($x) { return json_encode($x); }, $arr);
			sort($out);
			return $out;
		};
		return $norm($da) === $norm($db);
	};

// ─────────────────────────────────────────────────────────────────────────────
// INPUT
// ─────────────────────────────────────────────────────────────────────────────

	$read_json = function(?string $file, string $what) : ?array {
		if (empty($file)) {
			return null;
		}
		if (!is_file($file)) {
			fwrite(STDERR, "compare_publication: $what not found: $file\n");
			exit(2);
		}
		$data = json_decode((string)file_get_contents($file), true);
		if (!is_array($data)) {
			fwrite(STDERR, "compare_publication: $what is not valid JSON: $file\n");
			exit(2);
		}
		return $data;
	};

	$v6			= $read_json($v6_file, 'v6 snapshot');
	$v7			= $read_json($v7_file, 'v7 snapshot');
	$schema6	= $read_json($schema6_file, 'v6 schema');
	$schema7	= $read_json($schema7_file, 'v7 schema');
	$run_info6	= $read_json($run_info6_file, 'v6 run info');
	$run_info7	= $read_json($run_info7_file, 'v7 run info');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

	$MEDIA_CANONICAL = '/dedalo/@MEDIA@/';

	/** A value that carries no information. Used for the UNTESTED verdict. */
	$is_empty = fn($v) => $v === null || $v === '';

	/** NULL on one side and '' on the other: different values, reported on its own. */
	$is_null_vs_empty = fn($a, $b) => ($a === null && $b === '') || ($a === '' && $b === null);

	/** ws: CRLF → LF and trailing whitespace trimmed (per line and at the end). */
	$norm_ws = function($v) {
		if (!is_string($v)) {
			return $v;
		}
		$v = str_replace(["\r\n", "\r"], "\n", $v);
		$v = preg_replace('/[ \t]+$/m', '', $v);
		return rtrim($v);
	};

	/** numeric: applies ONLY when both sides parse as a number or a boolean literal. */
	$as_number = function($v) {
		if (is_bool($v)) {
			return $v ? 1.0 : 0.0;
		}
		if (is_int($v) || is_float($v)) {
			return (float)$v;
		}
		if (!is_string($v)) {
			return null;
		}
		$t = trim($v);
		if ($t === '') {
			return null;
		}
		$lower = strtolower($t);
		if (in_array($lower, ['true', 't'], true))  return 1.0;
		if (in_array($lower, ['false', 'f'], true)) return 0.0;
		return is_numeric($t) ? (float)$t : null;
	};

	/**
	 * media: the two installs mount media under different prefixes
	 * (v6 DEDALO_MEDIA_URL=/dedalo/media_mib, v7 /dedalo/media). Rewrite the first path
	 * segment after /dedalo/ to a canonical marker, per |-separated segment, and only on
	 * values that actually start with /dedalo/ — never on arbitrary text.
	 */
	$norm_media = function($v) use ($MEDIA_CANONICAL) {
		if (!is_string($v) || strpos($v, '/dedalo/') === false) {
			return $v;
		}
		$parts = explode('|', $v);
		foreach ($parts as $i => $p) {
			if (str_starts_with($p, '/dedalo/')) {
				$parts[$i] = preg_replace('#^/dedalo/[^/]+/#', $MEDIA_CANONICAL, $p, 1);
			}
		}
		return implode('|', $parts);
	};

	/**
	 * Canonicalise a decoded JSON value: OBJECT keys sorted recursively, ARRAY ORDER PRESERVED
	 * (in the v7 grammar a ddo_map entry list and a parser chain are ordered sequences).
	 *
	 * TYPE-PRESERVING, unlike the shared diffusion_canonical_json(): objects stay stdClass and
	 * lists stay arrays, so `{}` encodes as `{}` and `[]` as `[]`. Collapsing objects into
	 * arrays (which is what casting to array + json_encode does) would launder a real
	 * object-vs-array divergence between the two publishers into a NORMALIZED verdict.
	 */
	$canonical_typed = function($v) use (&$canonical_typed) {
		if (is_object($v)) {
			$props = (array)$v;
			ksort($props);
			$obj = new stdClass();
			foreach ($props as $k => $item) {
				$obj->{$k} = $canonical_typed($item);
			}
			return $obj;
		}
		if (is_array($v)) {
			// json_decode(assoc=false) only ever produces LISTS here — order is data.
			return array_map($canonical_typed, $v);
		}
		return $v;
	};

	/** json: canonical key order (arrays keep their order — chain/ddo_map order is meaning). */
	$norm_json = function($v) use ($canonical_typed) {
		if (!is_string($v)) {
			return $v;
		}
		$t = trim($v);
		if ($t === '' || ($t[0] !== '{' && $t[0] !== '[')) {
			return $v;
		}
		// assoc=FALSE: an empty object and an empty array must not decode to the same thing.
		$decoded = json_decode($t);
		if ($decoded === null && strtolower($t) !== 'null') {
			return $v; // not JSON: leave untouched
		}
		return (string) json_encode($canonical_typed($decoded));
	};

	/** Apply one named normaliser to both sides and test equality. */
	$apply = function(string $name, $a, $b) use ($norm_ws, $norm_media, $norm_json, $as_number) {
		switch ($name) {
			case 'ws':
				return [$norm_ws($a), $norm_ws($b)];
			case 'media':
				return [$norm_media($a), $norm_media($b)];
			case 'json':
				return [$norm_json($a), $norm_json($b)];
			case 'numeric':
				$na = $as_number($a);
				$nb = $as_number($b);
				// only when BOTH sides parse: otherwise a no-op, so it cannot launder anything
				return ($na === null || $nb === null) ? [$a, $b] : [$na, $nb];
		}
		return [$a, $b];
	};

	$eq = function($a, $b) : bool {
		if ($a === null || $b === null) {
			return $a === $b;
		}
		if (is_float($a) || is_float($b)) {
			return (float)$a === (float)$b;
		}
		return (string)$a === (string)$b;
	};

	$truncate = function($v, int $width) : string {
		if ($v === null) {
			return 'NULL';
		}
		$s	= is_string($v) ? $v : json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		$len= strlen((string)$s);
		if ($len <= $width) {
			return (string)$s;
		}
		return substr((string)$s, 0, $width) . '...(len=' . $len . ')';
	};

// ─────────────────────────────────────────────────────────────────────────────
// TABLE SET
// ─────────────────────────────────────────────────────────────────────────────

	$all_tables = array_values(array_unique(array_merge(
		array_keys($v6),
		array_keys($v7),
		$schema6 ? array_keys($schema6) : [],
		$schema7 ? array_keys($schema7) : []
	)));
	sort($all_tables);

	$tables = [];
	$excluded_tm = [];
	foreach ($all_tables as $t) {
		if (str_starts_with($t, 'tm_')) {			// time-machine shadow tables, not publication output
			$excluded_tm[] = $t;
			continue;
		}
		if (!empty($only_tables) && !in_array($t, $only_tables, true)) {
			continue;
		}
		$tables[] = $t;
	}

// ─────────────────────────────────────────────────────────────────────────────
// COMPARE
// ─────────────────────────────────────────────────────────────────────────────

	$report = [
		'inputs' => [
			'v6'		=> $v6_file,
			'v7'		=> $v7_file,
			'schema6'	=> $schema6_file,
			'schema7'	=> $schema7_file
		],
		'settings' => [
			'ignore_cols'		=> $ignore_cols,
			'normalizers'		=> $normalizers,
			'allow_null_empty'	=> $allow_null_empty,
			'tables_filter'		=> $only_tables,
			'excluded_tm_tables'=> $excluded_tm
		],
		'tables'	=> [],
		'summary'	=> []
	];

	$tally = [
		'tables_compared'		=> 0,
		'tables_schema_only'	=> 0,
		'tables_empty_both'		=> 0,
		'tables_with_mismatch'	=> 0,
		'columns_accepted'		=> 0,
		'columns_match'			=> 0,
		'columns_normalized'	=> 0,
		'columns_untested'		=> 0,
		'columns_null_vs_empty'	=> 0,
		'columns_mismatch'		=> 0,
		'columns_ignored'		=> 0,
		'rows_compared'			=> 0,
		'rows_only_v6'			=> 0,
		'rows_only_v7'			=> 0,
		'cell_mismatches'		=> 0
	];

	// observed environment facts, collected while walking the data.
	// (dd_tm is deliberately NOT collected: it only ever exists on tm_% clone tables, which are
	//  excluded above, so it was always an empty list. The publication timestamp is compared from
	//  the run info instead — see the docblock.)
	$observed = [
		'v6' => ['langs' => [], 'media_prefixes' => []],
		'v7' => ['langs' => [], 'media_prefixes' => []]
	];

	$collect = function(array $rows, string $side) use (&$observed) {
		foreach ($rows as $r) {
			if (isset($r['lang']) && $r['lang'] !== null && $r['lang'] !== '') {
				$observed[$side]['langs'][(string)$r['lang']] = true;
			}
			foreach ($r as $v) {
				if (is_string($v) && strpos($v, '/dedalo/') !== false) {
					if (preg_match_all('#/dedalo/([^/|]+)/#', $v, $m)) {
						foreach ($m[1] as $seg) {
							$observed[$side]['media_prefixes']['/dedalo/' . $seg . '/'] = true;
						}
					}
				}
			}
		}
	};

	foreach ($tables as $t) {

		$rows6 = $v6[$t] ?? null;
		$rows7 = $v7[$t] ?? null;

		$collect($rows6 ?? [], 'v6');
		$collect($rows7 ?? [], 'v7');

		$entry = [
			'table'			=> $t,
			'present_v6'	=> $rows6 !== null,
			'present_v7'	=> $rows7 !== null,
			'rows_v6'		=> $rows6 === null ? 0 : count($rows6),
			'rows_v7'		=> $rows7 === null ? 0 : count($rows7)
		];

		// ── NOTHING TO COMPARE ─────────────────────────────────────────────────
		// Two shapes, and they are NOT the same finding:
		//  · absent on one side, zero rows on the other → SCHEMA-ONLY. v7's ensureSchema
		//    pre-creates a table for every section, v6 creates one only when it writes its
		//    first row, so this is a schema-shape difference, not a data finding.
		//  · present on BOTH sides with zero rows on both → EMPTY-BOTH. Nothing was proved
		//    about this table; "empty == empty" is exactly the green-on-nothing that the
		//    column-level UNTESTED verdict exists to refuse, so it is a WARNING that counts
		//    toward the exit code.
		if ($entry['rows_v6'] === 0 && $entry['rows_v7'] === 0) {
			$entry['columns'] = [];
			if ($rows6 === null || $rows7 === null) {
				$entry['status'] = 'SCHEMA-ONLY';
				$entry['note']	 = 'table exists on one side only and holds no rows on either';
				$tally['tables_schema_only']++;
			} else {
				$entry['status'] = 'EMPTY-BOTH';
				$entry['note']	 = 'table exists on both sides and holds no rows on either — NOTHING WAS COMPARED';
				$tally['tables_empty_both']++;
			}
			$report['tables'][] = $entry;
			continue;
		}

		// one side has rows, the other has none/absent → a real data finding
		$entry['status'] = 'COMPARED';
		$rows6 = $rows6 ?? [];
		$rows7 = $rows7 ?? [];

		// ── row key ───────────────────────────────────────────────────────────
		$sample_cols = [];
		foreach (array_merge(array_slice($rows6, 0, 1), array_slice($rows7, 0, 1)) as $r) {
			foreach (array_keys($r) as $c) {
				$sample_cols[$c] = true;
			}
		}
		$has_tld	= isset($sample_cols['tld']);
		$key_cols	= $has_tld ? ['section_id', 'lang', 'tld'] : ['section_id', 'lang'];
		$entry['row_key'] = implode('|', $key_cols);

		$index = function(array $rows) use ($key_cols) : array {
			$out = [];
			foreach ($rows as $r) {
				$parts = [];
				foreach ($key_cols as $kc) {
					$parts[] = (string)($r[$kc] ?? '?');
				}
				$out[implode('|', $parts)] = $r;
			}
			return $out;
		};

		$i6 = $index($rows6);
		$i7 = $index($rows7);

		$keys = array_values(array_unique(array_merge(array_keys($i6), array_keys($i7))));
		sort($keys);

		$only6 = []; $only7 = []; $common = [];
		foreach ($keys as $k) {
			if (!isset($i7[$k]))      { $only6[] = $k; }
			elseif (!isset($i6[$k]))  { $only7[] = $k; }
			else                      { $common[] = $k; }
		}

		$entry['keys_total']	= count($keys);
		$entry['keys_common']	= count($common);
		$entry['rows_only_v6']	= $only6;
		$entry['rows_only_v7']	= $only7;

		$tally['rows_compared']	+= count($common);
		$tally['rows_only_v6']	+= count($only6);
		$tally['rows_only_v7']	+= count($only7);

		// ── columns ───────────────────────────────────────────────────────────
		$cols = [];
		foreach (array_merge($rows6, $rows7) as $r) {
			foreach (array_keys($r) as $c) {
				$cols[$c] = true;
			}
		}
		$cols = array_keys($cols);
		sort($cols);

		$col_reports = [];
		foreach ($cols as $c) {

			if (in_array($c, $ignore_cols, true)) {
				$tally['columns_ignored']++;
				continue;
			}
			if (in_array($c, $key_cols, true)) {
				continue; // part of the row key: equal by construction
			}

			$v6_populated	= 0;
			$n_match		= 0;
			$n_mismatch		= 0;
			$n_null_empty	= 0;
			$normalized_by	= [];
			$n_normalized	= 0;
			$n_accepted		= 0;
			$accept_reason	= null;
			// Acceptances resolve "<table>.<column>" BEFORE bare "<column>". A bare key is a
			// blanket statement about every table that has such a column, which is almost never
			// what was actually decided: `space` is an accepted NULL on restringidos and an OPEN
			// defect on games. Scope by default; use a bare key only when the decision really is
			// element-wide.
			$unordered_reason	= $unordered_json_cols["$t.$c"] ?? $unordered_json_cols[$c] ?? null;
			$accepted_reason_col	= $accepted_cols["$t.$c"] ?? $accepted_cols[$c] ?? null;
			$examples		= ['MISMATCH' => [], 'NULL_VS_EMPTY' => [], 'NORMALIZED' => [], 'ACCEPTED' => []];

			foreach ($common as $k) {

				$a = $i6[$k][$c] ?? null;
				$b = $i7[$k][$c] ?? null;

				if (!$is_empty($a)) {
					$v6_populated++;
				}

				if ($eq($a, $b)) {
					$n_match++;
					continue;
				}

				// DECLARED-UNORDERED json column: same elements, order ignored.
				if ($unordered_reason !== null && $json_multiset_equal($a, $b)) {
					$n_accepted++;
					$accept_reason = $unordered_reason;
					if (count($examples['ACCEPTED']) < $examples_max) {
						$examples['ACCEPTED'][] = ['key' => $k, 'v6' => $a, 'v7' => $b, 'why' => 'unordered-json'];
					}
					continue;
				}

				// DECLARED-ACCEPTED column: any difference is a recorded decision.
				if ($accepted_reason_col !== null) {
					$n_accepted++;
					$accept_reason = $accepted_reason_col;
					if (count($examples['ACCEPTED']) < $examples_max) {
						$examples['ACCEPTED'][] = ['key' => $k, 'v6' => $a, 'v7' => $b, 'why' => 'accepted-column'];
					}
					continue;
				}

				// NULL vs '' is its own category and is never normalised away
				if ($is_null_vs_empty($a, $b)) {
					if ($allow_null_empty===true) {
						$n_match++;
					} else {
						$n_null_empty++;
						if (count($examples['NULL_VS_EMPTY']) < $examples_max) {
							$examples['NULL_VS_EMPTY'][] = ['key' => $k, 'v6' => $a, 'v7' => $b];
						}
					}
					continue;
				}

				// normalisers, each attributed individually so "matches only after N" is visible
				$resolved_by = null;
				foreach ($normalizers as $n) {
					[$na, $nb] = $apply($n, $a, $b);
					if ($eq($na, $nb)) {
						$resolved_by = $n;
						break;
					}
				}
				if ($resolved_by === null && count($normalizers) > 1) {
					$ca = $a; $cb = $b;
					foreach ($normalizers as $n) {
						[$ca, $cb] = $apply($n, $ca, $cb);
					}
					if ($eq($ca, $cb)) {
						$resolved_by = 'combined:' . implode('+', $normalizers);
					}
				}

				if ($resolved_by !== null) {
					$n_normalized++;
					$normalized_by[$resolved_by] = ($normalized_by[$resolved_by] ?? 0) + 1;
					if (count($examples['NORMALIZED']) < $examples_max) {
						$examples['NORMALIZED'][] = ['key' => $k, 'v6' => $a, 'v7' => $b, 'by' => $resolved_by];
					}
					continue;
				}

				$n_mismatch++;
				$tally['cell_mismatches']++;
				if (count($examples['MISMATCH']) < $examples_max) {
					$examples['MISMATCH'][] = ['key' => $k, 'v6' => $a, 'v7' => $b];
				}
			}

			// ── verdict ────────────────────────────────────────────────────────
			if ($n_mismatch > 0) {
				$verdict = 'MISMATCH';
			} elseif ($n_null_empty > 0) {
				$verdict = 'NULL_VS_EMPTY';
			} elseif ($n_accepted > 0) {
				$verdict = 'ACCEPTED';
			} elseif ($v6_populated === 0) {
				// green on empty==empty proves nothing
				$verdict = 'UNTESTED';
			} elseif ($n_normalized > 0) {
				$verdict = 'NORMALIZED';
			} else {
				$verdict = 'MATCH';
			}

			$col_reports[] = [
				'column'			=> $c,
				'verdict'			=> $verdict,
				'accepted'			=> $n_accepted,
				'accepted_reason'	=> $accept_reason,
				'v6_populated'		=> $v6_populated,
				'match'				=> $n_match,
				'normalized'		=> $n_normalized,
				'normalized_by'		=> $normalized_by,
				'null_vs_empty'		=> $n_null_empty,
				'mismatch'			=> $n_mismatch,
				'examples'			=> $examples
			];

			switch ($verdict) {
				case 'MISMATCH':		$tally['columns_mismatch']++;		break;
				case 'NULL_VS_EMPTY':	$tally['columns_null_vs_empty']++;	break;
				case 'UNTESTED':		$tally['columns_untested']++;		break;
				case 'NORMALIZED':		$tally['columns_normalized']++;		break;
				case 'ACCEPTED':		$tally['columns_accepted']++;		break;
				default:				$tally['columns_match']++;			break;
			}
		}

		// rank by mismatch count descending, then by null_vs_empty, then by name
		usort($col_reports, function($x, $y) {
			return [$y['mismatch'], $y['null_vs_empty'], $x['column']]
				<=> [$x['mismatch'], $x['null_vs_empty'], $y['column']];
		});

		$entry['columns']			= $col_reports;
		$entry['columns_total']		= count($col_reports);
		$entry['has_mismatch']		= (!empty($only6) || !empty($only7));
		foreach ($col_reports as $cr) {
			if ($cr['verdict']==='MISMATCH' || $cr['verdict']==='NULL_VS_EMPTY') {
				$entry['has_mismatch'] = true;
			}
		}

		$tally['tables_compared']++;
		if ($entry['has_mismatch']===true) {
			$tally['tables_with_mismatch']++;
		}

		$report['tables'][] = $entry;
	}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA DIVERGENCE (optional)
// ─────────────────────────────────────────────────────────────────────────────

	$schema_report = null;
	if ($schema6 !== null && $schema7 !== null) {

		$schema_report = ['tables' => [], 'tables_only_v6' => [], 'tables_only_v7' => []];

		$stables = array_values(array_unique(array_merge(array_keys($schema6), array_keys($schema7))));
		sort($stables);
		foreach ($stables as $t) {
			if (str_starts_with($t, 'tm_')) continue;
			if (!empty($only_tables) && !in_array($t, $only_tables, true)) continue;

			if (!isset($schema7[$t])) { $schema_report['tables_only_v6'][] = $t; continue; }
			if (!isset($schema6[$t])) { $schema_report['tables_only_v7'][] = $t; continue; }

			$c6 = $schema6[$t];
			$c7 = $schema7[$t];
			$diff = [
				'columns_only_v6'	=> array_values(array_diff(array_keys($c6), array_keys($c7))),
				'columns_only_v7'	=> array_values(array_diff(array_keys($c7), array_keys($c6))),
				'columns_differing'	=> []
			];
			foreach ($c6 as $name => $def6) {
				if (!isset($c7[$name])) continue;
				$def7 = $c7[$name];
				foreach (['type', 'null', 'key'] as $attr) {
					if (($def6[$attr] ?? null) !== ($def7[$attr] ?? null)) {
						$diff['columns_differing'][$name][$attr] = [
							'v6' => $def6[$attr] ?? null,
							'v7' => $def7[$attr] ?? null
						];
					}
				}
			}
			if (!empty($diff['columns_only_v6']) || !empty($diff['columns_only_v7']) || !empty($diff['columns_differing'])) {
				$schema_report['tables'][$t] = $diff;
			}
		}
	}
	$report['schema'] = $schema_report;

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY FACTS
// ─────────────────────────────────────────────────────────────────────────────

	$facts = [
		'v6' => [
			'langs'				=> array_keys($observed['v6']['langs']),
			'langs_count'		=> count($observed['v6']['langs']),
			'media_prefixes'	=> array_keys($observed['v6']['media_prefixes']),
			'run_info'			=> $run_info6
		],
		'v7' => [
			'langs'				=> array_keys($observed['v7']['langs']),
			'langs_count'		=> count($observed['v7']['langs']),
			'media_prefixes'	=> array_keys($observed['v7']['media_prefixes']),
			'run_info'			=> $run_info7
		]
	];
	sort($facts['v6']['langs']);
	sort($facts['v7']['langs']);

	$report['facts']	= $facts;
	$report['summary']	= $tally;

	$mismatch_total = $tally['columns_mismatch']
		+ $tally['columns_null_vs_empty']
		+ $tally['rows_only_v6']
		+ $tally['rows_only_v7'];
	$report['summary']['mismatch_total'] = $mismatch_total;

	// ── NOTHING COMPARED ────────────────────────────────────────────────────────
	// mismatch_total counts only REAL mismatches, so on its own it cannot tell "everything
	// matched" from "nothing was looked at". Two empty snapshots (a publisher that wrote
	// nothing, a harness DB that was never refreshed and then never repopulated) would score
	// mismatch_total===0 and be reported as PARITY. Refuse.
	$nothing_compared = [];
	if ($tally['tables_compared'] === 0) {
		$nothing_compared[] = 'zero tables were compared';
	}
	if ($tally['rows_compared'] === 0) {
		$nothing_compared[] = 'zero rows were compared';
	}
	if ($tally['tables_empty_both'] > 0) {
		$nothing_compared[] = $tally['tables_empty_both']
			. ' table(s) present on BOTH sides with zero rows on both (untested, not matched)';
	}
	$report['summary']['nothing_compared'] = $nothing_compared;

	// ── THE PUBLICATION TIMESTAMP PIN ───────────────────────────────────────────
	// v6 publishes FIRST and its run_info records the diffusion::get_publication_unix_timestamp()
	// it actually used (a function-static memo with no injection point); the orchestrator hands
	// that value to v7 via --run-started-at. If the two run infos disagree the pin was defeated
	// and every column fed by process_dato='diffusion::get_publication_unix_timestamp' would
	// differ on every row — a permanent false divergence. Fail loudly instead of drowning.
	// The two run infos are authored independently — the v6 publisher writes snake_case, the v7
	// publisher writes camelCase — so this reader accepts BOTH spellings rather than forcing one
	// side's house style onto the other.
	$ts6 = $run_info6['run_started_at'] ?? $run_info6['runStartedAt'] ?? null;
	$ts7 = $run_info7['run_started_at'] ?? $run_info7['runStartedAt'] ?? null;
	$timestamp_finding = null;
	if ($run_info6 !== null && $run_info7 !== null) {
		if ($ts6 === null || $ts7 === null) {
			$missing = [];
			if ($ts6 === null) $missing[] = 'v6';
			if ($ts7 === null) $missing[] = 'v7';
			$timestamp_finding = 'run_started_at is missing from the ' . implode(' and ', $missing)
				. ' run info — the timestamp pin cannot be verified';
		} elseif ((string)$ts6 !== (string)$ts7) {
			$timestamp_finding = "run_started_at DIFFERS: v6=$ts6 v7=$ts7 — the timestamp pin was defeated";
		}
	}
	$report['summary']['timestamp_finding'] = $timestamp_finding;

	// "Nothing compared" only when there is genuinely nothing to report. If both sides wrote rows
	// but share no row key at all (a section_id or lang shape divergence — exactly the class of bug
	// this harness exists to catch) mismatch_total is non-zero, and calling that "nothing compared"
	// would send the reader off to check the publishers instead of the diff.
	if (($tally['tables_compared'] === 0 || $tally['rows_compared'] === 0) && $mismatch_total === 0) {
		$result = 'NOTHING COMPARED';
	} elseif ($mismatch_total > 0 || !empty($nothing_compared) || $timestamp_finding !== null) {
		$result = 'DIVERGENCE';
	} else {
		$result = 'PARITY';
	}
	$report['summary']['result'] = $result;

// ─────────────────────────────────────────────────────────────────────────────
// TEXT OUTPUT
// ─────────────────────────────────────────────────────────────────────────────

	$out = [];

	if ($quiet===false) {

		foreach ($report['tables'] as $entry) {

			$t = $entry['table'];

			if ($entry['status']==='SCHEMA-ONLY' || $entry['status']==='EMPTY-BOTH') {
				$out[] = sprintf('TABLE %s: %s (v6 %s, v7 %s) — %s',
					$t,
					$entry['status'],
					$entry['present_v6'] ? 'present' : 'absent',
					$entry['present_v7'] ? 'present' : 'absent',
					$entry['note']
				);
				$out[] = '';
				continue;
			}

			$out[] = sprintf('TABLE %s: rows v6=%d v7=%d | keys=%d (common=%d, only v6=%d, only v7=%d) | columns=%d | key=%s',
				$t,
				$entry['rows_v6'], $entry['rows_v7'],
				$entry['keys_total'], $entry['keys_common'],
				count($entry['rows_only_v6']), count($entry['rows_only_v7']),
				$entry['columns_total'],
				$entry['row_key']
			);
			if (!empty($entry['rows_only_v6'])) {
				$out[] = '  ROWS ONLY IN V6 : ' . implode(', ', array_slice($entry['rows_only_v6'], 0, 20))
					. (count($entry['rows_only_v6']) > 20 ? ' … +' . (count($entry['rows_only_v6']) - 20) : '');
			}
			if (!empty($entry['rows_only_v7'])) {
				$out[] = '  ROWS ONLY IN V7 : ' . implode(', ', array_slice($entry['rows_only_v7'], 0, 20))
					. (count($entry['rows_only_v7']) > 20 ? ' … +' . (count($entry['rows_only_v7']) - 20) : '');
			}

			// group by verdict, preserving the mismatch-descending order inside each group
			$groups = ['MISMATCH' => [], 'NULL_VS_EMPTY' => [], 'NORMALIZED' => [], 'ACCEPTED' => [], 'UNTESTED' => [], 'MATCH' => []];
			foreach ($entry['columns'] as $cr) {
				$groups[$cr['verdict']][] = $cr;
			}

			foreach (['MISMATCH', 'NULL_VS_EMPTY', 'NORMALIZED', 'ACCEPTED'] as $g) {
				foreach ($groups[$g] as $cr) {
					$head = sprintf('  %-13s %s (mismatch=%d, null_vs_empty=%d, normalized=%d, match=%d, v6_populated=%d)',
						$g, $cr['column'], $cr['mismatch'], $cr['null_vs_empty'], $cr['normalized'], $cr['match'], $cr['v6_populated']);
					if (!empty($cr['normalized_by'])) {
						$by = [];
						foreach ($cr['normalized_by'] as $n => $cnt) { $by[] = $n . ' x' . $cnt; }
						$head .= ' [by ' . implode(', ', $by) . ']';
					}
					if (!empty($cr['accepted_reason'])) {
						$out[] = '                  why accepted: ' . $cr['accepted_reason'];
					}
					$out[] = $head;
					foreach (['MISMATCH', 'NULL_VS_EMPTY', 'NORMALIZED'] as $ex_kind) {
						foreach ($cr['examples'][$ex_kind] as $ex) {
							$tag = isset($ex['by']) ? " ($ex_kind by {$ex['by']})" : " ($ex_kind)";
							$out[] = '      [' . $ex['key'] . ']' . $tag;
							$out[] = '        v6: ' . $truncate($ex['v6'], $example_width);
							$out[] = '        v7: ' . $truncate($ex['v7'], $example_width);
						}
					}
				}
			}

			if (!empty($groups['UNTESTED'])) {
				$out[] = '  UNTESTED      (0 populated v6 rows — proves nothing): '
					. implode(', ', array_column($groups['UNTESTED'], 'column'));
			}
			if (!empty($groups['MATCH'])) {
				$names = [];
				foreach ($groups['MATCH'] as $cr) { $names[] = $cr['column'] . '(' . $cr['v6_populated'] . ')'; }
				$out[] = '  MATCH         : ' . implode(', ', $names);
			}
			$out[] = '';
		}

		// schema divergence
		if ($schema_report !== null) {
			$out[] = '──── SCHEMA ────';
			if (!empty($schema_report['tables_only_v6'])) {
				$out[] = '  tables only in v6: ' . implode(', ', $schema_report['tables_only_v6']);
			}
			if (!empty($schema_report['tables_only_v7'])) {
				$out[] = '  tables only in v7: ' . implode(', ', $schema_report['tables_only_v7']);
			}
			if (empty($schema_report['tables'])) {
				$out[] = '  no per-column structural divergence';
			}
			foreach ($schema_report['tables'] as $t => $diff) {
				$out[] = "  $t:";
				if (!empty($diff['columns_only_v6'])) $out[] = '    columns only in v6: ' . implode(', ', $diff['columns_only_v6']);
				if (!empty($diff['columns_only_v7'])) $out[] = '    columns only in v7: ' . implode(', ', $diff['columns_only_v7']);
				foreach ($diff['columns_differing'] as $name => $attrs) {
					foreach ($attrs as $attr => $vals) {
						$out[] = sprintf('    %-24s %-5s v6=%s v7=%s', $name, $attr, json_encode($vals['v6']), json_encode($vals['v7']));
					}
				}
			}
			$out[] = '';
		}
	}

// SUMMARY block (always printed)
	$out[] = '──── SUMMARY ────';
	$out[] = sprintf('  tables      : %d compared, %d schema-only, %d empty-on-both, %d with mismatch (tm_%% excluded: %d)',
		$tally['tables_compared'], $tally['tables_schema_only'], $tally['tables_empty_both'],
		$tally['tables_with_mismatch'], count($excluded_tm));
	$out[] = sprintf('  columns     : %d MATCH, %d NORMALIZED, %d UNTESTED, %d NULL_VS_EMPTY, %d MISMATCH (%d ignored)',
		$tally['columns_match'], $tally['columns_normalized'], $tally['columns_untested'],
		$tally['columns_null_vs_empty'], $tally['columns_mismatch'], $tally['columns_ignored']);
	$out[] = sprintf('  accepted    : %d column(s) differ by a RECORDED DECISION (see %s)',
		$tally['columns_accepted'], $accepted_file === 'none' ? '--accepted=none' : basename($accepted_file));
	$out[] = sprintf('  rows        : %d compared, %d only in v6, %d only in v7 | %d differing cells',
		$tally['rows_compared'], $tally['rows_only_v6'], $tally['rows_only_v7'], $tally['cell_mismatches']);
	$out[] = sprintf('  normalizers : %s', empty($normalizers) ? '(none — raw comparison)' : implode(',', $normalizers));
	$out[] = sprintf('  ignored     : %s', empty($ignore_cols) ? '(none)' : implode(',', $ignore_cols));
	$out[] = sprintf('  run_started_at : v6=%s v7=%s %s',
		$ts6 === null ? '(not declared)' : (string)$ts6,
		$ts7 === null ? '(not declared)' : (string)$ts7,
		$timestamp_finding === null
			? (($ts6 !== null && $ts7 !== null) ? '(pinned — identical)' : '')
			: '(!) ' . $timestamp_finding);
	$out[] = sprintf('  langs       : v6=%d v7=%d %s',
		$facts['v6']['langs_count'], $facts['v7']['langs_count'],
		$facts['v6']['langs'] === $facts['v7']['langs'] ? '(identical sets)' : '(!) DIFFERENT SETS');
	$out[] = sprintf('  media prefix: v6=%s v7=%s',
		empty($facts['v6']['media_prefixes']) ? '(none)' : implode(',', $facts['v6']['media_prefixes']),
		empty($facts['v7']['media_prefixes']) ? '(none)' : implode(',', $facts['v7']['media_prefixes']));
	$out[] = '';
	foreach ($nothing_compared as $nc) {
		$out[] = '  (!) NOTHING COMPARED: ' . $nc;
	}
	if ($timestamp_finding !== null) {
		$out[] = '  (!) TIMESTAMP: ' . $timestamp_finding;
	}
	if ($result === 'PARITY') {
		$out[] = '  RESULT: PARITY (all columns MATCH / NORMALIZED / UNTESTED)';
	} elseif ($result === 'NOTHING COMPARED') {
		$out[] = '  RESULT: NOTHING COMPARED — this is NOT parity. '
			. 'Two empty snapshots prove nothing; check that both publishers actually wrote rows '
			. 'and that the harness database was refreshed before each pass.';
	} else {
		$findings = $mismatch_total + count($nothing_compared) + ($timestamp_finding === null ? 0 : 1);
		$out[] = '  RESULT: DIVERGENCE — ' . $findings . ' finding(s)'
			. ($mismatch_total !== $findings ? ' (' . $mismatch_total . ' data mismatch(es))' : '');
	}

	echo implode("\n", $out) . "\n";

// ─────────────────────────────────────────────────────────────────────────────
// JSON REPORT
// ─────────────────────────────────────────────────────────────────────────────

	if (!empty($json_out)) {
		$ok = file_put_contents(
			$json_out,
			json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
		);
		if ($ok === false) {
			fwrite(STDERR, "compare_publication: failed writing $json_out\n");
			exit(2);
		}
		fwrite(STDERR, "[compare] json report -> $json_out\n");
	}

	// NOTHING COMPARED is never exit 0 — see C6.
	exit($result === 'PARITY' ? 0 : 1);
