<?php
/**
* FFMPEG SETTINGS — 240p PAL 16×9
* Variable-injection configuration for low-bandwidth 240-line PAL widescreen delivery.
*
* This file is NOT a class or a module; it is a plain PHP script that is pulled
* into the scope of Ffmpeg::build_av_alternate_command() via require().  Every
* variable defined here becomes a local variable inside that method and is
* interpolated directly into the two-pass ffmpeg shell command.
*
* Standard setting files expose the following contract variables:
*   - $vb         Video bitrate string fed to ffmpeg -vb
*   - $s          Output resolution string fed to ffmpeg -s
*   - $g          Keyframe interval (GOP size) fed to ffmpeg -g
*   - $vcodec     Video codec name fed to ffmpeg -vcodec
*   - $progresivo Deinterlace filter fragment (empty string disables it)
*   - $gamma_y    Luma (Y) gamma correction factor for lutyuv
*   - $gamma_u    Cb/U  gamma correction factor for lutyuv
*   - $gamma_v    Cr/V  gamma correction factor for lutyuv
*   - $gammma     Complete -vf lutyuv filter fragment built from the three gamma_* vars
*   - $force      Container format string fed to ffmpeg -f
*   - $ar         Audio sample rate (Hz) fed to ffmpeg -ar
*   - $ab         Audio bitrate string fed to ffmpeg -ab
*   - $ac         Audio channel count ("1" = mono, "2" = stereo) fed to ffmpeg -ac
*   - $acodec     Audio codec name fed to ffmpeg -acodec
*   - $target_path Subdirectory name under which the transcoded file is stored
*                  (e.g. "240" maps to <media_root>/240/<filename>.mp4)
*
* Profile identity:
*   - Standard    : PAL (European / 50 Hz broadcast standard)
*   - Aspect ratio: 16:9 widescreen
*   - Resolution  : 428×240 px  (closest 16:9-safe pixel count for 240 lines)
*   - GOP size    : 25 frames   (matches the PAL 25 fps frame rate)
*
* Contrast with the NTSC twin (240_ntsc_16x9.php): that profile uses $g = 30 to
* match the NTSC 30 fps / 29.97 frame rate; all other parameters are identical.
* The 4:3 counterpart (240_pal_4x3.php) uses $s = '320x240' instead of '428x240'.
*
* Caller: Ffmpeg::build_av_alternate_command() — core/media_engine/class.Ffmpeg.php
*
* @package Dédalo
* @subpackage Core
*/
# FFMPEG SETTING 240_pal

// video settings
$vb				= '384k';			# video rate kbs
$s				= '428x240';		# scale
$g				= 25;				# keyframes interval (gob)
$vcodec			= 'libx264';		# default libx264

// deinterlace + gamma correction filter fragments
// These are injected verbatim into the ffmpeg command line; an empty string
// suppresses the corresponding filter.  yadif performs temporal deinterlacing
// (mode 0: output one frame per input field-pair).  lutyuv applies per-channel
// gamma curves to reduce the colour shift introduced by YUV transcoding.
$progresivo		= "-vf yadif";		# desentrelazar
$gamma_y		= "0.97";			# correccion de luminancia
$gamma_u		= "1.01";			# correccion de B-y
$gamma_v		= "0.98";			# correccion de R-y
// (!) $gammma is intentionally misspelled with three 'm' characters to match
// the variable name consumed by Ffmpeg::build_av_alternate_command() (line ~671).
// Do NOT rename this variable — doing so would silently drop the colour
// correction from the generated ffmpeg command.
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # corrección de gamma
$force			= 'mp4';			# default mp4

// audio settings
// Low bitrate (28k/24000 Hz mono) chosen for bandwidth-constrained streaming
// at this low resolution; higher fidelity settings are applied at 404p and above.
// (!) $acodec 'libvo_aacenc' is deprecated and removed in newer FFmpeg builds.
//     The caller Ffmpeg::get_audio_codec() overrides this with the best available
//     AAC encoder detected at runtime; see class.Ffmpeg.php ~line 1488.
$ar				= 24000;			# audio sample rate (22050)
$ab				= '28k';			# adio rate kbs
$ac				= "1";				# numero de canales de audio 2 = stereo, 1 = nomo
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

// output subdirectory — the transcoded MP4 is written under <media_root>/240/
$target_path 	= "240";			# like '404'
