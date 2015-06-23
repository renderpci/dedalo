<?php
/*
* CLASE LangTranslate
*/

/* GOOGLE API 

LANGUAGES ENUM

var google.language.Languages = {
  'AFRIKAANS' : 'af',
  'ALBANIAN' : 'sq',
  'AMHARIC' : 'am',
  'ARABIC' : 'ar',
  'ARMENIAN' : 'hy',
  'AZERBAIJANI' : 'az',
  'BASQUE' : 'eu',
  'BELARUSIAN' : 'be',
  'BENGALI' : 'bn',
  'BIHARI' : 'bh',
  'BRETON' : 'br',
  'BULGARIAN' : 'bg',
  'BURMESE' : 'my',
  'CATALAN' : 'ca',
  'CHEROKEE' : 'chr',
  'CHINESE' : 'zh',
  'CHINESE_SIMPLIFIED' : 'zh-CN',
  'CHINESE_TRADITIONAL' : 'zh-TW',
  'CORSICAN' : 'co',
  'CROATIAN' : 'hr',
  'CZECH' : 'cs',
  'DANISH' : 'da',
  'DHIVEHI' : 'dv',
  'DUTCH': 'nl',  
  'ENGLISH' : 'en',
  'ESPERANTO' : 'eo',
  'ESTONIAN' : 'et',
  'FAROESE' : 'fo',
  'FILIPINO' : 'tl',
  'FINNISH' : 'fi',
  'FRENCH' : 'fr',
  'FRISIAN' : 'fy',
  'GALICIAN' : 'gl',
  'GEORGIAN' : 'ka',
  'GERMAN' : 'de',
  'GREEK' : 'el',
  'GUJARATI' : 'gu',
  'HAITIAN_CREOLE' : 'ht',
  'HEBREW' : 'iw',
  'HINDI' : 'hi',
  'HUNGARIAN' : 'hu',
  'ICELANDIC' : 'is',
  'INDONESIAN' : 'id',
  'INUKTITUT' : 'iu',
  'IRISH' : 'ga',
  'ITALIAN' : 'it',
  'JAPANESE' : 'ja',
  'JAVANESE' : 'jw',
  'KANNADA' : 'kn',
  'KAZAKH' : 'kk',
  'KHMER' : 'km',
  'KOREAN' : 'ko',
  'KURDISH': 'ku',
  'KYRGYZ': 'ky',
  'LAO' : 'lo',
  'LATIN' : 'la',
  'LATVIAN' : 'lv',
  'LITHUANIAN' : 'lt',
  'LUXEMBOURGISH' : 'lb',
  'MACEDONIAN' : 'mk',
  'MALAY' : 'ms',
  'MALAYALAM' : 'ml',
  'MALTESE' : 'mt',
  'MAORI' : 'mi',
  'MARATHI' : 'mr',
  'MONGOLIAN' : 'mn',
  'NEPALI' : 'ne',
  'NORWEGIAN' : 'no',
  'OCCITAN' : 'oc',
  'ORIYA' : 'or',
  'PASHTO' : 'ps',
  'PERSIAN' : 'fa',
  'POLISH' : 'pl',
  'PORTUGUESE' : 'pt',
  'PORTUGUESE_PORTUGAL' : 'pt-PT',
  'PUNJABI' : 'pa',
  'QUECHUA' : 'qu',
  'ROMANIAN' : 'ro',
  'RUSSIAN' : 'ru',
  'SANSKRIT' : 'sa',
  'SCOTS_GAELIC' : 'gd',
  'SERBIAN' : 'sr',
  'SINDHI' : 'sd',
  'SINHALESE' : 'si',
  'SLOVAK' : 'sk',
  'SLOVENIAN' : 'sl',
  'SPANISH' : 'es',
  'SUNDANESE' : 'su',
  'SWAHILI' : 'sw',
  'SWEDISH' : 'sv',
  'SYRIAC' : 'syr',
  'TAJIK' : 'tg',
  'TAMIL' : 'ta',
  'TATAR' : 'tt',
  'TELUGU' : 'te',
  'THAI' : 'th',
  'TIBETAN' : 'bo',
  'TONGA' : 'to',
  'TURKISH' : 'tr',
  'UKRAINIAN' : 'uk',
  'URDU' : 'ur',
  'UZBEK' : 'uz',
  'UIGHUR' : 'ug',
  'VIETNAMESE' : 'vi',
  'WELSH' : 'cy',
  'YIDDISH' : 'yi',
  'YORUBA' : 'yo',
  'UNKNOWN' : ''
};

LIST OF TRANSLATABLES LANGUAGES

Language			Code	Language			Code

AFRIKAANS			af	 	ITALIAN				it
ALBANIAN			sq	 	JAPANESE			ja
ARABIC				ar	 	KOREAN				ko
BELARUSIAN			be	 	LATVIAN				lv
BULGARIAN			bg	 	LITHUANIAN			lt
CATALAN				ca	 	MACEDONIAN			mk
CHINESE				zh	 	MALAY				ms
CHINESE_SIMPLIFIED	zh-CN	MALTESE				mt
CHINESE_TRADITIONAL	zh-TW	NORWEGIAN			no
CROATIAN			hr	 	PERSIAN				fa
CZECH				cs	 	POLISH				pl
DANISH				da	 	PORTUGUESE			pt
DUTCH				nl	 	PORTUGUESE_PORTUGAL	pt-PT
ENGLISH				en	 	ROMANIAN			ro
ESTONIAN			et	 	RUSSIAN				ru
FILIPINO			tl	 	SERBIAN				sr
FINNISH				fi	 	SLOVAK				sk
FRENCH				fr	 	SLOVENIAN			sl
GALICIAN			gl	 	SPANISH				es
GERMAN				de	 	SWAHILI				sw
GREEK				el	 	SWEDISH				sv
HAITIAN_CREOLE		ht	 	TAGALOG				tl
HEBREW				iw	 	THAI				th
HINDI				hi	 	TURKISH				tr
HUNGARIAN			hu	 	UKRAINIAN			uk
ICELANDIC			is	 	VIETNAMESE			vi
INDONESIAN			id	 	WELSH				cy
IRISH				ga	 	YIDDISH				yi
*/

