<?php
#
# UPDATES CONTROL
#
global $updates;
$updates = new stdClass();	



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


	$updates->$v->SQL_update 	= ' CREATE TABLE IF NOT EXISTS "matrix_updates" (
										"id" serial NOT NULL,
										"datos" jsonb NULL,
										CONSTRAINT matrix_updates_id PRIMARY KEY(id)
									);';



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
	$updates->$v->SQL_update 	= ' CREATE TABLE IF NOT EXISTS "matrix_notifications" (
										"id" serial NOT NULL,
										"datos" jsonb NULL,
										CONSTRAINT matrix_notifications_id PRIMARY KEY(id)
									);';									
									


			


?>