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



	/**
	* @todo
	* - Solucionar el tema de los lenguajes en componentes que no deben tener lenguaje (por ejemplo relaciones). Si cambiamos el idioma base de dedalo (DEDALO_DATA_LANG) ya no funcionarán los vínculos
	* - Listados: orden no es correcto a veces. Ejemplo http://host/dedalo/main/?&order_by=id&order_dir=DESC
	* - CSS Cambiar el funcionamiento para posibilitar grupos (ej. bloques) . Asignación directa al wrapper
	*/

	
	
	# Version
	define('DEDALO_VERSION', "4.0b69");


	# Build
	if (isset($_SESSION['config4']['DEDALO_BUILD'])) {
		define('DEDALO_BUILD', $_SESSION['config4']['DEDALO_BUILD']);
	}else{
		// Reads folder (dedalo lib) recursively and get the more recently edited file date
		$last_modification_timestamp= get_last_modification_date(DEDALO_LIB_BASE_PATH);
		define('DEDALO_BUILD', date("d-m-Y H:i:s ", $last_modification_timestamp));
		$_SESSION['config4']['DEDALO_BUILD'] = DEDALO_BUILD;
	}
	
?>