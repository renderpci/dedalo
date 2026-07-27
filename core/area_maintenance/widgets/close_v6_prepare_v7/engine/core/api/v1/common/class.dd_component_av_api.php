<?php declare(strict_types=1);
/**
* CLASS DD_COMPONENT_AV_API
* Remote API handler for audio/video (AV) component operations in Dédalo.
*
* Exposes a strict allowlist of public-static actions reachable through the
* Dédalo REST API (dd_api = 'dd_component_av_api'). Each action receives a
* normalized RQO (Request Query Object) that carries a 'source' locator
* (tipo / section_tipo / section_id) and an 'options' payload.
*
* Responsibilities:
* - Download time-coded fragments from an AV file via FFmpeg.
* - Retrieve low-level stream metadata (codec, frame-rate, bit-rate, …) from
*   an AV file via ffprobe.
* - Create or delete the posterframe still image that represents the AV
*   component in list/preview contexts.
*
* All actions enforce Dédalo's section-level permission model via
* security::assert_section_permission() before any file I/O is performed.
* Read-only actions (download_fragment, get_media_streams) require permission
* level 1; write actions (create_posterframe, delete_posterframe) require
* level 2.
*
* The actual AV business logic lives in component_av and the Ffmpeg utility
* class; this class is a thin, security-checked API façade.
*
* @package Dédalo
* @subpackage API
*/
final class dd_component_av_api {



