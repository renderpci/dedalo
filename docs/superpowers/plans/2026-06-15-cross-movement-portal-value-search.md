# Cross-Movement Portal-Value Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a single search-builder filter that combines several portal-relation values with AND match **across** the linked records (e.g. Refugees whose Movements reference Caldes de Malavella *and* Irun in *different* movement records), instead of silently requiring one linked record to hold all values.

**Architecture:** Backend-only. Each leaf search clause that traverses a multi-step `path` is given a unique `join_id` during the conform phase (`search::conform_filter`). That `join_id` is folded into the clause's `table_alias` (which the component bakes into its SQL `sentence`) and into the JOIN chain emitted by `build_sql_join()`, so every clause gets an **independent** `LATERAL JOIN` over the parent's relation array. The existing group `$and`/`$or` operator and the existing `DISTINCT ON (section_id)` then produce correct cross-record AND/OR semantics with no client changes.

**Tech Stack:** PHP 8.x, PostgreSQL (JSONB `relation` column), PHPUnit 13. Search engine: `core/search/class.search.php` + traits (`trait.where.php`, `trait.utils.php`). Tests under `test/server/` run with `vendor/bin/phpunit -c test/server/phpunit.xml`.

---

## Background facts (verified in code — do not re-derive)

- **Conform phase** `core/search/class.search.php::conform_filter()` (line ~795) walks the filter tree. For each **leaf** clause (object with a `path`) it sets, at line ~879:
  ```php
  $search_object->table_alias = $this->get_table_alias_from_path( $path );
  $search_object->table       = $this->matrix_table;
  ```
  then calls `$model_name::get_search_query($search_object)` which **mutates and returns the same object**, building `sentence` from `$search_object->table_alias` (e.g. `core/component_relation_common/trait.search_component_relation_common.php:222` `$ctx->table_alias = $query_object->table_alias;` → line 436 `"{$ctx->table_alias}.{$ctx->column} @> _Q1_::jsonb"`). Extra properties on the object survive the round-trip.
- **Build phase** `core/search/trait.where.php::filter_parser()` (line ~281) walks the *conformed* tree. For a leaf with `count($path) > 1` it calls `build_sql_join($search_object->path)` (line ~326, return value currently discarded) to append the JOIN, then `parse_search_object_sql($search_object)` (line ~329) which only substitutes `_Q1_` placeholders into the already-built `sentence`.
- **`get_table_alias_from_path(array $path)`** (`trait.utils.php:54`) and **`build_sql_join(array $path)`** (`trait.where.php:409`) independently compute the **same** final alias from the path tipos (e.g. `oh1_oh25_rs167`). The main table alias `$this->main_section_tipo_alias` is the shared FROM table and is **not** part of the joined-relation alias chain (step 0 sets `$base_key = $this->main_section_tipo_alias`).
- **The bug:** two leaf clauses with the *identical* path produce the *identical* alias → they reference the same joined row → `WHERE rel.relation @> Caldes AND rel.relation @> Irun` on one row → empty result. The old per-alias dedup guard at `trait.where.php:447` is commented out.
- **`DISTINCT ON (section_id)`** is already applied (`trait.select.php:107`, `class.search.php:1307`), so independent joins multiplying parent rows are collapsed.
- `build_sql_join()` is also called by **ordering** (`trait.order.php:227`, capturing the return value). That caller must keep today's behavior.

## Alias scheme to implement

Introduce a per-clause integer `join_id`. When set, prefix the **joined-relation** alias chain (NOT the main table alias) with `"j{join_id}_"`:

- Clause #1, path `dmm2070 → dmm2099 → dmm2045`: final alias `j1_dmm2099_dmm2045` style → SQL:
  ```sql
  LEFT JOIN LATERAL jsonb_array_elements(dmm2070.relation->'dmm2099') AS rel_j1_... ON true
  LEFT JOIN matrix_default AS j1_..._dmm2045 ON ...
  ```
- Clause #2 (same path) gets `j2_...` → a **separate** LATERAL+JOIN hanging off the same shared `dmm2070` parent.
- When `join_id` is `null` (single-level paths, order clauses, single-clause searches) → **no prefix**, byte-identical to today.

