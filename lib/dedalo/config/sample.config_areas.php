<?php

#
# CONFIG4_AREAS
#
# Control what areas are showed in profiles an menu

# Reviewed: 12-05-2018

/* 
	MAIN MENU AREAS INFO

	$areas_deny[] = 'dd242';	// Inventario
	$areas_deny[] = 'dd69';		// Actividades
	$areas_deny[] = 'dd222';	// Publicacion
	$areas_deny[] = 'dd14'; 	// Recursos
	$areas_deny[] = 'dd35'; 	// Procesos
	$areas_deny[] = 'dd100'; 	// Tesauro
	$areas_deny[] = 'dd207'; 	// Administracion
*/

$areas_deny  = [];
$areas_allow = []; // allow override deny always


# DEFAULT DENY AREAS
$areas_deny[] = 'dd137';		// Private list of values
$areas_deny[] = 'rsc1';			// Media real section
$areas_deny[] = 'hierarchy20';	// Thesaurus real section