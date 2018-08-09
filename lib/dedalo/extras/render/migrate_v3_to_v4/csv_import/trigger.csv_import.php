<?php
require_once( dirname(dirname(dirname(dirname(dirname(__FILE__))))).'/config/config4.php');
require_once( dirname(__FILE__).'/class.csv_import.php');
/*
	csv_import TRIGGER
*/
set_time_limit ( 259200 );  // 3 dias

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# set vars
$vars = array('mode');
	foreach($vars as $name) $$name = common::setVar($name);

echo '<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
</head>
<body>';

#
# MENU
$html='';
$html .= "<div style=\"line-height: 1.5em;padding: 5px;\">";
$html .= "<a href=\"?mode=proyectos\">proyectos</a> <br>";
$html .= "<a href=\"?mode=profesiones\">profesiones</a> <br>";
$html .= "<a href=\"?mode=informantes\">informantes</a> <br>";
$html .= "<a href=\"?mode=linea_investigacion\">linea_investigacion</a> <br>";
$html .= "<a href=\"?mode=entidades\">entidades</a> <br>";
$html .= "<a href=\"?mode=usuarios\">usuarios</a> <br>";
$html .= "<a href=\"?mode=personas\">personas</a> <br>";
$html .= "<a href=\"?mode=imagenes\">imagenes</a> <br>";
$html .= "<a href=\"?mode=images_informantes\">images_informantes</a> <br>";
$html .= "<a href=\"?mode=sra_informantes\">sra_informantes</a> <br>";
$html .= "<a href=\"?mode=sra_sra\">sra_sra</a> <br>";
$html .= "<a href=\"?mode=change_section_creator\">change_section_creator</a> <br>";
$html .= "<a href=\"?mode=test_csv\">test_csv</a> <br>";
$html .= "</div>";
echo $html;


#
# SESSION STORE DATA AND CLOSE
# We do not need write session info here. Liberate session to free browser
session_write_close();


# CALL FUNCTION
if ( function_exists($mode) ) {
	call_user_func($mode);
}



/**
* CHANGE_SECTION_CREATOR
* @return 
*/
function change_section_creator() {

	/*
	  "section_creator_top_tipo": "mdcat597",
	  "section_creator_portal_tipo": "mdcat602",
	  "section_creator_portal_section_tipo": "rsc197"
	  */	  

	 // informantes sra
	$matrix_table						 = 'matrix';
	$section_creator_top_tipo 			 = 'mdcat597';
	$section_creator_portal_tipo 		 = 'mdcat602';
	$section_creator_portal_section_tipo = 'rsc197';


	// informantes oh
	$matrix_table						 = 'matrix';
	$section_creator_top_tipo 			 = 'oh1';
	$section_creator_portal_tipo 		 = 'oh24';
	$section_creator_portal_section_tipo = 'rsc197';


	$section_tipo = 'rsc197';
	

	csv_import::change_section_creator( $matrix_table, $section_creator_top_tipo , $section_creator_portal_tipo, $section_creator_portal_section_tipo, $section_tipo );
	
}#end change_section_creator


