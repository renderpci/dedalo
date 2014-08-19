<?php
# FFMPEG SETTING 288_pal

$b				= '224k';			# video rate kbs
$maxrate		= '256k';			# max video rate kbs
$s				= '360x202';		# scale
$g				= 25;				# keyframes interval (gob)	
$vcodec			= 'libx264';		# default libx264
$force			= 'mp4';			# default mp4

$ar				= 22050;			# audio sample rate (22050)
$ab				= '32k';			# adio rate kbs
$acodec			= 'libvo_aacenc';	# default libvo_aacenc				
$target_path	= 'low';

?>