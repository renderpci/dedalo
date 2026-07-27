<?php
/**
* FFMPEG SETTING: 1080_NTSC
* FFmpeg transcoding parameter set for full-HD (1080p) output in NTSC frame-rate territory.
*
* This file is a plain PHP variable-injection include. It is loaded via require() inside
* Ffmpeg::build_av_alternate_command() (core/media_engine/class.Ffmpeg.php) and injects its
* variables directly into that method's local scope. It has no classes, functions, or return
* values of its own.
*
* Target profile:
*   - Resolution : 1920 × 1080 px
*   - Frame system: NTSC (29.97 fps baseline; keyframe interval set to 30 — one per nominal second)
*   - Container  : MP4 (H.264 video + AAC audio)
*   - Intended for full-HD web delivery from NTSC-originated material
*
* Variables injected into the caller's scope after require():
*   $vb, $s, $g, $vcodec                — video encoding parameters
*   $progresivo, $gamma_y/$u/$v, $gammma — deinterlace and colour-correction filter strings
*   $force                               — output container format
*   $ar, $ab, $ac, $acodec             — audio encoding parameters
*   $target_path                         — subdirectory name used when building the output path
*
* (!) NOTE: $acodec is set to 'libvo_aacenc', which was removed from FFmpeg in 2015. Modern
*     FFmpeg builds should use 'aac' or 'libfdk_aac'. This value is kept verbatim to avoid
*     unintended behaviour changes — update in the caller or replace the value here after
*     verifying the installed FFmpeg version.
*
* (!) NOTE: The original header comment in this file read "FFMPEG SETTING 404_pal", which is a
*     copy-paste artefact from a sibling settings file. The actual profile is 1080_ntsc.
*
* @package Dédalo
* @subpackage Core
*/

# FFMPEG SETTING 404_pal

// VIDEO PARAMETERS
// Core encoding settings consumed by build_av_alternate_command() to construct the -vb, -s,
// -g, and -vcodec arguments of the ffmpeg command line.
$vb				= '6656k';			# video rate kbs
$s				= '1920x1080';		# scale
$g				= 30;				# keyframes interval (gob)
// 30 = one keyframe per nominal NTSC second (29.97 fps rounded up); PAL equivalent uses 25.
$vcodec			= 'libx264';		# default libx264

// FILTER STRINGS
// These are passed verbatim as -vf arguments. They are built as strings here so that
// build_av_alternate_command() can select which filters to apply per conversion step.

// Deinterlace filter: yadif (Yet Another DeInterlacing Filter) removes interlace combing
// artefacts from NTSC-interlaced source material before downscaling or encoding.
$progresivo		= "-vf yadif";		# deinterlace

// Luma/chroma gamma correction values.
// Slight roll-off on luma (0.97) and chroma (0.98 R-Y, 1.01 B-Y) compensates for the
// typical luma boost and chroma imbalance introduced by broadcast-to-digital capture chains.
$gamma_y		= "0.97";			# luma (Y) correction
$gamma_u		= "1.01";			# B-Y (Cb) correction
$gamma_v		= "0.98";			# R-Y (Cr) correction
// (!) Typo in identifier: '$gammma' has three 'm's. This matches the name expected by
//     build_av_alternate_command() — do not rename without updating the caller.
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # gamma correction filter
$force			= 'mp4';			# default mp4

// AUDIO PARAMETERS
$ar				= 44100;			# audio sample rate (22050)
// CD-quality 44.1 kHz for full-HD delivery; lower-resolution profiles (240, 404) use 22–24 kHz.
$ab				= '160k';			# audio bitrate kbs
// (!) Typo in original comment: "adio rate kbs" — kept verbatim; meaning is "audio rate kbs".
$ac				= "2";				# audio channel count: 2 = stereo, 1 = mono
// (!) Typo in original comment: "nomo" — meaning is "mono".
// (!) $acodec 'libvo_aacenc' was removed from FFmpeg ~2015; modern builds require 'aac' or
//     'libfdk_aac'. See class.Ffmpeg::build_av_alternate_command() before changing.
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

// OUTPUT PATH
// The subdirectory name appended to the media root when building the output file path.
// Must match the directory that Dédalo creates under the section's media folder
// (e.g. /path/to/media/<section_tipo>/<section_id>/1080/<filename>.mp4).
$target_path 	= "1080";			# like '404'
