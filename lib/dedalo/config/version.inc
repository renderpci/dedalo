<?php
/* VERSION INFO

	Plataforma Dédalo v4 Valencia 2012

	Valencia 08-02-2012 v4.0b1
	Añadida funcionalidad ( html_page.js -> document.activeElement.blur() ) de salvar el componente activo al abandonar la página (cerrar la ventana o volver atrás)

	
	Valencia 23-11-2012 v4.0b2
	Rediseñada estructura de acurerdo a la propuesta preliminar de la ficha 


	Valencia 11-12-2012 v4.0b3
	Cambiado el sistema de Descriptores para converger con matrix
	# MYSQL
	ALTER TABLE  `descriptors` CHANGE  `parent`  `parent` VARCHAR( 8 ) NOT NULL COMMENT  '(0 para término)' ;
	ALTER TABLE  `descriptors` CHANGE  `tipo`  `tipo` VARCHAR( 8 ) CHARACTER SET utf8 COLLATE utf8_unicode_ci NOT NULL ;
	# UTILS
	Usar la 16 para traspasar los datos al nuevo formato


	Valencia 20-01-2014 v4.0b41
	Añadido soporte Imagemagick para component_image
	Component_image / tool_upload reconfigurados para soportar Imagemagick y aceptar ficheros no jpg (tif,psd,png,etc) como originales. Internamente se mantiene el formato JPG

	Valencia 25-01-2014 v4.0b50
	Limpieza general de ficheros y clases de dedalo3
	Separación de datos / tablas privadas y públicas
	Dump de datos privados exclusivamente (estructura, etc.)	

	
	Valencia 21-03-2014 v4.0b55
	Solucionado bug de 'component_security_access' al salvar valores '0' para los permisos (cambiado el cómputo del valor en trigger.comoponent_common)

	Valencia 21-03-2014 v4.0b56
	Añadidas visualizaciones para modo sólo lectura en varios compoentes (portal, checkbox, radiobutton, area)

	
	Valencia 25-03-2014 v4.0b57
	Añadido instalador
	Solucionados bugs:
	OK - Cache : Implementar Redis o Memcache para trabajo
	OK - Listas de valores: lang fallback no funciona correctamente
	OK - Lenguajes; al cambiar el idioma no visualiza en azul los campos que no están traducidos. El input text no se puede traducir automáticamente en el tool de traducción

	
	Valencia 23-04-2014 v4.0b60
	Varios bugs solucionados y añadidos varios (partituras, import images tool, etc..)

	
	Valencia 26-04-2014 v4.0b61
	Varios bugs solucionados y añadidos varios (partituras, import images tool, etc..)
	Añadido dd_init_test para control de inicio de Dédalo


	Valencia 29-04-2014 v4.0b62
	Arreglado bug actualización de miniaturas en portales al cerrar tool images

	Valencia 30-04-2014 v4.0b63
	Añadida funcionalidad de importación de imágenes (sólo probada en script MUPREVA)
	Ampliado el campo de MySQL 'dato' de text a mediumtext en matrix, matrix_time_machine en la versión de instalación

	Valencia 13-05-2014 v4.0b64
	Añadida opción de diffusion - trigger button - create and save mysql tables

	Valencia 23-05-2014 v4.0b66
	Corregido un error en la identificación del componente (component_common::get_id_by_tipo_parent) cuando se usa el lenguaje actual
	de los datos para despejar un componente fijado como no traducible (ej. un component_av no traducible)

	Valencia 10-06-2014 v4.0b67
	Corregido un error en la selección del componente component_html_text aal pinchar en el editor
	
	Valencia30-0-2014 v4.0b68
	Improved image manage and transcription with canvas image in full window size and image button
	
	Valencia 08-11-2014 v4.0b2-69
		POSTGRESQL Add table matrix_profiles
		-- Table: matrix_profiles
		CREATE TABLE matrix_profiles
		(
		  id serial NOT NULL,
		  datos jsonb,
		  CONSTRAINT matrix_profiles_pkey PRIMARY KEY (id)
		)
		WITH (
		  OIDS=FALSE
		);
		ALTER TABLE matrix_profiles OWNER TO postgres;

		-- Index: matrix_profiles_datos_idx
		CREATE INDEX matrix_profiles_datos_idx
		  ON matrix_profiles
		  USING gin
		  (datos);

		-- Index: matrix_profiles_expr_idx
		CREATE INDEX matrix_profiles_expr_idx
		  ON matrix_profiles
		  USING gin
		  ((datos -> 'components'::text));

		-- Index: matrix_profiles_expr_idx1
		CREATE INDEX matrix_profiles_expr_idx1
		  ON matrix_profiles
		  USING gin
		  ((datos #> '{components,dd243,dato,lg-nolan}'::text[]));

		-- Index: matrix_profiles_id_expr_expr1_idx
		CREATE INDEX matrix_profiles_id_expr_expr1_idx
		  ON matrix_profiles
		  USING btree
		  (id, (datos ->> 'section_tipo'::text) COLLATE pg_catalog."default", (datos ->> 'created_by_userID'::text) COLLATE pg_catalog."default");

		-- Index: matrix_profiles_id_expr_expr1_idx1
		CREATE INDEX matrix_profiles_id_expr_expr1_idx1
		  ON matrix_profiles
		  USING btree
		  (id, (datos #>> '{section_tipo}'::text[]) COLLATE pg_catalog."default", (datos #>> '{created_by_userID}'::text[]) COLLATE pg_catalog."default");		
		

	Valencia 10-11-2014 v4.0b2-70
	Fix bug in structure dump that don't save postgresql sequences. Now, wildcard flag [-t '*dd_id_seq'] is used to save Dedalo private sequences when structure dump is made.

	Valencia 10-11-2014 v4.0b2-71
	Creado script de importación de datos desde MySQL hacia POSTGRESQL. /dedalo/extras/render/import_b1_to_b2/
	Reimportado matrix_dd desde MySQL. Reconstruidos los índices de matrix_dd
		POSTGRESQL INDEX:

		CREATE INDEX matrix_dd_created_by_userid_gin
		  ON matrix_dd
		  USING gin
		  ((datos #> '{created_by_userID}'::text[]));
		CREATE INDEX matrix_dd_datos_gin
		  ON matrix_dd
		  USING gin
		  (datos jsonb_path_ops);
		CREATE INDEX matrix_dd_section_id_gin
		  ON matrix_dd
		  USING gin
		  ((datos #> '{section_id}'::text[]));
		CREATE INDEX matrix_dd_section_tipo_created_by_userid
		  ON matrix_dd
		  USING btree
		  (id, (datos ->> 'section_tipo'::text) COLLATE pg_catalog."default", (datos ->> 'created_by_userID'::text) COLLATE pg_catalog."default");
		CREATE INDEX matrix_dd_section_tipo_created_by_userid_2
		  ON matrix_dd
		  USING btree
		  (id, (datos #>> '{section_tipo}'::text[]) COLLATE pg_catalog."default", (datos #>> '{created_by_userID}'::text[]) COLLATE pg_catalog."default");
		CREATE INDEX matrix_dd_section_tipo_gin
		  ON matrix_dd
		  USING gin
		  ((datos #> '{section_tipo}'::text[]));		

	
	Valencia 11-11-2014 v4.0b2-72
	Config: Changed default DEDALO_DATA_LANG_DEFAULT value config. Now is the same as DEDALO_APPLICATION_LANG:
		define('DEDALO_DATA_LANG_DEFAULT', DEDALO_APPLICATION_LANG); # The same as DEDALO_APPLICATION_LANG
		

	Valencia 19-11-2014 v4.0b2-72
		Rebuilded component_autocomplete
		
	Valencia 26-12-2014 v4.0b3.16
		Fix bug with substring dato in component_text_area with multibyte chars.


	Valencia 26-12-2014 v4.0b3.16
		Added new table 'matrix_list' to DDBB
		-- POSTGRES SQL CODE -- 
		CREATE TABLE public.matrix_list
		(
		   LIKE public.matrix_dd INCLUDING CONSTRAINTS INCLUDING INDEXES
		) 
		WITH (
		  OIDS = FALSE
		)
		;
		CREATE SEQUENCE public.matrix_list_id_seq;
		ALTER TABLE matrix_list ALTER COLUMN id SET DEFAULT nextval('matrix_list_id_seq'::regclass);
		ALTER SEQUENCE matrix_list_id_seq OWNER TO current_user_XX;
		ALTER TABLE matrix_list OWNER TO current_user_XX;


	Valencia 13-01-2015 v4.0b3.18
		Changed path from 'component_tools' to 'tools'

	Valencia 20-01-2015 v4.0b3.20
		Added new table 'matrix_layout' to DDBB
		-- POSTGRES SQL CODE -- 
		CREATE TABLE public.matrix_layout
		(
		   LIKE public.matrix_dd INCLUDING CONSTRAINTS INCLUDING INDEXES
		) 
		WITH (
		  OIDS = FALSE
		);
		Added new table 'matrix_layout_dd' to DDBB
		-- POSTGRES SQL CODE -- 

			CREATE TABLE public.matrix_layout_dd
		(
		   LIKE public.matrix_dd INCLUDING CONSTRAINTS INCLUDING INDEXES
		) 
		WITH (
		  OIDS = FALSE
		);
		ALTER TABLE matrix_layout OWNER TO dedalo4;
		ALTER TABLE matrix_layout_dd OWNER TO dedalo4;

		CREATE SEQUENCE public.matrix_layout_id_seq;
		CREATE SEQUENCE public.matrix_layout_dd_id_seq;

		ALTER TABLE matrix_layout_id_seq OWNER TO dedalo4;
		ALTER TABLE matrix_layout_dd_id_seq OWNER TO dedalo4;

		ALTER TABLE matrix_layout_dd ALTER COLUMN id SET DEFAULT nextval('matrix_layout_dd_id_seq'::regclass);
		ALTER TABLE matrix_layout ALTER COLUMN id SET DEFAULT nextval('matrix_layout_id_seq'::regclass);

	Valencia 21-01-2015 v4.0b3.21
		Added config constant DEDALO_ENTITY for future filters
	
	Valencia 28-01-2015 v4.0b3.22
		Add ts_map and 'dedalo_country' concept in diffusion for standarize political and geografical divisions
		Refactorized class.diffusion.php for better manage of records and support for ts_map
		
	Valencia 02-02-2015 v4.0b3.23
		Fix bug on delete tag option (tool_indexation)
		Fix bug in inspector mode edit not sow index references (inverse resolution)

	Valencia 02-02-2015 v4.0b3.24
		Changed dedalo session vars name (to avoid versions conflicts) from 
			$_SESSION['config4'] to $_SESSION['dedalo4']['config']
			$_SESSION['auth4'] 	 to $_SESSION['dedalo4']['auth']

	Valencia 23-03-2015 v4.0b3.25
		Add tool_calendar
		Various performance improvements
		Posstgres add index
			CREATE INDEX matrix_projects_datos_idx  ON matrix_projects  USING gin (datos);
			-- IMPORTANTE !! HACER ESTE INDICE PARA ACELERAR LA TIPOLOGIA DEL MEDIA RSC (SE USA MUCHO) 
			CREATE INDEX matrix_rsc24  ON matrix  USING btree ((datos #>> '{components,rsc24,dato,lg-nolan}'::text[]) COLLATE pg_catalog."default");
			-- IMPORTANTE !! HACER ESTE INDICE PARA ACELERAR PARTICIPANTES … RSC (SE USA MUCHO) 
			CREATE INDEX matrix_rsc90 on "matrix" USING GIN ((datos #> '{components,rsc90,dato,lg-nolan}'));


	Valencia 31-03-2015 v4.0b3.26
		Fix bug on import structure. Postgres sequence now set correct values


	Valencia 02-03-2015 v4.0b3.27
		Added session cache for rows_search html (moved form elements css to section list css)


	

	Valencia 28-07-2015 v4.0 RC 4.2
		Add class dd_date to manage unsupported dates like -40000, etc.
		component_date: Date component recreated to support dates as object like {"year":-41985,"month":11,"day":15,"hour":23,"minute":54,"second":4} 
		component_date: Current date format is imcompatible with anterior format, but onload in edit mode, dato is resaved whith new format 
		component_date: 'dato' now is a dd_date object and 'value' is a dd_timestamp like '-40000-12-31 00:00:00'
		Time machine: fixed a bug that cause wrong list of values data in components of virtual sections
		Time machine: Added column 'section_tipo' in table matrix_time_machine for manage correctly components of virtual sections

	
	Valencia 11-08-2015 v4.0 RC 4.21
		Add Search operators (SQL comparison and logical operators)
		Add class operators to manage search operators
		Working here to implement all components search operators
	

	Valencia 18-08-2015 v4.0 RC 4.22
		component_text_area: fixed image tags error display in php >= 5.6.12
		text image tags: modify button img offset to adjust show with linux arial font ttf
		text image tags: modify tc image base to new small height 16px
		difussion_ts: fixed image issue with new locator format. Now image is get from value from thumbs dir
	

	Valencia 18-08-2015 v4.0 RC 4.23
		component_filter_master: fixed list value bug
	

	Valencia 22-08-2015 v4.0 RC 4.24
		search: modified section edit behaviour to enable list and search in edit mode
		lib:geoip:data : updated geoip lib data (GeoLiteCity.dat)
		lib:tinymce : updated from 4.2.3 to 4.2.4
		TODO: 	- update inspector section info on navigate in edit mode - OK
				- update right top label about current section id - OK
				- Activity: error "json_decode Message: Error Processing Request" (admin) - OK
				- tool portal : list for select record. View filtered / unfiltered don't work -OK


	Valencia 22-08-2015 v4.0 RC 4.25
		fixed bug in tool portal : list for select record. View filtered / unfiltered 
		fixed bug in component_html_text : edit 'context_name' is passed as string now instead of object
		fixed bug in tool_import_zotero : preview 'date' now work as standar dd_date format instead timestamp
		

	Valencia 04-09-2015 v4.0 RC 4.26
		Add remove development elements (dd str) in backup script for non development instalations
		lib:tinymce : updated from 4.2.4 to 4.2.5
		Changed 'section_list' to 'section_records' to unify list and edit sections manager view


	Valencia 04-09-2015 v4.0 RC 4.27
		stats: adapted to support partial results (using general search section params) and different component levels
		diffusion: support for resolve portals 'valor' 

	
	Valencia 04-09-2015 v4.0 RC 4.28
		tool_import_zotero : Fixed issue with pdf preview that call gosthscript lib and hang cpu trying build thumbs (now is dissable)


	Valencia 28-09-2015 v4.0 RC 4.29
		tool_replace_component_data : Add new tool
		interface: changed buttons styles and other cosmetic issues

	Valencia 14-10-2015 v4.0 RC 4.30
		component_common : fixed ar_list_of_values data issue when a component is changed from translatable to non translatable and viceversa		
		minor fixes for stability and view 	

	Valencia 14-10-2015 v4.0 RC 4.31
		component_common : set_dato now unset var ar_list_of_values to avoid cache when data is injected (ex. statistics)
		

	Valencia 14-10-2015 v4.0 RC 4.32
		component_autocomplete_ts : now is multivalue and deeep searchable
		component_autocomplete_ts : now is multivalue 
		
	Valencia 26-10-2015 v4.0 RC 4.33
		backup : added 'DEDALO_BACKUP_TIME_RANGE' to control the building of backup files. Default 4 hours
		
	
	Valencia 31-10-2015 v4.0 RC 4.34
		tool_import_files : added tool as alpha version
		section : added 'save_handler' concept to manage temporal data in sections (required for the new tool tool_import_files)
		config : added 'DEDALO_SECTION_ID_TEMP' to control temporal sections. Default 'tmp'
		
	
	Valencia 04-11-2015 v4.0 RC 4.35
		component_image: changed save way. Now, on save, defult quality and thumb are created allways to ensure list view consistency. 'valor_list' now is set to null when file thumb not exists, instead a defaul 0.jpg image
		search : added ignore project behaviour when section is list of values (tables matrix_list and matrix_dd) to allow all users view all lists
		backup: added control to export sequence for capture errors and stop next execution (avoid do import with bad auth conditions)
				added db_system_config_verify for test pgpass file
		
	Valencia 05-11-2015 v4.0.000
		Released current version (4.0 RC 4.35) as version 4.0 official launch

	Valencia 09-11-2015 v4.0.008		
		section: added inverse_locators concept. Opened section data property and methods to manage inverse_locators of portals
		component_portal: add inverse_locators manager
		component_portal: changed way of iterate records. Now component dato locators are iterated instead database search results. This maintain rows consistency when referenced section are deleted
		component_state: working here to update behaviour and features

	Valencia 13-11-2015 v4.0.009
		Add new state_component 
		Fixed images cache issue 

	Valencia 25-11-2015 v4.0.2
		component_portal: multiple souces support
		component_autocomplete: multiple sources support
		
	
	Valencia 12-12-2015 v4.0.2.6
		tool_posterframe: added create identifying image support
		maintanance : added maintance mode (add config var DEDALO_MAINTENANCE_MODE)
		
		
	Valencia 02-01-2016 v4.0.2.8
		tool_diffusion: added tool_diffusion to control export to mysql flow
		diffusion : added support to export thesaurus and new tool tool_diffusion. Beter memory control when process large sections / thesaurus
		
	Valencia 02-01-2016 v4.0.2.8c
		core_functions : added isSerialized function to test valid serialized data (e.g. dedalo_decryptStringArray data)
		dd_error : removed show errors options to users when not in DEBUG mode

	Valencia 13-01-2016 v4.0.2.9
		component_text_area : enable create tragments anywhere (not only in indexaxtion mode)
		dd : minor changes on related terms selection when edit

	Valencia 14-01-2016 v4.0.2.10
		tool_diffusion : opened to all users with tool auth access (not only admin)

	Valencia 18-01-2016 v4.0.2.11
		tool_portal : solved bug that enable add section locator to portal incorrectly
		component_portal : fix issue with empty columns in component_portal_list.phtml

	Valencia 19-01-2016 v4.0.2.12
		tinymce : updated to 4.3.3
		jquery : updated to 2.2.0
		component_common js : changed various jquery methods to pure javascript
		component_pdf : auto open tool_upload on empty file
		config : add optionsl contant 'DEDALO_BYPASS_FILTER' to allow skip projects filter if is needed


	Valencia 19-01-2016 v4.0.2.16
		component_input_text : for compatibility with lastest Chrome versions, changed event onchange to direct input and set readonly default state and onfocus enable write
		diffusion : minor changes and fix errors in method update_record to enable deep recursion when publish. Now recursion levels don't have limitation

	Valencia 19-01-2016 v4.0.2.17
		component_common : js load_component_by_wrapper_id restored jquery handler (pure javascript generate some problems with tool_lang for example)
		dd_init_test : add force create folders for all av / image quality (needed for recompressions of ffmpeg)

	Valencia 31-01-2016 v4.0.2.18
		component_state : fixed bug when component is reloaded in 'edit_component' mode (was disappeared from DOM)

	Valencia 01-02-2016 v4.0.2.19
		search : fixed bug in defaults of search operators when not defined operator in component (now uses defult options)
		
	Valencia 04-02-2016 v4.0.2.20
		component_image : changed thumb behaviour and show mode. No longer is used tag img (current div) Now is defined in config (DEDALO_IMAGE_THUMB_WIDTH x DEDALO_IMAGE_THUMB_WIDTH)
		class Imagemagick uses this config constants to made thumbs
		
	Valencia 04-02-2016 v4.0.2.21
		component_date : fix issue when negative big years are used
		dd_date : changed method 'get_dd_timestamp' for support non standar timestamps (negative years, etc..)

	Valencia 04-02-2016 v4.0.3
		component_profile : added support to replace user permissions data. Now users no longer have own permission. Instead, users will have profiles always (mandatory)
							utility is added for compatibility to previous mode


	/**
	* @todo
	* - Solucionar el tema de los lenguajes en componentes que no deben tener lenguaje (por ejemplo relaciones). Si cambiamos el idioma base de dedalo (DEDALO_DATA_LANG) ya no funcionarán los vínculos
	* - Listados: orden no es correcto a veces. Ejemplo http://host/dedalo/main/?&order_by=id&order_dir=DESC
	* - CSS Cambiar el funcionamiento para posibilitar grupos (ej. bloques) . Asignación directa al wrapper
	* - Valorar usar una clase para las constantes de configuración del programa, Sería más flexible (podría albergar objetos y arrays sin serializar) y más ordenado.
		Ejemplo:
		class app {
		    const MY_CONSTANT = array("a","b"); const MY_CONSTANT_OBJ = new stdClass();
		};	dump(app::MY_CONSTANT, ' MY_CONSTANT');
	*/

	
	
	# Version
	define('DEDALO_VERSION'	, '4.0.3');
	define('DEDALO_BUILD'	, '09-02-2016');
	
	/*
	# Build
	if (isset($_SESSION['dedalo4']['config']['DEDALO_BUILD'])) {
		define('DEDALO_BUILD', $_SESSION['dedalo4']['config']['DEDALO_BUILD']);
	}else{		
		$last_modification_timestamp_file = DEDALO_LIB_BASE_PATH.'/write/last_modification_timestamp.txt';
		if (file_exists($last_modification_timestamp_file)) {
			$last_modification_timestamp = file_get_contents($last_modification_timestamp_file);
		}else{
			// Reads folder (dedalo lib) recursively and get the more recently edited file date
			$last_modification_timestamp = get_last_modification_date(DEDALO_LIB_BASE_PATH,null,array('/acc/','/backups','/temp/'));
			file_put_contents($last_modification_timestamp_file, $last_modification_timestamp);
		}
		define('DEDALO_BUILD', date("d-m-Y H:i:s ", $last_modification_timestamp));
		$_SESSION['dedalo4']['config']['DEDALO_BUILD'] = DEDALO_BUILD;		
	}
	*/
	
	
?>