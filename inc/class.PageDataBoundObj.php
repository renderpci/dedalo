<?php
require_once('class.DB.php');

abstract class PageDataBoundObj {
	
	# list and paginator info
	protected $maxRows ;			# max reg by page. Default 10
	protected $totalRows ;			# calculated first time ( ceil($totalRows/$maxRows)-1 ) . Default false
	protected $pageNum ;			# current page number
	protected $totalPages ;			# total pages ($totalRows/$maxRows)-1
	
	protected $strTableName ;		# name like tr
	protected $strPrimaryKeyName ;	# usually id
	protected $strFilter ;			# sql generic filter
	protected $strOrder ;			# sql order filter
	
	protected $ar_records ;			# array of id records ($strPrimaryKeyName) founded
	
	protected $blIsLoaded ;
	
	
	abstract protected function defineTableName();
	abstract protected function definePrimaryKeyName();
	abstract protected function defineOrder();
	abstract protected function defineFilter();
	
	
	
	public function __construct() {
		$this->strTableName			= $this->defineTableName();
		$this->strPrimaryKeyName	= $this->definePrimaryKeyName();
		$this->strOrder				= $this->defineOrder();
		$this->strFilter			= $this->defineFilter();		
		$this->blIsLoaded			= false;
		$this->maxRows				= 10;
		$this->ar_records			= array();
	}
	
	
	public function Load() {
		
		# get parameters
		if(isset($_REQUEST['maxRows']) && $_REQUEST['maxRows']>0)	$this->maxRows		= intval($_REQUEST['maxRows']);
		if(isset($_REQUEST['totalRows']))							$this->totalRows 	= intval($_REQUEST['totalRows']);
			
		if(isset($_REQUEST['pageNum'])) 							$this->pageNum		= intval($_REQUEST['pageNum']);
		if(isset($_REQUEST['totalPages'])) 							$this->totalPages	= intval($_REQUEST['totalPages']);
		
		
		# DB QUERY	
		$startRow = $this->pageNum * $this->maxRows;		
		
		# sql
		if(strpos($this->strFilter,'SELECT')!==false)
		{			
			$sql = $this->strFilter . " LIMIT $startRow, $this->maxRows	";
		}else{
			$sql = "SELECT $this->strPrimaryKeyName FROM $this->strTableName WHERE $this->strFilter $this->strOrder LIMIT $startRow, $this->maxRows ";
		}		
		#echo "$this->strFilter <hr> $sql <br>";
		
		$res = mysql_query($sql, DB::_getConnection());
		if(!$res) die(__METHOD__."Load: <br>Failed getting records data for page: $pageNum <hr> <pre>$sql</pre> <hr>" . mysql_error() ); #&& mysql_num_rows($res)
		$row_RS = mysql_fetch_assoc($res);
		
		$ar_data = false;
				
		# calculate total rows if not received ..
		if(!$this->totalRows)
		{			
			$arSQL				= explode('LIMIT',$sql); # like "SELECT id from ficha WHERE $strFilter"
			$all_RS				= mysql_query($arSQL[0]);
			$this->totalRows	= mysql_num_rows($all_RS);			
		}
		
		# create array with all records founded		
		if($this->totalRows>0) {			
			do{
				$this->ar_records[] = $row_RS["$this->strPrimaryKeyName"];
			} while ($row_RS = mysql_fetch_assoc($res)); mysql_free_result($res);
		}
		
		$this->blIsLoaded = true;
	}
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	public function __call($strFunction, $arArguments) {
		$strMethodType 		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember 	= substr($strFunction, 4);
		switch($strMethodType) {
			case 'set_' : return($this->SetAccessor($strMethodMember, $arArguments[0]));	break;
			case 'get_' : return($this->GetAccessor($strMethodMember));						break;			
		}
		return(false);
	}
	
	private function SetAccessor($strMember, $strNewValue) {		
		if(property_exists($this, $strMember)) {
			if(is_numeric($strNewValue)) {
				eval(' $this->' . $strMember .'=' . $strNewValue . ';');	
			}else{
				if(is_string($strNewValue)) $strNewValue = addslashes($strNewValue);				
				eval(' $this->' . $strMember .'="' . $strNewValue . '";');	
			}
		}else{
			return(false)	;
		}
	}
	
	private function GetAccessor($strMember) {		
		if($this->blIsLoaded != true) {
			$this->Load();
		}
		if(property_exists($this, $strMember)) {
			eval(' $strRetVal = $this->' . $strMember .';');
			if(is_string($strRetVal)) $strRetVal = stripslashes($strRetVal);
			return($strRetVal);
		}else{
			return(false);	
		}
	}
	
	
	
	
	
	
	
	
	
	
	
	
	


}
?>