/**
* PROYECTOS
*/
function proyectos() {

	$file = 'files/memorial/proyectos.csv';

	$ar_csv_data = csv_import::read_csv_file_as_array( $file, $skip_header=true, ',');
	/*
	echo '<pre>';
	print_r($ar_csv_data);
	echo '</pre>';
	return;
	*/

	$section_tipo = 'dd153';

	/* REF
	1	projectID			int(5)			No	None	AUTO_INCREMENT	 Change	 Drop	 Browse distinct values	Primary	 Unique	 Index	Spatial	Fulltext
	2	proyecto			varchar(255)	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	 Fulltext
	3	ambito				tinyint(4)			No	1		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	Fulltext
	4	lineaInv			varchar(255)	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	 Fulltext
	5	serie				varchar(255)	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	 Fulltext
	6	descripcion			text	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	Primary	Unique	Index	Spatial	 Fulltext
	7	fechaAlta			date			Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	Fulltext
	8	codigo				varchar(255)	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	 Fulltext
	9	responsable			varchar(255)	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	 Fulltext
	10	otrosResponsables	text	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	Primary	Unique	Index	Spatial	 Fulltext
	11	tipo				varchar(255)	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	 Fulltext
	12	​​languagesDES		text	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	Primary	Unique	Index	Spatial	 Fulltext
	13	difundible			enum('si', 'no', 'restringit')	utf8_unicode_ci		No	no		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	Fulltext
	14	observaciones		text

	[0] => Array
        (
            [0] => projectID
            [1] => proyecto
            [2] => ambito
            [3] => dd54
            [4] => lineaInv
            [5] => serie
            [6] => descripcion
            [7] => created_date
            [8] => fechaAlta
            [9] => codigo
            [10] => dd364
            [11] => Entidad responsible
            [12] => dd53
            [13] => responsable
            [14] => dd78
            [15] => otrosResponsables
            [16] => tipo
            [17] => ​​languagesDES
            [18] => dd40
            [19] => difundible
            [20] => observaciones
        )

    [1] => Array
        (
            [0] => 89
            [1] => Entrevista Mercedes Orgaz
            [2] => 1
            [3] => 
            [4] => 
            [5] => E2006/G0246/2015/12
            [6] => Entrevista a Mercedes Orgaz, funcionària del Govern de la República durant la Guerra Civil i l'exili. Projecte finançat pel Departament d'Interior, Relacions Institucionals i Participació (2007), i que ha comptat amb el suport del CEHI de la UB.
            [7] => 2015-12-10 00:00:00
            [8] => 2015-12-10
            [9] => 2015/002
            [10] => [{"section_id":"35","section_tipo":"rsc106"}]
            [11] => Fundació privada Ciència en Societat
            [12] => [{"section_id":"27","section_tipo":"rsc194"}]
            [13] => Cristina Junyent
            [14] => 
            [15] => 
            [16] => 
            [17] => 
            [18] => [{"section_id":"2","section_tipo":"dd64"}]
            [19] => no
            [20] => 
	*/
	
	$map = array(
		'section_id'  		=> 0, // section_id to use/create in current row
		'dd156'				=> 1, // nombre	
		'dd54'				=> 3, // linea de investigación
		'dd106'				=> 5, // serie
		'dd71'				=> 6, // descripción
		'created_date'  	=> 7, // section created date	
		'dd155'				=> 9, // código 
		'dd364'				=> 10, // entidad responsable
		'dd53'				=> 12, // responsable	
		'dd78'				=> 14, // otros responsables	
		'dd40'				=> 18, // publicación  / difusión
		//'dd71'			=> 20, // observaciones (no existe)
		
	);
	#dump($map, ' map ++ '.to_string()); #return;

	csv_import::update_dedalo_section( $map, $ar_csv_data, $section_tipo );

}//end proyectos



/**
* USUARIOS
*/
function usuarios() {

	$file = 'files/memorial/usuarios.csv';

	$ar_csv_data = csv_import::read_csv_file_as_array( $file, $skip_header=true, ',');
	/*
	echo '<pre>';
	print_r($ar_csv_data);
	echo '</pre>';
	return;
	*/

	$section_tipo = 'dd128';

	/* REF	
    [0] => userID
    [1] => usuario dd132
    [2] => clave dd133
    [3] => nombre dd452
    [4] => email dd134
    [5] => activa dd131
    [6] => fechaAlta created_date
    [7] => obs dd135        

    [0] => 1
    [1] => admin
    [2] => Paella096su
    [3] => Administrador técnico
    [4] => robot@robot.es
    [5] => si
    [6] => 2010-02-08 18:53:55
    [7] => Compte reservada per a ús tècnic. Per a ús de treball, creeu un altre compte d'administració de nivell 9 i accedeixi amb ella al sistema.
	*/
	
	$map = array(
		'section_id'  		=> 0, // section_id to use/create in current row
		'created_date'  	=> 6, // fecha alta
		'dd132'				=> 1, // usuario
		'dd133'				=> 2, // clave
		'dd452'				=> 3, // nombre completo
		'dd134'				=> 4, // email
		'dd131'				=> 5, // activa		
		'dd135'				=> 7, // obs
	);
	#dump($map, ' map ++ '.to_string()); return;

	csv_import::update_dedalo_section( $map, $ar_csv_data, $section_tipo );

}//end usuarios