require_once(DEDALO_ROOT . '/inc/funciones.php');
#require_once(DEDALO_ROOT . '/descriptors/class.Descriptors.php');
#require_once("../inc/funciones.php");
#require_once("../descriptors/class.Descriptors.php");

class LangTranslate {
	
	public $path 	= "../lang/" ;
	
	# google translator key
	public $google_site_dir	;
	public $google_key ;
	
	# google lang pair	
	public $google_lang_source	= false;
	public $google_lang_target	= false;
	
	# google transtlation active (true, false)
	private $google_lang_active	;
	private $totalFormFieldsLimit= 50000;
	
	public static $google_ar_codes	= array(
							'' => '',				# UNKNOW
							'AFRIKAANS' => 'af',
							'ALBANIAN' => 'sq',
							'AMHARIC' => 'am',
							'ARABIC' => 'ar',
							'ARMENIAN' => 'hy',
							'AZERBAIJANI' => 'az',
							'BASQUE' => 'eu',
							'BELARUSIAN' => 'be',
							'BENGALI' => 'bn',
							'BIHARI' => 'bh',
							'BRETON' => 'br',
							'BULGARIAN' => 'bg',
							'BURMESE' => 'my',
							'CATALAN' => 'ca',
							'CHEROKEE' => 'chr',
							'CHINESE' => 'zh',
							'CHINESE_SIMPLIFIED' => 'zh-CN',
							'CHINESE_TRADITIONAL' => 'zh-TW',
							'CORSICAN' => 'co',
							'CROATIAN' => 'hr',
							'CZECH' => 'cs',
							'DANISH' => 'da',
							'DHIVEHI' => 'dv',
							'DUTCH'=> 'nl',  
							'ENGLISH' => 'en',
							'ESPERANTO' => 'eo',
							'ESTONIAN' => 'et',
							'FAROESE' => 'fo',
							'FILIPINO' => 'tl',
							'FINNISH' => 'fi',
							'FRENCH' => 'fr',
							'FRISIAN' => 'fy',
							'GALICIAN' => 'gl',
							'GEORGIAN' => 'ka',
							'GERMAN' => 'de',
							'GREEK' => 'el',
							'GUJARATI' => 'gu',
							'HAITIAN_CREOLE' => 'ht',
							'HEBREW' => 'iw',
							'HINDI' => 'hi',
							'HUNGARIAN' => 'hu',
							'ICELANDIC' => 'is',
							'INDONESIAN' => 'id',
							'INUKTITUT' => 'iu',
							'IRISH' => 'ga',
							'ITALIAN' => 'it',
							'JAPANESE' => 'ja',
							'JAVANESE' => 'jw',
							'KANNADA' => 'kn',
							'KAZAKH' => 'kk',
							'KHMER' => 'km',
							'KOREAN' => 'ko',
							'KURDISH'=> 'ku',
							'KYRGYZ'=> 'ky',
							'LAO' => 'lo',
							'LATIN' => 'la',
							'LATVIAN' => 'lv',
							'LITHUANIAN' => 'lt',
							'LUXEMBOURGISH' => 'lb',
							'MACEDONIAN' => 'mk',
							'MALAY' => 'ms',
							'MALAYALAM' => 'ml',
							'MALTESE' => 'mt',
							'MAORI' => 'mi',
							'MARATHI' => 'mr',
							'MONGOLIAN' => 'mn',
							'NEPALI' => 'ne',
							'NORWEGIAN' => 'no',
							'OCCITAN' => 'oc',
							'ORIYA' => 'or',
							'PASHTO' => 'ps',
							'PERSIAN' => 'fa',
							'POLISH' => 'pl',
							'PORTUGUESE' => 'pt',
							'PORTUGUESE_PORTUGAL' => 'pt-PT',
							'PUNJABI' => 'pa',
							'QUECHUA' => 'qu',
							'ROMANIAN' => 'ro',
							'RUSSIAN' => 'ru',
							'SANSKRIT' => 'sa',
							'SCOTS_GAELIC' => 'gd',
							'SERBIAN' => 'sr',
							'SINDHI' => 'sd',
							'SINHALESE' => 'si',
							'SLOVAK' => 'sk',
							'SLOVENIAN' => 'sl',
							'SPANISH' => 'es',
							'SUNDANESE' => 'su',
							'SWAHILI' => 'sw',
							'SWEDISH' => 'sv',
							'SYRIAC' => 'syr',
							'TAJIK' => 'tg',
							'TAMIL' => 'ta',
							'TATAR' => 'tt',
							'TELUGU' => 'te',
							'THAI' => 'th',
							'TIBETAN' => 'bo',
							'TONGA' => 'to',
							'TURKISH' => 'tr',
							'UKRAINIAN' => 'uk',
							'URDU' => 'ur',
							'UZBEK' => 'uz',
							'UIGHUR' => 'ug',
							'VIETNAMESE' => 'vi',
							'WELSH' => 'cy',
							'YIDDISH' => 'yi',
							'YORUBA' => 'yo',
							'VALENCIAN' => 'va' # NOT DEFINED IN GOOGLE
														
						  );
	
