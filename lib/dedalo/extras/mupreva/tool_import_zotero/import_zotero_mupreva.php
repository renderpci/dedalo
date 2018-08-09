<?php
require_once( DEDALO_LIB_BASE_PATH . '/diffusion/class.diffusion_mysql.php' );

/**
* VARIABLES ESPECÍFICAS DEL SCRIPT DE IMPORTACIÓN
*/


# Sección real Bibliografia MUPREVA
define('ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_CODIGO'			, 'mupreva171');	// Ex rsc137
define('ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_FILTER'			, 'mupreva192');	// Ex rsc148
define('ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_DESCRIPCION_TRANSCRIPCION', 'mupreva195');  // Ex rsc210 # rsc210 Transcripción / descripción 
define('ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_DESCRIPCION_TRANSCRIPCION_REVISION', 'mupreva2081');
define('ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_DOCUMENTO'		, 'mupreva194');	// Ex rsc209 # Bibliografía Documento [rsc209]

# Sección virtual  Publicaciones externas
define('ZOTERO_SECTION_TIPO_VIRTUAL_BIBLIOGRAFIA' 			, 'mupreva156');	// Ex rsc205

# Lista de valores Series / colecciones
define('ZOTERO_SECTION_TIPO_SERIES_COLECCIONES'	  			, 'mupreva613');  # component_input_text of Lista de valores Series / colecciones
define('ZOTERO_COMPONENT_TIPO_SERIES_COLECCIONES' 			, 'mupreva615');  # component_input_text in Lista de valores Series / colecciones


# Lista valores privada tipologia de bibliografía
define('ZOTERO_SECTION_TIPO_LISTA_TIPOLOGIA_BIBLIOGRAFIA'	, 'mupreva228'); # Ex dd810 Section Lista valores privada tipologia de bibliografía

## DEDALO
define('ZOTERO_COMPONENT_TIPO_TIPOLOGIA_DE_BIBLIORAFIA' 	, 'mupreva173'); # Tipología bibliográfica select (Nota: Establecer correspondencias tipo 'entry-encyclopedia' => 'Libro electrónico')
define('ZOTERO_COMPONENT_TIPO_TITULO' 						, 'mupreva178'); # Título
define('ZOTERO_COMPONENT_TIPO_SERIE_COLECCION' 				, 'mupreva174'); # Series / colecciones (component_autocomplete)
define('ZOTERO_COMPONENT_TIPO_AUTORIA_RESPONSABILIDAD' 		, 'mupreva631'); # Autoría y responsabilidad
define('ZOTERO_COMPONENT_TIPO_RESUMEN' 						, 'mupreva183'); # Resumen
define('ZOTERO_COMPONENT_TIPO_FECHA_ACTUALIZACION'			, 'mupreva187'); # Fecha de actualización o revisión //accessed
define('ZOTERO_COMPONENT_TIPO_FECHA'						, 'mupreva181'); # Fecha 
define('ZOTERO_COMPONENT_TIPO_NOTAS'						, 'mupreva189'); # Notas 
define('ZOTERO_COMPONENT_TIPO_NUMERO_NORMALIZADO'			, 'mupreva191'); # Número normalizado 
define('ZOTERO_COMPONENT_TIPO_FUENTE'						, 'mupreva186'); # Fuente
define('ZOTERO_COMPONENT_TIPO_URL'							, 'mupreva185'); # URL
define('ZOTERO_COMPONENT_TIPO_EDITOR'						, 'mupreva182'); # Editor (Publisher)
define('ZOTERO_COMPONENT_TIPO_NUMERO_PAGINAS'				, 'mupreva176'); # Nº de paginas del artículo
define('ZOTERO_COMPONENT_TIPO_NUMERO_DE_EJEMPLAR'			, 'mupreva175'); # Nº de Ejemplar
define('ZOTERO_COMPONENT_TIPO_TITULO_CORTO'					, 'mupreva179'); # Titulo corto

define('ZOTERO_LABEL_NOMBRE_FICHERO_PDF', 'dd176'); # Nombre del fichero pdf (dedalo label)

#
# Registros (section_id) correspondencias
# NOTA: De momento son los mismos, pero los definimos aquí por si se cambian o amplian
$map = array(
			'book' 				=> 1,  # Book
			'article-journal' 	=> 8,  # articluo en revista científica
			'article-magazine'  => 11, # Articulo en revista
			'thesis' 			=> 4,  # Tesis
			'motion_picture' 	=> 6,  # Movies
			'song' 				=> 7,  # Podcast
			);
define('ZOTERO_TIPOLOGIA_FROM_ZOTERO_TYPE_MAP', serialize($map)); // overwrite method array map var


/**
* CUSTOM_PROCESS
*/
function custom_process( $ar_section_id ) {

	$section_tipo = ZOTERO_SECTION_TIPO_VIRTUAL_BIBLIOGRAFIA;
	
	$diffusion_mysql = new diffusion_mysql(); // is 'diffusion_mupreva_web'

	#$ar_section_id = array_keys($ar_section_id);	// Keys are section id of each created/updated record
	foreach ($ar_section_id as $section_id) {		

		$options = new stdClass();
			$options->section_tipo  		 = (string)$section_tipo;
			$options->section_id    		 = (int)$section_id;
			$options->diffusion_element_tipo = (string)'mupreva800'; // Web MUPREVA (MySQL)

		$result = $diffusion_mysql->update_record( $options, $resolve_references=true );
		debug_log(__METHOD__." MUPREVA: Updated MySQL web data for record $section_id of section $section_tipo  - result: ".to_string($result), logger::DEBUG);
		
	}//end foreach ($ar_section_id as $section_id) {

}//end custom_process

?>