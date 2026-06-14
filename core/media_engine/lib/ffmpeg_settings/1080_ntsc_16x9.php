<?php
// FFMPEG SETTING 1080_ntsc_16x9
// FFmpeg encoding profile for full-HD 1080-line progressive NTSC video, widescreen 16:9.
//
// This file is a configuration fragment. It is loaded via require() inside
// Ffmpeg::build_av_alternate_command() (core/media_engine/class.Ffmpeg.php) and injects
// its variables directly into the caller's scope. It must never be included standalone
// or autoloaded as a class — it has no namespace, no class, and no return value.
//
// The NTSC variant targets 30 fps (keyframe interval $g = 30), distinguishing it from the
// PAL siblings (1080_pal_16x9.php, 1080_pal.php) which use $g = 25.
// The 16x9 suffix signals widescreen aspect ratio; the non-suffixed sibling (1080_ntsc.php)
// carries the same values for backward-compatibility.
//
// (!) $acodec is set to 'libvo_aacenc', which was removed from FFmpeg around version 2.8.
//     Modern builds will reject this encoder. The caller (build_av_alternate_command) resolves
//     the actual audio codec at runtime via Ffmpeg::get_audio_codec(), which can override
//     $acodec after the require(). Verify that override path is active on the target server.
//
// (!) The variable name $gammma (triple 'm') is a pre-existing typo shared across all
//     ffmpeg_settings files. Do not rename it here; the consuming code references the same
//     misspelled identifier.
//
// Variables injected into the caller's scope:
//   $vb          string  Video bitrate (e.g. '6656k')
//   $s           string  Output frame dimensions WxH (e.g. '1920x1080')
//   $g           int     GOP size / keyframe interval in frames
//   $vcodec      string  FFmpeg video codec name
//   $progresivo  string  FFmpeg filter fragment for deinterlacing (yadif)
//   $gamma_y     string  Luma (Y) gamma correction coefficient for lutyuv
//   $gamma_u     string  Cb (U / B–Y) gamma correction coefficient for lutyuv
//   $gamma_v     string  Cr (V / R–Y) gamma correction coefficient for lutyuv
//   $gammma      string  Full -vf lutyuv filter string built from the three coefficients above
//   $force       string  Container format override (e.g. 'mp4')
//   $ar          int     Audio sample rate in Hz
//   $ab          string  Audio bitrate (e.g. '160k')
//   $ac          string  Number of audio channels ('2' = stereo, '1' = mono)
//   $acodec      string  FFmpeg audio codec name (may be overridden at runtime; see (!) above)
//   $target_path string  Sub-directory name under the media root for this quality tier

// (!) File-header label below was copy-pasted from 404_pal.php and left stale in the original;
//     the actual profile is 1080_ntsc_16x9 (corrected in the comment above).

$vb				= '6656k';			# video rate kbs
$s				= '1920x1080';		# scale
$g				= 30;				# keyframe interval (GOP); 30 matches NTSC 30 fps — PAL variants use 25
$vcodec			= 'libx264';		# default libx264

$progresivo		= "-vf yadif";		# deinterlace filter (yadif = yet another deinterlacing filter)
$gamma_y		= "0.97";			# luma (Y) gamma correction coefficient
$gamma_u		= "1.01";			# Cb (U / B-Y) gamma correction coefficient
$gamma_v		= "0.98";			# Cr (V / R-Y) gamma correction coefficient
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # full lutyuv filter string; variable name has a pre-existing triple-'m' typo — do not rename
$force			= 'mp4';			# default mp4

$ar				= 44100;			# audio sample rate in Hz (44100 Hz / CD quality)
$ab				= '160k';			# audio bitrate; (!) source comment "adio rate kbs" is a pre-existing typo
$ac				= "2";				# number of audio channels: 2 = stereo, 1 = mono; (!) source comment "nomo" is a pre-existing typo for "mono"
$acodec			= 'libvo_aacenc';	# audio codec; (!) libvo_aacenc was removed from FFmpeg ~2.8 — see file header note

$target_path 	= "1080";			# output sub-directory name for this quality tier (mirrors the resolution label)
