-- DATA-34 — the search-term escape functions, at boot.
--
-- A curator's search term is TEXT, never a program. Every `~*` operand in
-- src/core/search/builders/ is now `f_regex_literal(f_unaccent(term))` and the
-- trigram pre-filter `f_like_literal(lower(f_unaccent(term)))`: the escape must
-- run on the SQL side of f_unaccent, because Postgres's unaccent dictionary
-- EXPANDS characters into metacharacters (× → *, © → (C), … → ..., ∖ → \,
-- ％ → %), so an escape performed in TypeScript neutralises metacharacters that
-- do not exist yet.
--
-- The functions are DECLARED in src/core/db/db_pg_definitions.json (ar_function)
-- — the maintenance "rebuild functions" action recreates them from there. This
-- migration is how an EXISTING install gets them without an operator pressing a
-- button: without the functions, every contains/wildcard/not-contains search
-- fails with `function f_regex_literal(text) does not exist`.
--
-- The bodies below are the declared `add` of those two entries VERBATIM; the
-- two sources are pinned to each other by
-- test/unit/search_pattern_escape_tripwire.test.ts.
CREATE OR REPLACE FUNCTION f_regex_literal(text)
		RETURNS text LANGUAGE 'sql' COST 100 IMMUTABLE STRICT PARALLEL SAFE
		AS $BODY$ SELECT regexp_replace($1, '([.*+?\[\]{}()|\\^$])', '\\\1', 'g') $BODY$;

CREATE OR REPLACE FUNCTION f_like_literal(text)
		RETURNS text LANGUAGE 'sql' COST 100 IMMUTABLE STRICT PARALLEL SAFE
		AS $BODY$ SELECT regexp_replace($1, '([\\%_])', '\\\1', 'g') $BODY$;
