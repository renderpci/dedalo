<?php
/**
* DD_COMPONENT_AV_API
* Manage API REST data flow of the component with Dédalo
* This class is a collection of component exposed methods to the API using
* a normalized RQO (Request Query Object)
*
*/
final class dd_component_av_api {



	/**
	* DOWNLOAD_FRAGMENT
	* Creates a fragment from given av file with TC in:out
	*
	* @param object $rqo
	* 	Sample:
	* {
	* 	action	: "download_fragment",
	*	dd_api	: 'dd_component_av_api',
	*	source	: {
	*		tipo			: 'rsc36',
	*		section_tipo	: section_tipo,
	*		section_id		: section_id,
	*		quality			: quality,
	*		tc_in			: tc_in,
	*		tc_out			: tc_out,
	*		watermark		: false // bool
	*	}
	* }
	* @return object $response
	*/
	public static function download_fragment( object $rqo ) : object {


		// source
			$source			= $rqo->source;
			$tipo			= $source->tipo;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;
			$tag_id			= $source->tag_id;
			$lang			= $source->lang;

		// options
			$options		= $rqo->options;
			$quality		= $options->quality;
			$tc_in_secs		= $options->tc_in_secs;
			$tc_out_secs	= $options->tc_out_secs;
			$watermark		= $options->watermark;

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
				$lang, // string lang
				$section_tipo // string section_tipo
			);

		// short vars
			$source_file_path	= $component->get_media_filepath($quality);
			$target_filename	= implode('_', [
				'fragment',
				$tipo,
				$section_tipo,
				$section_id,
				$tag_id
			]) .'.'. pathinfo($source_file_path, PATHINFO_EXTENSION);
			$fragments_dir_path = $component->get_media_path_dir($quality) . '/fragments';

		// fragment cut
			$build_fragment_response = Ffmpeg::build_fragment((object)[
				'source_file_path'		=> $source_file_path,
				'target_filename'		=> $target_filename,
				'fragments_dir_path'	=> $fragments_dir_path,
				'tc_in_secs'			=> $tc_in_secs,
				'tc_out_secs'			=> $tc_out_secs,
				'watermark'				=> $watermark // bool watermark
			]);

		// response
			if ($build_fragment_response->result===true) {

				// fragment file is created successfully
				$url = DEDALO_PROTOCOL . DEDALO_HOST . $component->get_media_url_dir($quality) .'/fragments/'. $target_filename;

				$response->result	= $url;
				$response->msg		= 'OK. Request done successfully';
			}else{

				// error on create fragment file
				$response->msg		= 'Error on create the fragment file '.$target_filename;
			}


		return $response;
	}//end download_fragment



}//end dd_component_av_api
