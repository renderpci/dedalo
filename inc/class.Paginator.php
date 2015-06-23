<?php


class Paginator  {
	
	protected $maxRows ;		# max reg by page. Default 10
	protected $totalRows ;		# calculated first time ( ceil($totalRows/$maxRows)-1 ) . Default false
	protected $pageNum ;		# current page number
	protected $totalPages ;		# total pages ($totalRows/$maxRows)-1
	
	protected $arTitles ; 
		
	
	public function __construct(PageDataObj $PageDataObj) {
		
		#var_dump($PageDataObj);#die();
		
		$this->maxRows 		= intval($PageDataObj->get_maxRows()) ;
		$this->totalRows 	= intval($PageDataObj->get_totalRows()) ;
		$this->pageNum 		= intval($PageDataObj->get_pageNum()) ;
		$this->totalPages 	= intval($PageDataObj->get_totalPages()) ;
		
		$this->arTitles		= Title::getTitles();
	}
	
	
	# PAGINATOR 
	public function buildPaginator($mode='top')	{
		
		#if($this->maxRows==0 || $this->totalRows==0) return false ;
		
		#$this->totalPages 	= ceil(  $this->totalRows / $this->maxRows  )-1 ;
		
		
		$this->totalPages 	= floor(  $this->totalRows / $this->maxRows  );
		#throw new Exception("paginator totalPages:$this->totalPages , totalRows:$this->totalRows , maxRows:$this->maxRows operation is 0 !");
		
		
		
		#echo " totalPages:$this->totalPages , totalRows:$this->totalRows , maxRows:$this->maxRows, pageNum:$this->pageNum  <hr>";
		
		# get query string
		$queryString = "";
		if (!empty($_SERVER['QUERY_STRING'])) {
		  $params = explode("&", $_SERVER['QUERY_STRING']);
		  $newParams = array();
		  foreach ($params as $param) {
			if (stristr($param, "pageNum") == false && stristr($param, "totalRows") == false) {
			  array_push($newParams, $param);
			}
		  }
		  if (count($newParams) != 0) {
			$queryString = "&" . htmlentities(implode("&", $newParams));
		  }
		}
		#echo " <hr> $queryString <hr>";	
		
		# styles of elements
		$classActive	= '';		
		$classDesActive = "BtnDesactivo";
		
		#$mode = $this->mode;
		if($mode=='down'){
			$blockClass = 'pagContDivDown';
		}else{
			$blockClass = 'pagContDiv';
		}
		# open block
		$html  = "<div class=\"$blockClass\">\n";
					
		
		# Go First page
		$currentClass	= $classDesActive; # default classDesActive
		$link = false;
		if($this->pageNum > 0){ 
			$currentClass = $classActive ;
			$link = " onclick=\"window.location='?pageNum=0&totalRows=".$this->totalRows."$queryString';\" ";
		}
		#$html .= " <div class=\"$currentClass\" $link title=\"First\"> << </div>\n";
		$html .= "<div class=\"pagElementDiv\">";
		$html .= "<img src=\"../images/iconos/barra_primero.png\" $link title=\"First\" class=\"$currentClass\" />\n";
		$html .= "</div>\n";
			
		# Go Previous page
		$link = false;
		if($this->pageNum > 0){
			$currentClass = $classActive ;
			$link = " onclick=\"window.location='?pageNum=".intval($this->pageNum -1)."&totalRows=".$this->totalRows."$queryString';\" ";
		}
		#$html .= " <div class=\"$currentClass\" $link title=\"Previous\"> < </div>\n";
		$html .= "<div class=\"pagElementDiv\">";
		$html .= "<img src=\"../images/iconos/barra_anterior.png\" $link title=\"Previous\" class=\"$currentClass\" />\n";
		$html .= "</div>\n";
			
		# Go Next page
		$link = false; #echo "<hr>total pages:".$this->totalPages . " - page number:" . $this->pageNum 
		$currentClass	= $classDesActive; # default classDesActive		
		if($this->totalPages >1 && $this->pageNum < $this->totalPages){
			$link = " onclick=\"window.location='?pageNum=".intval($this->pageNum +1)."&totalRows=".$this->totalRows."$queryString';\" ";
			$currentClass = $classActive ;	
		}			
		#$html .= " <div class=\"$currentClass\" $link title=\"Next\"> > </div>\n";
		$html .= "<div class=\"pagElementDiv\">";
		$html .= "<img src=\"../images/iconos/barra_siguiente.png\" $link title=\"Next\" class=\"$currentClass\" />\n";
		$html .= "</div>\n";	
		
		# Go Last page
		$link = false;
		if($this->totalPages >1 && $this->pageNum < $this->totalPages){
			$link = " onclick=\"window.location='?pageNum=".$this->totalPages."&totalRows=".$this->totalRows."$queryString';\" ";
			$currentClass = $classActive ;	
		}		
		#$html .= " <div class=\"$currentClass\" $link title=\"Last\"> >> </div>\n";
		$html .= "<div class=\"pagElementDiv\">";
		$html .= "<img src=\"../images/iconos/barra_ultimo.png\" $link title=\"Last\" class=\"$currentClass\" />\n";
		$html .= "</div>\n";
		
		# Text info sow records
		$currentClass 	= $classDesActive; # default classDesActive ;
		$fromRecord		= $this->maxRows * $this->pageNum +1 ;
		$toRecord 		= $fromRecord + $this->maxRows -1;
		if($this->totalRows < $toRecord) $toRecord = $this->totalRows ;
		
		#$html .= " <div class=\"$currentClass\">\n  <span> $this->titleDisplayed $fromRecord $this->titleTo $toRecord $this->titleFrom $this->totalRows </span>\n </div>\n";
		# info
		$html .= "<div class=\"pagElementDiv\" style=\"width:auto;display:block; position:relative; float:left\">\n";
        $html .= " <div id=\"pagElementDivText\">";
        $html .= "" .$this->arTitles['mostradas_title'].' '.$fromRecord.' '.$this->arTitles['a_title'].' '.$toRecord.' '.$this->arTitles['de_title'].' '.$this->totalRows."";
		$html .= "</div>\n";
		$html .= "</div>\n";
			
		# close block
		$html .= "</div><!-- /pagContDiv -->\n";
				
		return $html;
	}
	
	
	
