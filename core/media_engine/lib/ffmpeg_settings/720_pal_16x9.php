<?php
/**
* FFMPEG SETTINGS PROFILE: 720_pal_16x9
* Variable-injection script for PAL high-definition 16:9 video at 720 px height.
*
* This file is NOT a standalone script. It is loaded with require() by
* Ffmpeg::build_av_alternate_command() to populate local variables that are
* then interpolated directly into the generated ffmpeg shell command.
*
* Profile identity:
*   - Resolution:         1280 × 720 px  (HD 16:9 widescreen)
*   - Broadcast standard: PAL  (< 29 fps; keyframe interval tuned to 25 = one GOP per second)
*   - Quality tier label: '720'  (maps to the $target_path sub-directory name)
*
* This profile is selected when Ffmpeg::get_setting_name() resolves to '720_pal_16x9'
* for a source file whose frame rate is below 29 fps (PAL) and whose display aspect
* ratio resolves to '16x9' via Ffmpeg::get_aspect_ratio(). Related profiles for this
* quality tier are 720_pal.php (no explicit aspect ratio suffix) and 720_ntsc_16x9.php
* (NTSC, >= 29 fps). The '16x9' suffix is appended to the setting name only when
* ffprobe explicitly reports a 16:9 display aspect ratio; the plain '720_pal' variant
* acts as the non-16:9 fallback for the same frame rate range.
*
* Two-pass encoding context (set in build_av_alternate_command):
*   Pass 1  — video only (-an), writes VBV stats to $log_file.
*   Pass 2  — video + audio, reads stats, writes to a temporary file.
*   Post-process — qt-faststart relocates the MOOV atom for progressive streaming,
*                  then temp and log files are deleted.
*
* (!) The file header comment says '404_pal' — this is a copy-paste error inherited
*     from the profile template; the actual profile is 720_pal_16x9. The code is
*     correct; only the banner comment is wrong. It has not been changed here because
*     only doc-blocks may be modified.
*
* (!) $acodec is declared here as a legacy placeholder ('libvo_aacenc').
*     It is unconditionally overridden at runtime by Ffmpeg::get_audio_codec(),
*     which probes the installed ffmpeg build and selects the best available
*     AAC encoder ('libfdk_aac', 'libvo_aacenc', or the native 'aac').
*     The value assigned below therefore has no effect on actual encoding.
*
* (!) $gammma (three 'm') is a pre-existing identifier typo. The variable name
*     is referenced by the same spelling in build_av_alternate_command() so it
*     must not be corrected here without a coordinated rename across the entire
*     ffmpeg pipeline.
*
* (!) $ab inline comment reads 'adio rate kbs' — this is a pre-existing typo for
*     'audio rate kbs'. Not corrected here; flagged only.
*
* (!) $ac inline comment reads 'nomo' — this is a pre-existing typo for 'mono'.
*     Not corrected here; flagged only.
*
* (!) Several inline comments are in Spanish (correccion de luminancia, etc.).
*     Translated equivalents are provided as additional comments below; the
*     original Spanish strings are preserved untouched per doc-only rule.
*
* @package Dédalo
* @subpackage Core
*/
# FFMPEG SETTING 404_pal

// Video encoding parameters

$vb				= '2968k';			# video rate kbs
$s				= '1280x720';		# scale
$g				= 25;				# keyframes interval (gob)

// Video encoder
// libx264 is the standard H.264 software encoder used by all Dédalo SD/HD profiles.
$vcodec			= 'libx264';		# default libx264

// Deinterlace filter
// Applied in both encoding passes via the -vf flag. yadif (Yet Another DeInterlacing
// Filter) removes interlace artefacts from field-based PAL sources frame by frame.
// ('desentrelazar' = deinterlace)
$progresivo		= "-vf yadif";		# desentrelazar

// Per-channel YUV gamma correction coefficients
// Values below 1.0 darken the channel; above 1.0 brighten it.
// These are fed into the lutyuv filter assembled in $gammma.
// ('correccion de luminancia' = luminance correction, 'correccion de B-y' = Cb correction,
//  'correccion de R-y' = Cr correction)
$gamma_y		= "0.97";			# correccion de luminancia
$gamma_u		= "1.01";			# correccion de B-y
$gamma_v		= "0.98";			# correccion de R-y

// Assembled lutyuv gamma correction filter string
// Passed to ffmpeg as a -vf argument alongside the yadif deinterlace filter.
// ('corrección de gamma' = gamma correction)
// Note: the variable name carries a pre-existing triple-'m' typo ($gammma) that is
// preserved for compatibility with build_av_alternate_command().
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # corrección de gamma

// Output container format
// Must be 'mp4' for qt-faststart compatibility (MOOV atom relocation).
$force			= 'mp4';			# default mp4

// Audio encoding parameters

$ar				= 44100;			# audio sample rate (22050)
$ab				= '128k';			# adio rate kbs
// ('numero de canales de audio' = number of audio channels; 'nomo' is a typo for 'mono')
$ac				= "2";				# numero de canales de audio 2 = stereo, 1 = nomo
// (!) $acodec is overridden at runtime by Ffmpeg::get_audio_codec(); see file header note.
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

// Quality tier sub-directory label
// Used by build_av_alternate_command() to derive the output path and by
// Ffmpeg::get_quality_from_setting() to recover the numeric quality tier.
$target_path 	= "720";			# like '404'
