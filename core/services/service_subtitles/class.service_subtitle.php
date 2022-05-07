<?php
include( dirname(dirname(__FILE__)) . '/shared/class.subtitles.php');

class service_subtitles{

	/**
	* BUILD_SUBTITLES_TEXT
	* @param object $request_options
	* @return object $response
	*/
	public static function build_subtitles_text( object $request_options) : object {

		$response = subtitles::build_subtitles_text($request_options) ;

		return (object)$response;
	}//end build_subtitles_text
}