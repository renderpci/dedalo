<?php
/*
* CLASS BABEL
*
*
*/
class babel {


	/**
	* TRANSLATE
	* @return object $response
	*/
	public static function translate($request_options) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		$options = new stdClass();
			$options->uri 			= null;
			$options->key 			= null;
			$options->source_lang 	= null;
			$options->target_lang 	= null;
			$options->text 			= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// babel config
			$direction 	= self::get_babel_direction($options->source_lang, $options->target_lang);
			$url 		= $options->uri; // DEDALO_TRANSLATOR_URL['babel'];


		// add custom image tags to avoid Apertium change original tags
			$source_text = trim(TR::addBabelTagsOnTheFly($options->text));

		// http query vars
			$fields = [
				'key' 		=> $options->key,
				'text' 		=> $source_text,
				'direction' => $direction
			];

		// curl
			$ch = curl_init();

			curl_setopt($ch, CURLOPT_URL, $url);
			#curl_setopt($ch, CURLOPT_POST, count($fields));
			curl_setopt($ch, CURLOPT_POST, true);
			curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($fields));
			curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
			$result = curl_exec($ch);
			curl_close($ch);



		// check invalild response or error
			$ar_invalid_respone = array('Error: Mode','Error. You need authorization');
			foreach ($ar_invalid_respone as $invalid_respone) {
				if( strpos($result, $invalid_respone)!==false ) {
					$response->msg = 'Trigger Error: ['.__FUNCTION__.'] '.$result;
					return $response;
				}
			}

		// decode html entities. Babel returns the special characters encoded as html entities.
		// To reverse the format we use html_entity_decode converting double quotes to
		// simple (flag ENT_COMPAT) and forcing the final format to UTF-8
			$result = html_entity_decode($result,ENT_COMPAT,'UTF-8');

		// Sanitize babel result
		// Apertium changes the format of the labels upon return. They are replaced here
			$result = self::sanitize_result($result);

		// response object
			$response = new stdClass();
				$response->result 	= $result;
				$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';


		return (object)$response;
	}//end translate



	/**
	* GET BABEL DIRECTION
	* Convert lang format like 'lg-spa' to 'sp' for Babel compatibility
	* and return 'direction' in format: 'sp-en' (for translate lg-spa to lg-eng)
	* @param $source_lang
	* @param $target_lang
	*/
	public static function get_babel_direction($source_lang, $target_lang) {

		# for babel like "ca-es";
		$source_babel	= substr($source_lang,3,2);
		$target_babel	= substr($target_lang,3,2);

		// german exception
		if ($source_lang==='lg-deu') {
			$source_babel = 'deu';
			if ($target_lang==='lg-eng') {
				$target_babel = 'eng';
			}
		}

		return $source_babel . '-' . $target_babel ;
	}//end get_babel_direction



	/**
	* SANITIZE RESULT
	* Sanitize Babel result string
	* @param $result
	*/
	public static function sanitize_result($result) {

		// Strip tags is applied to remove tags added to non translatable elements (apertium tags like '<apertium-notrans>')
		$sanitized = strip_tags($result, '<br><strong><em>');	//'<br><strong><em><apertium-notrans>'

		return $sanitized;
	}//end sanitize_result



}//end class


