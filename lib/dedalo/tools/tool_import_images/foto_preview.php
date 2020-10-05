<?php
$TOP_TIPO=false;
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.ImageObj.php');

$photo = safe_xss($_REQUEST['f']);

# Accept images with get vars
$ar = explode('?', $photo);
if (isset($ar[0])) {
	$photo = $ar[0];
}



# IDENTIFY : Get info aboout source file Colorspace
$colorspace_info  = shell_exec( MAGICK_PATH . "identify -format '%[colorspace]' " .$photo. "[0]" );



#
# FLAGS : Command flags
#
$flags='';
switch (true) {
	
	# CMYK to RGB
	# Si la imagen orgiginal es CMYK, la convertimos a RGB aignándole un perfil de salida para la conversión. Una vez convertida (y flateada en caso de psd)
	# le eliminamos el perfil orginal (cmyk) para evitar incoherencia con el nuevo espacio de color (rgb)
	case ( strpos($colorspace_info, 'CMYK')!==false ):

		# Profile full path
		$profile_file = COLOR_PROFILES_PATH.'sRGB_Profile.icc';

		# Test profile exists
		if(!file_exists($profile_file)) throw new Exception("Error Processing Request. Color profile not found in: $profile_file", 1);				

		# Command flags				
		$flags .= "-profile \"$profile_file\" "; # -negate.
		break;
	
	# RBG TO RBG
	default:
		$flags .= " ";
		break;
}


#$cmd = MAGICK_PATH . "convert \"$photo\" $flags -flatten -strip -thumbnail 260x400 -quality 100 JPG:-";	# -negate -profile Profiles/sRGB.icc -colorspace sRGB -colorspace sRGB 
$cmd = MAGICK_PATH . "convert \"$photo\" $flags -flatten -strip -thumbnail 400x260 -quality 100 JPG:-";



header("Content-type: image/jpeg");
passthru($cmd, $retval);