	/**
	* SEC-024: explicit allowlist of methods callable as remote API actions.
	* Adding a new public-static method does NOT make it remotely callable;
	* it must also be added here.
	*
	* (!) This constant is the authoritative security gate for this class.
	* Any method missing from this list is unreachable via the API router,
	* regardless of its visibility.
	*
	* @var array<string> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'download_fragment',
		'get_media_streams',
		'create_posterframe',
		'delete_posterframe'
	];



	/**
	* DOWNLOAD_FRAGMENT
	* Cuts a time-coded fragment from an AV file and returns its public URL.
	*
	* Uses FFmpeg (via Ffmpeg::build_fragment) to extract the segment between
	* $tc_in_secs and $tc_out_secs from the source quality file. The resulting
	* fragment is written to a 'fragments/' subdirectory next to the quality
	* file and is identified by a filename composed of the component locator
	* parts (tipo, section_tipo, section_id, tag_id).
	*
	* An optional watermark overlay can be burned into the fragment by passing
	* watermark = true in options; this requires the watermark file defined by
	* DEDALO_AV_WATERMARK_FILE to exist on disk.
	*
	* Requires section read permission (level 1). Throws if the caller lacks
	* permission (security::assert_section_permission halts execution).
	*
	* On success $response->result holds the absolute public URL of the
	* fragment file. On failure $response->result remains false and
	* $response->msg describes the error.
	*
	* @param object $rqo - Normalized Request Query Object. Expected shape:
	* {
	*   action  : "download_fragment",
	*   dd_api  : 'dd_component_av_api',
	*   source  : {
	*     tipo         : string  // ontology tipo of the AV component, e.g. 'rsc36'
	*     section_tipo : string  // section type that owns the component
	*     section_id   : string  // record identifier within the section
	*     tag_id       : string  // client-side tag identifier used to name the fragment
	*     lang         : string  // language code for component instantiation
	*   },
	*   options : {
	*     quality     : string  // quality level name, e.g. 'original' or '1.5MB'
	*     tc_in_secs  : float   // fragment start in seconds (from HTML5 currentTime)
	*     tc_out_secs : float   // fragment end in seconds
	*     watermark   : bool    // true to overlay the Dédalo watermark image
	*   }
	* }
	* @return object $response - stdClass with:
	*   result : string|false — absolute URL of the generated fragment, or false on error
	*   msg    : string|array — human-readable status message
	*   errors : array        — list of error tokens (empty on success)
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

		// SEC: read permission required to download a media fragment
			security::assert_section_permission($section_tipo, 1, __METHOD__);

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= [];
				$response->errors	= [];

		// component
			// Resolve the PHP model class name from the ontology and instantiate
			// the component in 'list' mode (no edit-mode overhead needed here).
			$model = ontology_node::get_model_by_tipo($tipo,true);
			$component = component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				$lang, // string lang
				$section_tipo // string section_tipo
			);

		// short vars
			// Fragment filename encodes the full component locator and tag_id so that
			// multiple concurrent fragment requests for the same record don't collide.
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
			// Ffmpeg::build_fragment creates the fragments directory if needed,
			// then runs the ffmpeg command synchronously and waits for completion.
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
				// Build the public URL by combining protocol+host with the
				// component's media URL directory and the generated filename.
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
	* Returns the raw stream metadata for a given AV file quality as reported by ffprobe.
	*
	* Delegates to component_av::get_media_streams(), which in turn calls
	* Ffmpeg::get_media_streams() to run ffprobe on the resolved file path.
	* If options.quality is omitted the component's default quality is used.
	*
	* The returned object mirrors the ffprobe JSON output and includes one
	* entry per stream (video, audio, subtitle …) with codec names, dimensions,
	* frame rates, colour space, bit-rates, and disposition flags. A sample
	* stream object is shown in the inline comment block below.
	*
	* Requires section read permission (level 1).
	*
	* On success $response->result is the media_streams object returned by
	* component_av::get_media_streams(). On unexpected failure (e.g. ffprobe
	* not installed, file missing) it may be null; the caller should handle
	* a null result gracefully.
	*
	* @param object $rqo - Normalized Request Query Object. Expected shape:
	* {
	*   action  : "get_media_streams",
	*   dd_api  : 'dd_component_av_api',
	*   source  : {
	*     tipo         : string  // ontology tipo of the AV component, e.g. 'rsc36'
	*     section_tipo : string  // section type that owns the component
	*     section_id   : string  // record identifier within the section
	*     lang         : string  // language code for component instantiation
	*   },
	*   options : {
	*     quality : string  // optional — quality level, defaults to component default
	*   }
	* }
	* @return object $response - stdClass with:
	*   result : object|null — ffprobe stream metadata object, or null on error
	*   msg    : array       — human-readable status message(s)
	*   errors : array       — list of error tokens (empty on success)
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

		// SEC: read permission required to read media stream metadata
			security::assert_section_permission($section_tipo, 1, __METHOD__);

		// component
			$model		= ontology_node::get_model_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				$lang, // string lang
				$section_tipo // string section_tipo
			);

		// media_streams
			// Fall back to the component's configured default quality when
			// the caller does not specify one explicitly.
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
				$response->errors	= [];


		return $response;
	}//end get_media_streams



	/**
	* CREATE_POSTERFRAME
	* Creates a posterframe still image from the AV file at the given playback position.
	*
	* Delegates to component_av::create_posterframe(), which uses FFmpeg to extract
	* a single video frame at $current_time seconds and saves it as a JPEG image to
	* the posterframe directory. After the frame is extracted, a thumbnail version is
	* also regenerated automatically (component_av::create_thumb() is called
	* internally by the component method).
	*
	* The component is instantiated with DEDALO_DATA_NOLAN because posterframes are
	* language-independent media files; no language-specific data path is needed.
	*
	* Requires section write permission (level 2). The response object carries the
	* boolean result of the FFmpeg command; a 'false' result means the source file
	* could not be found or the FFmpeg call failed (see component_av::create_posterframe
	* and logger output for diagnostics).
	*
	* (!) The doc-block description in the original code said "Deletes posterframe file"
	*     which was incorrect — this method CREATES the posterframe. Flagged for reference.
	*
	* (!) The rqo sample block references dd_api = 'dd_component_3d_api' which is a
	*     copy-paste error; the correct value is 'dd_component_av_api'. Flagged; code unchanged.
	*
	* @param object $rqo - Normalized Request Query Object. Expected shape:
	* {
	*   action  : "create_posterframe",
	*   dd_api  : 'dd_component_av_api',
	*   source  : {
	*     tipo         : string  // ontology tipo of the AV component, e.g. 'rsc36'
	*     section_tipo : string  // section type that owns the component
	*     section_id   : string  // record identifier within the section
	*   },
	*   options : {
	*     current_time : float   // playback position in seconds, e.g. 17.852
	*                            // corresponds to HTML5 video.currentTime
	*   }
	* }
	* @return object $response - stdClass with:
	*   result : bool   — true when the posterframe was created successfully
	*   msg    : string — human-readable status message
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
			// Initialise to the failure state; overwritten below on success.
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed '.__METHOD__;

		// SEC: write permission required to create a posterframe
			security::assert_section_permission($section_tipo, 2, __METHOD__);

		// component
			// DEDALO_DATA_NOLAN: posterframes are language-neutral; no language
			// path distinction is needed when instantiating the component here.
			$model		= ontology_node::get_model_by_tipo($tipo,true);
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
	* Removes the posterframe still image for an AV component from disk.
	*
	* Delegates to component_av::delete_posterframe(), which checks that the
	* posterframe file exists and then unlinks it. If the file does not exist,
	* the component method returns false and logs a debug notice rather than
	* treating the absence as a hard error.
	*
	* Unlike create_posterframe, this action does not need a quality level because
	* the posterframe file path is quality-independent (stored under the 'posterframe'
	* directory, not under a quality subdirectory).
	*
	* The component is instantiated with DEDALO_DATA_NOLAN because posterframes are
	* language-independent media files.
	*
	* Requires section write permission (level 2).
	*
	* (!) The rqo sample block references dd_api = 'dd_component_3d_api' which is a
	*     copy-paste error; the correct value is 'dd_component_av_api'. Flagged; code unchanged.
	*
	* @param object $rqo - Normalized Request Query Object. Expected shape:
	* {
	*   action  : "delete_posterframe",
	*   dd_api  : 'dd_component_av_api',
	*   source  : {
	*     tipo         : string  // ontology tipo of the AV component, e.g. 'rsc36'
	*     section_tipo : string  // section type that owns the component
	*     section_id   : string  // record identifier within the section
	*   }
	* }
	* @return object $response - stdClass with:
	*   result : bool   — true when the file was successfully deleted; false when
	*                     the file was missing or unlink() failed
	*   msg    : string — human-readable status message
	*/
	public static function delete_posterframe( object $rqo ) : object {

		// source
			$source			= $rqo->source;
			$tipo			= $source->tipo;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;

		// response
			// Initialise to the failure state; overwritten below on success.
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed '.__METHOD__;

		// SEC: write permission required to delete a posterframe
			security::assert_section_permission($section_tipo, 2, __METHOD__);

		// component
			// DEDALO_DATA_NOLAN: posterframes are language-neutral; no language
			// path distinction is needed when instantiating the component here.
			$model		= ontology_node::get_model_by_tipo($tipo,true);
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
