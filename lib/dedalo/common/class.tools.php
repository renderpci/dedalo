<?php
abstract class tools extends common {

	public static $globals;

	# SET REQUEST VAR
	public static function setVar($name,$default=false) {

		$$name = $default;
		if(isset($_REQUEST["$name"])) $$name = $_REQUEST["$name"];

		if($$name)
		return $$name ;
	}

	# SET POST VAR
	public static function setVarPost($name,$default=false) {

		$$name = $default;
		if(isset($_POST["$name"])) $$name = $_REQUEST["$name"];

		if($$name)
		return $$name ;
	}

	# SET SESSION VAR
	public static function setVarSession($name,$default=false) {

		$$name = $default;
		if(isset($_SESSION["$name"])) $$name = $_SESSION["$name"];

		if($$name)
		return $$name ;
	}



	# STRIP TAGS FOR TEMPLATES
	public static function template_strip_tags($string) {

		return trim(strip_tags($string,"<p><b><strong><i><em><br><ul><li><a><div>"));
	}

	# GET TEMPLATE FILE CONTENTS
	public static function get_current_template_content() {

		$tpl_file_html	= NULL;

		$backtrace		= debug_backtrace();
		$caller_file	= $backtrace[0]['file'];
		$tpl_file		= dirname($caller_file) . '/tpl/'. LANG_FILE . '.html';

		if(file_exists($tpl_file)) {
			$tpl_file_html	= Tools::template_strip_tags(file_get_contents($tpl_file));
		}else{
			$tpl_file		= dirname($caller_file) . '/tpl/'. LANG_DEFAULT . '.html';
			$tpl_file_html	= Tools::template_strip_tags(file_get_contents($tpl_file));
		}

		return $tpl_file_html;
	}


	# VAR_DUMP PRE
	public static function var_dump_pre($array) {

		ob_start();
			var_dump($array);
			$value	= ob_get_contents();
		ob_end_clean();

		return print "<pre>" . $value . "</pre>";
	}

	# PRINT_R PRE
	public static function print_r_pre($array) {

		ob_start();
			print_r($array);
			$value	= ob_get_contents();
		ob_end_clean();

		return print "<pre>" . $value . "</pre>";
	}



