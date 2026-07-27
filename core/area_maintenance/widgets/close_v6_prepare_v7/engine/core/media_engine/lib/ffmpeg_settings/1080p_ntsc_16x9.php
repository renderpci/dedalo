<?php
// FFMPEG SETTING 1080p_ntsc_16x9
// FFmpeg encoding profile for full-HD 1080-line progressive-scan NTSC video, widescreen 16:9.
//
// This file is a configuration fragment. It is loaded via require() inside
// Ffmpeg::build_av_alternate_command() (core/media_engine/class.Ffmpeg.php) and injects
// its variables directly into the caller's scope. It must never be included standalone
// or autoloaded as a class — it has no namespace, no class, and no return value.
//
// Profile characteristics:
//   - Resolution : 1920x1080 (full HD)
//   - Scan type  : progressive (the 'p' suffix distinguishes this from the interlaced 1080i_ntsc_16x9 sibling)
//   - Frame system: NTSC, 30 fps — keyframe interval ($g) is therefore 30; PAL siblings use 25
//   - Aspect ratio: 16:9 widescreen
//   - Video bitrate: 10496k — higher than the non-progressive 1080_ntsc_16x9.php (6656k),
//     reflecting the larger uncompressed data volume of a full-progressive raster
//   - Audio: 44100 Hz stereo, 256k AAC — broadcast-quality stereo
//   - Container: MP4
//   - Output sub-directory: "1080_full" (see $target_path)
//
// Relationship to sibling profiles:
//   1080_ntsc_16x9.php  — same resolution/aspect, lower bitrate (6656k), target "1080"
//   1080p_ntsc.php      — identical values; kept for backward-compatibility without the '16x9' suffix
//   1080p_pal_16x9.php  — same resolution but PAL frame system ($g = 25)
//   1080i_ntsc_16x9.php — interlaced variant of this profile
//
// (!) The file-header label on line 2 was copy-pasted from 404_pal.php and left stale in the
//     original source. It reads "FFMPEG SETTING 404_pal" but the actual profile is
//     1080p_ntsc_16x9. The corrected label appears above; the stale label inside the code
//     comment block is a pre-existing defect — do not rename/reorder code lines.
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
//   $vb          string  Video bitrate (e.g. '10496k')
//   $s           string  Output frame dimensions WxH (e.g. '1920x1080')
//   $g           int     GOP size / keyframe interval in frames (30 for NTSC)
//   $vcodec      string  FFmpeg video codec name
//   $progresivo  string  FFmpeg filter fragment for deinterlacing (yadif)
//   $gamma_y     string  Luma (Y) gamma correction coefficient for lutyuv
//   $gamma_u     string  Cb (U / B-Y) gamma correction coefficient for lutyuv
//   $gamma_v     string  Cr (V / R-Y) gamma correction coefficient for lutyuv
//   $gammma      string  Full -vf lutyuv filter string built from the three coefficients above
//   $force       string  Container format override (e.g. 'mp4')
//   $ar          int     Audio sample rate in Hz
//   $ab          string  Audio bitrate (e.g. '256k')
//   $ac          string  Number of audio channels ('2' = stereo, '1' = mono)
//   $acodec      string  FFmpeg audio codec name (may be overridden at runtime; see (!) above)
//   $target_path string  Sub-directory name under the media root for this quality tier

# FFMPEG SETTING 404_pal

$vb				= '10496k';			# video rate kbs
$s				= '1920x1080';		# scale
$g				= 30;				# keyframes interval (gob)
$vcodec			= 'libx264';		# default libx264

$progresivo		= "-vf yadif";		# desentrelazar
$gamma_y		= "0.97";			# correccion de luminancia
$gamma_u		= "1.01";			# correccion de B-y
$gamma_v		= "0.98";			# correccion de R-y
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # corrección de gamma
$force			= 'mp4';			# default mp4

$ar				= 44100;			# audio sample rate (22050)
$ab				= '256k';			# adio rate kbs
$ac				= "2";				# numero de canales de audio 2 = stereo, 1 = nomo
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

$target_path 	= "1080_full";			# like '404'
