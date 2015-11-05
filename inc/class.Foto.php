<?php

require_once(DEDALO_ROOT .'/Connections/config.php');

class Foto {  
     
   private $id;				# id from captacionID
   private $mode;			# mode (list,preview,etc..)
   private $fileVerify;		# boolean fileVerify 
   
     
   /*
   function __construct($captacionID=0,$mode='list',$fileVerify=true)
   {
		$this->id 			= intval($captacionID);
		$this->mode			= $mode;
		$this->fileVerify	= $fileVerify; 
   }
   */
   
	
	# BUILD FOTO . FROM CAPTACION ID
	public static function buildFoto($captacionID, $mode='list', $fileVerify=true, $w=false, $h=false) {
	   
		$id = intval($captacionID);

		# defined in config.php
		global $patImages ;	#echo $patImages;
		
		
		# fotoSource
		$fotoSource = $patImages . $id . '.jpg';
		
		# verify file existence . 
		if($fileVerify===true) {			
			# if not, change id to 0 to build default noimage	   	
			if(!file_exists($fotoSource)) $fotoSource = "../images/0.jpg";
		}
				
		
		if($mode=='list') {
			
			$width 	= 64;
			$height	= 48;		
			
		}else if($mode=='tesauro') {
			
			$width 	= 56;
			$height	= 42;
			
		}else if($mode=='preview1') {
			
			$width 	= 128;
			$height	= 96;
					
		}else if($mode=='index') {
			
			$width 	= 40;
			$height	= 30;	
					
		}else if($mode=='reg') {
			
			$width 	= 235;
			$height	= 176;			
		}
		
		# OVERWRITE DIMENSIONS
		if($w) $width 	= $w ;
		if($h) $height 	= $h ;
		
		$fotoSource .= "&fx=crop&w={$width}&h={$height}";
				
		return  "<img class=\"foto\" src=\"../inc/img.php?s=$fotoSource\" width=\"{$width}px\" height=\"{$height}px\" /> ";
			
		return false;		   
   }
   
   
   # BUILD FOTO  FROM POSTERFRAME
	public static function buildFoto_from_posterframe($reelID, $fix_no_posterframe=true, $w=false, $h=false, $fx='crop') {
		
		require_once(DEDALO_ROOT . '/media_engine/class/class.PosterFrameObj.php');
		
		$PosterFrameObj = new PosterFrameObj($reelID, $fix_no_posterframe);
		$foto_url		= $PosterFrameObj->get_url();
		
		# verify file existence .		   	
		if(!file_exists($foto_url)) $foto_url = "../images/0.jpg";
	
		
		$width 		= 64;
		$width 		= 86;
		$height		= 48;
		
		# OVERWRITE DIMENSIONS
		if($w) $width 	= $w ;
		if($h) $height 	= $h ;
		
		
		$fotoSource = $foto_url . "&fx={$fx}&w={$width}&h={$height}";
		
		if($width>64 || $height>48) {
			$random = mt_rand(1,1000000);
			$fotoSource .= "&random=$random";
		}
		
		
		return  "<img class=\"foto\" src=\"../inc/img.php?s=$fotoSource\"  /> ";
			
		return false;
			
	}
   
   
   
   
}

?>