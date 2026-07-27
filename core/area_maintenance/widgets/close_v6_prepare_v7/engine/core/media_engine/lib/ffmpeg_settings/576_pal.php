<?php
/**
* FFMPEG SETTINGS PROFILE: 576_pal
* Variable-injection script for the PAL standard-definition fallback profile at 576 px height.
*
* This file is NOT a standalone script. It is loaded with require() by
* Ffmpeg::build_av_alternate_command() to populate local variables that are
* then interpolated directly into the generated ffmpeg shell command.
*
* Profile identity:
*   - Resolution:         1024 × 576 px  (SD 16:9 pixel grid; see aspect-ratio note below)
*   - Broadcast standard: PAL  (25 fps; keyframe interval tuned to 25 = one GOP per second)
*   - Quality tier label: '576'  (maps to the $target_path sub-directory name)
*
* Profile selection — when this file is chosen:
*   Ffmpeg::get_setting_name() builds the setting name as:
*     <quality> + '_' + <media_standard> [+ '_' + <aspect_ratio>]
*   The aspect_ratio suffix ('16x9' or '4x3') is appended only when
*   Ffmpeg::get_aspect_ratio() returns a non-empty string. When aspect-ratio
*   detection fails (returns null or empty string) the suffix is omitted, and
*   this plain '576_pal' profile is selected as the fallback for any PAL source
*   whose pixel-ratio cannot be determined.
*   Explicit widescreen and 4:3 PAL sources are handled by:
*     576_pal_16x9.php — same pixel dimensions, also 1024 × 576
*     576_pal_4x3.php  — 720 × 576 px, 4:3 standard definition
*
* Two-pass encoding context (executed by build_av_alternate_command):
*   Pass 1  — video only (-an), writes VBV stats to $log_file.
*   Pass 2  — video + audio, reads stats, writes to a temporary file.
*   Post-process — qt-faststart relocates the MOOV atom for progressive streaming,
*                  then temp and log files are deleted.
*
* (!) $acodec is declared here as a legacy placeholder ('libvo_aacenc').
*     It is unconditionally overridden at runtime by Ffmpeg::get_audio_codec(),
*     which probes the installed ffmpeg build and selects the best available
*     AAC encoder ('libfdk_aac', 'libvo_aacenc', or the native 'aac').
*     The value assigned below therefore has no effect on actual encoding.
*
* (!) $gammma (three 'm') is a pre-existing identifier typo. The variable name
*     is referenced by the same spelling in build_av_alternate_command(), so it
*     must not be corrected here without a coordinated rename across the entire
*     ffmpeg pipeline.
*
* @package Dédalo
* @subpackage Core
*/
# FFMPEG SETTING 576_pal

// Video encoding parameters

$vb				= '1536k';			# video bitrate (kilobits per second)
$s				= '1024x576';		# output scale: width × height in pixels (16:9 pixel grid)
$g				= 25;				# keyframe interval in frames (GOP size); 25 = one keyframe per second at 25 fps PAL

// Video encoder
// libx264 is the standard H.264 software encoder used by all Dédalo SD/HD profiles.
$vcodec			= 'libx264';		# default libx264

// Deinterlace filter
// Applied in both encoding passes via the -vf flag. yadif (Yet Another DeInterlacing
// Filter) removes interlace artefacts from field-based PAL sources frame by frame.
$progresivo		= "-vf yadif";		# deinterlace filter

// Per-channel YUV gamma correction coefficients
// Values below 1.0 darken the channel; above 1.0 brighten it.
// These are fed into the lutyuv filter assembled in $gammma.
$gamma_y		= "0.97";			# luminance (Y) gamma correction coefficient — slight darkening
$gamma_u		= "1.01";			# Cb (blue-difference) gamma correction coefficient — minimal brightening
$gamma_v		= "0.98";			# Cr (red-difference) gamma correction coefficient — slight darkening

// Assembled lutyuv gamma correction filter string
// Passed to ffmpeg as a -vf argument alongside the yadif deinterlace filter.
// Note: the variable name carries a pre-existing triple-'m' typo ($gammma) that is
// preserved for compatibility with build_av_alternate_command().
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # gamma correction filter (lutyuv)

// Output container format
$force			= 'mp4';			# output container format; must be 'mp4' for qt-faststart compatibility

// Audio encoding parameters

$ar				= 44100;			# audio sample rate in Hz (CD quality; 22050 is the alternative SD rate)
$ab				= '128k';			# audio bitrate (kilobits per second) — stereo quality for SD delivery
$ac				= "2";				# audio channel count: 2 = stereo, 1 = mono
// (!) $acodec is overridden at runtime by Ffmpeg::get_audio_codec(); see file header note.
$acodec			= 'libvo_aacenc';	# legacy AAC encoder placeholder (overridden at runtime by Ffmpeg::get_audio_codec())

// Quality tier sub-directory label
// Used by build_av_alternate_command() to derive the output path and by
// Ffmpeg::get_quality_from_setting() to recover the numeric quality tier.
$target_path 	= "576";			# quality tier label matching DEDALO_AV_QUALITY subdirectory (e.g. 'av/576/')
