<?php

class Thumb {  
     
   private $source;
   
   private $image;  
   private $type;  
   private $width; 
   private $height;  
     
   
   function __construct($source)
   {
		$this->source = $source;
		$this->loadImage(); 
   }
   
   //---Método de leer la imagen  
   function loadImage() {  
        
      //---Tomar las dimensiones de la imagen 
      $info = @getimagesize($this->source);  if(!$info) return false;
	  
         #dump($info,'image info'); 
	   
      $this->width	= $info[0];  
      $this->height = $info[1];  
      $this->type	= $info[2];     
      
      //---Dependiendo del tipo de imagen crear una nueva imagen  
      switch($this->type){          
         case IMAGETYPE_JPEG:  
            $this->image = imagecreatefromjpeg($this->source);  
         break;          
         case IMAGETYPE_GIF:  
            $this->image = imagecreatefromgif($this->source);  
         break;          
         case IMAGETYPE_PNG:  
            $this->image = imagecreatefrompng($this->source);  
         break;          
      }
	  
	  return $this->image ;   
   }  
     
	//---Método de guardar la imagen  
	function save($name, $quality = 100) {  
		
		#if(!$this->image) return false;
		
		//---Guardar la imagen en el tipo de archivo correcto  
		switch($this->type){          
		 case IMAGETYPE_JPEG:  
			$save = imagejpeg($this->image, $name, $quality);  
			break;          
		 case IMAGETYPE_GIF:  
			 $save = imagegif($this->image, $name);  
			break;          
		 case IMAGETYPE_PNG:  
			$pngquality = floor(($quality - 10) / 10);  
			$save = imagepng($this->image, $name, $pngquality);  
			break;          
		}
		#imagedestroy($this->image);
		
		return $save;
	}  
     
	//---Método de mostrar la imagen sin salvarla  
	function show() { 
      
		//---Mostrar la imagen dependiendo del tipo de archivo  
      switch($this->type){
         case IMAGETYPE_JPEG:  
      	  $img = imagejpeg($this->image);
           break;          
         case IMAGETYPE_GIF:  
            $img = imagegif($this->image);
            break;          
         case IMAGETYPE_PNG:  
            $img = imagepng($this->image);
            break; 
      }
		#imagedestroy($this->image);
		#return $img;
	}  
     
   //---Método de redimensionar la imagen sin deformarla  
   function resize($value, $prop) {
        
      //---Determinar la propiedad a redimensionar y la propiedad opuesta  
      $prop_value	   = ($prop === 'width') ? $this->width : $this->height;  
      $prop_versus	= ($prop === 'width') ? $this->height : $this->width;
	  
      if(!$prop_value) return false;
	  
      //---Determinar el valor opuesto a la propiedad a redimensionar  
      $pcent = $value / $prop_value;        
      $value_versus = $prop_versus * $pcent;  
        
      //---Crear la imagen dependiendo de la propiedad a variar  
      $image = ($prop === 'width') ? imagecreatetruecolor($value, $value_versus) : imagecreatetruecolor($value_versus, $value);  
        
      //---Hacer una copia de la imagen dependiendo de la propiedad a variar  
      switch($prop){  
           
         case 'width':  
            imagecopyresampled($image, $this->image, 0, 0, 0, 0, $value, $value_versus, $this->width, $this->height);  
         break;  
           
         case 'height':  
            imagecopyresampled($image, $this->image, 0, 0, 0, 0, $value_versus, $value, $this->width, $this->height);  
         break;  
           
      }  
        
      //---Actualizar la imagen y sus dimensiones  
      #$info = getimagesize($name);  
	   #$info = getimagesize($this->image); 
        
      $this->width	= imagesx($image);  
      $this->height  = imagesy($image);  
      $this->image	= $image;        
   }


   
   
   function resizeWithLimits($maxWidth,$maxHeight) {
	
		# resolve bigger parameter of this image
		#if($this->width	>= $this->height)
      if($this->width >= $this->height && $maxWidth <= $maxHeight)
		{
			$bigger		= 'width';
			$toValue 	= $maxWidth ;
		}else{
			$bigger 	= 'height';
			$toValue 	= $maxHeight ;
		}
		
		$this->resize($value=$toValue, $prop=$bigger);
   }
   
   function resize_basic($width,$height) {
	   
      $new_image = imagecreatetruecolor($width, $height);
      imagecopyresampled($new_image, $this->image, 0, 0, 0, 0, $width, $height, $this->width, $this->height);
      $this->image = $new_image;   
   }


   function rotate($degrees) {
      $this->loadImage();
      #$new_image = imagecreatefromjpeg($this->image);
      $rotate_image = imagerotate($this->image, $degrees, 0);
      $this->image = $rotate_image;      
   }
      
     
   //---Método de extraer una sección de la imagen sin deformarla  
   function crop($cwidth, $cheight, $pos = 'center') {  
      
      if(intval($cwidth)===0 || intval($cheight)===0 || !$this->width ) return false;
	  
	  //---Hallar los valores a redimensionar 
      $new_w = $cwidth; 
      $new_h = ($cwidth / $this->width) * $this->height; 
       
      //---Si la altura es menor recalcular por la altura 
      if($new_h < $cheight){ 
          
         $new_h = $cheight; 
         $new_w = ($cheight / $this->height) * $this->width; 
       
      } 
       
      $this->resize($new_w, 'width'); 
        
      //---Crear la imagen tomando la porción del centro de la imagen redimensionada con las dimensiones deseadas  
      $image = imagecreatetruecolor($cwidth, $cheight);  
       
      switch($pos){  
           
         case 'center':  
            imagecopyresampled($image, $this->image, 0, 0, abs(($this->width - $cwidth) / 2), abs(($this->height - $cheight) / 2), $cwidth, $cheight, $cwidth, $cheight);  
         break;  
           
         case 'left':  
            imagecopyresampled($image, $this->image, 0, 0, 0, abs(($this->height - $cheight) / 2), $cwidth, $cheight, $cwidth, $cheight);  
         break;  
           
         case 'right':  
            imagecopyresampled($image, $this->image, 0, 0, $this->width - $cwidth, abs(($this->height - $cheight) / 2), $cwidth, $cheight, $cwidth, $cheight);  
         break;  
           
         case 'top':  
            imagecopyresampled($image, $this->image, 0, 0, abs(($this->width - $cwidth) / 2), 0+0, $cwidth, $cheight, $cwidth, $cheight);  
         break;  
           
         case 'bottom':  
            imagecopyresampled($image, $this->image, 0, 0, abs(($this->width - $cwidth) / 2), $this->height - $cheight, $cwidth, $cheight, $cwidth, $cheight);  
         break;        
      }  
	  
		#imagedestroy($image);
		#imagedestroy($this->image);
      
      return $this->image = $image;  
   }  
   
   
   
	function __destruct()
	{
		if($this->image) imagedestroy($this->image);   
	}
   
   
     
}  
?>