Within a single clause, all path steps share the one `join_id` (one traversal = one join chain), so multiple values inside one clause still match the same linked record (intra-record AND) — the "one box" semantics.

---

## File Structure

- **Modify** `core/search/trait.utils.php` — `get_table_alias_from_path()` gains optional `?int $join_id`.
- **Modify** `core/search/trait.where.php` — `build_sql_join()` gains optional `?int $join_id`; `filter_parser()` passes the clause's `join_id`.
- **Modify** `core/search/class.search.php` — add `$join_counter` reset point; `conform_filter()` assigns `join_id` to multi-level leaf clauses and passes it to `get_table_alias_from_path()`.
- **Create** `test/server/search/search_cross_join_Test.php` — new test class for the alias-independence and regression behavior.

---

## Task 1: Characterization — capture the current (buggy) SQL for two same-path clauses

Pin down real, runnable test tipos and prove the alias collision before changing anything.

**Files:**
- Create: `test/server/search/search_cross_join_Test.php`

- [ ] **Step 1: Discover a valid 2-step relation path in the test ontology**

Run:
```bash
grep -n "test80\|test3\|component_portal\|component_tipo" test/server/components/component_portal_Search_Test.php | head -20
```
Note the proven-valid pair from that file: section `test3`, portal component `test80` (model `component_portal`). Confirm `test80` targets a section by inspecting the relation it builds (`{"test80":[{"section_id":..,"section_tipo":"test3"}]}` → target section `test3`). For the leaf step pick a simple component on the target section by running:
```bash
grep -rn "section_tipo.*test3\|component_tipo.*test" test/server/components/component_relation_common_Search_Test.php | head
```
Record the chosen leaf component tipo (a relation/portal component on `test3`, e.g. `test80` reused, since a self-referential portal chain `test3 →test80→ test3 →test80→ test3` is a valid 2-step path for alias testing). The exact value of `q` does not matter for the SQL-shape assertion.

- [ ] **Step 2: Write a characterization test that dumps the generated SQL**

```php
<?php declare(strict_types=1);
require_once dirname(__FILE__, 2) . '/bootstrap.php';

final class search_cross_join_test extends BaseTestCase {

	private string $section_tipo = 'test3';
	private string $table        = 'matrix_test';

	protected function setUp(): void {
		if (login::is_logged() === false) {
			login_test::force_login(TEST_USER_ID);
		}
	}

	/** Two leaf clauses sharing the identical 2-step relation path. */
	private function two_same_path_sqo() : object {
		$path = [
			(object)['section_tipo' => 'test3', 'component_tipo' => 'test80', 'model' => 'component_portal'],
			(object)['section_tipo' => 'test3', 'component_tipo' => 'test80', 'model' => 'component_portal']
		];
		$clause_a = (object)['q' => (object)['section_id' => '1', 'section_tipo' => 'test3'], 'path' => $path];
		$clause_b = (object)['q' => (object)['section_id' => '2', 'section_tipo' => 'test3'], 'path' => $path];
		return (object)[
			'section_tipo' => [$this->section_tipo],
			'mode'         => 'list',
			'filter'       => (object)['$and' => [$clause_a, $clause_b]]
		];
	}

	public function test_characterize_current_sql() {
		$search = search::get_instance($this->two_same_path_sqo());
		$sql    = $search->parse_sql_query();
		fwrite(STDERR, "\n\n===CHARACTERIZE===\n" . $sql . "\n===END===\n\n");
		$this->assertIsString($sql);
	}
}
```

- [ ] **Step 3: Run it and read the emitted SQL**

Run:
```bash
vendor/bin/phpunit -c test/server/phpunit.xml --filter test_characterize_current_sql test/server/search/search_cross_join_Test.php
```
Expected: PASS, and the printed SQL shows the JOIN section with **one** relation join alias referenced by **both** `@>` fragments (the collision). If `parse_sql_query()` is not directly reachable (visibility/needs prior setup), adjust by calling `$search->search()` is NOT needed — `parse_sql_query()` is `public` (`class.search.php:1071`). If the chosen tipos throw in `get_search_query`, swap `test80`/`test3` for another proven pair from `component_relation_common_Search_Test.php` and re-run until the SQL prints.

