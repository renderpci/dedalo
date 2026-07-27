-- matrix_relation_index — the per-locator relation index (v7).
-- One typed row per locator stored in any relation column: (owning record,
-- from_component_tipo, type, target). DERIVED and never authoritative —
-- serves inverse lookups, the WC-012 translation and integrity reporting in
-- the TS engine. Canonical declaration: src/core/db/db_pg_definitions.json.
-- This file is the v6→v7 update twin (executed by
-- v6_to_v7::create_relation_index_store); all statements are idempotent.
-- Triggers and the backfill are handled per-table by the update method.

CREATE TABLE IF NOT EXISTS public.matrix_relation_index (
	section_tipo character varying(64) NOT NULL,
	section_id integer NOT NULL,
	from_component_tipo character varying(64) NOT NULL,
	type character varying(64),
	target_section_tipo character varying(64) NOT NULL,
	target_section_id integer NOT NULL
);

CREATE OR REPLACE FUNCTION public.matrix_relation_index_sync() RETURNS trigger
	LANGUAGE plpgsql
	AS $BODY$
BEGIN
	IF TG_OP <> 'INSERT' THEN
		DELETE FROM public.matrix_relation_index WHERE section_tipo = OLD.section_tipo AND section_id = OLD.section_id;
	END IF;
	IF TG_OP <> 'DELETE' AND NEW.relation IS NOT NULL THEN
		INSERT INTO public.matrix_relation_index (section_tipo, section_id, from_component_tipo, type, target_section_tipo, target_section_id)
		SELECT NEW.section_tipo, NEW.section_id, kv.key, e->>'type', e->>'section_tipo', (e->>'section_id')::int
		FROM jsonb_each(NEW.relation) AS kv, jsonb_array_elements(kv.value) AS e
		WHERE jsonb_typeof(kv.value) = 'array' AND e->>'section_tipo' IS NOT NULL AND e->>'section_id' ~ '^-?[0-9]+$';
	END IF;
	RETURN NULL;
END $BODY$;

CREATE INDEX IF NOT EXISTS matrix_relation_index_target_idx ON public.matrix_relation_index USING btree (target_section_tipo, target_section_id, from_component_tipo);

CREATE INDEX IF NOT EXISTS matrix_relation_index_from_idx ON public.matrix_relation_index USING btree (section_tipo, section_id);

CREATE INDEX IF NOT EXISTS matrix_relation_index_type_idx ON public.matrix_relation_index USING btree (type, target_section_tipo, target_section_id);
