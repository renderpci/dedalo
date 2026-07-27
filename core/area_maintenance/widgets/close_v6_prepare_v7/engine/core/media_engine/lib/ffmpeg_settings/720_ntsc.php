<?php
/**
* FFMPEG SETTINGS PROFILE: 720_ntsc
* Variable-injection script for NTSC high-definition 16:9 video at 720 px height.
*
* This file is NOT a standalone script. It is loaded with require() by
* Ffmpeg::build_av_alternate_command() to populate local variables that are
* then interpolated directly into the generated ffmpeg shell command.
*
* Profile identity:
*   - Resolution:         1280 × 720 px  (HD 16:9 at 720p)
*   - Broadcast standard: NTSC  (≥ 29 fps; keyframe interval tuned to 30 = one GOP per second at 29.97 fps)
*   - Quality tier label: '720'  (maps to the $target_path sub-directory name)
*
* This profile is selected when Ffmpeg::get_setting_name() resolves to '720_ntsc'
* for a source file whose frame rate is >= 29 fps (NTSC cadence, e.g. 29.97 or 30 fps)
* and whose aspect ratio is neither explicitly 4:3 nor 16:9 widescreen (the explicit
* 16:9 variant is 720_ntsc_16x9.php). In practice this profile acts as the plain-NTSC
* fallback for 1280 × 720 HD output — contrast with 720_pal.php (25 fps, GOP = 25).
*
* Two-pass encoding context (set in build_av_alternate_command):
*   Pass 1  — video only (-an), writes VBV stats to $log_file.
*   Pass 2  — video + audio, reads stats, writes to a temporary file.
*   Post-process — qt-faststart relocates the MOOV atom for progressive streaming,
*                  then temp and log files are deleted.
*
* (!) The file-header comment reads '404_pal' — this is a copy-paste artefact from
*     the original 404_pal.php template. The actual profile is 720_ntsc. Do not rely
*     on that comment string for any programmatic purpose.
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
* @package Dédalo
* @subpackage Core
*/
# FFMPEG SETTING 404_pal

$vb				= '2968k';			# video bitrate (kilobits per second) — high-bitrate HD target
$s				= '1280x720';		# output scale: width × height in pixels (HD 720p)
$g				= 30;				# keyframe interval in frames (GOP size); 30 = one keyframe per second at 29.97 fps NTSC

// Video encoder
// libx264 is the standard H.264 software encoder used by all Dédalo SD/HD profiles.
$vcodec			= 'libx264';		# default libx264

// Deinterlace filter
// Applied in both encoding passes via the -vf flag. yadif (Yet Another DeInterlacing
// Filter) removes interlace artefacts from field-based NTSC sources frame by frame.
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
// Stereo at CD-quality sample rate suits HD video deliverables.
$ar				= 44100;			# audio sample rate in Hz (CD quality; 22050 is the alternative SD rate)
$ab				= '128k';			# audio bitrate (kilobits per second) — standard stereo quality
$ac				= "2";				# audio channel count: 2 = stereo, 1 = mono
// (!) $acodec is overridden at runtime by Ffmpeg::get_audio_codec(); see file header note.
$acodec			= 'libvo_aacenc';	# legacy AAC encoder placeholder (overridden at runtime by Ffmpeg::get_audio_codec())

// Quality tier sub-directory label
// Used by build_av_alternate_command() to derive the output path and by
// Ffmpeg::get_quality_from_setting() to recover the numeric quality tier.
$target_path 	= "720";			# quality tier label matching DEDALO_AV_QUALITY subdirectory (e.g. 'av/720/')
