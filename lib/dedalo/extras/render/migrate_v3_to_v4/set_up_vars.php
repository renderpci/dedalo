<?php


# OH-1  HISTORIA ORAL CAPTACIONES**********************************************************************

			#
			# GROUP TABLE
			$oh1 = new stdClass();	
				$oh1->MY_table 			= 'captaciones';
				$oh1->section_tipo 		= 'oh1';
				$oh1->section_id		= 'captacionID';
				$oh1->filter 			= array('oh22' => 'projectID');
				$oh1->fields 			= new stdClass();
				$oh1->fields->oh14 		='codigo';
				$oh1->fields->oh15 		='codigo_anterior';
				$oh1->fields->oh16 		='titulo';
				$oh1->fields->oh29 		='fechaAlta';
				$oh1->fields->oh20 		='idioma';
				$oh1->fields->oh21 		='calidad';
				$oh1->fields->oh32 		='difundible';
				$oh1->fields->oh18 		='lugar_captacion';
				$oh1->fields->oh19 		='municipioID';
				$oh1->fields->oh35 		='acta_cesion';
				$oh1->fields->oh33 		='uso_imagen';
				$oh1->fields->oh34 		='der_explotacion';
				$oh1->fields->oh37 		='otra_documentacion';
				$oh1->fields->oh38 		='obs';
				$oh1->fields->oh39 		='notas';
				$oh1->fields->oh23 		='resumen';

				$oh1->fields->oh76 		='responsable';
				$oh1->fields->oh78 		='captador';
				$oh1->fields->oh77 		='copiaDVD';

/*Datos por pasar a otra tabla

fechaMod	
estado

fecha_captacion

entrevistador
operador_camara
digitalizacion
transcriptor
indexador

obsC

userID
*/

# RSC197  INFORMANTES *******************************************************************************


			$rsc197 = new stdClass();	
				$rsc197->MY_table 			= 'informants';
				$rsc197->section_tipo 		= 'rsc197';
				$rsc197->section_id			= 'informantID';
				$rsc197->filter 			= array('rsc98' => 'projectID');

				$rsc197->created_date		= 'fechaAlta';
				$rsc197->modified_date		= 'fechaMod';

				$rsc197->fields 			= new stdClass();
				$rsc197->fields->rsc85 		='nombre';
				$rsc197->fields->rsc86 		='apellidos';
				$rsc197->fields->rsc93 		=array('field'=>'sexo',
													'{"Section_tipo":"dd861","section_id":1}' => 'h',
													'{"Section_tipo":"dd861","section_id":2}' => 'd',
													);
				$rsc197->fields->rsc89 		=array('year' => 'fechaNanyo',
													'month' => 'fechaNmes',
													'day' => 'fechaNdia',
													);
				$rsc197->fields->rsc91 		='lugarN';
				$rsc197->fields->rsc100 	='direccion';
				$rsc197->fields->rsc92 		='municipioID';
				$rsc197->fields->rsc101		='tel';
				$rsc197->fields->rsc97 		=array('field'=>'uso_imagen_inf',
													'{"Section_tipo":"dd64","section_id":1}' => 'si',
													'{"Section_tipo":"dd64","section_id":2}' => 'no',
													);
				$rsc197->fields->rsc94 		='profesion';
				$rsc197->fields->rsc103		='contacto';
				$rsc197->fields->rsc104		='fecha_contacto';
				$rsc197->fields->rsc99		='obs';
				$rsc197->fields->rsc102		='email';



/*
informantID			int(4) unsigned zerofill Auto Increment	 
fechaAlta			date NULL	 
fechaMod			timestamp [CURRENT_TIMESTAMP]	 
nombre				varchar(255) NULL	 
apellidos			varchar(255) NULL	 
sexo				enum('h','d') NULL [d]	 
fechaNanyo			year(4) NULL	formato 4 digitos
fechaNmes			varchar(2) NULL	mes nacimiento
fechaNdia			varchar(2) NULL	dia nacimiento
lugarN				varchar(255) NULL	 
direccion			text NULL	 
municipioID			varchar(8) NULL	 
tel					varchar(255) NULL	 
uso_imagen_inf		enum('si','no') NULL [si]	uso imagen específico del informante
profesion			varchar(255) NULL	 
contacto			varchar(255) NULL	 
fecha_contacto		date NULL	 
obs					text NULL	 
projectIDtemp		int(4)	projectID temporal. Eliminar al vincular a captación
email 				varchar(255) NULL
*/


# DD153  PROYECTOS *******************************************************************************

			$dd153 = new stdClass();	
				$dd153->MY_table 			= 'projects';
				$dd153->section_tipo 		= 'dd153';
				$dd153->section_id			= 'projectID';

				$dd153->created_date		= 'fechaAlta';
				#$dd153->modified_date		= 'fechaMod';


				#$dd153->filter 			= array('rsc98' => 'projectID');
				#$dd153->filter 			= 'ambito'; //SIN SENTIDO EN LA V4 CADA ÁMBITO TIENE SU TERMINO EN ESTRUCTURA
				$dd153->fields 				= new stdClass();
				$dd153->fields->dd156 		='proyecto';

				$dd153->fields->dd54 		='lineaInv';
				$dd153->fields->dd106 		='serie';
				$dd153->fields->dd71 		='descripcion';
				$dd153->fields->dd155 		='codigo';
				$dd153->fields->dd53 		='responsable';
				$dd153->fields->dd78		='otrosResponsables';
				$dd153->fields->dd157 		='tipo';
				$dd153->fields->dd266 		='​​languagesDES';
				$dd153->fields->dd40		='difundible';

/*
projectID			int(5) Auto Increment	 
proyecto			varchar(255)	 
ambito				tinyint(4) [1]	 
lineaInv			varchar(255) NULL	 
serie				varchar(255) NULL	 
descripcion			text NULL	 
fechaAlta			date NULL	 
codigo				varchar(255) NULL	codigo del proyecto
responsable			varchar(255) NULL	persona a cargo del proyecto
otrosResponsables	text NULL	 
tipo				varchar(255) NULL	tipo de proyecto
​​languagesDES		text NULL	array of ​​languages (coma separated)
difundible			enum('si','no','restringit') [si]	 
*/

?>



