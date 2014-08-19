<?php
require_once('../Connections/config.php');

class RecordsList {	############## DEDALO RecordsList TRADUCTOR TABLE FOR LIST RESULT RECORDS
	
	private $ar_th ;	# List of headers
	private $ar_tr ;	# array list of data
	private $captionTitle ;
	
	
	public static function __construct($captionTitle,$ar_th,$ar_tr) {
		
		
		
	}
	
	
	
	public function buildTable() {
		
		$html .= "\n<!-- LIST DIV CONTAINER -->";
        $html .= "\n<div id=\"list\">";
		$html .= "pagination here";
		
		$html .= "\n<!-- TABLE LIST -->";
		$html .= "<table id=\"recordsTableList\" width=\"100%\" border=\"0\" cellpadding=\"4\" cellspacing=\"1\">";
		
		$html .= "\n<caption style=\"display:none\"> $this->captionTitle </caption>";
		
		# TH ROW HEAD
		$html .= "\n<tr class=\"rowHead\">";
		
		if(is_array($this->ar_th['title'])) foreach($this->ar_th['title'] as $key => $title) 
		{				
		$html .= "\n<th width=\"100\" align=\"center\" nowrap> $title ";
		
		$orderBy = $this->ar_th['orderBy'][$key];
		if($orderBy)
		$html .= "flechasOrden('$orderBy')";
		
		$html .= "\n</th>";
		}
		
		# TD BODY
		
	}
	
	

}
?>