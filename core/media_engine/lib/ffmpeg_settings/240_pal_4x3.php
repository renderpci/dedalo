<?php
/**
* FFMPEG SETTINGS — 240p PAL 4:3 (Standard Definition, European broadcast standard)
* Configuration fragment for transcoding video to 240p PAL at a 4:3 aspect ratio.
*
* This file is NOT a class or a standalone script. It is loaded via require() inside
* Ffmpeg::build_av_alternate_command() (core/media_engine/class.Ffmpeg.php) when the caller
* requests the '240_pal_4x3' setting. After inclusion all variables defined here become
* local variables inside that method's scope and are spliced directly into the ffmpeg shell
* command string.
*
* Profile characteristics:
* - Target resolution : 320×240 pixels (4:3 standard-definition frame).
* - Video bit-rate    : 384 kbps — low-bandwidth streaming or archival proxy.
* - Frame/GOP rate    : keyframe every 25 frames (PAL 25 fps cadence; NTSC equivalent uses 30).
* - Deinterlace       : always applied via the yadif filter ($progresivo).
* - Gamma correction  : subtle luminance and chroma adjustments via lutyuv (see below).
* - Audio             : mono, 24 kHz sample rate, 28 kbps — telephony-quality proxy audio.
* - Container         : MP4 (force flag).
*
* Relationship to sibling files:
* - 240_ntsc_4x3.php  — identical profile but $g = 30 (NTSC ~30 fps GOP interval).
* - 240_pal_16x9.php  — same PAL GOP (25) but wider frame: 428×240.
* - 240_pal.php       — generic PAL 240p without a forced aspect-ratio suffix.
*
* (!) $acodec is set to 'libvo_aacenc' as a legacy fallback. At runtime,
* Ffmpeg::get_audio_codec() probes the installed ffmpeg build and overrides this value
* with the best available AAC encoder (libfdk_aac > libvo_aacenc > aac). The local
* variable written here is therefore only used if the runtime probe is skipped.
*
* @package Dédalo
* @subpackage Core
*/

# FFMPEG SETTING 240_pal

// VIDEO PARAMETERS
// Core encoding settings consumed by the two-pass ffmpeg command in build_av_alternate_command().
$vb				= '384k';			# video rate kbs
$s				= '320x240';		# scale
$g				= 25;				# keyframes interval (gob)
$vcodec			= 'libx264';		# default libx264

// DEINTERLACE + GAMMA
// $progresivo applies the yadif (Yet Another DeInterlacing Filter) to convert interlaced
// frames to progressive scan. It is always applied regardless of whether the source is
// already progressive — build_av_alternate_command() does not inspect the source stream.
// (!) Variable name is Spanish for "progressive"; kept as-is for backward compatibility.
$progresivo		= "-vf yadif";		# deinterlace filter (Spanish: desentrelazar)

// Gamma correction coefficients for the YUV color space:
//   $gamma_y — luma (Y) plane: slight desaturation of brightness
//   $gamma_u — blue-difference chroma (Cb/U) plane
//   $gamma_v — red-difference chroma (Cr/V) plane
// These three scalars feed into the $gammma lutyuv filter string below.
// (!) Note the three-m typo in '$gammma' — it must not be renamed without updating
//     all callsites in class.Ffmpeg.php that reference this variable name.
$gamma_y		= "0.97";			# luma correction (correccion de luminancia)
$gamma_u		= "1.01";			# blue-difference chroma correction (correccion de B-y)
$gamma_v		= "0.98";			# red-difference chroma correction (correccion de R-y)
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # gamma correction filter (corrección de gamma)
$force			= 'mp4';			# default mp4

// AUDIO PARAMETERS
// Low-fidelity proxy audio suitable for 240p proxy streams.
// Mono (ac=1), narrow sample rate (24 kHz), and low bit-rate (28 k) keep file sizes minimal.
// (!) The comment in $ab originally read 'adio rate kbs' — a typo for 'audio rate kbps'.
// (!) The comment in $ac originally read 'nomo' — a typo for 'mono'. Both are preserved in code.
$ar				= 24000;			# audio sample rate in Hz (fallback comment originally cited 22050)
$ab				= '28k';			# audio bit-rate kbps (Spanish typo in original: 'adio rate kbs')
$ac				= "1";				# audio channel count: 1 = mono, 2 = stereo (Spanish typo in original: 'nomo')
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

// OUTPUT ROUTING
// $target_path defines the sub-directory token used when placing the transcoded file.
// build_av_alternate_command() appends this to the media root path to derive $target_path_dir.
$target_path 	= "240";			# like '404'