/**
* INFORMANTES
*/
function informantes() {

	$file = 'files/memorial/informantes.csv';

	$ar_csv_data = csv_import::read_csv_file_as_array( $file, $skip_header=true, ',');
	/*
	echo '<pre>';
	print_r($ar_csv_data);
	echo '</pre>';
	return;
	*/

	$section_tipo = 'rsc197';

	/* REF
	1	informantID		int(4)		UNSIGNED ZEROFILL	No	None	AUTO_INCREMENT	 Change	 Drop	 Browse distinct values	Primary	 Unique	 Index	Spatial	Fulltext
	2	fechaAlta		date			Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	Fulltext
	3	fechaMod		timestamp			No	CURRENT_TIMESTAMP		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	Fulltext
	4	nombre			varchar(255)	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	 Fulltext
	5	apellidos		varchar(255)	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	 Fulltext
	6	sexo			enum('h', 'd')	utf8_unicode_ci		Yes	d		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	Fulltext
	7	fechaNanyo		year(4)			Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	Fulltext
	8	fechaNmes		varchar(2)	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	 Fulltext
	9	fechaNdia		varchar(2)	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	 Fulltext
	10	lugarN			varchar(255)	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	 Fulltext
	11	direccion		text	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	Primary	Unique	Index	Spatial	 Fulltext
	12	municipioID		varchar(8)	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	 Fulltext
	13	tel				varchar(255)	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	 Fulltext
	14	uso_imagen_inf	enum('si', 'no')	utf8_unicode_ci		Yes	si		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	Fulltext
	15	profesion		varchar(255)	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	 Fulltext
	16	contacto		varchar(255)	utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	 Fulltext
	17	fecha_contacto	date			Yes	NULL		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	Fulltext
	18	obs	text		utf8_unicode_ci		Yes	NULL		 Change	 Drop	 Browse distinct values	Primary	Unique	Index	Spatial	 Fulltext
	19	projectIDtemp	int(4)			No	None		 Change	 Drop	 Browse distinct values	 Primary	 Unique	 Index	Spatial	Fulltext
	20	email			varchar(255)	utf8_bin		Yes	NULL

    [0] => Array
        (
            [0] => informantID
            [1] => created_date
            [2] => fechaAlta
            [3] => modified_date
            [4] => nombre
            [5] => apellidos
            [6] => rsc93
            [7] => sexo
            [8] => rsc89
            [9] => fechaNanyo
            [10] => fechaNmes
            [11] => fechaNdia
            [12] => rsc91
            [13] => lugarN
            [14] => direccion
            [15] => rsc92
            [16] => municipioID
            [17] => tel
            [18] => rsc97
            [19] => uso_imagen_inf
            [20] => rsc94
            [21] => profesion
            [22] => contacto
            [23] => fecha_contacto
            [24] => obs
            [25] => email
            [26] => Inversa
            [27] => captacionID
            [28] => captacionID2
            [29] => [{"section_id": "1","section_tipo": "oh1","component_tipo": "rsc170"}]
            [30] => 1
        )

    [1] => Array
        (
            [0] => 1
            [1] => 2010-02-15 00:00:00
            [2] => 2010-02-15
            [3] => 2011-04-26 14:27:22
            [4] => Anna
            [5] => Hero Sirvent
            [6] => [{"section_id":"2","section_tipo":"dd861"}]
            [7] => d
            [8] => {"day":"13","month":"2","year":"1947"}
            [9] => 1947
            [10] => 2
            [11] => 13
            [12] => [{"section_id":"967","section_tipo":"es1"}]
            [13] => es967
            [14] => 
            [15] => [{"section_id":"2352","section_tipo":"es1"}]
            [16] => es2352
            [17] => 932 261 057
            [18] => [{"section_id":"1","section_tipo":"dd64"}]
            [19] => si
            [20] => 
            [21] => 
            [22] => 
            [23] => 
            [24] => 
            [25] => 
            [26] => [{"section_id": "2","section_tipo": "oh1","component_tipo": "oh24"}]
            [27] => 2
            [28] => 
        )
	*/
	
	$map = array(
		'section_id'  		=> 0, // section_id to use/create in current row
		'created_date'  	=> 1, 
		'modified_date'		=> 3,
		'inverse_locators'	=> 26, // inversa
		'rsc85'				=> 4, // nombre
		'rsc86'				=> 5, // apellidos
		'rsc93'				=> 6, // genero
		'rsc89'				=> 8, // fecha nacimiento
		'rsc91'				=> 12, // lugar nacimiento
		'rsc100'			=> 14, // dirección actual
		'rsc92'				=> 15, // lugar residencia
		'rsc101'			=> 17, // telf
		'rsc97'				=> 18, // uso de imagen
		'rsc94'				=> 20, // profesion
		'rsc220'			=> 22, // persona de contacto
		'rsc104'			=> 23, // fecha de contacto
		'rsc99'				=> 24, // obs
		'rsc102'			=> 25, // email	
		'rsc88'				=> 29, // image
	);

	csv_import::update_dedalo_section( $map, $ar_csv_data, $section_tipo );

}//end informantes



