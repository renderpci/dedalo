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
		Corregido un error en la selección del componente component_html_text al pinchar en el editor


	Valencia30-10-2014 v4.0b68
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
		Add ts_map and 'dedalo_country' concept in diffusion for standardize political and geographical divisions
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
		component_date: Current date format is incompatible with anterior format, but onload in edit mode, dato is re saved with new format
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
		search: modified section edit behavior to enable list and search in edit mode
		lib:geoip:data : updated geoip lib data (GeoLiteCity.dat)
		lib:tinymce : updated from 4.2.3 to 4.2.4
		TODO: 	- update inspector section info on navigate in edit mode - OK
				- update right top label about current section id - OK
				- Activity: error "json_decode Message: Error Processing Request" (admin) - OK
				- tool portal : list for select record. View filtered / unfiltered don't work -OK


	Valencia 22-08-2015 v4.0 RC 4.25
		fixed bug in tool portal : list for select record. View filtered / unfiltered
		fixed bug in component_html_text : edit 'context_name' is passed as string now instead of object
		fixed bug in tool_import_zotero : preview 'date' now work as standard dd_date format instead timestamp


	Valencia 04-09-2015 v4.0 RC 4.26
		Add remove development elements (dd str) in backup script for non development installations
		lib:tinymce : updated from 4.2.4 to 4.2.5
		Changed 'section_list' to 'section_records' to unify list and edit sections manager view


	Valencia 04-09-2015 v4.0 RC 4.27
		stats: adapted to support partial results (using general search section params) and different component levels
		diffusion: support for resolve portals 'valor'


	Valencia 04-09-2015 v4.0 RC 4.28
		tool_import_zotero : Fixed issue with pdf preview that call gosthscript lib and hang cpu trying build thumbs (now is disable)


	Valencia 28-09-2015 v4.0 RC 4.29
		tool_replace_component_data : Add new tool
		interface: changed buttons styles and other cosmetic issues


	Valencia 14-10-2015 v4.0 RC 4.30
		component_common : fixed ar_list_of_values data issue when a component is changed from translatable to non translatable and vice versa
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
		component_image: changed save way. Now, on save, default quality and thumb are created always to ensure list view consistency. 'valor_list' now is set to null when file thumb not exists, instead a defaul 0.jpg image
		search : added ignore project behavior when section is list of values (tables matrix_list and matrix_dd) to allow all users view all lists
		backup: added control to export sequence for capture errors and stop next execution (avoid do import with bad auth conditions)
				added db_system_config_verify for test pgpass file


	Valencia 05-11-2015 v4.0.000
		Released current version (4.0 RC 4.35) as version 4.0 official launch


	Valencia 09-11-2015 v4.0.008
		section: added inverse_locators concept. Opened section data property and methods to manage inverse_locators of portals
		component_portal: add inverse_locators manager
		component_portal: changed way of iterate records. Now component dato locators are iterated instead database search results. This maintain rows consistency when referenced section are deleted
		component_state: working here to update behavior and features


	Valencia 13-11-2015 v4.0.009
		Add new state_component
		Fixed images cache issue


	Valencia 25-11-2015 v4.0.2
		component_portal: multiple sources support
		component_autocomplete: multiple sources support


	Valencia 12-12-2015 v4.0.2.6
		tool_posterframe: added create identifying image support
		maintenance : added maintenance mode (add config var DEDALO_MAINTENANCE_MODE)


	Valencia 02-01-2016 v4.0.2.8
		tool_diffusion: added tool_diffusion to control export to mysql flow
		diffusion : added support to export thesaurus and new tool tool_diffusion. Better memory control when process large sections / thesaurus


	Valencia 02-01-2016 v4.0.2.8c
		core_functions : added isSerialized function to test valid serialized data (e.g. dedalo_decryptStringArray data)
		dd_error : removed show errors options to users when not in DEBUG mode


	Valencia 13-01-2016 v4.0.2.9
		component_text_area : enable create fragments anywhere (not only in indexation mode)
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
		config : add options constant 'DEDALO_BYPASS_FILTER' to allow skip projects filter if is needed


	Valencia 19-01-2016 v4.0.2.16
		component_input_text : for compatibility with lastest Chrome versions, changed event onchange to direct input and set readonly default state and onfocus enable write
		diffusion : minor changes and fix errors in method update_record to enable deep recursion when publish. Now recursion levels don't have limitation


	Valencia 19-01-2016 v4.0.2.17
		component_common : js load_component_by_wrapper_id restored jquery handler (pure javascript generate some problems with tool_lang for example)
		dd_init_test : add force create folders for all av / image quality (needed for recompressions of ffmpeg)


	Valencia 31-01-2016 v4.0.2.18
		component_state : fixed bug when component is reloaded in 'edit_component' mode (was disappeared from DOM)


	Valencia 01-02-2016 v4.0.2.19
		search : fixed bug in defaults of search operators when not defined operator in component (now uses default options)


	Valencia 04-02-2016 v4.0.2.20
		component_image : changed thumb behavior and show mode. No longer is used tag img (current div) Now is defined in config (DEDALO_IMAGE_THUMB_WIDTH x DEDALO_IMAGE_THUMB_WIDTH)
		class Imagemagick uses this config constants to made thumbs


	Valencia 04-02-2016 v4.0.2.21
		component_date : fix issue when negative big years are used
		dd_date : changed method 'get_dd_timestamp' for support non standard timestamps (negative years, etc..)


	Valencia 04-02-2016 v4.0.3
		component_profile : added support to replace user permissions data. Now users no longer have own permission. Instead, users will have profiles always (mandatory)
							utility is added for compatibility to previous mode

	Valencia 16-02-2016 v4.0.4
		component_html_text : Added tinymce button 'upload' to manage locall images via plupload lib
		av_media_player.js  : Fixed bug with timecode generator when values pases from 01:07:59 to 01:08:00 (for example), calculate wrong value like 01:07:00
		image_magick : thumb Changed to adjust to bigger side and used as div background instead image in lists


	Valencia 22-02-2016 v4.0.5
		config : Added constants for subtitles DEDALO_SUBTITLES_FOLDER, DEDALO_AV_SUBTITLES_EXTENSION


	Valencia 12-03-2016 v4.0.6
		component_av : Added subtitles track
		tool_import_bibtext : created new tool to import bibtex files (generated from Mendeley for example)
		component_text_area : Now content is reloaded on save for updated and safe visualization
		PDFjs lib updated from 1.1.1 to 1.3.91
		tinymce : updated to 4.3.4 and fixed incompatibilities
		component_common : Save: fix javascript problem on save over Chrome version <=39
		tool_export : new tool export added to generate csv files from section list results
		tool_transcription : added additional command to safe save text_area on before unload window event
		section_list : solved issue when search. Pagination is set now to offset=0 and offset_list=0 to reset pagination results on every search
		component_text_area : added support to maintain content and keep changes when browser session is closed
		tinymce : updated to 4.3.7
		component_autocomplete: fixed error that return 'valor' always with DEDALO_DATA_LANG. Now respect received var $lang (affect diffusion mainly)
		component_image : fix canvas zoom issue with retina displays
		paper : updated paper js form 0.9.20 to 0.9.25
		component_image : image vectors tool : added new big handlers and better points control


	Valencia 12-03-2016 v4.0.7
		tool_image_versions : fixed bug on delete image of every quality file, not delete 'original' not dedalo extension (like .png) file. Now all files of current quality are moved to deleted files
		tool_export : fixed bug in path name and minor visualizations fixes
		lib bootstrap : fixed improper lib calls using path with version number (tools)
		lib bootstrap : updated from 3.1.1 to 3.3.6
		config : changed order of vars to allow use 'SHOW_DEBUG' in logger class
		logger : activated again dedalo file log
		search : filter_by_inverse_locators SQL changed json operator '#>' to '->' for compatibility with PGSQL 9.4


	Valencia 12-04-2016 v4.0.8
		lock_components : added lock_components to control already in use components and avoid users overwrite data
		notifications : added /lib/dd_node server (nodejs instance) for manage notifications
		ffmpeg : added audio codec fallback. First options now is libfdk-aac and if not enabled ('--enable-libfdk-aac'), libvo_aacenc is used
		tool_transcription : fixed behavior when focus editor it was interpreted as 'isDirty' true
		tool_transcription : fixed bug in reload related component did not work in some cases
		tool_transcription : added speed slider control to video
		component_common : js select_wrap now is managed by especific components when component method exists
		component_text_area : fix bug when spellchecker is called from Chrome. Reenabled browser spellchecker in text_editor
		component_html_text : fix bug when spellchecker is called from Chrome. Reenabled browser spellchecker in text_editor


	Valencia 21-04-2016 v4.0.9
		login : added login and logout calls to remove user locked components on both process
		component_ip : added support to maxmind geoip2 (https://github.com/maxmind/GeoIP2-php/releases)
		lib : geoip2 added library
		lib : added composer installer and autoloader
		filter : fixed issue that return partial result on section users. Now cross areas (administrator <-> user) can be values 1 or 2 to be showed in users list.
		tool_transcription : added specific add-ons.
		tool_transcription : context_name 'component_av' add new options: Change av control preferences (play/pause key, auto-rewind time, insert_tag key)
		component_autocomplete_ts : now searches are case insensitive (ILIKE)
		structure.css : added functionality to customize appearance on layout of components, section_groups, sections and other structure elements.
						added less mixins and auto-compiler for easy customize and manage
		inspector : moved records navigator to inspector in edit mode
		interface : general minor style changes are made in all application
		component_password : added control to avoid autocomplete
		tool_administration : added new tool 'tool_administration' for technical administrative and debug tasks


	Valencia 06-05-2016 v4.0.10
		structure : added new model 'component_publication'
					changed all elements 'Diffusion' from model 'component_radio_button' to 'component_publication'
		component_publication : added new component to manage publication state. Current radio buttons used to set values of publication, change model to component_publication. Data is maintained
		component_portal : fixed bug where images are not showed properly in portal list mode
		config: added var DEDALO_STRUCTURE_LANG
		component_select_lang : changes data format from current string like 'lg-spa' to array like '["lg-spa"]'
								added option to link to component_text_area and override component_text_area lang
		component_info : changed propiedades widgets format from array to object with array inside
		propiedades : add control to set state of the component. E.g. 'deprecated'
		component_common_draw : add label conditional to manage state of component warnings. New «update» state for control the update data
		component_portal : Fixed issue where section list don't show images properly
		component_geolocation : fixed save data when change the map re-position or zoom
		componet_date : New control for update the data of the component
		diffusion : added behavior to skip non publicable records and delete sql records with same section_id. Now all records stored in publication database are diffusible = yes
		section : added control of publication state. New 'diffusion_info' is a first level section dato variable for store an array of objects (diffusion_element_tipo and his relevant data)
				  When any component save, clear this var to indicate that current section is outdated in diffusion data places. When is published, element_diffusiion object is stored in this array var
		resources schema : added component_publication elements to bibliography and informants
		section_group_div : added new dedalo element 'section_group_div' similar to section_group but without headers and labels, only a wrapper div to free group components
		tool_administrator: new "update.php" file with control of the updates procedures. New «delete all data of the component» that can delete all data of the component or your language.
		Schema of the DB : new «matrix_updates» table with «id», «datos», for control the update process.


	Valencia 12-05-2016 v4.0.11
		security_areas : changed format from array to object (see updates) and removed '-admin' elements. Now areas have 3 permissions value: 0,2,3 (no access, access, admin)
		security_access : changed format from array to object (see updates)
		security : solved issue when non global admin enter to users section list don't show available user records
		lock_elements : added icon 'lock' on locked components
		tool_administrator : new option 'Remove av temporals' to delete ffmpeg temporal files in av/tmp folder
		tool_administrator : new option 'Ignore temporarily the publication status when publishing' to passthru component_publication value in some necessary cases
		tool_administrator : multiple sql querys are supported now on dedalo data updates


	Valencia 23-05-2016
		component_filter : fixed bug when in global admin, projects are showed by id_matrix instead section_id
		lock_components : fixed bug when force_unlock_all_components unset all DB locked elements, instead current user only components
		search : fixed bug in order by json fields when change from list to edit view
		tool_indexation : fixed bug when not autosave text on change tag tipo
		install : solved some inconsistencies when update from install version db
		component_portal : fixed undesired behavior when portal contains component_publications is selected
		tool_import_files : fixed issue when components are selected and inspector is not available
		component_pdf : add thumb for pdf files
						fixed correct output to tool_export
		component_select : fixed correct output to tool_export
		component_text_area : solved issue when button is not showed for link tag content from tool_portal
		tool_upload : added postprocessiong create transcription when upload pdf media
		tool_portal : added edit already existing portal links to enable, for example select a fragment when link is created in one user action (bibliography, etc..)
		component_portal : fixed various issues related with refresh component in some context. Now centralized html _page page_globals engine is dedicated to manage components refresh
		html_page : added centralized control / management of page components to refresh when new windows are open by tools etc
		search : optimized 'current_edit' search . Removed count
				 added always order by section_id clause to maintain pagination consistence over list and edit modes
		tool_comom : adequate to use html_page refresh components
		config : add constant 'DEDALO_PDF_THUMB_DEFAULT' default value 'thumb' to store rendered pdf preview thumbs


	Valencia 03-06-2016
		component_text_area : fonts used for create labels (indexation, timecode, etc.) are moved from lib/fonts to lib/dedalo/themes/default/fonts for convenience
		btn labels : changed font from arial to 'liberation'
		tool_transcription : fixed issue where lang selector it is out of sync with the language of the text area when component_textarea is forced to change lang


	Valencia 04-06-2016 v4.0.12
		component_select_lang : multi and using locators (like component select)
		component_project_langs : now use array of locators (like component select)
		section : get_ar_all_project_langs modified to allow lang locators
		config : added contant 'TOPONOMY_CENTRAL_SYNC' for define central toponomy manager url
		ts : added central toponomy manager to set unique id to toponomy terms


	Bengaluru 24-06-2016
		tool_time_machine : changed behavior when empty data is saved. Now blank data is saved to time machine record too.


	Jodhpur 23-07-2016
		tool_export : fixed output inconsistencies on export component_filter and component_filter_master
		lib : tinymce : updated from 4.3.12 to 4.4.0
		lib : jquery : jquery-ui : updated from 1.11.4 to 1.12


	Pushkar 26-07-2016
		tool_difussion : add window scroll top on publish record
		tool_image_versions : fixed loosed section_tipo var on trigger when rotate image


	Manali 06-08-2016
		search : javascript coode conversions from jquey to pure javascript and optimized record navigation


	Benimamet 17-08-2016
		lib/json_editor : updated version from 5.1.5 to 5.5.6


	Benimamet 22-08-2016
		component_autocomplete_ts : implemented thesaurus source modes (defined in 'propiedades'). Current defined modes: 'jer_tipo' and 'childrens_of'


	Benimamet 23-08-2016
		dd_date : implemented date_modes to save dates, ranges and periods
		component_date : allow manage ranges, periods and dates
		component_common:Save : changed main source vars (tipo, parent, section_tipo, etc.) from component dataset to wrapper dataset


	Benimamet 28-08-2016
		locator : Add property 'type' to object locator
		hierarchy : Added new hierarchy element to control new thesaurus model
		json_handler : fixed bug when encoded result 0 was generated an error.


	Benimamet 01-09-2016
		component_relation_common : created new class for manage common logic of relation components
		component_relation_model : created new component to manage thesaurus model relations (extends component_relation_common)
		component_relation_parent : created new component to manage thesaurus parent relations (extends component_relation_common)


	Benimamet 03-09-2016
		section : unified valor_list html source in method get_valor_list_html_to_save()
		backup:init_backup_secuence : Added control to skip time range control
		dd_date : fix bug when calculated reference time in seconds modify received dd_object subtracting 1 int to days and months
		dd_date : moved class file from component_date dir to common (another elements but components are using this class now)
		activity : changed column id. Now section_id is showed instead matrix id
				   modified matrix_activity table indexes to optimize ordination (added to updates file 4.0.14 to 4.1.0)
		search : performance : modified order_by when section activity is used. No longer adds "order by section_id" at end of query
		common : added get_main_lang method (gets the info from config)
		component_input_text : now supports main_lang fallback on list mode
		component_text_area : now supports main_lang fallback on list mode
		component_relation_common : added get_main_lang method (gets the info from hierarchy section data)
		component_relation_parent : now supports main_lang fallback on list mode
		component_relation_model : now supports main_lang fallback on list mode
		tool_administration : update_version now make a forced full backup of the database before update data


	Ruzafa 03-09-2016
		common : 'thesaurus' main_lang. Added get_main_lang option to calculate main_lang from hierarchy when is 'thesaurus' section
		tool_administration : before update section, build thesaurus section to avoid loose secction_tipo resolution when called later
		component_relation_related : created new component to manage thesaurus terms relations (extends component_relation_common)


	Ruzafa 07-09-2016
		section : added experimental var $_SESSION['dedalo4']['section_config'][$this->tipo]['list_line'] to control list column ID type


	Ruzafa 09-09-2016
		config : DEDALO_AR_EXCLUDE_COMPONENTS . Added constant de set array of components to hide in sections, etc.
				 Removed action occurs in:	class.component_layout.php,
				 							record.php,
				 							class.records_search.php,
				 							class.component_portal.php,
				 							class:component_security_access.php
		component_autocomplete_ts : added source type 'tree' to add terms directly from thesaurus


	Benimamet 15-09-2016 v4.0.15.a
		component_autocomplete_ts : fixed bug when search only uses descriptors elements with parent like 'prefix1'. Now prefix is calculated always to avoid this
									(desirable value to filter is 'prefix' without number)


	Ruzafa 20-09-2016 v4.0.15.g
		lib tinymce : version updated from 4.4.0 to 4.4.3
		component_security_access : changed to save only one section at once. Control of minimum php config max_input_vars was set (>1000 please)
		component_security_areas  : changed to save without propagation to component_security_access dato (multiple issues were detected with propagation)


	Ruzafa 21-09-2016 v4.0.15.h
		backup : structure import and export methods are review to not use 'id' and avoid conflicts on import
				 unified db calls as pgsl daemon commands


	Benimamet 25-09-2016 v4.0.15.hd
		locator : added property 'from_component_tipo' for set source component tipo
		component_relation_common : changed to manage section 'relations' container as dato of components that extends this class


	Benimamet 28-09-2016 v4.0.15.hf
		area : solved bug on error is triggered on installations where not defined new 'area_thesaurus' model


	Benimamet 29-09-2016 v4.0.15.hl
		component_portal : add target_section permissions control on portal buttons (add element to portal, remove element from portal)


	Benimamet 30-09-2016 v4.0.15.hq
		component_date : add mode 'time' to manage times in hours, minutes and seconds like 15:23:12


	Benimamet 04-09-2016 v4.0.15.ia
		search : fixed bug when search in virtual sections (erroneous section_real_tipo var is changed to section_tipo)


	Benimamet 06-09-2016 v4.0.15.id
		component_portal : added view 'Mosaic'
		component_autocomplete_ts : added option to hide resolved parents in value (set propiedades->value_with_parents: false)


	Benimamet 06-09-2016 v4.0.15.id
		component_portal : added view 'Mosaic'
		component_autocomplete_ts : added option to hide resolved parents in value (set propiedades->value_with_parents: false)


	Benimamet 11-10-2016 v4.0.15.ja
		component_security_access : fixed issue when buttons in virtual sections are no showed
		tool_import_dedalo_csv : added tool to import csv files (with dedalo special format:
			- section_tipo is file base name like dd21 on file dd21.csv
			- first line columns are components_tipo to import
			- column section_id is optional (if exists, force to use defined values)
			- portals and other reference type dato components value are always as array of locators like [{"section_tipo":"dd21","section_id":"1",etc..}]

	Valencia 13-10-2016 v4.0.15.jd
		tool_upload : fixed issue when browser is locked until ffmpeg ends the media transcode
		component_date : fixed bug when order not work in search list
		component_common : added method to control order_by param in search orders


	Valencia 19-10-2016 v4.0.15.k0
		component_autocomplete_hi : created new model and component for use with new dedalo thesaurus v4
		component_publication : fixed issue when in portal, values was overwritten in some cases (two o more portals with same component publication)


	Valencia 20-10-2016 v4.0.15.kb
		section : created new structure section element named 'section_map' to maping section components to different uses
				  for example: define what component is used as 'term' by thesaurus and hierarchies


	Valencia 23-10-2016 v4.5.0.a
		hierarchy : added matrix table 'matrix_langs' and imported all thesaurus v3 langs data.
		component_select_lang : now resolve with new lang data v4
		lang : added class to manage lang needs
		hierarchy : modified to contemplate import thesaurus v3 exceptions (code and model basically)
		tool_portal : fixed bug when a link is replaced. Now, when user select a record to edit in portal edit and selects a different link (another tag for example), old locator is replaced by new locator in portal


	Valencia 25-10-2016 v4.5.0.b
		component_autocomplete : minor js/css fixes when is showed in portal list
		tool_import_dedalo_csv : added multi language support for 'traducible' components (use JSON format in value like {"lg-eng":"My value","lg-spa":"Mi valor"})
		section : unified get_ar_all_project_langs with common:get_ar_all_langs
		component_select_lang : fix some issues using new dedalo thesaurus v4 lang


	Valencia 27-10-2016 v4.5.0.bc
		lang : fixed issue when update Dedalo version < 4.5
		hierarchy : add support for resolve langs when import previous version of Dédalo data (<4.5)
		component_children : add support to 'target_section' when in hierarchy section
		tool-administrator : fixed bug in ajax error response. Now is returned text instead object
		section : fixed bug on get section real tipo using common::get_relaciones(). Now common::get_ar_related_by_model() is used always
		common : get_relaciones is deprecated. Use common::get_ar_related_by_model() instead


	Valencia 28-10-2016 v4.5.0.bd
		general performance and optimization tasks


	Valencia 31-10-2016 v4.5.0.bd
		menu : added thesaurus v4 menu links (reads from structure)


	Valencia 02-11-2016 v4.5.0.bj
		ImageMagick class : added control of preview image layers (tifs) and skip in conversions
		tool_image_versions : added option to re-convert 'original' quality from original file (tif, psd, etc..)


	Valencia 05-11-2016 v4.5.0.bk
		ImageMagick class : fixed issue when conform headers is done only with fast start. Now copy and later fast start is maked on conform
		css : no longer browser cache structure.css file when in debug mode


	Valencia 07-11-2016 v4.5.0.bl
		counter : optimized class
		diffusion_sql : fixed some minor issues when publish data
		diffusion_mysql : removed is publicable verification. No longer necessary because previous verification is made


	Valencia 12-11-2016 v4.5.0.bo
		component_image : fixed bug when in time machine mode images with custom path (like '/0') are no found
		search : load_rows : fixed bug when in time machine list, paginator don't use the correct container for load records
		widgets : descriptors : Rebuilded to load by ajax on demand instead load always in lists (performance problem)


	Valencia 15-11-2016 v4.5.0.bp
		component_state : fixed permissions issue on 'validation' selector when not was shown to admin general and area/section administrators
		component_text_area : changed data showed in list mode. Now, if exists related component_select_lang, original lang is used always in lists
							  Now value list is always calculated from original lang
		component_info : widget tags : now data showed is synchronized with component_text_area lang (original lang when exists)


	Valencia 17-11-2016 v4.5.0.bs
		tool_transcription : fixed issue when text area forced lang is not updated in video subtitles track lang. Now, on load component_text_area
							 video subtitles track is forced to sync with component_text_area lang.
							 Besides, when changes source lang selector, this action force updates subtitles track sync
		tool_time_machine  : Added lang selector to switch historic lang source in tool window


	Valencia 23-11-2016 v4.5.0.bv2
		component_relation_children : moved some common methods to component_relation_common (__construct,set_dato)
									  class var 'relation_tipo' changes to 'relation_type'
		component_relation_related : changed html and class to manage related terms like component_relation_childrens


	Valencia 24-11-2016 v4.5.0.bv4
		component_html_text : fixed bug when reload component don´t init text editor
		ffmpeg : fixed issue when detect audio codec libvo-aacenc fails


	Valencia 24-11-2016 v4.5.0.bx5
		dd_date : added method convert_seconds_to_period


	Valencia 21-12-2016 v4.5.0.cd4
		tool_import_dedalo_csv : Sorted ar_csv_data by column 0 (section_id) before data is processed
		button_delete : Added pre and post js actions of delete method configurable in structure


	Valencia 07-01-2017 v4.5.1.aa8
		tinymce : Updated text editor version from 4.4 to 4.5.2


	Valencia 14-01-2017 v4.5.1.c6
		tool_import_marc21 : Added new tool for import bibliography data in marc21 format
		tool_common : added dedalo_upload js lib (used by tool_import_marc21)
		component_filter : get_ar_projects_for_current_section : Optimized for large projects table (Now is a only one database call instead one for each project)


	Valencia 16-01-2017 v4.5.1.c8
		component_input_text : fixed issue when search exact (Now 'dato' is array and need jsonb array search operators)
							   fixed issue with double and single quotes broken input viewed value
		component_select : fixed issue with select wrap component blur on every select action


	Valencia 17-01-2017 v4.5.1.c10
		common : notify_load_lib_element_tipo : Changed to manage only model names (and not model tipos)
		search : fixed issue when portal search is not defined
				 optimized sub search querys on portals


	Valencia 18-01-2017 v4.5.1.c12
		component_autocomplete_hi : fixed bug on search not send properly component name
		diffusion_section_stats : fixed bug when component_select_lang values are computed to generate stats (value now is locator instead lang code)


	Valencia 25-01-2017 v4.5.1.c16
		component_inverse : Created new component 'component_inverse' to manage inverse locators view and search
		tool_export : Removed fixed column 'section_id' in standard export mode


	Valencia 26-01-2017 v4.5.1.c17
		tool_common : added custom_arguments param to url request (from 'propiedades')
		tool_import_files : changed to use temp section data from main section when in 'section' mode instead from portal target section tipo
							trigger now works in json mode (Content-Type: application/json')
		component_portal : changed controller to calculate always the filter_by_locator data from component dato instead from session stored search options (avoid inconsistencies when import images)
		section : Save : section_temp_data is now managed as pure json object to avoid problems with session serialize / unserialize objects and classes


	Valencia 26-01-2017 v4.5.1.c18
		tool_import_files : fix issue with components permissions showed in temp section are wrong


	Valencia 02-02-2017 v4.5.1.c23
		component_portal : get_valor_export Fixed issue when empty values generate double tabs and spaces


	Valencia 03-02-2017 v4.5.1.c25
		tool_portal : fixed bug when link row to portal don't send the correct parent after to do a search in tool_portal window


	Valencia 06-02-2017 v4.5.1.c26
		diffusion_sql : get_ts_columns : added 'geolocalizacion' column for publication


	Valencia 09-02-2017 v4.5.1.c27
		component_inverse : added link option to jump to refered record


	Valencia 11-02-2017 v4.5.1.c27
		component_geolocation : added default option to render points in edit mode
		leaflet : Updated from 0.7.7 to 1.0.3
		leaflet-draw : Updated from 0.2.4 to 0.4.9
		tinymce : Updated from 4.0.2 to 4.0.3
		component_common_draw : added html_delimiter builder


	Valencia 15-02-2017 v4.5.1.df
		common : get_main_lang : fixed bug when main_lang returned is erroneous when section is not children of thesaurus


	Valencia 20-02-2017 v4.5.1.eg9
		tool_portal : fixed issue when add_relation (fragment) don't work on some context
		tool_portal : fixed button sho_all / show_filtered issue.
		rows : fixed issue when on paginated records not work the delete button


	Valencia 02-03-2017 v4.5.1.ei16
		search : added option to search into the same component of different portals


	Valencia 05-03-2017 v4.5.1.ei17
		tool_layout_print : fixed error when current section is not found in search available templates


	Valencia 05-03-2017 v4.5.2a1
		index : begin extended tag index to new format with data and label


	Valencia 07-03-2017 v4.5.2a4
		subtitles : standardize as share static library usable by public websites
		TR : standardize as share static library usable by public websites
		OptimizeTC : standardize as share static library usable by public websites
		web_data : (api_dedalo_web) standardize as share static library usable by public websites


	Valencia 09-03-2017 v4.5.2a5
		subtitles : fixed incorrect call to tool_subtitles


	Valencia 11-03-2017 v4.5.2a9
		hierarchy : rows_jer_to_matrix_json : fixed erroneous call to removed component 'order' (hierarchy42) in import thesaurus


	Valencia 22-03-2017 v4.6.0j
		component_text_area : build_tag_person fix bug that send unsafe data to tag


	Valencia 23-03-2017 v4.6.0k
		tool_lang : fixed bug when new tags are not preserved on appertium translation process


	Valencia 24-03-2017 v4.6.0m
		dd_date : fixed issue where search value is not properly calculated
		component_relation_parent : removed default tools for component because this component is always a computed value
									fixed bug when infinite recursion occurs. To prevent infinite loop, a new control is added


	Valencia 27-03-2017 v4.6.0n
		area_thesaurus : fixed issue when tool_av_versons js is not included when controller builds his html
		tool_upload : Added option to store original file name in a component of current section


	Valencia 28-03-2017 v4.6.0p
		component_text_area : added notes state a/b : 'private/public' -orange/green-
		component_publication : adapted to support notes (+ mode 'edit_note') and auto sync current note tag state on change (js component_publication.change_tag_state)


	Valencia 28-03-2017 v4.6.0u
		component_autocomplete : changed way of work


	Valencia 26-04-2017 v4.6.1
		component_text_area : updated text editor tinyMCE from 453 to 457


	Valencia 28-04-2017 v4.6.1hc
		tool_transcription : fixed bug on unload page when no refresh opener window properly
		tool_indexation : fixed bug on unload page when no refresh opener window properly
		search.js : reload_rows_list : Fixed bug on jquery selection


	Valencia 28-04-2017 v4.6.1hc
		component_autocomplete : fixed bug when multiple input text elements save the same value on create new record


	Valencia 08-05-2017 v4.6.1hi7
		login : fixed bug on clean install when database data version is < 4.0.22
		config4 : added constant ENCRYPTION_MODE to define current encryption mode


	Berlin 10-05-2017 v4.6.1hi8
		component_text_area : get_fragment_text_from_rel_locator : fixed bug on switch tag type is erroneous and time codes are not calculated properly


	Valencia 16-05-2017 4.6.1hj12
		config : added new constant SHOW_DEVELOPER to control especial debug info showed to developers
		login : added new method to control when user is developer
		component_radiobutton : add forced read only mode when user is not dedalo superuser (root)


	Valencia 31-05-2017 4.6.2a9
		component_text_area : create_new_note : Fixed issue where selected text is replaced with new note. Now, selection is collapsed and note is placed at end of selection
		component_portal : Changed to enable limit viewed records and use "Show more items" link action
		tool_lang : Fixed issue where copy to target lang not set editor as "Dirty" and then don't save. Now component save on copy content from source
		are_thesaurus : search : fixed wrong filter sql code. Now correct f_unaccent is used instead unaccent to obtain gain of index
		tool_av_versions : Added new behavior: on download, use original filename if exists


	Valencia 31-05-2017 4.6.2b1
		component_portal : Fixed issues on drag between portals (jquery reverse order event remove / )


	Valencia 15-06-2017 4.6.2c2
		tool_export : Fixed issue with csv separator ";" . Now is converted to unicode value: U+003B when in raw mode
		tool_import : Now decode unicode U+003B to ; to rebuild correctly the values after export


	Valencia 21-06-2017 4.6.2c4
		fixed issues with js 'let' in non strict mode libs


	Valencia 22-06-2017 4.6.2c5
		filter : fixed issue where user can view records of projects that this user don't have actually. Now only in case that record don't have project, user that was created can view it


	Valencia 22-06-2017 4.6.2c5
		filter : fixed issue where new filter (projects) fails in postgresql <= 9.4 on detect null value in jsonb
		tool_export : fixed issue that shows column titles always in Spanish. Now uses DEDALO_DATA_LANG to render column titles


	Valencia 29-06-2017 4.6.2c7
		tool_didffusion : fixed bug that return wrong value when multiple publication elements are defined
		component_portal::get_diffusion_value : fixed bug that not return the correct value when diffusion field propiedades->data_to_be_used = "valor" is requested
												Now, portal calculate by default the 'valor_list' instead 'valor' for work with input_text array data


	Valencia 30-06-2017 4.6.2c7cd
		component_text_area : added tiny editor control to avoid users can insert reserved chars: <> mapped to []


	Valencia 30-06-2017 4.6.2c8
		component_portal : fixed issue when read very old data as string. Now, wen portal detect string dato, emit a warning and saves empty array value instead


	Valencia 10-07-2017 4.6.2d1
		component_relation_related : configurated to allow relations with all thesaurus terms instead only same section
		component_text_area : updated tinyMCE editor version from 4.5.7 to 4.6.4 . This version allow replace "reference" tags content without delete the reference tags (use Alt click to select reference content text)


	Valencia 11-07-2017 4.6.2d3
		component_common : Added var $update_diffusion_info_propagate_changes to define when the save process of a component set callers (inverse locators) as publication outdated
						   When in edit mode is true, else is false


	Valencia 12-07-2017 4.6.2d4
		component_reference_common : Fixed bug when empty arrays are not included in subquery results.
		tool_import_dedalo_csv : Added Delete file option in each file row
		component_relation_parent : get_parents : Fixed bug when parents are from hierarchy (hierarchy1) instead self thesaurus section (ex. ts1)


	Valencia 13-07-2017 4.6.2d5
		tool_replace_component_data : Changed dialog from jquery ui to bootstrap dialog
									  Fixed issue when on replace data, search params session are loosed


	Valencia 20-07-2017 4.6.2d8
		records_search : fixed bug in processes tool sections that incorrectly mix processes in list results
		area_thesaurus : search_thesaurus : Added selector to filter search by hierarchy
		component_av : add info video for all users (not only debug mode)


	Valencia 20-07-2017 4.6.2d9
		ts_object : added permissions control to hide "New" and "Delete" buttons in the tree view


	Valencia 24-07-2017 4.6.2d10
		tool_structuration : trigger.tool_structuration : remove_index : Removed mandatory check to field "name" (translations issue)


	Valencia 25-07-2017 4.6.2d11
		component_relation_parent : get_parents_recursive : Fixed bug when a term parent is bad configured provokes infinite loop


	Valencia 27-07-2017 4.6.2d12
		diffusion_sql : fix bug when tables alias records are not deleted on unpublish


	Valencia 13-08-2017 4.6.3a1
		TR : fix bug when various tag are placed continuous. On save, this contiguous tags was mixed in only one (geo tag for example)


	Valencia 31-08-2017 4.7.0a8
		component_text_area : updated tinyMCE editor version from 4.6.4 to 4.6.5
		component_text_area : created a second editor (switable) "text_preview"
		tool_lang : Added option to edit and translate the chapter headings
		component_common : refactorized all to manage all request as json request
		triggers : refactorized all to use json request
		tool_structuration : refactorized all
		components DDBB dato container: added "dataframe" to allocate metadata of component value like certainty, time, space, etc.
		dataframe : created dataframe tool to manage the dataframe info inside each component
		tool_transcription, tool_structuration, tool_indexation, tool_lang : refactorized to send and receive notifications of value change and update self data
		tool_lang_multi : added net tool to fast and easy translate content of components
		various : refactorized many js and php files to use json request instead get / post request
		many, many details and fixes are made


	Valencia 05-08-2017 4.7.0b17
		section : fixed bug when component_relation_common set a empty value (from time machine->assign_vale or ts_object->order, for example) now all locators of type requested are removed correctly
		ts_object : save_order : fixed js function error that selects all deep wrap_ts_object bellow before sort. Now only first level children are selected to sort


	Valencia 09-08-2017 4.7.0b36
		tool_import_dedalo_csv : fixed issue with upload js library that stops on
		backup : import_structure : Added optional download and update from a remote server (master)
		Config : added constants:
		# REMOTE_STRUCTURE_SERVER_CODE
			define('STRUCTURE_FROM_SERVER'		, true);
			define('STRUCTURE_SERVER_CODE'		, 'XXXXXXX');
			define('STRUCTURE_SERVER_URL'		, 'http://myserver.com/my_path_to_manager/');
			define('STRUCTURE_DOWNLOAD_DIR'		, DEDALO_LIB_BASE_PATH . '/backup/backups_structure/srt_download');


	Valencia 11-09-2017 4.7.0b40
		component_html_text : fixed bug on search . Input name now is normative and search is enable again


	Valencia 12-09-2017 4.7.0bc1
		component_portal : fixed bug on load more items don't activate component scripts


	Valencia 29-09-2017 4.7.0bc3
		component_text_area : fixed bug on load structuration info from tool lang. Undefined trigger vars are fixed
		tool_posterframe ; fix issue on generate identify image


	Valencia 04-10-2017 4.7.1
		main : fixed security issue of requested vars (tipo and id) to avoid sql injection attacks


	Valencia 08-10-2017 4.7.0d2
		area_thesaurus : added toggle show/hide tipology option in tree view
		tool_image_versions : changed to bootstrap dialog from jquery ui dialog
		tool_av_versions : changed to bootstrap dialog from jquery ui dialog
		tool_posterframe : changed to bootstrap dialog from jquery ui dialog


	Valencia 08-10-2017 4.7.0c1
		diffusion_sql : update_ts_term : Limit recursion to maximun to avoid infinite loops. Default recursions: 2


	Valencia 11-10-2017 4.7.0c3
		component_portal : fixed permissions bug when user can remove resources from portal without valid permissions in target section delete button


	Valencia 16-10-2017 4.7.0c4
		backup : fixed permissions issue when download structure


	Valencia 21-10-2017 4.7.1a1
		component_reference_common : added postgrsql function for compatibility with postgresql 10 (Please update dedalo to version >=471)


	Valencia 02-11-2017 4.7.1a12
		diffusion_sql : added map_locator_to_terminoID_parent method to update parent on publish term (useful in web thesaurus applications)


	Valencia 02-11-2017 4.7.1a14
		section_records : added debug info. JSON visualization of actual search options


	Valencia 06-11-2017 4.7.1a18
		section : removed method add_relations. Now, relations are added individually
		component_relation_common : set_dato now is compatible with new relation type 'link' for future portals and autocompletes
		component_relation_autocomplete : added transition component for replacement of actual component_autocomplete


	Valencia 26-11-2017 4.8.1b
		section : unified save_component_dato. Now all (direct and relation) components save using this method
		component_relation_common : changed the component data manager to converge with standard components
		tool_portal : js : fixed bug when section_id is parsed as int (incompatible with temp section_id)
		tool_common : propagate_temp_section_data : added relation components propagate dato loosed feature
		trigger.import_files : updated component_portal add new element method for compatibility with version >=4.8


	Valencia 27-11-2018 4.8.1t
		component_relation_common : created new dedalo components dir 'component_relation_common' to organize all relation common code


	Valencia 13-01-2018 4.8.1x
		js : added/review get_dato method for ALL components. Fixed small code issues


	Valencia 16-01-2018 4.8.1z
		diffusion_sql : split_date_range . added function to select/split date ranges to sql columns


	Valencia 21-01-2018 4.8.1ab4
		component_image : fixed issues with canvas resize and view (argggg...)
		paper js : updated library from 0.9.9 to 0.11.5


	Valencia 22-01-2018 4.8.1ab5
		tool_import_files : Added new options:
			Import file name mode (to process smart numbered images)
			Image processor selector (to trigger predefined in 'propiedades' scripts and commands)
			Target component (to select different target components from importer)


	Valencia 25-01-2018 4.8.1ab9
		component_number : 	set js validator / formatter to force always . instead ,
							php controller to format float numbers with . instead , when print


	Valencia 27-01-2018 4.8.1b
		inverse_locators : 	review all classes to unify new inverse locator format (using from_component_tipo, from_section_tipo, from_section_id)


	Valencia 05-02-2018 4.8.1g
		component_text_area : added method fix_broken_peson_tags to fix untranslated person info
		component_common : added script to all components (at end of component html) that load js and css files if not already loaded


	Valencia 07-02-2018 4.8.1h
		search2 : fixed minor issues and added new features in alpha mode for test


	Valencia 01-03-2018 4.8.3c3
		section_records : added init with css / js files to load options


	Valencia 02-03-2018 4.8.3c9
		component_relation_related : Fix autosearch feature. (Set search_query_object as allow_sub_select_by_id=false to avoid use id's window query)


	Valencia 05-03-2018 4.8.3c11
		component_relation_parent : Fix import issue. Now component Save do not try to save data anymore (component dato is always calculated)


	Valencia 08-03-2018 4.8.3c15
		component_date : Fixed issue on js convert_date_to_seconds that calculate seconds wrongly when year is negative
		tool_import_zotero : Fixed error on import when set component_autocomplete dato is made it
		component_geolocation : Fixed init problem that unable load related component_text_area tags be rendered on ajax paginate


	Valencia 09-03-2018 4.8.3c16
		tool_import_zotero : Updated for use modern trigger format. Fixed old format issues with component_autocomplete.


	Valencia 26-03-2018 4.8.3c20
		search2 : Added operators to relationable components (radio_button, select, etc.)


	Valencia 28-03-2018 4.8.4
		search2 : Fix minor issues with search mode in various components and search operator additions


	Valencia 01-04-2018 4.9.0
		component_filter, component_filter_master : Change format dato to standard locator
		tool_ts_print : Created neew tool to easy print thesaurus


	Valencia 25-04-2018 4.9.0f
		search2 : fixed issue when autocomplete operator is used in search (generates json decode error)


	Valencia 27-04-2018 4.9.0g
		tool_replace : fixed issue when dato to replace is 0 (component_number cases)


	Valencia 30-04-2018 4.9.0h
		tool_export : fixed error on export raw data relation common components


	Valencia 01-05-2018 4.9.0l
		diffusion_sql : build_data_field : fixed error on fallback lang
		component_text_area : fixed bug when tinymce insert '<br data-mce-bogus="1">' on empty values !


	Valencia 02-05-2018 4.9.0n
		component_autocomplete : get_valor_export : fixed error on get export value when recived var '$valor' is empty instead null


	Valencia 11-05-2018 4.9.0q
		backup class : fixed curl issue when download structure from https servers (master)


	Valencia 12-05-2018 4.9.0r
		config : updated outdated sample config files
		session : fixed minor issues when multiple dedalo servers are in the same domain


	Valencia 14-05-2018 4.9.0s
		component_date : fix issue when empty date is not removed from search object
		search_development2 : fixed bug when Limit and Offset was made inside search window instead for global result


	Valencia 15-05-2018 4.9.0t
		component_autocomplete_hi : fix bug add_hierarchy_sections_from_types when more than one hierarchy_types is received


	Valencia 16-05-2018 4.9.0t
		search_development2 : fixed bug when order is not default in subquery window


	Valencia 23-05-2018 4.9.1
		component_autocomplete_hi : added option to search unique values (distinct)
		component_autocomplete_hi : changed to use standard search_query_object to build searches (allow operators, etc.)
		search-development2 	  : changed sql query builder for better group results in subquery


	Valencia 28-05-2018 4.9.1a
		service_autocomplete : new agnostic service for create autocomplete options in any component (only usable in autocomplete_hi for now)
		component_autocomplete_hi : fix minor issues on search mode (css, js)
		component_autocomplete : added "search_list_add" option in propiedades for clarify ambiguous results. Allow add view only (not in search) elements to result


	Valencia 31-05-2018 4.9.1c
		updates : reference_dato_v47_to_relation_dato_v48 : convert_reference_dato_to_relation_dato : Fixed bug that ignores ds and dataframe when convert data from 4.7.1 to 4.8.0
		component_common : save js : Add fallback for get tipo, parent, section_tipo, ans lang vars from wrapper when not present in the received component


	Valencia 02-06-2018 4.9.5
		search : optimized subquery and projects filter (using relations table)


	Valencia 05-06-2018 4.9.5d
		component_filter : fixed bug that cause component_filter_master was set default value when is called in edit mode (because extends component_filter)


	Valencia 13-06-2018 4.9.5f
		component_portal : fixed bug on create new record from portal in paginated portals
		component_portal : fixed pagination issues
		component_portal : fixed bug on drag portal element between different connected portals (and optimized drag and drop)
		component_relation_common : set_dato_external : changed calculation way to table relations for speed (x number of locators in new_dato is fast aprox. because 'OR' problem in indexes)


	Helsinki 29-06-2018 4.9.5g
		class.ts_term.php : added optional scope_note as var/column


	Valencia 02-07-2018 4.9.5h
		class.Ffmpeg.php : build_fragment : Fixed issue with duration format. Converted from float to string tc for safe ffmpeg command execution in all environments


	Valencia 04-07-2018 4.9.5j
		class.search_development2.php : added var $sql_query_order_window_subselect for custom order in window sub-select query when DISCTINCT is applied
		class.component_autocomplete_hi.js : link_term : fixed bug with new add_locator arguments. Updated format for unify


	Valencia 05-07-2018 4.9.5k
		trigger.tool_diffusion.php : added try catch option to capture errors on db calls
		class.DBi.php : _getConnection_mysql : added throw new Exception when connection / query fail on mysql query
		class.diffsusion_sql.php : split_date_range : added option to format regular dates to (not only ranges)
		class.autocomplete_hi : get_diffusion_value : added comma separator on multiple results
		section_list.phtml : removed old portal button 'show_all' (use default search option instead)
		class.diffusion_mysql.php : added table fields verification on save data to avoid save non-existent columns


	Valencia 09-07-2018 4.9.5n
		search_development2 : fixed issue with window subquery when search multiple sections


	Valencia 10-07-2018 4.9.5o
		component_common : get_search_query2 : added query_object q_split option to control split literals
		component_autocomplete_hi : autocomplete_hi_search : added q_split (with default value as false) to avoid split literal names like 'l'atmella del mar'


	Valencia 13-07-2018 4.9.6
		search_development2 : fixed issue with window subquery order in autocomplete searches
		all components : added and review unified edit mode render html init in javascript
						 minor js ecma6 code unifications
		component_check_box : fixed issue when is not available js class in new records when in dataframe mode (uncertainly)
		inspector : changed div to static mode and remove js for maintain vertical position
		tool_indexation : delete_tag : fixed bug when delete tag whit indexations not delete indexation locator


	Valencia 18-07-2018 4.9.6a
		component_autocomplete : added q_split (with default value as true) to control split literal names like 'els catalans als camps nazis'
		component_autocomplete : rebuild_search_query_object : js : added q_split
		service-autocomplete : convert_data_to_label_value : added sort terms in result list
		search_development2 : fixed bug in activity section when search window is not set to desc order by default
		button_new : fixed issue when section search_query_object (full_count) is not updated when a new record is created
		button_delete : fixed issue when section search_query_object (full_count) is not updated when a record is deleted


	Valencia 19-07-2018 4.9.6c
		component_relation_parent : unified js code to allow future search mode (work in progress)


	Valencia 20-07-2018 4.9.6d
		component_relation_parent : added search mode and allow to use normally in filter components


	Valencia 23-07-2018 4.9.7
		dedalo : cleaned some unused and unsafe legacy code (old thesaurus mainly)


	Valencia 24-07-2018 4.9.7c
		class.diffusion_sql_php : map_parent_to_norder : fix issue with parent locator component tipo getter
		core_fumtions : safe_xss : add security rules
		service_autocomplete : fix on_source problem when propiedades custon filter is not defined
		component_text_area.js : preprocess_text_to_save : fixed bug that break timecode tags


	Valencia 25-07-2018 4.9.8a
		various : fixed vulnerabilities in Dédalo code
		files : re-order and remove old files and folders (old thesaurus and related)


	Valencia 29-07-2018 4.9.8e
		Login : fixed password issue with some chars on safe_xss check


	Valencia 12-08-2018 4.9.9
		component_relation_children : enable different sources (sections) defined in structure
		component_relation_parent : enable different sources (sections) from defined component_relation_children sources


	Valencia 17-08-2018 4.9.9c
		component_autocomplete : Unified using service autocomple
		component_autocomplete_hi : Unified using service autocomple


	Valencia 18-08-2018 4.9.11
		unified service autocomplete for all components


	Valencia 29-09-2018 4.9.12
		component_geolocation : re-add interaction between map position/zoom and input fields to enable write numeric values interactively
		component_image : re-enable paper.js lib version 0.9 because compatibility problems found with version >=0.10


	Valencia 29-10-2018 4.9.12
		tool_diffusion : added auto-publish publication_schema on edit structure diffusion element


	Valencia 02-11-2018 4.9.14
		component_state : removed NVD3_URL_CSS link because conflict with component geolocation polygon lines css (Intangible Heritage)


	Valencia 05-11-2018 5.0.0
		Updated version from 4 to 5


	Valencia 06-11-2018 5.0.1
		component_pdf : updated pdfjs lib to 2.0.943
						added full screen mode


	Valencia 07-12-2018 5.0.23
		search_development2 : Fixed bug on search_development2 that skip filter_by_user_records in some scenarios


	Valencia 12-12-2018 5.0.27
		tool_layout_print : Reenabled search using search_query_object


	Valencia 12-12-2018 5.0.29
		diffusion_stats : Reenabled diffusion_stats using search_query_object (Working here)


	Valencia 14-12-2018 5.0.32
		diffusion_stats : Fixed issues and optimization works (Working here)


	Valencia 15-12-2018 5.0.33
		diffusion_stats : Fixed stats portal resolution in activity (Working here)


	Valencia 17-12-2018 5.0.35
		component_input_text : Fixed error when search empty values on non translatable components (DEDALO_DATA_NOLAN)


	Valencia 24-12-2018 5.0.36
		tool_import_dedalo_csv : Fix bug in import_dedalo_csv_file when numbers are wrong json decoded as float


	Valencia 29-12-2018 5.1.0
		section : Added created and modified info about section in components / relations container to allow search with them


	Valencia 06-01-2019 5.1.1
		section : Allow skip save save_modified to import info about section modification user and date


	Valencia 08-01-2019 5.1.4
		search_development2 : Changed sequential insert relations sql in propagate_component_dato_to_relations_table to múltiple insert for speed


	Valencia 17-01-2019 5.1.9
		component_input_text : Fixed issue when render_list_value with empty value in current lang. Fixed search issues with empty and not empty values in all langs


	Valencia 28-01-2019 5.2.0
		search : Recoded to make it independent of initator (js/php) and context


	Valencia 11-02-2019 5.2.2
		Added psql and pgpass file check on Dédalo init sequence


	Valencia 21-02-2019 5.2.21
		Fixed error on tool_import_dedalo_csv when import modified_by_user and modified_date


	Valencia 26-02-2019 5.3.2
		Fixed error on tool_image_versions when regular image_id is overwrited by external image_id


	Valencia 28-02-2019 5.3.3
		Fixed error on component_autocomplete_hi when any related section have missconfigurated property 'term' and is not found in section map thesaurus


	Valencia 08-04-2019 5.4.0
		Added publication (diffusion) info data to section. First publication date and user and last publication date and user
		(!) Need structure version >= 08-04-2019 16:06


	Valencia 11-04-2019 5.4.8
		Added new component layout render_layout_map engine in test develop mode


	Valencia 15-04-2019 5.4.11
		Fixed error on tool import files thats not show correctly the temporal section


	Valencia 23-04-2019 5.4.17
		Fixed issue on diffusion component_relation_related value when references are not included in publication data


	Valencia 25-04-2019 5.4.18
		Fixed date error on import zotero. Now format is correct (using 'start' property always)


	Valencia 25-04-2019 5.4.31
		Fixed component_autocomplete error on parse filter fields from properties (get_filter_fields_data) (bibliography author case)


	Valencia 13-05-2019 5.4.32
		Fixed thesaurus scope note issue on load text area editor (changed from component_input_text_large to component_text_area)


	Valencia 14-05-2019 5.4.34
		Fixed thesaurus no descriptors issue when more than one is not showed


	Valencia 20-05-2019 5.4.36
		Fixed unnecessary reset values (make slow resolutions in large component_select) in component_relation_parent get_parents_recursive
		Added get_dato_export custom resolution for component_relation_parent


	Valencia 22-05-2019 5.4.40
		Added thesaurus list sort alphabetically by group


	Valencia 27-05-2019 5.4.41
		Fixed error in tool time machine get_source_langs. Add project langs always for safe langs list


	Valencia 28-05-2019 5.4.44
		Fixed error in diffusion that cause infinite loop in some context like portals with external source data
		Limit portal sort to below 1000 locators


	Valencia 31-05-2019 5.4.45
		Fixed error in component_portal add element when offset is not properly calculated
		Moved structure and langs js strings check from dd_init to login.php to allow ingnore this files in git sync


	Valencia 04-06-2019 5.4.46
		Add publication subtitles db_name optional param for discriminate database on instalations with multiple sites


	Valencia 07-06-2019 5.4.47
		Subtitles fix: remove start and end spaces to avoid infinite loops in split lines


	Valencia 01-07-2019 5.4.52
		Make section_map term format array as default instead string (string is supported for compatibility)


	Valencia 01-07-2019 5.4.60
		Fixed bug in component relation parent method get_parents recursive that use cached parents incorrectly when in multiple items are processing (import, update_cache, etc.)


	Valencia 01-07-2019 5.4.64
		Fixed error on component_relation_related get_references when section_map thesaurus value is multiple (array)


	Valencia 06-09-2019 5.4.74
		Fix error on exec_component_triggers in radio button and component common show_section_group


	Valencia 12-09-2019 5.4.76
		Enable search_development2 'build_having' when operator is '$or_link'


	Valencia 13-09-2019 5.4.80
		Implements search operator '$or_link' in filter


	Valencia 17-09-2019 5.4.82
		Implements date q_operator: !* and *
		Add search_development type of filter: 'typeof' to use like:
			jsonb_typeof(oh1.datos#>'{components,oh29,dato,lg-nolan}')='array'


	Valencia 18-09-2019 5.4.83
		Fix component input text error on search non empty values (operator '*')


	Valencia 18-09-2019 5.4.84
		Fix search error on having searches (left join keys are more reliables now)


	Valencia 23-09-2019 5.4.88
		Add tool export section info components


	Valencia 24-10-2019 5.4.92
		Fix top_tipo issues in list and portals


	Valencia 24-10-2019 5.4.93
		Add multivalue to component email (from string to array dato).
		Add update script to data version from 5.1.1 to 5.1.2 that convert component_email dato from string
		to array


	Valencia 07-11-2019 5.4.96
		Rewrite component_email css


	Valencia 27-11-2019 5.5.0
		Change the security policy of the profiles, allowing access to not global admin users


	Valencia 16-12-2019 5.5.4
		Fix tool export issue when more than one portal share the same section





	WORK IN PROGRESS
		component_date : mark as "red or similar" restricted an other terms based in x param..
					on search fix appearance issue with results css
		structure config search for all resources (notes, chapter titles, etc.)
		tool_structuration : solve error in structure tag inside text (is showed outside)


	/**
	* @todo
	* - Solucionar el tema de los lenguajes en componentes que no deben tener lenguaje (por ejemplo relaciones). Si cambiamos el idioma base de dedalo (DEDALO_DATA_LANG) ya no funcionarán los vínculos
	* - Valorar usar una clase para  las constantes de configuración del programa, Sería más flexible (podría albergar objetos y arrays sin serializar) y más ordenado.
		Ejemplo:
		class app {
		    const MY_CONSTANT = array("a","b"); const MY_CONSTANT_OBJ = new stdClass();
		};	dump(app::MY_CONSTANT, ' MY_CONSTANT');
	*/


	# Version
	$DEDALO_VERSION = '5.5.9b';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.'.time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '08-01-2020');


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