	public static $google_ar_codes_2_iso2 = array(							
						# GOOGLE CODE	# ISO 3 CODE	
						'af'			=> "afr",	# AFRIKAANS
						'sq'			=> "sqi*",	# ALBANIAN
						'am'			=> "amh*",	# AMHARIC
						'ar'			=> "ara",	# ARABIC
						'hy'			=> "hye",	# ARMENIAN
						'az'			=> "aze",	# AZERBAIJANI
						'eu'			=> "eus",	# BASQUE
						'be'			=> "bel",	# BELARUSIAN
						'bn'			=> "ben",	# BENGALI
						'bh'			=> "bih",	# BIHARI
						'bh'			=> "bih",	# BIHARI	
						'br'			=> "bre",	# BRETON
							
						'ca'			=> "cat",	# CATALAN		
						'bg'			=> "bul",	# BULGARIAN
						'en'			=> "eng",	# ENGLISH	
						'es'			=> "spa",	# SPANISH	
						'fa'			=> "fas",	# PERSIAN
						'fr'			=> "fra",	# FRENCH	
						'gl'			=> "glg",	# GALICIAN
						'hi'			=> "hin",	# HINDI
						'ja'			=> "jpn",	# JAPANESE
						'nl'			=> "nld",	# DUTCH
						'pt'			=> "por",	# PORTUGUESE
						'th'			=> "tha",	# THAI
						'va'			=> "vlca",	# VALENCIAN						
						/*
						'BULGARIAN' => 'bg',
						'BURMESE' => 'my',
						'CATALAN' => 'ca',
						'CHEROKEE' => 'chr',
						'CHINESE' => 'zh',
						'CHINESE_SIMPLIFIED' => 'zh-CN',
						'CHINESE_TRADITIONAL' => 'zh-TW',
						'CORSICAN' => 'co',
						'CROATIAN' => 'hr',
						'CZECH' => 'cs',
						'DANISH' => 'da',
						'DHIVEHI' => 'dv',
						'DUTCH'=> 'nl',  
						'ENGLISH' => 'en',
						'ESPERANTO' => 'eo',
						'ESTONIAN' => 'et',
						'FAROESE' => 'fo',
						'FILIPINO' => 'tl',
						'FINNISH' => 'fi',
						'FRENCH' => 'fr',
						'FRISIAN' => 'fy',
						'GALICIAN' => 'gl',
						'GEORGIAN' => 'ka',
						'GERMAN' => 'de',
						'GREEK' => 'el',
						'GUJARATI' => 'gu',
						'HAITIAN_CREOLE' => 'ht',
						'HEBREW' => 'iw',
						'HINDI' => 'hi',
						'HUNGARIAN' => 'hu',
						'ICELANDIC' => 'is',
						'INDONESIAN' => 'id',
						'INUKTITUT' => 'iu',
						'IRISH' => 'ga',
						'ITALIAN' => 'it',
						'JAPANESE' => 'ja',
						'JAVANESE' => 'jw',
						'KANNADA' => 'kn',
						'KAZAKH' => 'kk',
						'KHMER' => 'km',
						'KOREAN' => 'ko',
						'KURDISH'=> 'ku',
						'KYRGYZ'=> 'ky',
						'LAO' => 'lo',
						'LATIN' => 'la',
						'LATVIAN' => 'lv',
						'LITHUANIAN' => 'lt',
						'LUXEMBOURGISH' => 'lb',
						'MACEDONIAN' => 'mk',
						'MALAY' => 'ms',
						'MALAYALAM' => 'ml',
						'MALTESE' => 'mt',
						'MAORI' => 'mi',
						'MARATHI' => 'mr',
						'MONGOLIAN' => 'mn',
						'NEPALI' => 'ne',
						'NORWEGIAN' => 'no',
						'OCCITAN' => 'oc',
						'ORIYA' => 'or',
						'PASHTO' => 'ps',
						'PERSIAN' => 'fa',
						'POLISH' => 'pl',
						'PORTUGUESE' => 'pt',
						'PORTUGUESE_PORTUGAL' => 'pt-PT',
						'PUNJABI' => 'pa',
						'QUECHUA' => 'qu',
						'ROMANIAN' => 'ro',
						'RUSSIAN' => 'ru',
						'SANSKRIT' => 'sa',
						'SCOTS_GAELIC' => 'gd',
						'SERBIAN' => 'sr',
						'SINDHI' => 'sd',
						'SINHALESE' => 'si',
						'SLOVAK' => 'sk',
						'SLOVENIAN' => 'sl',
						'SPANISH' => 'es',
						'SUNDANESE' => 'su',
						'SWAHILI' => 'sw',
						'SWEDISH' => 'sv',
						'SYRIAC' => 'syr',
						'TAJIK' => 'tg',
						'TAMIL' => 'ta',
						'TATAR' => 'tt',
						'TELUGU' => 'te',
						'THAI' => 'th',
						'TIBETAN' => 'bo',
						'TONGA' => 'to',
						'TURKISH' => 'tr',
						'UKRAINIAN' => 'uk',
						'URDU' => 'ur',
						'UZBEK' => 'uz',
						'UIGHUR' => 'ug',
						'VIETNAMESE' => 'vi',
						'WELSH' => 'cy',
						'YIDDISH' => 'yi',
						'YORUBA' => 'yo',
						'VALENCIAN' => 'va' # NOT DEFINED IN GOOGLE
						*/
						);
	
	
	function __construct()
	{
		#$this->file($file);
		
		# set google transtalion prefs from config.php file
		$this->fixGoogleTranslatorPrefs();		
	}
	
