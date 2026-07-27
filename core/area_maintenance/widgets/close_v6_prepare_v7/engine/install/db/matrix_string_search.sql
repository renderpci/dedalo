-- matrix_string_search — the per-value text-search store (v7).
-- One row per component value of every matrix `string` column:
--   component_tipo = the component the value belongs to
--   string         = lower(f_unaccent(value))
-- The composite btree_gin index resolves component scoping AND the trigram
-- containment in one index scan; the TS engine's search builders pre-filter
-- accent/case-insensitive contains searches through it (the exact predicate
-- still decides membership). Canonical declaration lives in the TS engine:
-- src/core/db/db_pg_definitions.json (ar_table / ar_trigger / ar_function /
-- ar_index). This file is the v6→v7 update twin (executed by
-- v6_to_v7::create_string_search_store); all statements are idempotent.
-- Triggers and the backfill are handled per-table by the update method.

CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS public.matrix_string_search (
	section_tipo character varying(64) NOT NULL,
	section_id integer NOT NULL,
	component_tipo character varying(64) NOT NULL,
	string text NOT NULL
);

CREATE OR REPLACE FUNCTION public.matrix_string_search_sync() RETURNS trigger
	LANGUAGE plpgsql
	AS $BODY$
BEGIN
	IF TG_OP <> 'INSERT' THEN
		DELETE FROM public.matrix_string_search WHERE section_tipo = OLD.section_tipo AND section_id = OLD.section_id;
	END IF;
	IF TG_OP <> 'DELETE' AND NEW.string IS NOT NULL THEN
		INSERT INTO public.matrix_string_search (section_tipo, section_id, component_tipo, string)
		SELECT NEW.section_tipo, NEW.section_id, kv.key, lower(public.f_unaccent(e->>'value'))
		FROM jsonb_each(NEW.string) AS kv, jsonb_array_elements(kv.value) AS e
		WHERE jsonb_typeof(kv.value) = 'array' AND e->>'value' IS NOT NULL AND e->>'value' <> '';
	END IF;
	RETURN NULL;
END $BODY$;

CREATE INDEX IF NOT EXISTS matrix_string_search_gin_idx ON public.matrix_string_search USING gin (component_tipo, string public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS matrix_string_search_record_idx ON public.matrix_string_search USING btree (section_tipo, section_id);