- [ ] **Step 4: Record the observed aliases in a code comment**

Add a comment at the top of the test file documenting the actual alias string observed (e.g. `// before fix: both fragments reference alias "te3_te80_te3"`). This is the ground truth the fix must change.

- [ ] **Step 5: Commit**

```bash
git add test/server/search/search_cross_join_Test.php
git commit -m "test(search): characterize same-path join-alias collision

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Failing test — two same-path clauses must produce two independent joins

**Files:**
- Modify: `test/server/search/search_cross_join_Test.php`

- [ ] **Step 1: Add the desired-behavior test**

Append this method to `search_cross_join_test` (reuses `two_same_path_sqo()` from Task 1):

> **Characterization result (Task 1, commit a5d217c6d):** the buggy SQL already emits the `test80` LATERAL join *twice*, but BOTH use the identical target alias `te3_te80_te3`, and both WHERE fragments reference it. So counting LATERAL joins is NOT a valid discriminator (it is already 2). The correct red/green signal is the number of **distinct** `LEFT JOIN matrix_test AS <alias>` target aliases: currently **1**, must become **2** after the fix.

```php
	public function test_same_path_clauses_get_independent_joins() {
		$search = search::get_instance($this->two_same_path_sqo());
		$sql    = $search->parse_sql_query();

		// Extract every target-table alias emitted by build_sql_join:
		//   "LEFT JOIN matrix_test AS <alias> ON"
		preg_match_all('/LEFT JOIN\s+matrix_test\s+AS\s+(\S+)\s+ON/i', $sql, $m);
		$aliases          = $m[1];
		$distinct_aliases = array_values(array_unique($aliases));

		// Two clauses with the same path must produce TWO DISTINCT joined-table aliases,
		// so each clause traverses the relation independently (cross-record AND/OR).
		$this->assertCount(
			2,
			$distinct_aliases,
			"Expected 2 distinct join aliases (one per clause), got: "
				. json_encode($aliases) . "\nSQL:\n{$sql}"
		);

		// And each clause's WHERE fragment must reference its OWN alias (no shared alias).
		foreach ($distinct_aliases as $alias) {
			$this->assertStringContainsString(
				"{$alias}.relation @>",
				$sql,
				"Each distinct alias must own a WHERE fragment.\nSQL:\n{$sql}"
			);
		}
	}
```

- [ ] **Step 2: Run it and confirm it FAILS**

Run:
```bash
vendor/bin/phpunit -c test/server/phpunit.xml --filter test_same_path_clauses_get_independent_joins test/server/search/search_cross_join_Test.php
```
Expected: FAIL — there is only **1** distinct alias (`te3_te80_te3`) shared by both clauses, so `assertCount(2, ...)` fails.

- [ ] **Step 3: Commit the failing test**

```bash
git add test/server/search/search_cross_join_Test.php
git commit -m "test(search): assert same-path clauses get independent joins (red)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add the `join_id` prefix to `get_table_alias_from_path()`

**Files:**
- Modify: `core/search/trait.utils.php:54-76`

- [ ] **Step 1: Add the optional `join_id` parameter and prefix logic**

Replace the body of `get_table_alias_from_path()` with:

```php
	public function get_table_alias_from_path( array $path, ?int $join_id=null ) : string {

		$total	= count($path);
		$ar_key = [];
		foreach ($path as $key => $step_object) {

			if ($total===1) {

				$ar_key[] = $this->main_section_tipo_alias; // mix

			}else{

				$ar_key[] = ($key === $total-1)
					? self::trim_tipo($step_object->section_tipo) // last
					: self::trim_tipo($step_object->section_tipo) .'_'. self::trim_tipo($step_object->component_tipo);
			}

		}//foreach ($path as  $step_object)

		$table_alias = implode('_', $ar_key);

		// Per-clause discriminator. Multi-step paths only: prefix the joined-relation
		// alias so two clauses sharing the same path get INDEPENDENT joins (each clause
		// traverses the relation array on its own row). Single-step paths use the shared
		// main table alias and must never be prefixed. join_id===null preserves legacy SQL.
		if ($join_id!==null && $total>1) {
			$table_alias = 'j' . $join_id . '_' . $table_alias;
		}

		return $table_alias;
	}//end get_table_alias_from_path
```

