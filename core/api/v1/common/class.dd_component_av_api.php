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
	*		section_id		: section_id
	*	},
	*	options	: {
	*		quality			: quality,
	*		tc_in_secs		: tc_in_secs,
	*		tc_out_secs		: tc_out_secs,
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



	/**
	* GET_MEDIA_STREAMS
	* 	Get file streams info in JSON format
	* @param object $rqo
	* 	Sample:
	* {
	* 	action	: "get_media_streams",
	*	dd_api	: 'dd_component_av_api',
	*	source	: {
	*		tipo			: 'rsc36',
	*		section_tipo	: section_tipo,
	*		section_id		: section_id
	*	},
	*	options	: {
	*		quality	: quality // optional
	*	}
	* }
	* @return object $response
	*/
	public static function get_media_streams( object $rqo ) : object {

		// source
			$source			= $rqo->source;
			$tipo			= $source->tipo;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;
			$lang			= $source->lang;

		// options
			$options = $rqo->options;

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				$lang, // string lang
				$section_tipo // string section_tipo
			);

		// media_streams
			$quality		= $options->quality ?? $component->get_default_quality();
			$media_streams	= $component->get_media_streams( $quality );

			// sample
				// {
				// 	"streams": [
				// 		{
				// 			"index": 0,
				// 			"codec_name": "h264",
				// 			"codec_long_name": "H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10",
				// 			"profile": "High",
				// 			"codec_type": "video",
				// 			"codec_tag_string": "avc1",
				// 			"codec_tag": "0x31637661",
				// 			"width": 720,
				// 			"height": 404,
				// 			"coded_width": 720,
				// 			"coded_height": 404,
				// 			"closed_captions": 0,
				// 			"film_grain": 0,
				// 			"has_b_frames": 2,
				// 			"pix_fmt": "yuv420p",
				// 			"level": 30,
				// 			"color_range": "tv",
				// 			"color_space": "bt709",
				// 			"color_transfer": "bt709",
				// 			"color_primaries": "bt709",
				// 			"chroma_location": "left",
				// 			"field_order": "progressive",
				// 			"refs": 1,
				// 			"is_avc": "true",
				// 			"nal_length_size": "4",
				// 			"id": "0x1",
				// 			"r_frame_rate": "25/1",
				// 			"avg_frame_rate": "25/1",
				// 			"time_base": "1/12800",
				// 			"start_pts": 0,
				// 			"start_time": "0.000000",
				// 			"duration_ts": 2560,
				// 			"duration": "0.200000",
				// 			"bit_rate": "1095680",
				// 			"bits_per_raw_sample": "8",
				// 			"nb_frames": "5",
				// 			"extradata_size": 50,
				// 			"disposition": {
				// 				"default": 1,
				// 				"dub": 0,
				// 				"original": 0,
				// 				"comment": 0,
				// 				"lyrics": 0,
				// 				"karaoke": 0,
				// 				"forced": 0,
				// 				"hearing_impaired": 0,
				// 				"visual_impaired": 0,
				// 				"clean_effects": 0,
				// 				"attached_pic": 0,
				// 				"timed_thumbnails": 0,
				// 				"captions": 0,
				// 				"descriptions": 0,
				// 				"metadata": 0,
				// 				"dependent": 0,
				// 				"still_image": 0
				// 			},
				// 			"tags": {
				// 				"language": "und",
				// 				"handler_name": "VideoHandler",
				// 				"vendor_id": "[0][0][0][0]",
				// 				"encoder": "Lavc60.3.100 libx264"
				// 			}
				// 		}
				// 	]
				// }

		// response
			$response = new stdClass();
				$response->result	= $media_streams;
				$response->msg		= ['OK. Request done'];
				$response->error	= null;


		return $response;
	}//end get_media_streams



	/**
	* CREATE_POSTERFRAME
	* Deletes posterframe file
	*
	* @param object $rqo
	* 	Sample:
	* {
	* 	action	: "create_posterframe",
	*	dd_api	: 'dd_component_3d_api',
	*	source	: {
	*		tipo			: 'rsc36',
	*		section_tipo	: section_tipo,
	*		section_id		: section_id
	*	},
	* 	options: {
	* 		current_time : float as 17.852
	* 	}
	* }
	* @return object $response
	*/
	public static function create_posterframe( object $rqo ) : object {

		// source
			$source			= $rqo->source;
			$tipo			= $source->tipo;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;

		// options
			$options		= $rqo->options;
			$current_time	= $options->current_time;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed '.__METHOD__;

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$section_tipo // string section_tipo
			);

		// result boolean
			$result = $component->create_posterframe($current_time);

		// response
			$response->result	= $result;
			$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end create_posterframe



	/**
	* DELETE_POSTERFRAME
	* Deletes posterframe file
	*
	* @param object $rqo
	* 	Sample:
	* {
	* 	action	: "delete_posterframe",
	*	dd_api	: 'dd_component_3d_api',
	*	source	: {
	*		tipo			: 'rsc36',
	*		section_tipo	: section_tipo,
	*		section_id		: section_id
	*	}
	* }
	* @return object $response
	*/
	public static function delete_posterframe( object $rqo ) : object {

		// source
			$source			= $rqo->source;
			$tipo			= $source->tipo;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed '.__METHOD__;

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$section_tipo // string section_tipo
			);

		// result boolean
			$result = $component->delete_posterframe();

		// response
			$response->result	= $result;
			$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end delete_posterframe



}//end dd_component_av_api