	# CLEAN HTML
	public static function clean_html_code($uncleanhtml) {


				/* PROVISIONAL */
				$cleanhtml = preg_replace(
				    array(
				        '/ {2,}/',
				        '/<!--.*?-->|\t|(?:\r?\n[ \t]*)+/s'
				    ),
				    array(
				        ' ',
				        ''
				    ),
				    $uncleanhtml
				);
				$cleanhtml = str_replace(array(' <','> '), array('<','>'), $cleanhtml);
				return $cleanhtml;
	

		//Set wanted indentation
		#$indent = "    ";
		$indent = "";

		//Uses previous function to seperate tags
		$fixed_uncleanhtml = self::fix_newlines_for_clean_html($uncleanhtml);
		$uncleanhtml_array = explode("\n", $fixed_uncleanhtml);
		//Sets no indentation
		$indentlevel = 0;
		foreach ($uncleanhtml_array as $uncleanhtml_key => $currentuncleanhtml)
		{
			//Removes all indentation
			$currentuncleanhtml = preg_replace("/\t+/", "", $currentuncleanhtml);
			$currentuncleanhtml = preg_replace("/^\s+/", "", $currentuncleanhtml);

			$replaceindent = "";

			//Sets the indentation from current indentlevel
			for ($o = 0; $o < $indentlevel; $o++)
			{
				$replaceindent .= $indent;
			}

			//If self-closing tag, simply apply indent
			if (preg_match("/<(.+)\/>/", $currentuncleanhtml))
			{
				$cleanhtml_array[$uncleanhtml_key] = $replaceindent.$currentuncleanhtml;
			}
			//If doctype declaration, simply apply indent
			else if (preg_match("/<!(.*)>/", $currentuncleanhtml))
			{
				$cleanhtml_array[$uncleanhtml_key] = $replaceindent.$currentuncleanhtml;
			}
			//If opening AND closing tag on same line, simply apply indent
			else if (preg_match("/<[^\/](.*)>/", $currentuncleanhtml) && preg_match("/<\/(.*)>/", $currentuncleanhtml))
			{
				$cleanhtml_array[$uncleanhtml_key] = $replaceindent.$currentuncleanhtml;
			}
			//If closing HTML tag or closing JavaScript clams, decrease indentation and then apply the new level
			else if (preg_match("/<\/(.*)>/", $currentuncleanhtml) || preg_match("/^(\s|\t)*\}{1}(\s|\t)*$/", $currentuncleanhtml))
			{
				$indentlevel--;
				$replaceindent = "";
				for ($o = 0; $o < $indentlevel; $o++)
				{
					$replaceindent .= $indent;
				}

				$cleanhtml_array[$uncleanhtml_key] = $replaceindent.$currentuncleanhtml;
			}
			//If opening HTML tag AND not a stand-alone tag, or opening JavaScript clams, increase indentation and then apply new level
			else if ((preg_match("/<[^\/](.*)>/", $currentuncleanhtml) && !preg_match("/<(link|meta|base|br|img|hr)(.*)>/", $currentuncleanhtml)) || preg_match("/^(\s|\t)*\{{1}(\s|\t)*$/", $currentuncleanhtml))
			{
				$cleanhtml_array[$uncleanhtml_key] = $replaceindent.$currentuncleanhtml;

				$indentlevel++;
				$replaceindent = "";
				for ($o = 0; $o < $indentlevel; $o++)
				{
					$replaceindent .= $indent;
				}
			}
			else
			//Else, only apply indentation
			{$cleanhtml_array[$uncleanhtml_key] = $replaceindent.$currentuncleanhtml;}
		}
		//Return single string seperated by newline
		return implode("\n", $cleanhtml_array);
	}
	//Function to seperate multiple tags one line
	public static function fix_newlines_for_clean_html($fixthistext) {

		$fixthistext_array = explode("\n", $fixthistext);
		foreach ($fixthistext_array as $unfixedtextkey => $unfixedtextvalue)
		{
			//Makes sure empty lines are ignores
			if (!preg_match("/^(\s)*$/", $unfixedtextvalue))
			{
				$fixedtextvalue = preg_replace("/>(\s|\t)*</U", ">\n<", $unfixedtextvalue);
				$fixedtext_array[$unfixedtextkey] = $fixedtextvalue;
			}
		}
		return implode("\n", $fixedtext_array);
	}

	# TRUNCATE
	public static function truncate_text($string, $limit, $break=" ", $pad="...") {

	  # return with no change if string is shorter than $limit
	  if(strlen($string) <= $limit) return $string;

	  $string = mb_substr($string, 0, $limit);
	  if(false !== ($breakpoint = strrpos($string, $break))) {
		$string = mb_substr($string, 0, $breakpoint);
	  }

	  return $string . $pad;
	}


	/**
	* HTML CONTENT
	* Modifica el contenido '$html' empaquetándolo en un div '.content' necesario para delimitar las actualizaciones mediante ajax
	*/
	public static function prepare_content(&$html) {

		#$string = "/\t{1,15}/";
		#$html 	= preg_replace($string,'',$html);

		#$html 	= str_replace(array("\t\t"), "\t", $html);
		#$html 	= str_replace(array("\n","\r","  "),' ',$html);
		#$html 	= preg_replace("/\t{2,}/",' ',$html);
		#$html 	= preg_replace("/\n/",' ',$html);
		#$html 	= preg_replace("/ {2,}/",' ',$html);
		/*
		$html = preg_replace("/\t{1,}/", " ", $html);
		$html = preg_replace("/\n{1,}/", " ", $html);
		$html = preg_replace("/ {2,}/", " ", $html);
		*/
		$html = "\n <div class=\"content_data\">".trim($html)." \n</div><!-- /content_data -->";

		return $html;
	}