	# values are in config.php
	private function fixGoogleTranslatorPrefs()
	{
		global $google_lang_active, $google_site_dir, $google_key ;
		
		$this->google_lang_active 	= $google_lang_active ;
		$this->google_site_dir 		= $google_site_dir ;
		$this->google_key 			= $google_key ;		
	}
	
	/*
	* crea el formulario del idioma
	*/
	function createFormFromFile($source=false) {
		
		$html  = false;
		
		$guest = false;	if(isset($_REQUEST['guest'])) $guest = $_REQUEST['guest'];
		
		# guarda el fichero si hacemos un post. Si no,no hace nada.
		if(isset($_POST) && $_POST) 
		$save = $this->saveLanguageFile();
		
		if(!$source) {
			
			$html .= "<form id=\"formLanguage\" name=\"formLanguage\" method=\"get\" action=\"\" onSubmit=\"return validar(this)\">\n";
			
			# source file slect
			$html .= " Select reference file and target file <br><br>";
			$html .= $this->createSelectLanguages('source')."<br>";
			
			# target field
			$html .= $this->createSelectLanguages('target');
			$target = false; 
			if(isset($_REQUEST['target'])) $target = $_REQUEST['target'];
			$html .= " or create target file:<input type=\"text\" id=\"targetT\" name=\"targetT\" value=\"$target\" style=\"width:60px\" /> Like it.php ";
			$html .= "<input type=\"submit\" value=\" OK \" class=\"SubmitButon\" style=\"width:50px;margin-left:40px\" /> ";
			
			$html .= '</form>';
				
		}else{
									
			$html .= "<form id=\"formLanguage\" name=\"formLanguage\" method=\"post\" action=\"\" onSubmit=\"return validar(this)\">\n";
			
			
			# recorremos los datos para crear el formulario	
			#$html .= $this->createSelectLanguages();
			$html .= "  Source reference file:<input type=\"text\" id=\"source\" name=\"source\" value=\"$source\" style=\"width:80px\" readonly /> ";			
			
			# target field. Si hay datos en el campo de texto, usamos estos. Si no, los del select
			$target = false; 
			if(isset($_REQUEST['targetT']) && strlen($_REQUEST['targetT'])>3) 
			{
				$target = trim($_REQUEST['targetT']);
				
			}else if(isset($_REQUEST['target'])) {
				
				$target = trim($_REQUEST['target']);
			}
			
			
			# bloqueamos la escritura de los idiomas oficiales. Redirigimos _edit (like eng_edit.php). Mostramos advertencia
			
			global $oficialLangsArray ;
			if( in_array($target, $oficialLangsArray) )
			{
				if(NIVEL==10) {
					echo "<div class=\"langAtention\">You are editing an official language. Be careful what you do.. .</div>" ;
				}else{
					$troz	= explode('.',$target);
					$target	= $troz[0]."_edit.php"; #die("Error...");
								
					echo "<div class=\"langAtention\">You can not overwrite an official language. Instead it will create/use the file <b>$target</b> for editing.</div>" ;
				}
			}
			
			
			
			$file = $this->path.$target ;
			
			$html .= " Target saved file: <input type=\"text\" id=\"target\" name=\"target\" value=\"$target\" style=\"width:80px\" readonly  /> ";
			
			$html .= "<input type=\"submit\" value=\"Save\" class=\"SubmitButon\" /> ";
			
			if($guest!=1)
			$html .= "<input type=\"button\" value=\"Select a different configuration\" class=\"submitBtn\" id=\"selectorBtn\" onclick=\"window.location='?'\" /> ";
			
			#$html .= " <div id=\"selectorBtn\" class=\"submitBtn\" onclick=\"window.location='?'\" > Select a different configuration </div>  ";
			
			# verificamos si existe el fichero
			if(!file_exists($file))
			{
				# creamos el archivo
				$ourFileHandle = fopen($file, 'w') or die(" Error: can't create file");				
				fclose($ourFileHandle);
				if(is_resource($file)) chmod($file, '0777');
			}
			
			# leemos el fichero source y metemos los datos en un array
			$arSource = $this->dataFromFile($source);
			
			# leemos el fichero target y metemos los datos en un array		
			$arTarget = $this->dataFromFile($target); #print_r($arTarget);				
			
			# table 
			$html .= '<table id="langTable" border="0" cellspacing="1" cellpadding="2" >'."\n";
			$html .= '<tr>';
			$html .= "<th align=\"center\">#</th>";
			$html .= "<th align=\"left\">Reference [$source]</th>";
			$html .= "<th align=\"left\">Value [$target]</th>";
			$html .= '<th align="left">var name</th>';
			$html .= "</tr>\n";
			
			$i=0;
			if(is_array($arSource)) foreach($arSource as $key=>$value)
			{
				$nombreCampo 		= $key ; #echo "$key -  $nombreCampo <br>";							
				$valorCampoSource	= $value ;  #echo " $valorCampo <br>";
				$valorCampoTarget 	= false;
				if(isset($arTarget[$key])) 
				$valorCampoTarget 	= $arTarget[$key];
				
				$i++;
				
				if($i<=$this->totalFormFieldsLimit)
				{				
					#echo " $key - $value[0] - $value[1] <br> "; 
					$html .= "<tr>\n";
					$html .= "<td align=\"center\" class=\"referencia\">$i</td>\n";
					$html .= "<td align=\"left\" class=\"referencia\"> $valorCampoSource </td>\n";				
					$html .= "<td align=\"left\">\n";
					
					# if is active google tranlator, translate textarea value from campoSource
					if($this->google_lang_active===true && $this->google_lang_source && $this->google_lang_target)
					{ 
						$translatedString = $this->translateTextWithGoogle($valorCampoSource);
						if($translatedString) $valorCampoTarget = $translatedString ;
					}
					
					# text area form data
					$html .= "<textarea name=\"$nombreCampo\" id=\"$nombreCampo\" class=\"textAreaLang\" rows=\"2\" >".$valorCampoTarget."</textarea> ";
					
					$html .= "</td>\n";
					$html .= "<td align=\"left\"><div class=\"var\"> \$$nombreCampo </div></td>\n";
					$html .= "</tr>\n";	
				}#limit
			}			
			
			$html .= "<tr>";
			$html .= "<td align=\"center\"> </td>";
			$html .= "<td align=\"left\">  <input type=\"hidden\" name=\"translation\" value=\"1\"> </td>";	
			$html .= "<td align=\"center\"> <input type=\"submit\" value=\"Save\" class=\"SubmitButon\"/> </td>";
			$html .= "<td align=\"left\">  </td>";
			$html .= "</tr>\n";
			$html .= "</table>\n";
			$html .= "</form>\n\n";			
		}		
		
		# muestra msg al guardar
		if(isset($_POST['target']) && !$save)
		{
			$html .= "<script type=\"text/javascript\">alert('Data save ERROR !')</script>";
		}else if(isset($_POST['target']) && $save){
			$html .= " <script type=\"text/javascript\">alert('Data saved OK !')</script>";	
		}		
		
		return $html ;
	}
	
	
	# Translate field text with google translator API 1
	# require config key and url
	# Parameters defined in top vars of this class
	public function translateTextWithGoogle($valorCampoSource=false)
	{
		# older php versions are not json_decode capables
		if (!function_exists('json_decode') ) die("json_decode not found!");
			
		// This example request inc an optional API key which you will need to
		// remove or replace with your own key.
		// Read more about why it's useful to have an API key.
		// The request also inc the userip parameter which provides the end
		// user's IP address. Doing so will help distinguish this legitimate
		// server-side traffic from traffic which doesn't come from an end-user.
		if(!isset($_POST['translation']) && $this->google_lang_active === true && $valorCampoSource)
		{
			$source_text 	= urlencode($valorCampoSource) ; #$source_text 	= "Hello%20friend" ;
			
			$source_lang	= $this->google_lang_source ;
			$target_lang	= $this->google_lang_target ; #echo "target: ".substr($target,0,2);
			
			$userip			= $_SERVER['REMOTE_ADDR'];
			
			$url =  "https://ajax.googleapis.com/ajax/services/language/translate?" .
					"v=1.0&q=".$source_text."&langpair=".$source_lang."%7C".$target_lang."&key=".$this->google_key."&userip=$userip";

			# sendRequest (note how referer is set manually)
			$ch = curl_init();
			curl_setopt($ch, CURLOPT_URL, $url);
			curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
			curl_setopt($ch, CURLOPT_REFERER, $this->google_site_dir /* Enter the URL of your site here */);
			$body = curl_exec($ch);
			curl_close($ch);
			
			# now, process the JSON string (as true, is converted to one array)
			$json = json_decode($body,true); #print_r($json); #echo "<br><hr><strong> json: " ; print_r($json['responseData']['translatedText']) ; echo "</strong><br><hr>";
			# now have some fun with the results...
			$valorCampoTarget = $json['responseData']['translatedText'];
			
			echo $this->code2language($source_lang).' - '.$this->code2language($target_lang).' <br>';
			
			return $valorCampoTarget ;
		}
		
		return false;
	}
	
