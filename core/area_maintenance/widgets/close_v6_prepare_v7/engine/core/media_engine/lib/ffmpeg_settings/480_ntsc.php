<?php
// FFMPEG SETTING 480_ntsc
// FFmpeg encoding profile for standard-definition 480-line progressive NTSC video (widescreen).
//
// This file is a configuration fragment. It is loaded via require() inside
// Ffmpeg::build_av_alternate_command() (core/media_engine/class.Ffmpeg.php) and
// injects its variables directly into the caller's scope. It must never be
// included standalone or autoloaded as a class — it has no namespace, no class,
// and no return value.
//
// The NTSC variant targets 30 fps (keyframe interval $g = 30), distinguishing it
// from the PAL sibling (480p would use $g = 25). The 854x480 frame dimensions
// correspond to a 16:9 widescreen aspect ratio at 480-line SD resolution — the
// same dimensions used by 480_ntsc_16x9.php. The narrower 4:3 variant (640x480)
// lives in 480_ntsc_4x3.php.
//
// This profile targets mid-range bandwidth delivery: video bitrate ($vb = '1024k')
// and audio bitrate ($ab = '128k') place it between the low-bandwidth 240/288 tiers
// and the HD 720/1080 tiers in Ffmpeg::$ar_supported_quality_settings.
//
// (!) The original file-header label read "404_pal", copied verbatim from a PAL
//     sibling. The actual profile encoded in this file is 480_ntsc (corrected above).
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
// Variables injected into the caller's scope:
//   $vb          string  Video bitrate (e.g. '1024k')
//   $s           string  Output frame dimensions WxH (e.g. '854x480')
//   $g           int     GOP size / keyframe interval in frames
//   $vcodec      string  FFmpeg video codec name
//   $progresivo  string  FFmpeg filter fragment for deinterlacing (yadif)
//   $gamma_y     string  Luma (Y) gamma correction coefficient for lutyuv
//   $gamma_u     string  Cb (U / B–Y) gamma correction coefficient for lutyuv
//   $gamma_v     string  Cr (V / R–Y) gamma correction coefficient for lutyuv
//   $gammma      string  Full -vf lutyuv filter string built from the three coefficients above
//   $force       string  Container format override (e.g. 'mp4')
//   $ar          int     Audio sample rate in Hz
//   $ab          string  Audio bitrate (e.g. '128k')
//   $ac          string  Number of audio channels ('2' = stereo, '1' = mono)
//   $acodec      string  FFmpeg audio codec name (may be overridden at runtime; see (!) above)
//   $target_path string  Sub-directory name under the media root for this quality tier

# FFMPEG SETTING 404_pal

$vb				= '1024k';			# video rate kbs
$s				= '854x480';		# scale
$g				= 30;				# keyframes interval (gob)
$vcodec			= 'libx264';		# default libx264

$progresivo		= "-vf yadif";		# deinterlace filter (yadif = yet another deinterlacing filter); (!) source comment "desentrelazar" was in Spanish
$gamma_y		= "0.97";			# luma (Y) gamma correction coefficient; (!) source comment "correccion de luminancia" was in Spanish
$gamma_u		= "1.01";			# Cb (U / B-Y) gamma correction coefficient; (!) source comment "correccion de B-y" was in Spanish
$gamma_v		= "0.98";			# Cr (V / R-Y) gamma correction coefficient; (!) source comment "correccion de R-y" was in Spanish
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # full lutyuv filter string; variable name has a pre-existing triple-'m' typo — do not rename
$force			= 'mp4';			# default mp4

$ar				= 44100;			# audio sample rate in Hz (note: 22050 Hz was an earlier candidate, left in source as reference)
$ab				= '128k';			# audio bitrate; (!) source comment "adio rate kbs" is a pre-existing typo for "audio"
$ac				= "2";				# number of audio channels: 2 = stereo, 1 = mono; (!) source comments "numero de canales de audio" and "nomo" were in Spanish / contained a typo for "mono"
$acodec			= 'libvo_aacenc';	# audio codec; (!) libvo_aacenc was removed from FFmpeg ~2.8 — see file header note

$target_path 	= "480";			# output sub-directory name for this quality tier (mirrors the resolution label); (!) source comment "like '404'" referenced the wrong tier
