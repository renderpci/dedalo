<?php
declare(strict_types=1);
/**
* DD_COMPONENT_INFO
* Manage API REST data flow of the component with Dédalo
* This class is a collection of component exposed methods to the API using
* a normalized RQO (Request Query Object)
*
*/
final class dd_component_info {



	/**
	* GET_WIDGET_DATO
	* Get given widget data for current component
	*
	* @param object $rqo
	* 	Sample:
	* {
	* 	action	: "get_widget_dato",
	*	dd_api	: 'dd_component_info',
	*	source	: {
	*		tipo			: 'oh87',
	*		section_tipo	: section_tipo,
	*		section_id		: section_id,
	* 		mode			: 'edit'
	*	},
	* 	options : {
	* 		widget_name		: 'descriptors'
	* 	}
	* }
	* @return object $response
	*/
	public static function get_widget_dato( object $rqo ) : object {

		// source
			$source			= $rqo->source;
			$tipo			= $source->tipo;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;
			$mode			= $source->mode;

		// options
			$options		= $rqo->options;
			$widget_name	= $options->widget_name;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= [];
				$response->error	= null;

		// component
			$model = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component = component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$section_tipo // string section_tipo
			);

			$properties	= $component->get_properties();
			$widgets	= $properties->widgets ?? null;

			if (empty($widgets) || !is_array($widgets)) {

				$msg = ' Empty defined widgets for '.get_called_class()." : $component->label [$component->tipo] ".to_string($widgets);

				debug_log(__METHOD__.$msg, logger::ERROR);
				$response->msg[] = $msg;
				return $response;
			}

			$widget_obj = array_find($widgets, function($widget) use ($widget_name){
				return $widget->widget_name === $widget_name;
			});

			if(empty($widget_obj)){
				$msg = ' Empty widget_obj for widget '. $widget_name;

				debug_log(__METHOD__.$msg, logger::ERROR);
				$response->msg[] = $msg;
				return $response;
			}

			$widget_options = new stdClass();
				$widget_options->section_tipo		= $section_tipo;
				$widget_options->section_id			= $section_id;
				$widget_options->lang				= DEDALO_DATA_LANG;
				// $widget_options->component_info	= $this;
				$widget_options->widget_name		= $widget_obj->widget_name;
				$widget_options->path				= $widget_obj->path;
				$widget_options->ipo				= $widget_obj->ipo;
				$widget_options->mode				= $mode;

			$widget = widget_common::get_instance($widget_options);
			$widget_dato = $widget->get_dato();

		// response
			$response->result	= $widget_dato;
			$response->msg		= 'OK. Request done successfully';


		return $response;
	}//end get_widget_dato



}//end dd_component_info