	# Google code 2 language like es => SPANISH
	public static function code2language($code,$addAlpha=false)
	{						  						  
		# search value in array and returs key value
		$langName = array_search($code,self::$google_ar_codes);
		
		# note alpha versions (not in official array langs) . Caution: oficialLangsArray format is es.php
		global $oficialLangsArray ;
		if($addAlpha && $langName!==false && !in_array($code.'.php', $oficialLangsArray) ) 	$langName = $langName ." Alpha ";
		
		return $langName ;
	}
	
	public static function get_google_ar_codes()
	{
		#var_dump($this->google_ar_codes);
		return 	self::$google_ar_codes;
	}
		
	
	/*
	* salva los datos de formulario del idioma. Crea un archivo nuevo si no existe el target o lo sobreescribe si ya existe
	*/
	function saveLanguageFile()
	{
		$result = false;
		$string = false;
		
		$_SESSION['langOverwrite'] = false ;		
		
		$target		= false;	if(isset($_POST['target']))		$target		= $_POST['target'];
		$targetT	= false;	if(isset($_POST['targetT']))	$targetT	= $_POST['targetT'];		
		
		if(isset($target) || isset($targetT))
		{
			if(isset($targetT) && strlen($targetT)>3) 
			{
				$target = trim($targetT);
				
			}else if(isset($target)){
				
				$target = trim($target);
			}			
			
			if(!strpos($target,".php")) die("Bad target file name ! <br> Use a complete file name like 'demo.php' ");
			
			# bloqueamos la escritura de los idiomas oficiales
			global $oficialLangsArray ;
			if( in_array($target, $oficialLangsArray) )
			{
				if(NIVEL==10) {
					echo "<div class=\"langAtention\">You are overwriting an official language. Be careful what you do.. .</div>" ;
				}else{
					$troz	= explode('.',$target);
					$target	= $troz[0]."_edit.php"; #die("Error...");
								
					echo "<div class=\"langAtention\">Atention ! You can not overwrite an official language. Instead <b>$target</b> has been created for editing.</div>" ;
				}
			}
			
			$file = $this->path.$target ;
			# verificamos si existe el fichero
			if(!file_exists($file))
			{
				# creamos el archivo
				$ourFileHandle = fopen($file, 'w') or die(" Error: can't create file");				
				fclose($ourFileHandle);
				if(is_resource($file)) chmod($file, '0777');
			}
			
			$fh = fopen($file, 'w') or die(" Error: can't open/write file '$file' ");
			
			# recogemos los datos del post y creamos el string a escribir en el fichero
			$arDatos = $_POST ;	#print_r($arDatos);			
			$string .= "<?php \n";
			if(is_array($arDatos)) foreach($arDatos as $key=>$value)
			{
				if(strpos($key,"_title"))
				{
					# limpiamos las comillas dobles
					$rp = array("\"");
					$valueClean = str_replace($rp, "'", $value);

					$string .= "\$"."$key = \"$valueClean\" ;\n";	
				}
			}
			$string .= "\n?>";
			
			$string = stripslashes($string); 
			
			fwrite($fh, $string);
			fclose($fh);
			

			$result = true ;			
		}		
		
		
		return $result ;	
	}
	
	
	
	
	/*
	* Lee un archivo de idioma y devuelve las variables
	*/
	function dataFromFile($name)
	{
		$result = false ; 
		# leemos el fichero y metemos los datos en un array		
		$file = file($this->path.$name);	#print_r($file) ; die($this->path.$name); #print_r( $file ) ;
		
		$fullString = false;
		if(is_array($file)) foreach($file as $value) $fullString .= $value ;
		
		$ar = false;
		
		# limpiamos codigo no necesario
		$rp = array('<?php','?>',"\n");
		$fullString = str_replace($rp, '', $fullString);
		
		$fr = explode(';',$fullString);
		foreach($fr as $value)
		{
			$line = "$value ;"; #echo " $file2 <br> ";	 
			$arLine[] = $line ; 
		}		
		
		if(is_array($arLine))
		{
			foreach( $arLine as $line_num => $line ){
				#echo " $line_num - $line <br> ";		 		
				$beats = explode('=',$line); #echo $ar[0] .' = '. $ar[1] ."<br>" ;
				
				$varName 		= trim($beats[0]);
				$varNameString	= substr($varName,1);
				#$varValue		= trim($beats[1]);
				#$varValue 		= substr($varValue,1); 		# eliminamos el primer caracter
				#$varValue 		= substr($varValue,0,-1);	# eliminamos el último caracter
				
				if(strpos($varName,"_title"))
				{
					# evaluamos la variable actual (tipo $t_error_de_conexion_title = 'lo que sea')
					eval($line); #echo $line . " <br> ". $t_error_de_conexion_title  ."<hr>";
					# cargamos su valor en otra variable 
					eval("\$varNameR = $varName ;"); #echo $varNameR;
					# lo metemos en un array
					$ar["$varNameString"] = $varNameR ;
					
					#eval("\$ar2[\$varNameString] = $varName ;"); #echo $ar2[$varName]." <br> ";
				}
			}
			
			$result = $ar ;
		}
			
		#print_r($ar); die();
		
		return $result ;
	}
	
	
	