/**
* SRA_SRA
*/
function sra_sra() {

	$file = 'files/memorial/V4_SRA_SRA.csv';

	$ar_csv_data = csv_import::read_csv_file_as_array( $file, $skip_header=true, ',');
	/*
	echo '<pre>';
	print_r($ar_csv_data);
	echo '</pre>';
	return;
	*/

	$section_tipo = 'mdcat597';

	/* REF	 
		[0] => orden
        [1] => id
        [2] => mdcat601
        [3] => mdcat602
        [4] => mdcat607
        [5] => mdcat606
        [6] => mdcat634
        [7] => Lloc de producció
        [8] => mdcat628
        [9] => Idioma
        [10] => mdcat629
        [11] => Grafia
        [12] => mdcat630
        [13] => mdcat632

        [0] => 15
        [1] => 1
        [2] => 1
        [3] => [{"section_id": "2248","section_tipo": "rsc197"}]
        [4] => 
        [5] => origen: Terrassa/ exili: Tolosa/ Alta Garona/Unitat familiar: Monscal, Pepita / Pujol Sola, Andrés/
        [6] => Expedient format per la fitxa de registre
        [7] =>  Toulouse
        [8] => [{"section_id":"12427","section_tipo":"fr1"}]
        [9] =>  Francès
        [10] => [{"section_id":"5450","section_tipo":"mdcat674"}]
        [11] =>  Mecanoscrit
        [12] => [{"section_id":"2","section_tipo":"mdcat664"}]
        [13] => 1       
	*/
	
	$map = array(
		'section_id'  		=> 1, // section_id to use/create in current row
		'mdcat601'			=> 2,
		'mdcat602'			=> 3,
		'mdcat607'			=> 4,
		'mdcat606'			=> 5,
		'mdcat634'			=> 6, // lugar produccion
		'mdcat628'			=> 8, // idioma
		'mdcat629'			=> 10, // grafia
		'mdcat630'			=> 12, // 
		'mdcat632'			=> 13, //
	);

	csv_import::update_dedalo_section( $map, $ar_csv_data, $section_tipo );

}//end sra_sra




/**
* SRA_informantes
*/
function sra_informantes() {

	$file = 'files/memorial/V4_SRA_informantes.csv';

	$ar_csv_data = csv_import::read_csv_file_as_array( $file, $skip_header=true, ',');
	/* 
	echo '<pre>';
	print_r($ar_csv_data);
	echo '</pre>';
	return;
	*/

	$section_tipo = 'rsc197';

	/* REF	 
		[0] => 1103
        [1] => Abad Abad
        [2] => Emilio
        [3] => [{"section_id": "1393","section_tipo": "mdcat597","component_tipo": "mdcat602"}]
	*/
	
	$map = array(
		'section_id'  		=> 0, // section_id to use/create in current row
		//'mdcat601'			=> 1, // apellidos
		//'mdcat602'			=> 2, // nombre
		'rsc86'				=> 1, // apellidos
		'rsc85'				=> 2, // nombre
		'inverse_locators'	=> 3, // inversa
	);

	csv_import::update_dedalo_section( $map, $ar_csv_data, $section_tipo );

}//end sra_informantes





/**
* PROFESIONES
*/
function profesiones() {

	$file = 'files/memorial/profesiones.csv';

	$ar_csv_data = csv_import::read_csv_file_as_array( $file, $skip_header=true, ',');
	/*
	echo '<pre>';
	print_r($ar_csv_data);
	echo '</pre>';
	return;
	*/

	$section_tipo = 'dd882';

	/* REF
	[0] => UserID
    [1] => Inversa
    [2] => id
    [3] => prefesion
	*/
	
	$map = array(
		
		'inverse_locators'  => 1,
		'section_id'  		=> 2, // section_id to use/create in current row
		'dd884'				=> 3, // profesion		
	);

	csv_import::update_dedalo_section( $map, $ar_csv_data, $section_tipo );

}//end profesiones



/**
* LINEA_INVESTIGACION
*/
function linea_investigacion() {

	$file = 'files/memorial/linea_investigacion.csv';

	$ar_csv_data = csv_import::read_csv_file_as_array( $file, $skip_header=true, ',');
	/*
	echo '<pre>';
	print_r($ar_csv_data);
	echo '</pre>';
	return;
	*/

	$section_tipo = 'dd1308';

	/* REF
	[0] => 1
	[1] => Antifranquisme
	*/
	
	$map = array(		
		
		'section_id'  		=> 0, // section_id to use/create in current row
		'dd1311'			=> 1, // linea de investigación nombre		
	);

	csv_import::update_dedalo_section( $map, $ar_csv_data, $section_tipo );

}//end linea_investigacion



