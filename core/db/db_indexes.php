<?php
// db index

// extensions
	$ar_sql_query[] = '
		CREATE EXTENSION IF NOT EXISTS pg_trgm
		SCHEMA public
		VERSION "1.6";

		CREATE EXTENSION IF NOT EXISTS unaccent
		SCHEMA public
		VERSION "1.1";
	';

// functions
	$ar_sql_query[] = '
		CREATE OR REPLACE FUNCTION public.f_unaccent(
		text)
		RETURNS text
		LANGUAGE \'sql\'
		COST 100
		IMMUTABLE PARALLEL UNSAFE
		AS $BODY$
		SELECT public.unaccent(\'public.unaccent\', $1)
		$BODY$;

		-- DROP FUNCTION IF EXISTS public.relations_flat_st_si(jsonb);
		-- DROP FUNCTION IF EXISTS public.relations_flat_fct_st_si(jsonb);
		-- DROP FUNCTION IF EXISTS public.relations_flat_ty_st_si(jsonb);
		-- DROP FUNCTION IF EXISTS public.relations_flat_ty_st(jsonb);

		-- Create function with base flat locators st=section_tipo si=section_id (rsc197_2)
		CREATE OR REPLACE FUNCTION public.relations_flat_st_si(datos jsonb) RETURNS jsonb
		AS $$ SELECT jsonb_agg( concat(rel->>\'section_tipo\',\'_\',rel->>\'section_id\') )
		FROM jsonb_array_elements($1->\'relations\') rel(rel)
		$$ LANGUAGE sql IMMUTABLE;

		-- Create function with base flat locators fct=from_section_tipo st=section_tipo si=section_id (oh24_rsc197_2)
		CREATE OR REPLACE FUNCTION public.relations_flat_fct_st_si(datos jsonb) RETURNS jsonb
		AS $$ SELECT jsonb_agg( concat(rel->>\'from_component_tipo\',\'_\',rel->>\'section_tipo\',\'_\',rel->>\'section_id\') )
		FROM jsonb_array_elements($1->\'relations\') rel(rel)
		$$ LANGUAGE sql IMMUTABLE;

		-- Create function with base flat locators ty=type st=section_tipo si=section_id (oh24_rsc197_2)
		CREATE OR REPLACE FUNCTION public.relations_flat_ty_st_si(datos jsonb) RETURNS jsonb
		AS $$ SELECT jsonb_agg( concat(rel->>\'type\',\'_\',rel->>\'section_tipo\',\'_\',rel->>\'section_id\') )
		FROM jsonb_array_elements($1->\'relations\') rel(rel)
		$$ LANGUAGE sql IMMUTABLE;

		-- Create function with base flat locators ty=type st=section_tipo (dd96_rsc197)
		CREATE OR REPLACE FUNCTION public.relations_flat_ty_st(datos jsonb) RETURNS jsonb
		AS $$ SELECT jsonb_agg( concat(rel->>\'type\',\'_\',rel->>\'section_tipo\') )
		FROM jsonb_array_elements($1->\'relations\') rel(rel)
		$$ LANGUAGE sql IMMUTABLE;
	';

// jer_dd
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS jer_dd_esdescriptor
		ON public.jer_dd USING btree
		(esdescriptor ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: jer_dd_esmodelo

		-- DROP INDEX IF EXISTS public.jer_dd_esmodelo;

		CREATE INDEX IF NOT EXISTS jer_dd_esmodelo
		ON public.jer_dd USING btree
		(esmodelo ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: jer_dd_modelo

		-- DROP INDEX IF EXISTS public.jer_dd_modelo;

		CREATE INDEX IF NOT EXISTS jer_dd_modelo
		ON public.jer_dd USING btree
		(modelo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: jer_dd_norden

		-- DROP INDEX IF EXISTS public.jer_dd_norden;

		CREATE INDEX IF NOT EXISTS jer_dd_norden
		ON public.jer_dd USING btree
		(norden ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: jer_dd_parent

		-- DROP INDEX IF EXISTS public.jer_dd_parent;

		CREATE INDEX IF NOT EXISTS jer_dd_parent
		ON public.jer_dd USING btree
		(parent COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: jer_dd_parent_esdescriptor_norden

		-- DROP INDEX IF EXISTS public.jer_dd_parent_esdescriptor_norden;

		CREATE INDEX IF NOT EXISTS jer_dd_parent_esdescriptor_norden
		ON public.jer_dd USING btree
		(parent COLLATE pg_catalog."default" ASC NULLS LAST, esdescriptor ASC NULLS LAST, norden ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: jer_dd_relaciones

		-- DROP INDEX IF EXISTS public.jer_dd_relaciones;

		CREATE INDEX IF NOT EXISTS jer_dd_relaciones
		ON public.jer_dd USING btree
		(relaciones COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: jer_dd_traducible

		-- DROP INDEX IF EXISTS public.jer_dd_traducible;

		CREATE INDEX IF NOT EXISTS jer_dd_traducible
		ON public.jer_dd USING btree
		(traducible ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: jer_dd_usableindex

		-- DROP INDEX IF EXISTS public.jer_dd_usableindex;

		CREATE INDEX IF NOT EXISTS jer_dd_usableindex
		ON public.jer_dd USING btree
		(tld COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: jer_dd_visible

		-- DROP INDEX IF EXISTS public.jer_dd_visible;

		CREATE INDEX IF NOT EXISTS jer_dd_visible
		ON public.jer_dd USING btree
		(visible ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// main_dd
	$ar_sql_query[] = '
		DO $$
		BEGIN
			IF EXISTS(SELECT *
				FROM information_schema.columns
				WHERE table_name=\'main_dd\')
			THEN
				CREATE INDEX IF NOT EXISTS main_dd_tld
				ON public.main_dd USING btree
				(tld COLLATE pg_catalog."default" ASC NULLS LAST)
				TABLESPACE pg_default;
			END IF;
		END $$;
	';

// matrix
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_datos_gin
		ON public.matrix USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_id_index

		-- DROP INDEX IF EXISTS public.matrix_id_index;

		CREATE INDEX IF NOT EXISTS matrix_id_index
		ON public.matrix USING btree
		(id ASC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_order_id_desc

		-- DROP INDEX IF EXISTS public.matrix_order_id_desc;

		CREATE INDEX IF NOT EXISTS matrix_order_id_desc
		ON public.matrix USING btree
		(id DESC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_relations_flat_fct_st_si

		-- DROP INDEX IF EXISTS public.matrix_relations_flat_fct_st_si;

		CREATE INDEX IF NOT EXISTS matrix_relations_flat_fct_st_si
		ON public.matrix USING gin
		(relations_flat_fct_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_relations_flat_st_si

		-- DROP INDEX IF EXISTS public.matrix_relations_flat_st_si;

		CREATE INDEX IF NOT EXISTS matrix_relations_flat_st_si
		ON public.matrix USING gin
		(relations_flat_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_relations_flat_ty_st

		-- DROP INDEX IF EXISTS public.matrix_relations_flat_ty_st;

		CREATE INDEX IF NOT EXISTS matrix_relations_flat_ty_st
		ON public.matrix USING gin
		(relations_flat_ty_st(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_relations_flat_ty_st_si

		-- DROP INDEX IF EXISTS public.matrix_relations_flat_ty_st_si;

		CREATE INDEX IF NOT EXISTS matrix_relations_flat_ty_st_si
		ON public.matrix USING gin
		(relations_flat_ty_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_relations_gin

		-- DROP INDEX IF EXISTS public.matrix_relations_gin;

		CREATE INDEX IF NOT EXISTS matrix_relations_gin
		ON public.matrix USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_section_id

		-- DROP INDEX IF EXISTS public.matrix_section_id;

		CREATE INDEX IF NOT EXISTS matrix_section_id
		ON public.matrix USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_section_tipo

		-- DROP INDEX IF EXISTS public.matrix_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_section_tipo
		ON public.matrix USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_section_tipo_section_id

		-- DROP INDEX IF EXISTS public.matrix_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_section_tipo_section_id
		ON public.matrix USING btree
		(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_section_tipo_section_id_desc

		-- DROP INDEX IF EXISTS public.matrix_section_tipo_section_id_desc;

		CREATE INDEX IF NOT EXISTS matrix_section_tipo_section_id_desc
		ON public.matrix USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST)
		TABLESPACE pg_default;
	';

// matrix_activities
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_activities_datos_gin
		ON public.matrix_activities USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_activities_id_idx

		-- DROP INDEX IF EXISTS public.matrix_activities_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_activities_id_idx
		ON public.matrix_activities USING btree
		(id ASC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_activities_relations_flat_fct_st_si

		-- DROP INDEX IF EXISTS public.matrix_activities_relations_flat_fct_st_si;

		CREATE INDEX IF NOT EXISTS matrix_activities_relations_flat_fct_st_si
		ON public.matrix_activities USING gin
		(relations_flat_fct_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_activities_relations_flat_st_si

		-- DROP INDEX IF EXISTS public.matrix_activities_relations_flat_st_si;

		CREATE INDEX IF NOT EXISTS matrix_activities_relations_flat_st_si
		ON public.matrix_activities USING gin
		(relations_flat_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_activities_relations_flat_ty_st

		-- DROP INDEX IF EXISTS public.matrix_activities_relations_flat_ty_st;

		CREATE INDEX IF NOT EXISTS matrix_activities_relations_flat_ty_st
		ON public.matrix_activities USING gin
		(relations_flat_ty_st(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_activities_relations_flat_ty_st_si

		-- DROP INDEX IF EXISTS public.matrix_activities_relations_flat_ty_st_si;

		CREATE INDEX IF NOT EXISTS matrix_activities_relations_flat_ty_st_si
		ON public.matrix_activities USING gin
		(relations_flat_ty_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_activities_relations_idx

		-- DROP INDEX IF EXISTS public.matrix_activities_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_activities_relations_idx
		ON public.matrix_activities USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_activities_section_id

		-- DROP INDEX IF EXISTS public.matrix_activities_section_id;

		CREATE INDEX IF NOT EXISTS matrix_activities_section_id
		ON public.matrix_activities USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_activities_section_tipo

		-- DROP INDEX IF EXISTS public.matrix_activities_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_activities_section_tipo
		ON public.matrix_activities USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_activities_section_tipo_section_id

		-- DROP INDEX IF EXISTS public.matrix_activities_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_activities_section_tipo_section_id
		ON public.matrix_activities USING btree
		(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// matrix_activity
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_activity_date_btree
		ON public.matrix_activity USING btree
		(date ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_activity_datos_gin

		-- DROP INDEX IF EXISTS public.matrix_activity_datos_gin;

		CREATE INDEX IF NOT EXISTS matrix_activity_datos_gin
		ON public.matrix_activity USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_activity_order_id_asc

		-- DROP INDEX IF EXISTS public.matrix_activity_order_id_asc;

		CREATE INDEX IF NOT EXISTS matrix_activity_order_id_asc
		ON public.matrix_activity USING btree
		(id ASC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_activity_order_id_desc

		-- DROP INDEX IF EXISTS public.matrix_activity_order_id_desc;

		CREATE INDEX IF NOT EXISTS matrix_activity_order_id_desc
		ON public.matrix_activity USING btree
		(id DESC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_activity_order_section_id_desc

		-- DROP INDEX IF EXISTS public.matrix_activity_order_section_id_desc;

		CREATE INDEX IF NOT EXISTS matrix_activity_order_section_id_desc
		ON public.matrix_activity USING btree
		(section_id DESC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_activity_relations_idx

		-- DROP INDEX IF EXISTS public.matrix_activity_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_activity_relations_idx
		ON public.matrix_activity USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_activity_section_id

		-- DROP INDEX IF EXISTS public.matrix_activity_section_id;

		CREATE INDEX IF NOT EXISTS matrix_activity_section_id
		ON public.matrix_activity USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_activity_section_tipo

		-- DROP INDEX IF EXISTS public.matrix_activity_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_activity_section_tipo
		ON public.matrix_activity USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_activity_section_tipo_section_id

		-- DROP INDEX IF EXISTS public.matrix_activity_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_activity_section_tipo_section_id
		ON public.matrix_activity USING btree
		(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// matrix_counter
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_counter_parent
		ON public.matrix_counter USING btree
		(parent ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_counter_tipo

		-- DROP INDEX IF EXISTS public.matrix_counter_tipo;

		CREATE INDEX IF NOT EXISTS matrix_counter_tipo
		ON public.matrix_counter USING btree
		(tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// matrix_counter_dd
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_counter_dd_parent
		ON public.matrix_counter_dd USING btree
		(parent ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_counter_dd_tipo

		-- DROP INDEX IF EXISTS public.matrix_counter_dd_tipo;

		CREATE INDEX IF NOT EXISTS matrix_counter_dd_tipo
		ON public.matrix_counter_dd USING btree
		(tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// matrix_dataframe
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_dataframe_datos_idx
		ON public.matrix_dataframe USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_dataframe_expr_idx

		-- DROP INDEX IF EXISTS public.matrix_dataframe_expr_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_expr_idx
		ON public.matrix_dataframe USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_dataframe_id_idx

		-- DROP INDEX IF EXISTS public.matrix_dataframe_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_id_idx
		ON public.matrix_dataframe USING btree
		(id ASC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_dataframe_id_idx1

		-- DROP INDEX IF EXISTS public.matrix_dataframe_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_id_idx1
		ON public.matrix_dataframe USING btree
		(id DESC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_dataframe_relations_flat_fct_st_si_idx

		-- DROP INDEX IF EXISTS public.matrix_dataframe_relations_flat_fct_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_relations_flat_fct_st_si_idx
		ON public.matrix_dataframe USING gin
		(relations_flat_fct_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_dataframe_relations_flat_st_si_idx

		-- DROP INDEX IF EXISTS public.matrix_dataframe_relations_flat_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_relations_flat_st_si_idx
		ON public.matrix_dataframe USING gin
		(relations_flat_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_dataframe_relations_flat_ty_st_idx

		-- DROP INDEX IF EXISTS public.matrix_dataframe_relations_flat_ty_st_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_relations_flat_ty_st_idx
		ON public.matrix_dataframe USING gin
		(relations_flat_ty_st(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_dataframe_relations_flat_ty_st_si_idx

		-- DROP INDEX IF EXISTS public.matrix_dataframe_relations_flat_ty_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_relations_flat_ty_st_si_idx
		ON public.matrix_dataframe USING gin
		(relations_flat_ty_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_dataframe_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_dataframe_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_section_id_idx
		ON public.matrix_dataframe USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_dataframe_section_id_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_dataframe_section_id_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_section_id_section_tipo_idx
		ON public.matrix_dataframe USING btree
		(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_dataframe_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_dataframe_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_section_tipo_idx
		ON public.matrix_dataframe USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_dataframe_section_tipo_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_dataframe_section_tipo_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_section_tipo_section_id_idx
		ON public.matrix_dataframe USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST)
		TABLESPACE pg_default;
	';

// matrix_dd
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_dd_dd1475_gin
		ON public.matrix_dd USING gin
		((datos #> \'{components,dd1475,dato,lg-nolan}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_dd_gin

		-- DROP INDEX IF EXISTS public.matrix_dd_gin;

		CREATE INDEX IF NOT EXISTS matrix_dd_gin
		ON public.matrix_dd USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_dd_relations_idx

		-- DROP INDEX IF EXISTS public.matrix_dd_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_dd_relations_idx
		ON public.matrix_dd USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_dd_section_id

		-- DROP INDEX IF EXISTS public.matrix_dd_section_id;

		CREATE INDEX IF NOT EXISTS matrix_dd_section_id
		ON public.matrix_dd USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_dd_section_tipo

		-- DROP INDEX IF EXISTS public.matrix_dd_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_dd_section_tipo
		ON public.matrix_dd USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_dd_section_tipo_section_id

		-- DROP INDEX IF EXISTS public.matrix_dd_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_dd_section_tipo_section_id
		ON public.matrix_dd USING btree
		(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// matrix_hierarchy
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_hierarchy_datos_idx
		ON public.matrix_hierarchy USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_id_idx

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_id_idx
		ON public.matrix_hierarchy USING btree
		(id ASC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_id_idx1

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_id_idx1
		ON public.matrix_hierarchy USING btree
		(id DESC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_relations_flat_fct_st_si

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_relations_flat_fct_st_si;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_relations_flat_fct_st_si
		ON public.matrix_hierarchy USING gin
		(relations_flat_fct_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_relations_flat_st_si

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_relations_flat_st_si;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_relations_flat_st_si
		ON public.matrix_hierarchy USING gin
		(relations_flat_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_relations_flat_ty_st

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_relations_flat_ty_st;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_relations_flat_ty_st
		ON public.matrix_hierarchy USING gin
		(relations_flat_ty_st(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_relations_flat_ty_st_si

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_relations_flat_ty_st_si;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_relations_flat_ty_st_si
		ON public.matrix_hierarchy USING gin
		(relations_flat_ty_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_relations_idx

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_relations_idx
		ON public.matrix_hierarchy USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_section_id_idx
		ON public.matrix_hierarchy USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_section_tipo_idx
		ON public.matrix_hierarchy USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_section_tipo_section_id

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_section_tipo_section_id
		ON public.matrix_hierarchy USING btree
		(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_section_tipo_section_id_desc

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_section_tipo_section_id_desc;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_section_tipo_section_id_desc
		ON public.matrix_hierarchy USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_term

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_term;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_term
		ON public.matrix_hierarchy USING gin
		(f_unaccent(datos #>> \'{components,hierarchy25,dato}\'::text[]) COLLATE pg_catalog."default" gin_trgm_ops)
		TABLESPACE pg_default;
	';

// matrix_hierarchy_main
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_datos_idx
		ON public.matrix_hierarchy_main USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_main_id_idx

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_main_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_id_idx
		ON public.matrix_hierarchy_main USING btree
		(id ASC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_main_id_idx1

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_main_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_id_idx1
		ON public.matrix_hierarchy_main USING btree
		(id DESC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_main_relations_idx

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_main_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_relations_idx
		ON public.matrix_hierarchy_main USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_main_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_main_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_section_id_idx
		ON public.matrix_hierarchy_main USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_hierarchy_main_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_hierarchy_main_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_section_tipo_idx
		ON public.matrix_hierarchy_main USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// matrix_indexations
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_indexations_datos_idx
		ON public.matrix_indexations USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_indexations_id_idx

		-- DROP INDEX IF EXISTS public.matrix_indexations_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_indexations_id_idx
		ON public.matrix_indexations USING btree
		(id ASC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_indexations_id_idx1

		-- DROP INDEX IF EXISTS public.matrix_indexations_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_indexations_id_idx1
		ON public.matrix_indexations USING btree
		(id DESC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_indexations_relations_idx

		-- DROP INDEX IF EXISTS public.matrix_indexations_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_indexations_relations_idx
		ON public.matrix_indexations USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_indexations_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_indexations_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_indexations_section_id_idx
		ON public.matrix_indexations USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_indexations_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_indexations_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_indexations_section_tipo_idx
		ON public.matrix_indexations USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// matrix_langs
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_langs_datos_idx
		ON public.matrix_langs USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_langs_hierarchy41_gin

		-- DROP INDEX IF EXISTS public.matrix_langs_hierarchy41_gin;

		CREATE INDEX IF NOT EXISTS matrix_langs_hierarchy41_gin
		ON public.matrix_langs USING gin
		((datos #> \'{components,hierarchy41,dato,lg-nolan}\'::text[]))
		TABLESPACE pg_default;
		-- Index: matrix_langs_id_idx

		-- DROP INDEX IF EXISTS public.matrix_langs_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_langs_id_idx
		ON public.matrix_langs USING btree
		(id ASC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_langs_id_idx1

		-- DROP INDEX IF EXISTS public.matrix_langs_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_langs_id_idx1
		ON public.matrix_langs USING btree
		(id DESC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_langs_relations_idx

		-- DROP INDEX IF EXISTS public.matrix_langs_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_langs_relations_idx
		ON public.matrix_langs USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_langs_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_langs_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_langs_section_id_idx
		ON public.matrix_langs USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_langs_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_langs_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_langs_section_tipo_idx
		ON public.matrix_langs USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_langs_section_tipo_section_id

		-- DROP INDEX IF EXISTS public.matrix_langs_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_langs_section_tipo_section_id
		ON public.matrix_langs USING btree
		(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;

		-- relations_flat
		CREATE INDEX IF NOT EXISTS matrix_langs_relations_flat_fct_st_si
		ON public.matrix_langs USING gin
		(relations_flat_fct_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;

		CREATE INDEX IF NOT EXISTS matrix_langs_relations_flat_st_si
		ON public.matrix_langs USING gin
		(relations_flat_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;

		CREATE INDEX IF NOT EXISTS matrix_langs_relations_flat_ty_st
		ON public.matrix_langs USING gin
		(relations_flat_ty_st(datos) jsonb_path_ops)
		TABLESPACE pg_default;

		CREATE INDEX IF NOT EXISTS matrix_langs_relations_flat_ty_st_si
		ON public.matrix_langs USING gin
		(relations_flat_ty_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;

		-- term
		CREATE INDEX IF NOT EXISTS matrix_langs_term
		ON public.matrix_langs USING gin
		(f_unaccent(datos #>> \'{components,hierarchy25,dato}\'::text[]) COLLATE pg_catalog."default" gin_trgm_ops)
		TABLESPACE pg_default;
	';

// matrix_list
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_list_datos_gin
		ON public.matrix_list USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_list_relations_flat_fct_st_si

		-- DROP INDEX IF EXISTS public.matrix_list_relations_flat_fct_st_si;

		CREATE INDEX IF NOT EXISTS matrix_list_relations_flat_fct_st_si
		ON public.matrix_list USING gin
		(relations_flat_fct_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_list_relations_flat_st_si

		-- DROP INDEX IF EXISTS public.matrix_list_relations_flat_st_si;

		CREATE INDEX IF NOT EXISTS matrix_list_relations_flat_st_si
		ON public.matrix_list USING gin
		(relations_flat_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_list_relations_flat_ty_st

		-- DROP INDEX IF EXISTS public.matrix_list_relations_flat_ty_st;

		CREATE INDEX IF NOT EXISTS matrix_list_relations_flat_ty_st
		ON public.matrix_list USING gin
		(relations_flat_ty_st(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_list_relations_flat_ty_st_si

		-- DROP INDEX IF EXISTS public.matrix_list_relations_flat_ty_st_si;

		CREATE INDEX IF NOT EXISTS matrix_list_relations_flat_ty_st_si
		ON public.matrix_list USING gin
		(relations_flat_ty_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_list_relations_idx

		-- DROP INDEX IF EXISTS public.matrix_list_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_list_relations_idx
		ON public.matrix_list USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_list_section_id

		-- DROP INDEX IF EXISTS public.matrix_list_section_id;

		CREATE INDEX IF NOT EXISTS matrix_list_section_id
		ON public.matrix_list USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_list_section_tipo

		-- DROP INDEX IF EXISTS public.matrix_list_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_list_section_tipo
		ON public.matrix_list USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_list_section_tipo_section_id

		-- DROP INDEX IF EXISTS public.matrix_list_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_list_section_tipo_section_id
		ON public.matrix_list USING btree
		(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// matrix_nexus
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_nexus_datos_idx
		ON public.matrix_nexus USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_expr_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_expr_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_expr_idx
		ON public.matrix_nexus USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_id_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_id_idx
		ON public.matrix_nexus USING btree
		(id ASC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_id_idx1

		-- DROP INDEX IF EXISTS public.matrix_nexus_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_nexus_id_idx1
		ON public.matrix_nexus USING btree
		(id DESC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_relations_flat_fct_st_si_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_relations_flat_fct_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_relations_flat_fct_st_si_idx
		ON public.matrix_nexus USING gin
		(relations_flat_fct_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_relations_flat_st_si_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_relations_flat_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_relations_flat_st_si_idx
		ON public.matrix_nexus USING gin
		(relations_flat_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_relations_flat_ty_st_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_relations_flat_ty_st_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_relations_flat_ty_st_idx
		ON public.matrix_nexus USING gin
		(relations_flat_ty_st(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_relations_flat_ty_st_si_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_relations_flat_ty_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_relations_flat_ty_st_si_idx
		ON public.matrix_nexus USING gin
		(relations_flat_ty_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_section_id_idx
		ON public.matrix_nexus USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_section_id_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_section_id_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_section_id_section_tipo_idx
		ON public.matrix_nexus USING btree
		(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_section_tipo_idx
		ON public.matrix_nexus USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_section_tipo_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_section_tipo_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_section_tipo_section_id_idx
		ON public.matrix_nexus USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST)
		TABLESPACE pg_default;
	';

// matrix_nexus_main
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_nexus_main_datos_idx
		ON public.matrix_nexus_main USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_main_expr_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_main_expr_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_expr_idx
		ON public.matrix_nexus_main USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_main_id_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_main_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_id_idx
		ON public.matrix_nexus_main USING btree
		(id ASC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_main_id_idx1

		-- DROP INDEX IF EXISTS public.matrix_nexus_main_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_id_idx1
		ON public.matrix_nexus_main USING btree
		(id DESC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_main_relations_flat_fct_st_si_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_main_relations_flat_fct_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_relations_flat_fct_st_si_idx
		ON public.matrix_nexus_main USING gin
		(relations_flat_fct_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_main_relations_flat_st_si_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_main_relations_flat_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_relations_flat_st_si_idx
		ON public.matrix_nexus_main USING gin
		(relations_flat_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_main_relations_flat_ty_st_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_main_relations_flat_ty_st_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_relations_flat_ty_st_idx
		ON public.matrix_nexus_main USING gin
		(relations_flat_ty_st(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_main_relations_flat_ty_st_si_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_main_relations_flat_ty_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_relations_flat_ty_st_si_idx
		ON public.matrix_nexus_main USING gin
		(relations_flat_ty_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_main_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_main_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_section_id_idx
		ON public.matrix_nexus_main USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_main_section_id_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_main_section_id_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_section_id_section_tipo_idx
		ON public.matrix_nexus_main USING btree
		(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_main_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_main_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_section_tipo_idx
		ON public.matrix_nexus_main USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_nexus_main_section_tipo_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_nexus_main_section_tipo_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_section_tipo_section_id_idx
		ON public.matrix_nexus_main USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST)
		TABLESPACE pg_default;
	';

// matrix_notes
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_notes_datos_idx
		ON public.matrix_notes USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_notes_id_idx

		-- DROP INDEX IF EXISTS public.matrix_notes_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_notes_id_idx
		ON public.matrix_notes USING btree
		(id ASC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_notes_id_idx1

		-- DROP INDEX IF EXISTS public.matrix_notes_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_notes_id_idx1
		ON public.matrix_notes USING btree
		(id DESC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_notes_relations_idx

		-- DROP INDEX IF EXISTS public.matrix_notes_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_notes_relations_idx
		ON public.matrix_notes USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_notes_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_notes_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_notes_section_id_idx
		ON public.matrix_notes USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_notes_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_notes_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_notes_section_tipo_idx
		ON public.matrix_notes USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// matrix_profiles
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_profiles_datos_gin
		ON public.matrix_profiles USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_profiles_relations_idx

		-- DROP INDEX IF EXISTS public.matrix_profiles_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_profiles_relations_idx
		ON public.matrix_profiles USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_profiles_section_id

		-- DROP INDEX IF EXISTS public.matrix_profiles_section_id;

		CREATE INDEX IF NOT EXISTS matrix_profiles_section_id
		ON public.matrix_profiles USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_profiles_section_tipo

		-- DROP INDEX IF EXISTS public.matrix_profiles_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_profiles_section_tipo
		ON public.matrix_profiles USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_profiles_section_tipo_section_id

		-- DROP INDEX IF EXISTS public.matrix_profiles_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_profiles_section_tipo_section_id
		ON public.matrix_profiles USING btree
		(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// matrix_projects
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_projects_datos_gin
		ON public.matrix_projects USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_projects_relations_idx

		-- DROP INDEX IF EXISTS public.matrix_projects_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_projects_relations_idx
		ON public.matrix_projects USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_projects_section_id

		-- DROP INDEX IF EXISTS public.matrix_projects_section_id;

		CREATE INDEX IF NOT EXISTS matrix_projects_section_id
		ON public.matrix_projects USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_projects_section_tipo

		-- DROP INDEX IF EXISTS public.matrix_projects_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_projects_section_tipo
		ON public.matrix_projects USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_projects_section_tipo_section_id

		-- DROP INDEX IF EXISTS public.matrix_projects_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_projects_section_tipo_section_id
		ON public.matrix_projects USING btree
		(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// matrix_stats
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_stats_datos_idx
		ON public.matrix_stats USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_stats_expr_idx

		-- DROP INDEX IF EXISTS public.matrix_stats_expr_idx;

		CREATE INDEX IF NOT EXISTS matrix_stats_expr_idx
		ON public.matrix_stats USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_stats_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_stats_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_stats_section_id_idx
		ON public.matrix_stats USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_stats_section_id_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_stats_section_id_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_stats_section_id_section_tipo_idx
		ON public.matrix_stats USING btree
		(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_stats_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_stats_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_stats_section_tipo_idx
		ON public.matrix_stats USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// matrix_test
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_test_datos_idx
		ON public.matrix_test USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_test_id_idx

		-- DROP INDEX IF EXISTS public.matrix_test_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_test_id_idx
		ON public.matrix_test USING btree
		(id ASC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_test_id_idx1

		-- DROP INDEX IF EXISTS public.matrix_test_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_test_id_idx1
		ON public.matrix_test USING btree
		(id DESC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_test_relations_flat_fct_st_si

		-- DROP INDEX IF EXISTS public.matrix_test_relations_flat_fct_st_si;

		CREATE INDEX IF NOT EXISTS matrix_test_relations_flat_fct_st_si
		ON public.matrix_test USING gin
		(relations_flat_fct_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_test_relations_flat_st_si

		-- DROP INDEX IF EXISTS public.matrix_test_relations_flat_st_si;

		CREATE INDEX IF NOT EXISTS matrix_test_relations_flat_st_si
		ON public.matrix_test USING gin
		(relations_flat_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_test_relations_flat_ty_st

		-- DROP INDEX IF EXISTS public.matrix_test_relations_flat_ty_st;

		CREATE INDEX IF NOT EXISTS matrix_test_relations_flat_ty_st
		ON public.matrix_test USING gin
		(relations_flat_ty_st(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_test_relations_flat_ty_st_si

		-- DROP INDEX IF EXISTS public.matrix_test_relations_flat_ty_st_si;

		CREATE INDEX IF NOT EXISTS matrix_test_relations_flat_ty_st_si
		ON public.matrix_test USING gin
		(relations_flat_ty_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_test_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_test_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_test_section_id_idx
		ON public.matrix_test USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_test_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_test_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_test_section_tipo_idx
		ON public.matrix_test USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_test_section_tipo_section_id

		-- DROP INDEX IF EXISTS public.matrix_test_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_test_section_tipo_section_id
		ON public.matrix_test USING btree
		(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// matrix_time_machine
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_time_machine_datos_gin
		ON public.matrix_time_machine USING gin
		(dato jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_time_machine_bulk_process_id

		DROP INDEX IF EXISTS public.matrix_time_machine_id_matrix;

		-- DROP INDEX IF EXISTS public.matrix_time_machine_bulk_process_id;

		CREATE INDEX IF NOT EXISTS matrix_time_machine_bulk_process_id
		ON public.matrix_time_machine USING btree
		(bulk_process_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_time_machine_lang

		-- DROP INDEX IF EXISTS public.matrix_time_machine_lang;

		CREATE INDEX IF NOT EXISTS matrix_time_machine_lang
		ON public.matrix_time_machine USING btree
		(lang COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_time_machine_section_id

		-- DROP INDEX IF EXISTS public.matrix_time_machine_section_id;

		CREATE INDEX IF NOT EXISTS matrix_time_machine_section_id
		ON public.matrix_time_machine USING btree
		(section_id DESC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_time_machine_section_id_key

		-- DROP INDEX IF EXISTS public.matrix_time_machine_section_id_key;

		CREATE INDEX IF NOT EXISTS matrix_time_machine_section_id_key
		ON public.matrix_time_machine USING btree
		(section_id ASC NULLS LAST, section_id_key ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, tipo COLLATE pg_catalog."default" ASC NULLS LAST, lang COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_time_machine_section_tipo

		-- DROP INDEX IF EXISTS public.matrix_time_machine_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_time_machine_section_tipo
		ON public.matrix_time_machine USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_time_machine_state

		-- DROP INDEX IF EXISTS public.matrix_time_machine_state;

		CREATE INDEX IF NOT EXISTS matrix_time_machine_state
		ON public.matrix_time_machine USING btree
		(state COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_time_machine_timestamp

		-- DROP INDEX IF EXISTS public.matrix_time_machine_timestamp;

		CREATE INDEX IF NOT EXISTS matrix_time_machine_timestamp
		ON public.matrix_time_machine USING btree
		("timestamp" DESC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_time_machine_tipo

		-- DROP INDEX IF EXISTS public.matrix_time_machine_tipo;

		CREATE INDEX IF NOT EXISTS matrix_time_machine_tipo
		ON public.matrix_time_machine USING btree
		(tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_time_machine_userID

		-- DROP INDEX IF EXISTS public."matrix_time_machine_userID";

		CREATE INDEX IF NOT EXISTS "matrix_time_machine_userID"
		ON public.matrix_time_machine USING btree
		("userID" ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// matrix_tools
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_tools_datos_idx
		ON public.matrix_tools USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_tools_id_idx

		-- DROP INDEX IF EXISTS public.matrix_tools_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_tools_id_idx
		ON public.matrix_tools USING btree
		(id ASC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_tools_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_tools_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_tools_section_id_idx
		ON public.matrix_tools USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_tools_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_tools_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_tools_section_tipo_idx
		ON public.matrix_tools USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_tools_section_tipo_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_tools_section_tipo_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_tools_section_tipo_section_id_idx
		ON public.matrix_tools USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST)
		TABLESPACE pg_default;
	';

// matrix_users
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_users_datos_gin
		ON public.matrix_users USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_users_relations_idx

		-- DROP INDEX IF EXISTS public.matrix_users_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_users_relations_idx
		ON public.matrix_users USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_users_section_id

		-- DROP INDEX IF EXISTS public.matrix_users_section_id;

		CREATE INDEX IF NOT EXISTS matrix_users_section_id
		ON public.matrix_users USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_users_section_tipo

		-- DROP INDEX IF EXISTS public.matrix_users_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_users_section_tipo
		ON public.matrix_users USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_users_section_tipo_section_id

		-- DROP INDEX IF EXISTS public.matrix_users_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_users_section_tipo_section_id
		ON public.matrix_users USING btree
		(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// relations
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS relations_from_component_tipo
		ON public.relations USING btree
		(from_component_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: relations_section_id

		-- DROP INDEX IF EXISTS public.relations_section_id;

		CREATE INDEX IF NOT EXISTS relations_section_id
		ON public.relations USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: relations_section_tipo

		-- DROP INDEX IF EXISTS public.relations_section_tipo;

		CREATE INDEX IF NOT EXISTS relations_section_tipo
		ON public.relations USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: relations_section_tipo_section_id

		-- DROP INDEX IF EXISTS public.relations_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS relations_section_tipo_section_id
		ON public.relations USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: relations_target_section_id

		-- DROP INDEX IF EXISTS public.relations_target_section_id;

		CREATE INDEX IF NOT EXISTS relations_target_section_id
		ON public.relations USING btree
		(target_section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: relations_target_section_id_section_id

		-- DROP INDEX IF EXISTS public.relations_target_section_id_section_id;

		CREATE INDEX IF NOT EXISTS relations_target_section_id_section_id
		ON public.relations USING btree
		(target_section_id ASC NULLS LAST, section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: relations_target_section_tipo

		-- DROP INDEX IF EXISTS public.relations_target_section_tipo;

		CREATE INDEX IF NOT EXISTS relations_target_section_tipo
		ON public.relations USING btree
		(target_section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: relations_target_section_tipo_section_tipo

		-- DROP INDEX IF EXISTS public.relations_target_section_tipo_section_tipo;

		CREATE INDEX IF NOT EXISTS relations_target_section_tipo_section_tipo
		ON public.relations USING btree
		(target_section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: relations_target_section_tipo_target_section_id

		-- DROP INDEX IF EXISTS public.relations_target_section_tipo_target_section_id;

		CREATE INDEX IF NOT EXISTS relations_target_section_tipo_target_section_id
		ON public.relations USING btree
		(target_section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, target_section_id ASC NULLS LAST)
		TABLESPACE pg_default;
	';

// matrix_ontology
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_ontology_datos_idx
		ON public.matrix_ontology USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_id_idx

		-- DROP INDEX IF EXISTS public.matrix_ontology_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_ontology_id_idx
		ON public.matrix_ontology USING btree
		(id ASC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_id_idx1

		-- DROP INDEX IF EXISTS public.matrix_ontology_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_ontology_id_idx1
		ON public.matrix_ontology USING btree
		(id DESC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_relations_flat_fct_st_si

		-- DROP INDEX IF EXISTS public.matrix_ontology_relations_flat_fct_st_si;

		CREATE INDEX IF NOT EXISTS matrix_ontology_relations_flat_fct_st_si
		ON public.matrix_ontology USING gin
		(relations_flat_fct_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_relations_flat_st_si

		-- DROP INDEX IF EXISTS public.matrix_ontology_relations_flat_st_si;

		CREATE INDEX IF NOT EXISTS matrix_ontology_relations_flat_st_si
		ON public.matrix_ontology USING gin
		(relations_flat_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_relations_flat_ty_st

		-- DROP INDEX IF EXISTS public.matrix_ontology_relations_flat_ty_st;

		CREATE INDEX IF NOT EXISTS matrix_ontology_relations_flat_ty_st
		ON public.matrix_ontology USING gin
		(relations_flat_ty_st(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_relations_flat_ty_st_si

		-- DROP INDEX IF EXISTS public.matrix_ontology_relations_flat_ty_st_si;

		CREATE INDEX IF NOT EXISTS matrix_ontology_relations_flat_ty_st_si
		ON public.matrix_ontology USING gin
		(relations_flat_ty_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_relations_idx

		-- DROP INDEX IF EXISTS public.matrix_ontology_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_ontology_relations_idx
		ON public.matrix_ontology USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_ontology_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_ontology_section_id_idx
		ON public.matrix_ontology USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_ontology_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_ontology_section_tipo_idx
		ON public.matrix_ontology USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_section_tipo_section_id

		-- DROP INDEX IF EXISTS public.matrix_ontology_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_ontology_section_tipo_section_id
		ON public.matrix_ontology USING btree
		(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_section_tipo_section_id_desc

		-- DROP INDEX IF EXISTS public.matrix_ontology_section_tipo_section_id_desc;

		CREATE INDEX IF NOT EXISTS matrix_ontology_section_tipo_section_id_desc
		ON public.matrix_ontology USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_term

		-- DROP INDEX IF EXISTS public.matrix_ontology_term;

		CREATE INDEX IF NOT EXISTS matrix_ontology_term
		ON public.matrix_ontology USING gin
		(f_unaccent(datos #>> \'{components,hierarchy25,dato}\'::text[]) COLLATE pg_catalog."default" gin_trgm_ops)
		TABLESPACE pg_default;
	';

// matrix_ontology_main
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_ontology_main_datos_idx
		ON public.matrix_ontology_main USING gin
		(datos jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_main_id_idx

		-- DROP INDEX IF EXISTS public.matrix_ontology_main_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_ontology_main_id_idx
		ON public.matrix_ontology_main USING btree
		(id ASC NULLS FIRST)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_main_id_idx1

		-- DROP INDEX IF EXISTS public.matrix_ontology_main_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_ontology_main_id_idx1
		ON public.matrix_ontology_main USING btree
		(id DESC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_main_relations_idx

		-- DROP INDEX IF EXISTS public.matrix_ontology_main_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_ontology_main_relations_idx
		ON public.matrix_ontology_main USING gin
		((datos #> \'{relations}\'::text[]) jsonb_path_ops)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_main_section_id_idx

		-- DROP INDEX IF EXISTS public.matrix_ontology_main_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_ontology_main_section_id_idx
		ON public.matrix_ontology_main USING btree
		(section_id ASC NULLS LAST)
		TABLESPACE pg_default;
		-- Index: matrix_ontology_main_section_tipo_idx

		-- DROP INDEX IF EXISTS public.matrix_ontology_main_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_ontology_main_section_tipo_idx
		ON public.matrix_ontology_main USING btree
		(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST)
		TABLESPACE pg_default;

		-- relations_flat
		CREATE INDEX IF NOT EXISTS matrix_ontology_main_relations_flat_fct_st_si
		ON public.matrix_ontology_main USING gin
		(relations_flat_fct_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;

		CREATE INDEX IF NOT EXISTS matrix_ontology_main_relations_flat_st_si
		ON public.matrix_ontology_main USING gin
		(relations_flat_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;

		CREATE INDEX IF NOT EXISTS matrix_ontology_main_relations_flat_ty_st
		ON public.matrix_ontology_main USING gin
		(relations_flat_ty_st(datos) jsonb_path_ops)
		TABLESPACE pg_default;

		CREATE INDEX IF NOT EXISTS matrix_ontology_main_relations_flat_ty_st_si
		ON public.matrix_ontology_main USING gin
		(relations_flat_ty_st_si(datos) jsonb_path_ops)
		TABLESPACE pg_default;
	';

// People special indexes (name [rsc85], surname [rsc86])
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_rsc85_gin ON matrix USING gin(f_unaccent(datos#>>\'{components, rsc85, dato}\') gin_trgm_ops);
		CREATE INDEX IF NOT EXISTS matrix_rsc86_gin ON matrix USING gin(f_unaccent(datos#>>\'{components, rsc86, dato}\') gin_trgm_ops);
	';

// matrix_dd REINDEX
	$ar_sql_query[] = '
		REINDEX TABLE public.matrix_dd;
	';

// matrix_dd vacuum
	$ar_sql_query[] = '
		VACUUM FULL VERBOSE ANALYZE public.matrix_dd;
	';

// vacuum. Vacuum analyze main tables
	$ar_sql_query[] = '
		VACUUM ANALYZE "matrix_hierarchy";
	';
	$ar_sql_query[] = '
		VACUUM ANALYZE "matrix";
	';
	$ar_sql_query[] = '
		VACUUM ANALYZE "matrix_activity";
	';