	/**
	* ECHO MEMORY USAGE FORMATED
	*/
	public static function get_memory_usage($mode='pid') {

		if($mode=='pid') {
			$pid = getmypid();
     		exec("ps -o rss -p $pid", $output);
     		$mem_usage = $output[1] *1024;
		}else{
			$mem_usage = memory_get_usage(true);
		}


        /*
        if ($mem_usage < 1024)
            return $mem_usage." bytes";
        elseif ($mem_usage < 1048576)
            return round($mem_usage/1024,2)." KB";
        else
            return round($mem_usage/1048576,2)." MB";
        */
		return tools::_formatBytes($mem_usage);
    }


    public static function _formatBytes($bytes) {
	    $prefixes = array('', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y');
	    $c = 0;
	    while($bytes >= 1024 && $c++ < count($prefixes) - 1) $bytes /= 1024;
	    $bytes = round($bytes, 3);
	    return "$bytes {$prefixes[$c]}B";
	}


	/**
	* GET_REQUEST_TIME
	*/
	public static function get_request_time() {
		return $_SERVER['REQUEST_TIME_FLOAT'];
		
		if (isset($_SERVER['REQUEST_TIME_FLOAT'])) {
			$request_time = $_SERVER['REQUEST_TIME'];
		}else{
			$request_time = $_SERVER['REQUEST_TIME'];
		}
		return $request_time;
	}


	static public function build_link($string, $argumens) {

		$url = NULL;
		if( !empty($argumens['url']) ) $url = $argumens['url'];

		$css = NULL;
		if( !empty($argumens['css']) ) $css = $argumens['css'];

		$target = '_blank';
		if( !empty($argumens['target']) ) $target = $argumens['target'];

		return "<a href=\"$url\" target=\"$target\" class=\"$css\">$string</a>";

	}


	static function convert_d4_to_d3_lang($lang) {

		#$lang = preg_replace("/lg-/", "", $lang);

		# TDL3 COMPATIBILITY
		switch (true) {
			case ($lang=='lg-cat'):
			case ($lang=='lg-vlca'):
			case ($lang=='lg-vlnc'):
				$lang_d3= 'ca';
				break;
			case ($lang=='lg-espn'):
			case ($lang=='lg-spa'):
				$lang_d3= 'es';
				break;
			case ($lang=='lg-fra'):
				$lang_d3= 'fr';
				break;
			case ($lang=='lg-eng'):
				$lang_d3= 'en';
				break;
			default:
				$lang_d3= substr($lang, 3);
				#die("lang $lang not supported");
				break;
		}
		return $lang_d3;
	}
	/*
	static function lang_tld3_to_tld2($lang_tld3) {
		$lang_tld3 = preg_replace("/lg-/", "", $lang_tld3);

		$ar_langs = array(
			'spa' => 'es',
			'cat' => 'ca',
			'eng' => 'en',
			'fra' => 'fr',
			)

	}//end lang_tld3_to_tld2
	*/


	/**
	* GET_BC_PATH
	* Get breadcrumb path . Path is dragged along url (var is base64 encoded)
	*/
	static function get_bc_path() {
		global $tipo;

		#
		# PATH
		$bc_path='';
		if (isset($_GET['bc_path'])) {
			$bc_path .= trim( base64_decode($_GET['bc_path']) ) .' / ';
		}

		#
		# TX CURRENT TOP_TIPO / TIPO
		#$tx_tipo1 = (TOP_TIPO ? RecordObj_dd::get_termino_by_tipo(TOP_TIPO, DEDALO_APPLICATION_LANG, true) : '' );
		$tx_tipo2 = ($tipo ? RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_APPLICATION_LANG, true) : '' );

		$bc_path .= $tx_tipo2;

		return $bc_path;
	}


	static function get_id_path($id) {

		#
		# PATH
		$id_path='';
		if (isset($_GET['id_path'])) {
			$id_path .= trim($_GET['id_path']);
		}
		if (empty($id_path)) {
			$id_path = TOP_TIPO.'.'.TOP_ID;
		}


		if (!empty($id)) {			
			$id_path .= ','.$id;						
		}

		
		return $id_path;
	}

	
	


}
?>