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
	define('DEDALO_VERSION', "4.0 RC 4.1");



	# Build
	if (isset($_SESSION['dedalo4']['config']['DEDALO_BUILD'])) {
		define('DEDALO_BUILD', $_SESSION['dedalo4']['config']['DEDALO_BUILD']);
	}else{
		// Reads folder (dedalo lib) recursively and get the more recently edited file date
		$last_modification_timestamp= get_last_modification_date(DEDALO_LIB_BASE_PATH);
		define('DEDALO_BUILD', date("d-m-Y H:i:s ", $last_modification_timestamp));
		$_SESSION['dedalo4']['config']['DEDALO_BUILD'] = DEDALO_BUILD;
	}
	
?>