	/*
	# build paginator like : Displayed 1 to 7 from 7
	public function paginator_Old()
	{
		$this->totalPages 	= ceil($this->totalRows / $this->maxRows)-1 ;
		
		# get query string
		$queryString = "";
		if (!empty($_SERVER['QUERY_STRING'])) {
		  $params = explode("&", $_SERVER['QUERY_STRING']);
		  $newParams = array();
		  foreach ($params as $param) {
			if (stristr($param, "pageNum") == false && stristr($param, "totalRows") == false && stristr($param, "fichaID") == false ) {
			  array_push($newParams, $param);
			}
		  }
		  if (count($newParams) != 0) {
			$queryString = "&" . htmlentities(implode("&", $newParams));
		  }
		}
		#echo " <hr> $queryString <hr>";	
		
		# styles of elements
		$classActive	= 'pagElementDiv';
		$classDesActive = 'pagElementDivDes';	
		$classText		= 'pagElementDivText';
		
		# open block
		$html  = "<div class=\"pagContDiv\">\n";
		
		# case we are show fichaFull, show link to previous page list
		if( isset($_REQUEST['mode']) && $_REQUEST['mode']=='ficha' ) {
			#$lastListURLlink = $_SESSION['lastListURL'];
			#$html  .= "<div class=\"divPageList\" onclick=\"window.location='$lastListURLlink'\">\n";
			$html  .= "<div class=\"divPageList\" onclick=\"gotoLastList()\">\n";
			$html  .= "Volver al listado";
			$html  .= "</div><!-- /divPageList -->\n";
		}
			
		
		# Go First page
		$currentClass	= $classDesActive; # default classDesActive
		$link = false;
		if($this->pageNum > 0){ 
			$currentClass = $classActive ;
			$link = " onclick=\"window.location='?pageNum=0&totalRows=$this->totalRows$queryString';\" ";
		}
		$html .= " <div class=\"$currentClass\" $link title=\"First\"> << </div>\n";
			
		# Go Previous page
		$link = false;
		if($this->pageNum > 0){
			$currentClass = $classActive ;
			$link = " onclick=\"window.location='?pageNum=".intval($this->pageNum -1)."&totalRows=".$this->totalRows."$queryString';\" ";
		}
		$html .= " <div class=\"$currentClass\" $link title=\"Previous\"> < </div>\n";
			
		# Go Next page
		$link = false;
		$currentClass	= $classDesActive; # default classDesActive
		if ($this->pageNum < $this->totalPages){
			$link = " onclick=\"window.location='?pageNum=".intval($this->pageNum +1)."&totalRows=".$this->totalRows."$queryString';\" ";
			$currentClass = $classActive ;	
		}			
		$html .= " <div class=\"$currentClass\" $link title=\"Next\"> > </div>\n";		
		
		# Go Last page
		$link = false;
		if ($this->pageNum < $this->totalPages){
			$link = " onclick=\"window.location='?pageNum=".$this->totalPages."&totalRows=".$this->totalRows."$queryString';\" ";
			$currentClass = $classActive ;	
		}		
		$html .= " <div class=\"$currentClass\" $link title=\"Last\"> >> </div>\n";		
		
		# Text info sow records
		$currentClass 	= $classText ;
		$fromRecord		= $this->maxRows * $this->pageNum +1 ;
		$toRecord 		= $fromRecord + $this->maxRows -1;
		if($this->totalRows < $toRecord) $toRecord = $this->totalRows ;
		
		$html .= " <div class=\"$currentClass\">\n  <span> $this->titleDisplayed $fromRecord $this->titleTo $toRecord $this->titleFrom $this->totalRows </span>\n </div>\n";
			
		# close block
		$html .= "</div><!-- /pagContDiv -->\n";
				
		return $html;
	}
	*/
	
	
}
?>