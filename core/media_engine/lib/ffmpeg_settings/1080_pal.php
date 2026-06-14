<?php
/**
* FFMPEG SETTINGS — 1080_pal
* Conversion parameters for full-HD PAL video at 1920×1080 resolution.
*
* This file is not a standalone script. It is loaded via require() inside
* Ffmpeg::build_av_alternate_command() to inject the settings variables
* into that method's local scope. Every variable defined here becomes
* directly available to the command-building logic in that method.
*
* PAL standard: 25 fps progressive or interlaced at 50 Hz.
* Full-HD target: 1920×1080 pixels, H.264 video, AAC audio, MP4 container.
*
* Variable contract (all variables are consumed by Ffmpeg::build_av_alternate_command()):
*   $vb          — target video bitrate string passed to ffmpeg -vb flag
*   $s           — output resolution passed to ffmpeg -s flag
*   $g           — GOP size (keyframe interval) passed to ffmpeg -g flag
*   $vcodec      — video encoder name passed to ffmpeg -vcodec flag
*   $progresivo  — ffmpeg filter string for deinterlacing (applied when source is interlaced)
*   $gamma_y     — luma (Y) gamma correction factor used in the lutyuv filter expression
*   $gamma_u     — chroma blue-difference (U/Cb) gamma correction factor
*   $gamma_v     — chroma red-difference (V/Cr) gamma correction factor
*   $gammma      — full lutyuv filter string built from the three gamma factors above
*   $force       — output container format name passed to ffmpeg -f flag
*   $ar          — audio sample rate in Hz passed to ffmpeg -ar flag
*   $ab          — target audio bitrate string passed to ffmpeg -ab flag
*   $ac          — number of audio output channels passed to ffmpeg -ac flag
*   $target_path — subdirectory name under the AV media tree where the output file is stored
*   $acodec      — audio encoder name; NOTE: Ffmpeg::build_av_alternate_command() overrides
*                  this value at runtime using Ffmpeg::get_audio_codec() to select the best
*                  encoder available in the installed ffmpeg binary (libfdk_aac > libvo_aacenc > aac).
*                  The value here serves only as a documented fallback placeholder.
*
* @package Dédalo
* @subpackage Core
*/

# FFMPEG SETTING 404_pal
// (!) The header comment above says "404_pal" — this is a copy-paste error from the
//     404_pal.php template. The actual profile is 1080_pal (1920×1080, PAL). Flag only.

$vb				= '6656k';			# video rate kbs
$s				= '1920x1080';		# scale
$g				= 25;				# keyframes interval (gob)
$vcodec			= 'libx264';		# default libx264

// Deinterlace filter — applied to progressive-scan output from interlaced PAL sources.
// yadif (Yet Another DeInterlacing Filter) outputs one frame per frame in mode 0.
$progresivo		= "-vf yadif";		# deinterlace
// Gamma correction factors for YUV colour space channels.
// Values near 1.0 apply mild correction to compensate for slight camera/capture bias.
$gamma_y		= "0.97";			# luma (Y) gamma correction
$gamma_u		= "1.01";			# chroma blue-difference (U/Cb) correction
$gamma_v		= "0.98";			# chroma red-difference (V/Cr) correction
// (!) Variable name contains a typo: '$gammma' has three 'm' characters.
//     Ffmpeg::build_av_alternate_command() references '$gammma' (triple-m) in its command
//     builder, so renaming here would break the injection. Flag only — do not rename.
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # gamma correction filter
$force			= 'mp4';			# default mp4

$ar				= 44100;			# audio sample rate in Hz (22050 is the half-rate alternative)
$ab				= '160k';			# audio bitrate kbs
// (!) Comment in original said "adio rate kbs" — typo, corrected in this comment only (code unchanged).
$ac				= "2";				# number of audio channels: 2 = stereo, 1 = mono
// (!) $acodec is set here but overridden at runtime by Ffmpeg::get_audio_codec() which
//     probes the installed ffmpeg binary for the best available AAC encoder. This value
//     is effectively a no-op placeholder; see the file-level doc-block for details.
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

// target_path defines the subdirectory name under the AV media tree (e.g. DEDALO_MEDIA_PATH/av/1080/).
// The value must match the resolution label used by the component_av file-tree convention.
$target_path 	= "1080";			# like '404'
