<?php
require_once('../Connections/config.php');


abstract class Page {	
	
	
	protected $ar_location ;	# ex. transcription,list
		
	protected $headerFileURL = '../inc/header.php';
	
	protected $footerFileURL = '../inc/footer.php';
	
	protected $mainJSFileURL = '../inc/javascript.php';
		
	protected $global_vars ;	# for de moment we need globals for compatibility...
	
	protected $pagTitle ;		# defined in config as global
	
	
	/*
	* Constructor.
	*/
	public function __construct($ar_location=NULL)
	{
		$this->create_global_vars();		
		$this->ar_location 	= $ar_location;	#print_r($ar_location);		
		$this->pagTitle		= $GLOBALS['pagTitle'];		
	}
	
	
	
	
	
	# HEADER
	public function get_header()
	{
		if(isset($_GET['head']) && $_GET['head']=='no') return false;
		
		# set global_vars to local var
		if(is_array($this->global_vars)) foreach($this->global_vars as $name => $value)	$$name = $value ;
		
		echo "<tr><td class=\"wrapTDhead\" >";
		#echo "<td height=\"77\" valign=\"top\" class=\"wrapTDhead\">";
		include $this->headerFileURL ;
		echo "</td></tr>";
	}
	# FOOTER
	public function get_footer()
	{		
		# set global_vars to local var
		if(is_array($this->global_vars)) foreach($this->global_vars as $name => $value)	$$name = $value ;
		
		echo "<tr><td class=\"wrapTDfooter\">";
		#echo "<tr><td align=\"center\" valign=\"bottom\" class=\"wrapTDfooter\">";
		include $this->footerFileURL ;	
		echo "</td></tr>";
	}
	# PAGE TITLE	
	public function get_pageTitle()
	{
		return "<title>".$this->pagTitle.' | '.ucfirst($this->ar_location[0]).' : '.ucfirst($this->ar_location[1])."</title>\n<link rel=\"shortcut icon\" href=\"../favicon.ico\">";
	}
	# JAVASCRIPT GENERAL (javascript.php + javascript.js
	public function get_common_JS()
	{		
		# set global_vars to local var
		if(is_array($this->global_vars)) foreach($this->global_vars as $name => $value)	$$name = $value ;
		
		include $this->mainJSFileURL ;
		echo "\n<script language=\"JavaScript\" type=\"text/javascript\" src=\"../inc/javascript.js\"></script>\n";		
	}
	
	
	
	
	
	
	
	
	
	
	
	
	/************************************************
	* UTILITIES 
	************************************************/
	
	
	# create_global_vars
	private function create_global_vars() {
		
		foreach($GLOBALS as $key => $value) {
			
			#if(strpos($key,'_title')) {		
			$this->global_vars[$key] = $value ;	#echo "$key - $value <br>";
			#}
		}
	}	
	
	
	public function title($string)
	{
		if($this->title[$string]) return addslashes($this->title[$string]);
		
		return false;
	}
	
	# set lang
	public function setAndLoadLang()
	{
		$this->lang = $this->lang_default;
		
		# session read
		if(isset($_SESSION['lang']) && in_array($_SESSION['lang'],$this->ar_valid_langs)) $this->lang = $_SESSION['lang'];
		
		# set by get
		if(isset($_REQUEST['lang']) && in_array($_REQUEST['lang'],$this->ar_valid_langs)) $this->lang = $_REQUEST['lang'];
		
		# session store
		$_SESSION['lang'] = $this->lang ;
		
		# lang file load
		$lang_filename = $this->title_path.$this->lang.'.php';
		
		# if file not existe
		if(!file_exists($lang_filename)) die(" invalid lang $this->title_path.$this->lang <br><a href=\"?lang=$this->lang_default\">back</a>");
		
		# set title array
		$loadLang = require_once($lang_filename); 
		
		if(!$loadLang) die(" invalid lang $this->title_path.$this->lang ");
		
		# store array with titles
		return $this->title = $title ;		
	}
	
	# Read metatags from file
	private function readAndSetmetatags()
	{
		return $this->metaTags = file_get_contents($this->metatagsFileURL);
	}
		
	# metatags
	public function get_metatags()
	{
		if(isset($this->metaTags)) return $this->metaTags; 	
	}
	
	/*
	* Open and read and format the selected template file
	*/
	public function readTemplateFile($file,$path="../templates/")
	{
		$contents = false;
		
		$filename 	= $path . $file ;
		
		$handle 	= @fopen($filename, "r");
		
		if(!$handle)
		{
			return "<div id=\"contenido_no_traducido\">". nl2br($this->title['contenido_no_traducido']) ."</div>";
		}
		
		$contents 	= fread($handle, filesize($filename));
		if($handle) fclose($handle);		
				
		$contents = strip_tags($contents, '<h1><p><strong><b><a><img><div><span><blockquote><form><input><br /><br><table><tr><td>');
		
		return $contents;
	}
	
	
	/*
	* Lee un directorio y devuelve el array de ficheros $sufix encontrado
	*/
	static public function filesFromFolder($path,$sufix)
	{
		$folder = @ opendir($path);
		
		if(!$folder) return false; #" Directory $path not found !";
		
		$ar_files = false;
		
		while (false !== ($file = readdir($folder))) {
			
			$pdf = strpos($file, ".$sufix");
			if($pdf)
			{
				$ar_files[] = $file ;
			}
		}
		
		return $ar_files ;	#print_r($ar_files); die();		
	}
	
	
	# utils
	static function getTiempo()
	{ 
		list($usec, $sec) = explode(" ",microtime()); 
		return ((float)$usec + (float)$sec); 
	} 

	
	
	

}
?>