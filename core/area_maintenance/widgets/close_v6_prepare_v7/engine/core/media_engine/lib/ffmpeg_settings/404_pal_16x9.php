<?php
/**
* FFMPEG SETTING: 404_PAL_16X9
* Encoding parameters for a PAL 16:9 widescreen H.264/MP4 derivative at 404-line height.
*
* This file is a PHP settings fragment — not a class. It is included (require'd) at
* runtime inside Ffmpeg::build_av_alternate_command() to inject a flat set of variables
* into that method's local scope. The caller reads the variables immediately after the
* include and uses them to assemble a two-pass ffmpeg encode command.
*
* Profile summary
* ---------------
* Standard : PAL (25 fps keyframe base)
* Aspect   : 16:9 widescreen — output frame 720 × 404 px
* Codec    : H.264 (libx264), MP4 container (faststart-ready)
* Video    : 1024 kbit/s, GOP 25 frames (one keyframe per second at 25 fps)
* Audio    : AAC, 64 kbit/s, mono (single channel), 44.1 kHz
*
* Variable contract (consumed by Ffmpeg::build_av_alternate_command)
* ------------------------------------------------------------------
* $vb          — video bitrate string passed to ffmpeg -b:v
* $s           — output scale (WxH) passed to ffmpeg -s
* $g           — GOP size (keyframe interval) passed to ffmpeg -g
* $vcodec      — video encoder name passed to ffmpeg -vcodec
* $progresivo  — deinterlace filter fragment ("-vf yadif"); applied when the
*                source is interlaced; always injected by convention
* $gamma_y     — luminance (Y) gamma correction coefficient for lutyuv
* $gamma_u     — blue-luma (Cb/U) gamma correction coefficient for lutyuv
* $gamma_v     — red-luma (Cr/V) gamma correction coefficient for lutyuv
* $gammma      — assembled lutyuv filter string built from the three coefficients above;
*                note the triple 'm' in the variable name (intentional typo in original,
*                preserved for backward compatibility across all settings files)
* $force       — container format passed to ffmpeg -f (overrides auto-detection)
* $ar          — audio sample rate in Hz passed to ffmpeg -ar
* $ab          — audio bitrate string passed to ffmpeg -ab
* $ac          — audio channel count ("1" = mono, "2" = stereo) passed to ffmpeg -ac
* $acodec      — preferred AAC encoder name; Ffmpeg::get_audio_codec() MAY override
*                this at runtime to match the available ffmpeg build (libfdk_aac >
*                libvo_aacenc > aac), so the value here is a hint, not a guarantee
* $target_path — sub-directory label under the AV media tree where the derivative
*                is stored (e.g. "404"); must match the quality key expected by the
*                component and media-protection rules
*
* Relationship to sibling settings files
* ----------------------------------------
* - 404_pal_4x3.php : same bitrate / audio, but scale is 540×404 (4:3 frame)
* - 404_pal.php     : identical parameters; the un-suffixed variant is kept for
*                     legacy callers that do not distinguish aspect ratio
* - 404_ntsc_16x9.php : same frame size (720×404) but g=30 (NTSC 30 fps base)
*                       and a higher video bitrate (1280 k) for NTSC material
*
* @package Dédalo
* @subpackage media_engine
*/

# FFMPEG SETTING 404_pal
// (!) Header comment preserved verbatim from original; should read "404_pal_16x9"
//     but is kept unchanged across all sibling files — do not correct here, as
//     patching only this file would create an inconsistency in the family.

$vb				= '1024k';			# video rate kbs
$s				= '720x404';		# scale
$g				= 25;				# keyframes interval (gob)
$vcodec			= 'libx264';		# default libx264

// Deinterlace filter
// yadif (Yet Another DeInterlacing Filter) is applied to progressive-scan output
// even when the source may already be progressive; the caller decides whether to
// include this fragment in the final command line.
$progresivo		= "-vf yadif";		# desentrelazar

// Gamma correction coefficients for the lutyuv filter
// These values apply a mild color-science correction to bring PAL material
// closer to sRGB/Rec.709 target levels.  Y < 1 slightly darkens luma;
// U > 1 slightly boosts blue-difference; V < 1 slightly reduces red-difference.
$gamma_y		= "0.97";			# correccion de luminancia
$gamma_u		= "1.01";			# correccion de B-y
$gamma_v		= "0.98";			# correccion de R-y
// Assembled lutyuv filter string — interpolates the three coefficients above.
// (!) Variable name "$gammma" (triple 'm') is a long-standing typo shared by
//     every settings file in this directory.  Do NOT rename: the caller in
//     Ffmpeg::build_av_alternate_command() references the same misspelled name.
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # corrección de gamma
$force			= 'mp4';			# default mp4

// Audio parameters
// Mono output (ac=1) keeps file size small for speech-heavy archival recordings.
// 44.1 kHz is chosen over 48 kHz for broad browser/player compatibility.
// (!) "$ab" comment below contains the typo "adio" (should be "audio") — preserved
//     as-is; it appears identically in every sibling settings file.
$ar				= 44100;			# audio sample rate (22050)
$ab				= '64k';			# adio rate kbs
$ac				= "1";				# numero de canales de audio 2 = stereo, 1 = nomo
// (!) libvo_aacenc is deprecated and removed from modern ffmpeg builds.
//     Ffmpeg::get_audio_codec() overrides this value at runtime with the best
//     available AAC encoder (libfdk_aac > libvo_aacenc > built-in aac).
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

// Target quality sub-directory
// Must match a key listed in DEDALO_AV_AR_QUALITY and be a valid quality name
// recognised by media_protection's public-quality allowlist.
$target_path 	= "404";			# like '404'