	/*
	* crea el select de lenguajes disponibles en funcion de los archivos en la carpeta "lang" (Admin language)
	*/
	private function createSelectLanguages($name="source")
	{
		$html = false;
		$langSelected = false; if(isset($_REQUEST[$name])) $langSelected = $_REQUEST[$name];
		
		if ($gestor = opendir("$this->path")) 
		{
			$html .= "\n<div class=\"select_label\">$name file:</div>";
			$html .= "\n<select name=\"$name\" id=\"$name\" onchange=\"jumpToForm(this)\">\n";
			$html .= "\n <option value=\"\"></option>\n";
			
			while (false !== ($archivoName = readdir($gestor))) {
				if ($archivoName != "." && $archivoName != ".." && $archivoName != ".DS_Store" && $archivoName != "acc")
				{
					#echo "$archivo\n";    				
    				$html .= "\n <option value=\"$archivoName\" ";
					if($langSelected==$archivoName) $html .= " selected=\"selected\" ";
					
					$tr = explode('.',$archivoName);
					$code = $tr[0];
					$langName = $this->code2language($code);						
					$html .= ">$archivoName - $langName</option>\n";						
					#$html .= ">$archivoName</option>\n";  										
				}
			}
			$html .= "\n</select>\n";
			closedir($gestor);			
		}
		
		return $html ;
	}
	
	
	/*
	* crea al select de lenguajes disponibles
	*/
	function createSelectLanguageHeader() {
		
		global $idioma_path ;
		
		$html 			= false;
		$langSelected 	= false;	
		
		if(isset($_SESSION['lang'])) $langSelected = $_SESSION['lang'];
		if(isset($_REQUEST['lang'])) $langSelected = $_REQUEST['lang'];
		
		if($gestor = opendir('../lang/')) {
			
			$html .= "\n\n\t<!-- Global Lang Selector -->";
			$html .= "\n\t<select name=\"langSelect\" id=\"langSelect\" onChange=\"MM_jumpMenu('parent',this,0)\" >";
			$html .= "\n\t <option value=\"\"></option>";
			
			while (false !== ($archivo = readdir($gestor))) {
				$ar = false;
				if ($archivo != "." && $archivo != ".." && $archivo != ".DS_Store" && $archivo != "acc") 
				{
					#echo "$archivo\n";
					$ar = explode('.',$archivo);
					if(is_array($ar)) 
					{
						$archivoName =  $ar[0];
						$url   = $this->jumpLangFromFiles($archivoName);			
						$html .= "\n\t <option value=\"$url\" ";
						if($langSelected==$archivoName) $html .= " selected=\"selected\" ";
						
						#$langName = $this->code2language($archivoName);	
						#$langName = RecordObj_ts::get_termino_by_tipo('lg-'.$archivoName);
						$langName	= false;
						if(array_key_exists($archivoName, self::$google_ar_codes_2_iso2)) {
							
								$terminoID 		= 'lg-' . self::$google_ar_codes_2_iso2[$archivoName];			
								$langName 		= RecordObj_ts::get_termino_by_tipo($terminoID);
						}						
											
						$html .= ">$archivoName - $langName</option>";						
					}
				}
			}
			$html .= "\n\t</select>\n";
			closedir($gestor);			
		}
		
		return $html ;
	}
	
	
	
