<?php
# FFMPEG SETTING 404_pal

$vb				= '2968k';			# video rate kbs
$s				= '1280x720';		# scale
$g				= 30;				# keyframes interval (gob)
$vcodec			= 'libx264';		# default libx264

$progresivo		= "-vf yadif";		# desentrelazar
$gamma_y		= "0.97";			# correccion de luminancia
$gamma_u		= "1.01";			# correccion de B-y
$gamma_v		= "0.98";			# correccion de R-y
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # corrección de gamma
$force			= 'mp4';			# default mp4

$ar				= 44100;			# audio sample rate (22050)
$ab				= '128k';			# adio rate kbs
$ac				= "2";				# numero de canales de audio 2 = stereo, 1 = nomo
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

$target_path 	= "720";			# like '404'