- [ ] **Step 2: Verify nothing breaks yet (the call site still passes no join_id)**

Run:
```bash
vendor/bin/phpunit -c test/server/phpunit.xml --filter "search_Test|search_cross_join_Test" test/server/search/
```
Expected: same results as before this task (cross-join test still FAILS; `search_Test` still PASSES). The new param is optional and unused so far.

- [ ] **Step 3: Commit**

```bash
git add core/search/trait.utils.php
git commit -m "feat(search): add optional join_id prefix to get_table_alias_from_path

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Make `build_sql_join()` honor the same `join_id` prefix

**Files:**
- Modify: `core/search/trait.where.php:409-487`

- [ ] **Step 1: Add the `join_id` parameter and apply the prefix to the joined-relation aliases**

Change the signature and the alias construction. Replace lines 409–487 (`build_sql_join`) so that:
- the signature becomes `public function build_sql_join(array $path, ?int $join_id=null) : ?string {`
- a prefix is computed once: `$prefix = ($join_id!==null) ? 'j'.$join_id.'_' : '';`
- the **target/relation** aliases use the prefix while the **main table** (`$base_key`) stays unprefixed.

Concretely:

```php
	public function build_sql_join(array $path, ?int $join_id=null) : ?string {

		$ar_key_join	= [];
		$base_key		= '';
		$total_paths	= count($path);

		// Per-clause discriminator prefix. Keeps two clauses with the same path from
		// collapsing onto one joined row (see get_table_alias_from_path). Empty when
		// join_id is null → legacy alias names unchanged.
		$prefix			= ($join_id!==null) ? 'j'.$join_id.'_' : '';

		$last_table_name = null;

		foreach ($path as $key => $step_object) {

			if ($key===0) {
				$base_key		= $this->main_section_tipo_alias;
				$ar_key_join[]	= self::trim_tipo($step_object->section_tipo) .'_'. self::trim_tipo($step_object->component_tipo);
				continue;
			}

			$current_key = ($key===1)
				? $base_key
				: $prefix . implode('_', $ar_key_join);

			$ar_key_join[] = ($key === $total_paths-1)
				? self::trim_tipo($step_object->section_tipo)
				: self::trim_tipo($step_object->section_tipo) .'_'. self::trim_tipo($step_object->component_tipo);

			$matrix_table = common::get_matrix_table_from_tipo($step_object->section_tipo);
			// Ignore invalid empty matrix tables
			if (empty($matrix_table)) {
				debug_log(__METHOD__
					. " Ignored invalid empty matrix table " . PHP_EOL
					. ' step_object->section_tipo: ' . $step_object->section_tipo
					, logger::ERROR
				);
				continue;
			}

			$t_name		= $prefix . implode('_', $ar_key_join);
			$t_relation	= 'rel_' . $t_name;

			$sql_join = '';
			if(SHOW_DEBUG===true) {
				$section_name = ontology_node::get_term_by_tipo($step_object->section_tipo, null, true, false);
				$sql_join .= "-- JOIN GROUP $matrix_table - $t_name - $section_name";
			}

			// Security: $component_tipo is a client-supplied SQO path value interpolated
			// verbatim as a JSONB relation key (it cannot be parameterized and must keep
			// its exact form, so trim_tipo() is not usable here). Validate the tipo format
			// and fail closed on anything that is not a well-formed ontology tipo.
			$component_tipo = $path[$key-1]->component_tipo;
			if (!self::is_valid_tipo((string)$component_tipo)) {
				debug_log(__METHOD__
					. " Rejected invalid component_tipo in join path (possible injection attempt) " . PHP_EOL
					. ' component_tipo: ' . to_string($component_tipo)
					, logger::ERROR
				);
				throw new Exception("Error: invalid component_tipo in search path", 1);
			}
			$sql_join .= PHP_EOL . "LEFT JOIN LATERAL jsonb_array_elements({$current_key}.relation->'{$component_tipo}') AS {$t_relation} on true";

			$sql_join .= PHP_EOL . "LEFT JOIN {$matrix_table} AS {$t_name} ON" . PHP_EOL;
			$sql_join .= " {$t_name}.section_id = NULLIF(({$t_relation}->>'section_id'), '')::bigint";
			$sql_join .= " AND {$t_name}.section_tipo = ({$t_relation}->>'section_tipo')::text";

			$this->sql_obj->join[] = $sql_join;

			// Override on every iteration
			$last_table_name = $t_name;
		}//end foreach ($path as $key => $step_object)

		return $last_table_name;
	}//end build_sql_join
```

> Note: the `current_key` for `$key===1` is the shared main table alias (`$base_key`), so every clause expands the *same* parent relation array independently — exactly the cross-record behavior we want. For `$key>=2` it uses `$prefix . implode(...)`, matching the prefixed `$t_name` from the previous step.

- [ ] **Step 2: Pass the clause's `join_id` from `filter_parser()`**

In `core/search/trait.where.php`, inside `filter_parser()` at the leaf branch (currently line ~324-327):

```php
				$n_levels = count($search_object->path);
				if ($n_levels>1) {
					$this->build_sql_join($search_object->path, $search_object->join_id ?? null);
				}
```

(Only the `build_sql_join(...)` call line changes — add `, $search_object->join_id ?? null`.)

- [ ] **Step 3: Run the cross-join test — still RED until conform assigns join_id**

Run:
```bash
vendor/bin/phpunit -c test/server/phpunit.xml --filter test_same_path_clauses_get_independent_joins test/server/search/search_cross_join_Test.php
```
Expected: still FAIL (conform has not set `join_id` yet, so `$search_object->join_id ?? null` is `null` → no prefix). This is expected; the next task closes the loop.

- [ ] **Step 4: Commit**

```bash
git add core/search/trait.where.php
git commit -m "feat(search): build_sql_join honors per-clause join_id prefix

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Assign `join_id` per multi-level leaf clause in `conform_filter()` (turns the test green)

**Files:**
- Modify: `core/search/class.search.php` (add property + reset; edit `conform_filter` line ~879)

- [ ] **Step 1: Add a join counter property**

Near the other search state properties (e.g. just after `public string $main_section_tipo_alias;` at `class.search.php:164`), add:

```php
	/**
	* Monotonic counter used to give each multi-step filter clause a unique join
	* alias namespace, so same-path clauses get independent joins (cross-record AND/OR).
	* @var int $join_counter
	*/
	public int $join_counter = 0;
```

- [ ] **Step 2: Reset the counter at the start of the conform pass**

In `parse_sqo()` (the method that drives conform, around `class.search.php:730` where it calls `conform_filter`), reset the counter immediately before conforming the filter so repeated parses are deterministic:

```php
			$this->join_counter = 0;
			$new_sqo_filter = $this->conform_filter($op, $filter_items);
```

(Locate the existing `$new_sqo_filter = $this->conform_filter(...)` line and insert the reset on the line above it. `conform_filter` recurses, so reset only at this top-level entry — do NOT reset inside `conform_filter`.)

- [ ] **Step 3: Assign `join_id` to multi-level leaf clauses**

In `conform_filter()`, replace the `table_alias` assignment block (currently line ~879):

```php
				$search_object->table_alias	= $this->get_table_alias_from_path( $path );
				$search_object->table		= $this->matrix_table;
```

with:

```php
				// Multi-step paths (value lives inside a related record reached through a
				// relation/portal) get a unique join_id so each clause traverses the relation
				// INDEPENDENTLY. This makes "value A AND value B" match across different linked
				// records, not within a single one. Single-step paths keep join_id null (legacy).
				$join_id = (count($path) > 1) ? ++$this->join_counter : null;
				$search_object->join_id		= $join_id;
				$search_object->table_alias	= $this->get_table_alias_from_path( $path, $join_id );
				$search_object->table		= $this->matrix_table;
```

- [ ] **Step 4: Run the cross-join test — expect GREEN**

Run:
```bash
vendor/bin/phpunit -c test/server/phpunit.xml --filter test_same_path_clauses_get_independent_joins test/server/search/search_cross_join_Test.php
```
Expected: PASS — two `LEFT JOIN LATERAL ... ->'test80'` joins, and `jN_` prefixes present. If it still fails because the component dropped `join_id`, confirm `get_search_query` returns the same object: it does for relation components (it mutates `$query_object`). The `table_alias` already carries the `jN_` prefix regardless, so the sentence is correct; only the JOIN side needs `join_id`, which is read from the conformed object in `filter_parser`. If a non-relation component clones the object, fall back to deriving the prefix in `filter_parser` from `$search_object->table_alias` instead — but verify this is unnecessary first.

- [ ] **Step 5: Commit**

```bash
git add core/search/class.search.php
git commit -m "feat(search): assign per-clause join_id for independent relation joins

Closes the cross-movement portal-value search: same-path filter clauses now
traverse the relation independently, so AND matches across linked records.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Regression — single-clause and single-level SQL must be unchanged; order-by intact

**Files:**
- Modify: `test/server/search/search_cross_join_Test.php`

- [ ] **Step 1: Add a regression test for legacy alias stability**

```php
	/** A single multi-step clause must still work and must NOT regress ordering/legacy single-level paths. */
	public function test_single_clause_multistep_still_builds() {
		$path = [
			(object)['section_tipo' => 'test3', 'component_tipo' => 'test80', 'model' => 'component_portal'],
			(object)['section_tipo' => 'test3', 'component_tipo' => 'test80', 'model' => 'component_portal']
		];
		$sqo = (object)[
			'section_tipo' => ['test3'],
			'mode'         => 'list',
			'filter'       => (object)['$and' => [
				(object)['q' => (object)['section_id' => '1', 'section_tipo' => 'test3'], 'path' => $path]
			]]
		];
		$search = search::get_instance($sqo);
		$sql    = $search->parse_sql_query();

		// Exactly one relation join for one clause, and it is prefixed j1_.
		$this->assertSame(1, preg_match_all("/LEFT JOIN LATERAL jsonb_array_elements\\([^)]*->'test80'\\)/", $sql), $sql);
		$this->assertSame(1, preg_match_all('/\bj1_/', $sql) > 0 ? 1 : 0, "expected j1_ prefix\n$sql");
	}

	/** Single-level path (value directly on the main table) must emit NO jN_ prefix (byte-legacy). */
	public function test_single_level_path_unprefixed() {
		$sqo = (object)[
			'section_tipo' => ['test3'],
			'mode'         => 'list',
			'filter'       => (object)['$and' => [
				(object)['q' => '1', 'path' => [
					(object)['section_tipo' => 'test3', 'component_tipo' => 'section_id']
				]]
			]]
		];
		$search = search::get_instance($sqo);
		$sql    = $search->parse_sql_query();
		$this->assertSame(0, preg_match_all('/\bj\d+_/', $sql), "single-level path must not be prefixed\n$sql");
	}
```

- [ ] **Step 2: Run the new regression tests**

Run:
```bash
vendor/bin/phpunit -c test/server/phpunit.xml --filter "test_single_clause_multistep_still_builds|test_single_level_path_unprefixed" test/server/search/search_cross_join_Test.php
```
Expected: PASS both.

- [ ] **Step 3: Run the full search + component-search suites for regressions**

Run:
```bash
vendor/bin/phpunit -c test/server/phpunit.xml test/server/search/
vendor/bin/phpunit -c test/server/phpunit.xml test/server/components/component_portal_Search_Test.php test/server/components/component_relation_common_Search_Test.php test/server/components/component_input_text_Search_Test.php
```
Expected: PASS (no change in existing assertions — those use single-step paths, which stay unprefixed). If `component_portal_Search_Test` (single-clause `resolve_query_object_sql` at the component level, bypassing `conform_filter`) fails, it should not — it never sets `join_id` and asserts `table_alias` `te3` directly. Confirm it still passes.

- [ ] **Step 4: Commit**

```bash
git add test/server/search/search_cross_join_Test.php
git commit -m "test(search): regression coverage for legacy alias stability

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Data-level verification — AND across records returns rows; one-box stays intra-record

This proves the *semantics*, not just the SQL shape. Uses the executable-SQL pattern from `component_portal_Search_Test::verify_sql_executable`.

**Files:**
- Modify: `test/server/search/search_cross_join_Test.php`

- [ ] **Step 1: Add an execution test that runs the generated SQL against the DB**

```php
	/** The two-clause AND query must be valid, executable SQL (no duplicate-alias error). */
	public function test_two_clause_sql_executes() {
		$search = search::get_instance($this->two_same_path_sqo());
		$result = $search->search(); // builds + executes
		$this->assertTrue(
			$result instanceof db_result || $result === false,
			'Two-clause cross-join search must execute without a SQL error (duplicate alias, etc.)'
		);
	}
```

- [ ] **Step 2: Run it**

Run:
```bash
vendor/bin/phpunit -c test/server/phpunit.xml --filter test_two_clause_sql_executes test/server/search/search_cross_join_Test.php
```
Expected: PASS. A FAIL here means PostgreSQL rejected the SQL — most likely a duplicate table alias, indicating the prefix did not apply to one of the two clauses. Re-check Task 5 Step 3.

- [ ] **Step 3: Commit**

```bash
git add test/server/search/search_cross_join_Test.php
git commit -m "test(search): assert two-clause cross-join SQL executes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Manual end-to-end verification in the search builder (the screenshot scenario)

No client code changes are expected; this confirms the feature works for users.

- [ ] **Step 1: Reproduce the screenshot**

In the Refugees (`dmm2070`) section search panel: drill `Movements (dmm2099) → Municipi (dmm2045)`, add **two separate boxes** — one `Caldes de Malavella`, one `Irun` — leave the group operator as **AND**, click **Aplicar**.

Expected: records now appear (refugees who have a movement to Caldes *and* a movement to Irun, in any movement records). Before the fix this returned "No records found".

- [ ] **Step 2: Verify OR**

Toggle the group operator to **OR**, re-apply. Expected: the union (refugees with a Caldes movement or an Irun movement) — a superset of the AND result.

- [ ] **Step 3: Verify intra-record (one box) still means "same record"**

Put **both** values inside a **single** box and apply with AND-equivalent. Expected: only refugees having a *single* movement that references both municipalities (typically empty for distinct municipalities) — confirming the "one box = within one record" semantics is preserved.

- [ ] **Step 4: Record the outcome**

If all three behave as described, the feature is complete. If the client serializes the drill-down path differently than assumed (e.g. an extra intermediate step for the Movements *section* tipo vs the portal component tipo), capture the actual SQO via the browser network panel and confirm `conform_filter` still assigns one `join_id` per leaf clause — the fix is path-length agnostic (any `count($path) > 1`), so additional steps do not break it.

---

## Self-Review

**Spec coverage:**
- "per-clause independent join alias namespace" → Tasks 3, 4, 5. ✓
- "leaf clause sentence binds to the right join" → `table_alias` carries the same `jN_` prefix the join uses (Task 3 + 5). ✓
- "within-clause path steps still share aliases" → single `join_id` per clause; multiple values in one clause share one join (Task 5 comment + Task 8 Step 3). ✓
- "`DISTINCT ON (section_id)` stays applied" → unchanged; verified via execution test (Task 7). ✓
- "no `EXISTS` rewrite / no UI change / no operator-UI change" → none in plan. ✓
- Testing: SQL-shape unit test (Task 2/6), regression (Task 6), data-level executable (Task 7), manual E2E (Task 8). ✓
- Open question "other build_sql_join callers (order)" → order caller passes no `join_id`; param is optional → unchanged (Background + Task 4). ✓
- Open question "exact client path shape" → Task 8 Step 4 confirms path-length-agnostic handling. ✓

**Placeholder scan:** No TBD/TODO; all steps carry concrete code and commands. The one discovery dependency (exact test tipos) is handled by Task 1 with a concrete fallback procedure.

**Type/name consistency:** `join_id` (clause property), `$join_counter` (search property), `?int $join_id` param on both `get_table_alias_from_path` and `build_sql_join`, prefix literal `'j'.$join_id.'_'` — consistent across Tasks 3, 4, 5. `parse_sql_query()` (public) used consistently for SQL assertions.
