<?php
// FFMPEG SETTING 240_ntsc
// FFmpeg encoding profile for low-bandwidth 240-line progressive NTSC video.
//
// This file is a configuration fragment. It is loaded via require() inside
// Ffmpeg::build_av_alternate_command() (core/media_engine/class.Ffmpeg.php) and
// injects its variables directly into the caller's scope. It must never be
// included standalone or autoloaded as a class — it has no namespace, no class,
// and no return value.
//
// The NTSC variant targets 30 fps (keyframe interval $g = 30), distinguishing it
// from the PAL sibling (240_pal.php) which uses $g = 25. Both share the same
// frame dimensions (428x240) and audio settings; the GOP size is the only
// difference between the two.
//
// This profile is intended for very-low-bandwidth delivery (mobile, slow
// connections). Both video bitrate ($vb = '384k') and audio bitrate ($ab = '28k')
// are set well below those of higher-quality tiers (e.g. 404_ntsc.php).
//
// (!) $acodec is set to 'libvo_aacenc', which was removed from FFmpeg around
//     version 2.8. Modern builds will reject this encoder. The caller
//     (build_av_alternate_command) resolves the actual audio codec at runtime via
//     Ffmpeg::get_audio_codec(), which can override $acodec after the require().
//     Verify that override path is active on the target server.
//
// (!) The variable name $gammma (triple 'm') is a pre-existing typo shared across
//     all ffmpeg_settings files. Do not rename it here; the consuming code
//     references the same misspelled identifier.
//
// (!) The original file-header label read "240_pal", copied verbatim from the PAL
//     sibling. The actual profile encoded in this file is 240_ntsc (corrected above).
//
// Variables injected into the caller's scope:
//   $vb          string  Video bitrate (e.g. '384k')
//   $s           string  Output frame dimensions WxH (e.g. '428x240')
//   $g           int     GOP size / keyframe interval in frames
//   $vcodec      string  FFmpeg video codec name
//   $progresivo  string  FFmpeg filter fragment for deinterlacing (yadif)
//   $gamma_y     string  Luma (Y) gamma correction coefficient for lutyuv
//   $gamma_u     string  Cb (U / B–Y) gamma correction coefficient for lutyuv
//   $gamma_v     string  Cr (V / R–Y) gamma correction coefficient for lutyuv
//   $gammma      string  Full -vf lutyuv filter string built from the three coefficients above
//   $force       string  Container format override (e.g. 'mp4')
//   $ar          int     Audio sample rate in Hz
//   $ab          string  Audio bitrate (e.g. '28k')
//   $ac          string  Number of audio channels ('2' = stereo, '1' = mono)
//   $acodec      string  FFmpeg audio codec name (may be overridden at runtime; see (!) above)
//   $target_path string  Sub-directory name under the media root for this quality tier

# FFMPEG SETTING 240_pal

$vb				= '384k';			# video rate kbs
$s				= '428x240';		# scale
$g				= 30;				# keyframes interval (gob)
$vcodec			= 'libx264';		# default libx264

$progresivo		= "-vf yadif";		# deinterlace filter (yadif = yet another deinterlacing filter); (!) source comment "desentrelazar" was in Spanish
$gamma_y		= "0.97";			# luma (Y) gamma correction coefficient; (!) source comment "correccion de luminancia" was in Spanish
$gamma_u		= "1.01";			# Cb (U / B-Y) gamma correction coefficient; (!) source comment "correccion de B-y" was in Spanish
$gamma_v		= "0.98";			# Cr (V / R-Y) gamma correction coefficient; (!) source comment "correccion de R-y" was in Spanish
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # full lutyuv filter string; variable name has a pre-existing triple-'m' typo — do not rename
$force			= 'mp4';			# default mp4

$ar				= 24000;			# audio sample rate in Hz (note: 22050 Hz was an earlier candidate, left in source as reference)
$ab				= '28k';			# audio bitrate; (!) source comment "adio rate kbs" is a pre-existing typo for "audio"
$ac				= "1";				# number of audio channels: 2 = stereo, 1 = mono; (!) source comment "nomo" is a pre-existing typo for "mono"; mono chosen for bandwidth economy at 240p
$acodec			= 'libvo_aacenc';	# audio codec; (!) libvo_aacenc was removed from FFmpeg ~2.8 — see file header note

$target_path 	= "240";			# output sub-directory name for this quality tier (mirrors the resolution label)