/**
* ENTIDADES
*/
function entidades() {

	$file = 'files/memorial/entidades.csv';

	$ar_csv_data = csv_import::read_csv_file_as_array( $file, $skip_header=true, ',');
	/*
	echo '<pre>';
	print_r($ar_csv_data);
	echo '</pre>';
	return;
	*/

	$section_tipo = 'rsc106';

	/* REF
	[0] => 2
	[1] => Arxiu de Blanes
	*/
	
	$map = array(		
		
		'section_id'  	=> 0, // section_id to use/create in current row
		'rsc116'		=> 1, // entidad nombre		
	);

	csv_import::update_dedalo_section( $map, $ar_csv_data, $section_tipo );

}//end entidades



/**
* PERSONAS
*/
function personas() {

	$file = 'files/memorial/personas.csv';

	$ar_csv_data = csv_import::read_csv_file_as_array( $file, $skip_header=true, ',');
	/**/
	echo '<pre>';
	print_r($ar_csv_data);
	echo '</pre>';
	return;
	

	$section_tipo = 'rsc194';

	/* REF
	[0] => id
    [1] => nombre rsc85
    [2] => apellido rsc86
	*/
	
	$map = array(		
		'section_id'  	=> 0, // section_id to use/create in current row
		'rsc85'			=> 1, // nombre	
		'rsc86'			=> 2, // apellido
	);

	csv_import::update_dedalo_section( $map, $ar_csv_data, $section_tipo );

}//end personas



/**
* imagenes
*/
function imagenes() {

	$file = 'files/memorial/imagenes.csv';

	$ar_csv_data = csv_import::read_csv_file_as_array( $file, $skip_header=true, ',');
		#dump($ar_csv_data, ' $ar_csv_data ++ '.to_string());
	/*
	echo '<pre>';
	print_r($ar_csv_data);
	echo '</pre>';
	return;	
	*/
	
	$section_tipo = 'rsc170';

	/* REF
	[0] => id
	[1] => rsc29
	[2] => inversa
	*/
	
	$map = array(		
		'section_id'  		=> 0, // section_id to use/create in current row
		'inverse_locators'  => 2, 
		'rsc29'				=> 1, // imagen dato (locator)
	);

	csv_import::update_dedalo_section( $map, $ar_csv_data, $section_tipo );

}//end imagenes



/**
* IMAGES_INFORMANTES
*/
function images_informantes() {

	$file = 'files/memorial/informantes.csv';

	$ar_csv_data = csv_import::read_csv_file_as_array( $file, $skip_header=true, ',');
	/* */
	echo '<pre>';
	print_r($ar_csv_data);
	echo '</pre>';
	return;

	
	$map = array(		
		'image_source'  	=> 27,
		'image_target'		=> 30,
		'locator'			=> 29,
		'tipo'				=> 31,
	);

	$max_items_folder = 1000;

	$path_source = dirname(__FILE__).'/files/memorial/images_informantes/source';
	$path_target = dirname(__FILE__).'/files/memorial/images_informantes/target';

	#$path_source = '/Users/Administrador/Sites/dedalo/media_foto';
	#$path_target = '/Users/Administrador/Sites/dedalo4/media/image/1.5MB';

	csv_import::export_images( $map, $ar_csv_data, $path_source, $path_target, $max_items_folder );

}//end images_informantes



/**
* test_csv
*/
function test_csv() {

	$file = 'files/test/matrix_mdcat301.csv';

	$ar_csv_data = csv_import::read_csv_file_as_array( $file, $skip_header=false, ';');
	/**/ 
	echo '<pre>';
	print_r($ar_csv_data);
	echo '</pre>';
	return;
	

	$section_tipo = 'rsc197';

	/* REF	 
		[0] => 1103
        [1] => Abad Abad
        [2] => Emilio
        [3] => [{"section_id": "1393","section_tipo": "mdcat597","component_tipo": "mdcat602"}]
	*/
	
	$map = array(
		'section_id'  		=> 0, // section_id to use/create in current row
		//'mdcat601'			=> 1, // apellidos
		//'mdcat602'			=> 2, // nombre
		'rsc86'				=> 1, // apellidos
		'rsc85'				=> 2, // nombre
		'inverse_locators'	=> 3, // inversa
	);

	csv_import::update_dedalo_section( $map, $ar_csv_data, $section_tipo );

}//end test_csv







echo '</body></html>';
?>