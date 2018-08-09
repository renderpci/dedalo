
-- Tipologia del media rsc (se usa mucho) 
DROP INDEX matrix_rsc24; --CREATE INDEX matrix_rsc24  ON matrix  USING btree ((datos #>> '{components,rsc24,dato,lg-nolan}'::text[]) COLLATE pg_catalog."default");
CREATE INDEX matrix_rsc24_id  ON matrix  USING btree  (id, (datos #>> '{components,rsc24,dato,lg-nolan}'::text[]) COLLATE pg_catalog."default");

-- Coleccion / archivo del media rsc 
DROP INDEX matrix_rsc25; --CREATE INDEX matrix_rsc25  ON matrix  USING btree ((datos #>> '{components,rsc25,dato,lg-nolan}'::text[]) COLLATE pg_catalog."default");
CREATE INDEX matrix_rsc25_id  ON matrix  USING btree  (id, (datos #>> '{components,rsc25,dato,lg-nolan}'::text[]) COLLATE pg_catalog."default");

-- Tipologia de informantes
CREATE INDEX matrix_rsc90 on "matrix" USING GIN ((datos #> '{components,rsc90,dato,lg-nolan}'));

-- Proyectos de Informantes
CREATE INDEX matrix_rsc98 on "matrix" USING GIN ((datos #> '{components,rsc98,dato,lg-nolan}'));

-- Proyectos de historia oral
CREATE INDEX matrix_oh22 on "matrix" USING GIN ((datos #> '{components,oh22,dato,lg-nolan}'));

-- Proyectos de PCI
CREATE INDEX matrix_ich26 on "matrix" USING GIN ((datos #> '{components,ich26,dato,lg-nolan}'));

-- Proyectos de imágenes resources
CREATE INDEX matrix_rsc28 on "matrix" USING GIN ((datos #> '{components,rsc28,dato,lg-nolan}'));

-- Proyectos de bibliografia
CREATE INDEX matrix_rsc148 on "matrix" USING GIN ((datos #> '{components,rsc148,dato,lg-nolan}'));

-- Proyectos de actividad
CREATE INDEX matrix_dd550 on "matrix" USING GIN ((datos #> '{components,dd550,dato,lg-nolan}'));

-- Proyectos de MUPREVA Catalogo
CREATE INDEX matrix_mupreva16 on "matrix" USING GIN ((datos #> '{components,mupreva16,dato,lg-nolan}'));


DROP INDEX matrix_datos_gin;
DROP INDEX matrix_id_index;
DROP INDEX matrix_rsc148;
DROP INDEX matrix_rsc24;
DROP INDEX matrix_rsc24_id;
DROP INDEX matrix_rsc25;
DROP INDEX matrix_rsc25_id;
DROP INDEX matrix_rsc28;
DROP INDEX matrix_rsc28_id;
DROP INDEX matrix_section_tipo;
DROP INDEX matrix_section_tipo_rsc2_id;
DROP INDEX matrix_srsc24_114;
DROP INDEX matrix_srsc24_114_id;
DROP INDEX matrix_srsc25_2;
DROP INDEX matrix_srsc25_2_id;
DROP INDEX matrix_test;
DROP INDEX section_tipo_rsc2;

-- DROP INDEX matrix_datos_gin;
CREATE INDEX matrix_datos_gin  ON matrix  USING gin  (datos jsonb_path_ops);

-- DROP INDEX matrix_id_index;
CREATE INDEX matrix_id_index  ON matrix  USING btree  (id NULLS FIRST);

-- DROP INDEX matrix_rsc148;
CREATE INDEX matrix_rsc148  ON matrix  USING gin  ((datos #> '{components,rsc148,dato,lg-nolan}'::text[]));

--DROP INDEX matrix_rsc24;
CREATE INDEX matrix_rsc24  ON matrix  USING btree  ((datos #>> '{components,rsc24,dato,lg-nolan}'::text[]) COLLATE pg_catalog."default");

-- DROP INDEX matrix_rsc24_id;
CREATE INDEX matrix_rsc24_id  ON matrix  USING btree  (id, (datos #>> '{components,rsc24,dato,lg-nolan}'::text[]) COLLATE pg_catalog."default");

-- DROP INDEX matrix_rsc25;
CREATE INDEX matrix_rsc25  ON matrix  USING btree  ((datos #>> '{components,rsc25,dato,lg-nolan}'::text[]) COLLATE pg_catalog."default");

-- DROP INDEX matrix_rsc25_id;
CREATE INDEX matrix_rsc25_id  ON matrix  USING btree  (id, (datos #>> '{components,rsc25,dato,lg-nolan}'::text[]) COLLATE pg_catalog."default");

-- DROP INDEX matrix_rsc28;
CREATE INDEX matrix_rsc28  ON matrix  USING btree  ((datos #>> '{components,rsc28,dato,lg-nolan}'::text[]) COLLATE pg_catalog."default");

-- DROP INDEX matrix_rsc28_id;
CREATE INDEX matrix_rsc28_id  ON matrix  USING btree  (id, (datos #>> '{components,rsc28,dato,lg-nolan}'::text[]) COLLATE pg_catalog."default");

-- DROP INDEX matrix_section_tipo;
CREATE INDEX matrix_section_tipo  ON matrix  USING gin  ((datos #> '{section_tipo}'::text[]));

/*
-- DROP INDEX matrix_section_tipo_rsc2_id;
CREATE INDEX matrix_section_tipo_rsc2_id  ON matrix  USING btree  (id, (datos #>> '{section_tipo}'::text[]) COLLATE pg_catalog."default") WHERE (datos #>> '{section_tipo}'::text[]) = 'rsc2'::text;

-- DROP INDEX matrix_srsc24_114;
CREATE INDEX matrix_srsc24_114  ON matrix  USING btree  ((datos #>> '{components,rsc24,dato,lg-nolan}'::text[]) COLLATE pg_catalog."default") WHERE (datos #>> '{components,rsc24,dato,lg-nolan}'::text[]) = '114'::text;

-- DROP INDEX matrix_srsc24_114_id;
CREATE INDEX matrix_srsc24_114_id  ON matrix  USING btree  (id, (datos #>> '{components,rsc24,dato,lg-nolan}'::text[]) COLLATE pg_catalog."default")  WHERE (datos #>> '{components,rsc24,dato,lg-nolan}'::text[]) = '114'::text;

-- DROP INDEX matrix_srsc25_2;
CREATE INDEX matrix_srsc25_2  ON matrix  USING btree  ((datos #>> '{components,rsc25,dato,lg-nolan}'::text[]) COLLATE pg_catalog."default")  WHERE (datos #>> '{components,rsc25,dato,lg-nolan}'::text[]) = '2'::text;

-- DROP INDEX matrix_srsc25_2_id;
CREATE INDEX matrix_srsc25_2_id  ON matrix  USING btree  (id, (datos #>> '{components,rsc25,dato,lg-nolan}'::text[]) COLLATE pg_catalog."default")  WHERE (datos #>> '{components,rsc25,dato,lg-nolan}'::text[]) = '2'::text;

-- DROP INDEX matrix_test;
CREATE INDEX matrix_test  ON matrix  USING btree  (id, (datos #>> '{section_tipo}'::text[]) COLLATE pg_catalog."default")  WHERE (datos #>> '{section_tipo}'::text[]) = 'rsc2'::text;

-- DROP INDEX section_tipo_rsc2;
CREATE INDEX section_tipo_rsc2  ON matrix  USING btree  (id, (datos #>> '{section_tipo}'::text[]) COLLATE pg_catalog."default") WHERE (datos #>> '{section_tipo}'::text[]) = 'rsc2'::text;
*/
