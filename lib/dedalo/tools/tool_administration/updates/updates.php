<?php
#
# UPDATES CONTROL
#
global $updates;
$updates = new stdClass();	


$v=4011; #####################################################################################
$updates->$v = new stdClass();

	#UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 11;


	#MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 10;


	#UPDATE COMPONENTS
	# Order is important !
	$updates->$v->components_update = ['component_security_access','component_security_areas'];


	$updates->$v->SQL_update[] 	= ' CREATE TABLE IF NOT EXISTS "matrix_notifications" (
										"id" serial NOT NULL,
										"datos" jsonb NULL,
										CONSTRAINT matrix_notifications_id PRIMARY KEY(id)
									) ';
	$updates->$v->SQL_update[] 	= ' CREATE TABLE IF NOT EXISTS public.jer_ds (
										LIKE public.jer_ts INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS
								  	) WITH (OIDS = FALSE) ';
	$updates->$v->SQL_update[] 	= ' CREATE SEQUENCE jer_ds_id_seq ';
	$updates->$v->SQL_update[] 	= ' ALTER TABLE public.jer_ds ALTER COLUMN id SET DEFAULT nextval(\'jer_ds_id_seq\'::regclass) ';
	$updates->$v->SQL_update[] 	= ' UPDATE jerarquia_tipos SET id = 8 WHERE id = 7 ';
	$updates->$v->SQL_update[] 	= ' UPDATE jerarquia SET tipo = 8 WHERE tipo = 7 ';
	$updates->$v->SQL_update[] 	= ' INSERT INTO "jerarquia_tipos" ("id", "nombre", "orden") VALUES (\'7\', \'Semantic\', \'7\') ';
	$updates->$v->SQL_update[] 	= ' INSERT INTO "jerarquia" ("alpha3", "alpha2", "nombre", "tipo", "activa", "mainLang") VALUES (\'DSE\', \'DS\', \'Semantic\', \'7\', \'si\', \'lg-spa\') ';
	


$v=4010; #####################################################################################
$updates->$v = new stdClass();

	#UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 10;


	#MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 9;


	#UPDATE COMPONENTS
	$updates->$v->components_update = ['component_date'];


	$updates->$v->SQL_update[] 	= ' CREATE TABLE IF NOT EXISTS "matrix_notifications" (
										"id" serial NOT NULL,
										"datos" jsonb NULL,
										CONSTRAINT matrix_notifications_id PRIMARY KEY(id)
									) ';
	$updates->$v->SQL_update[] 	= ' CREATE TABLE IF NOT EXISTS "matrix_updates" (
										"id" serial NOT NULL,
										"datos" jsonb NULL,
										CONSTRAINT matrix_updates_id PRIMARY KEY(id)
									) ';
	



$v=409; #####################################################################################
$updates->$v = new stdClass();

	#UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 9;


	#MINIM UPDATE FROM 
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 8;


	#UPDATE COMPONENTS
	$updates->$v->components_update = [];

	#UPDATE COMPONENTS
	$updates->$v->SQL_update[] 	= ' CREATE TABLE IF NOT EXISTS "matrix_notifications" (
										"id" serial NOT NULL,
										"datos" jsonb NULL,
										CONSTRAINT matrix_notifications_id PRIMARY KEY(id)
									) ';
	$updates->$v->SQL_update[] 	= ' INSERT INTO "matrix_notifications" ("datos") VALUES (\'[]\') ';								
									


			


?>