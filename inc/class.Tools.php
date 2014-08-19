<?php
/*
* CLASE Tools
*/

class Tools {
	
	public $lang ;
	
	public $lang_default = 'en';
	
	public $lang_path = '../lang/';
	
	public $lang_path_file ;
	
	
	
	function __construct()
	{
		# set and load language
		$this->setAndLoadLang();
	}
	
	
	/*
	* Idioma lenguaje
	* UNUSED
	public function loadCurrentLang($defaultLang='en')
	{		
		if(isset($_REQUEST['lang']) && $_REQUEST['lang']!='')
		{
			$lang	= $_REQUEST['lang'];
			
		}else if(isset($_SESSION['lang'])){
			
			$lang	= $_SESSION['lang'];
			
		}else{
			
			$lang	= $defaultLang;						# Lenguange por defecto (eng)
						
		}
		$this->lang			= $lang ;
		
		$_SESSION['lang']	= $this->lang ;		
		
		$idioma_path		= '../lang/'.$lang.'.php';	# Definido al entrar al formulario
		
		return $idioma_path;
	}
	*/
	
	# set lang
	public function setAndLoadLang()
	{
		$this->lang = $this->lang_default;
		
		# session read
		if(isset($_SESSION['lang'])) $this->lang = $_SESSION['lang'];
		
		# set by get
		if(isset($_REQUEST['lang'])) $this->lang = $_REQUEST['lang'];
		
		# session store
		$_SESSION['lang'] = $this->lang ;
		
		# lang file load
		$lang_filename = $this->lang_path.$this->lang.'.php';
		
		# if file not existe
		if(!file_exists($lang_filename)) die(" invalid lang $this->lang_path.$this->lang <br><a href=\"?lang=$this->lang_default\">back</a>");
		
		/*
		# set title array
		$loadLang = require_once($lang_filename); echo " $captaciones_title <br>";
		
		if(!$loadLang) die(" invalid lang $this->lang_path.$this->lang ");
		*/
		$this->lang_path_file = $lang_filename ;	
		
		return true ;		
	}
	
	function get_lang()
	{
		return 	$this->lang ;
	}
	
	function get_lang_path_file()
	{
		return 	$this->lang_path_file ;	
	}
	
	
	
	
	
	
}
?>