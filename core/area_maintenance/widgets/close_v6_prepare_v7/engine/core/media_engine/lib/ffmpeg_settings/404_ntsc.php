<?php
/**
* FFMPEG SETTINGS — 404_ntsc
* Quality-profile variables for 404-line NTSC transcoding (default aspect ratio).
*
* This file is a settings fragment — it contains no functions or classes. It is
* included at runtime by Ffmpeg::build_av_alternate_command() via require(), which
* populates local variables in that method's scope. The variables defined here are
* then used to build the two-pass ffmpeg shell command.
*
* Profile characteristics:
* - Target quality: 404-line (720×404 pixels), NTSC broadcast standard (30 fps GOP).
* - Video: H.264 (libx264) at 1 280 kbit/s, two-pass, with deinterlace + gamma correction.
* - Audio: mono AAC at 44 100 Hz / 64 kbit/s (suitable for voice-primary archive content).
* - Container: MP4 (MOOV atom moved by qt-faststart after encode for web streaming).
*
* NTSC vs PAL distinction:
* - GOP size ($g = 30) matches the NTSC display rate of ~29.97 fps (one keyframe per second).
*   The companion PAL file (404_pal.php) uses $g = 25, matching the 25 fps PAL frame rate.
* - Video bitrate ($vb = '1280k') is higher than the PAL equivalent ('1024k'), compensating
*   for the slightly higher temporal data rate of NTSC content.
*
* All variable names must match exactly what Ffmpeg::build_av_alternate_command() expects;
* adding or renaming variables here without updating the consumer will silently break encodes.
*
* (!) The $acodec value 'libvo_aacenc' is a legacy encoder removed from modern ffmpeg builds.
*     Ffmpeg::build_av_alternate_command() overrides $acodec at runtime via get_audio_codec(),
*     which falls back through libfdk_aac → libvo_aacenc → native aac in order of preference.
*     This default is therefore never used on a current installation.
*
* (!) The header comment on line 2 incorrectly reads "404_pal" — this is a copy-paste artefact
*     from the PAL sibling file. The actual profile is 404_ntsc (see $g = 30 and $vb = '1280k').
*
* @package Dédalo
* @subpackage Core
*/

# FFMPEG SETTING 404_pal

$vb				= '1280k';			# video rate kbs
$s				= '720x404';		# scale
$g				= 30;				# keyframes interval (gob)
$vcodec			= 'libx264';		# default libx264

$progresivo		= "-vf yadif";		# deinterlace filter
$gamma_y		= "0.97";			# luminance gamma correction coefficient
$gamma_u		= "1.01";			# blue-luma (B-Y) gamma correction coefficient
$gamma_v		= "0.98";			# red-luma (R-Y) gamma correction coefficient
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # assembled lutyuv gamma correction filter string; note: triple-m typo in '$gammma' is intentional preservation matching the consumer in class.Ffmpeg
$force			= 'mp4';			# default mp4

$ar				= 44100;			# audio sample rate (22050)
$ab				= '64k';			# audio bitrate kbs (typo 'adio' preserved in original source)
$ac				= "1";				# number of audio channels: 2 = stereo, 1 = mono
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

$target_path 	= "404";			# like '404'