	/*
	* Crea los enlaces url al cambiar de idioma
	*/
	function jumpLangFromFiles($lang)
	{
		$html = false ;
		if(isset($_SERVER['QUERY_STRING']))	
		{
			$queryString = $_SERVER['QUERY_STRING']; 
			$urlBase = '?'. eliminarOT($queryString);
			
			$search  = array('&&', '&=','=&','??');
			$replace = array('&', '&','&','?');
			$queryString = str_replace($search, $replace, $urlBase);	
		
			$html = $urlBase."&amp;lang=$lang";
			
			$html = str_replace('??','?',$html);
		}
		
		return $html ; 
	}
	
	
	public static function createSelectLangList($selectedItem=false) {
		
		$html = false;
		
		$html .= "\n<select name=\"SelectLangList\" id=\"SelectLangList\" onchange=\"newLang(this.value);\" >";
		#$html .= "\n <option value=\"\"></option>";
		
		if(is_array(self::$google_ar_codes)) foreach(self::$google_ar_codes as $key => $value) {
			
			$html .= "\n <option value=\"$value\" ";
			if($selectedItem==$value)
			$html .= " selected=\"selected\" ";				
			$html .= ">$key";
			$html .= "</option>";				
		}
		
		$html .= "\n</select>\n";
		
		
		return $html ;
	}
	
	
	

};#class

?>