<?php
/**
* FFMPEG SETTING 1080_PAL_16X9
* Conversion parameters for Full HD (1080p) video in PAL broadcast standard, widescreen 16:9.
*
* This file is a settings fragment — it is loaded via require() inside
* Ffmpeg::build_av_alternate_command() when the source file is detected as PAL
* (frame rate < 29 fps) with a 16:9 aspect ratio and a target quality of '1080'.
* All variables defined here are injected directly into the calling scope and
* consumed by the two-pass ffmpeg command builder.
*
* The file does NOT define a class; it only declares plain PHP variables.
* Caller: Ffmpeg::build_av_alternate_command() — see core/media_engine/class.Ffmpeg.php.
*
* Two-pass encoding strategy:
*   Pass 1 — encodes video only (-an) to produce a log file for rate-control statistics.
*   Pass 2 — re-encodes with the statistics from pass 1, adds audio, and writes to a
*             temporary MP4 file which is then moov-atom-relocated for web fast-start.
*
* Video profile: 1920×1080 px, libx264, 6656 kbps CBR, GOP=25 (1 keyframe/second at 25 fps),
*                deinterlace via yadif, YUV gamma correction via lutyuv.
* Audio profile: AAC stereo, 44100 Hz sample rate, 160 kbps.
*
* @package Dédalo
* @subpackage Core
*/

# FFMPEG SETTING 404_pal
// (!) Flag: header label "404_pal" is stale — copy-pasted from 404_pal.php.
//     This file applies to the 1080_pal_16x9 quality profile, not 404_pal.

$vb				= '6656k';			# video rate kbs
$s				= '1920x1080';		# scale
$g				= 25;				# keyframes interval (gob)
$vcodec			= 'libx264';		# default libx264

// Deinterlace filter
// yadif (yet another deinterlacing filter) removes interlaced scan lines from
// captured PAL broadcast material before rescaling.
$progresivo		= "-vf yadif";		# deinterlace (original: desentrelazar)

// YUV gamma correction coefficients
// Slight luminance roll-off (y < 1.0) and chroma nudges (u, v) compensate for
// the typical colour-space mismatch between broadcast capture and H.264 playback.
$gamma_y		= "0.97";			# luminance correction (original: correccion de luminancia)
$gamma_u		= "1.01";			# B-Y (Cb) chroma correction (original: correccion de B-y)
$gamma_v		= "0.98";			# R-Y (Cr) chroma correction (original: correccion de R-y)

// Assembled lutyuv filter string applying the three gamma coefficients above.
// (!) Flag: variable name '$gammma' contains a typo (triple 'm'). The caller in
//     class.Ffmpeg.php references '$gammma' with the same typo, so both sides are
//     consistent. Do not rename without fixing the caller simultaneously.
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # gamma correction (original: corrección de gamma)
$force			= 'mp4';			# default mp4

$ar				= 44100;			# audio sample rate (22050)

// (!) Flag: '$ab' comment contains a typo ('adio' should be 'audio'). Not fixed; flagged only.
$ab				= '160k';			# audio rate kbps (original comment: adio rate kbs)

// Number of audio channels: 2 = stereo, 1 = mono.
// (!) Flag: original comment spelled 'mono' as 'nomo'. Not fixed; flagged only.
$ac				= "2";				# number of audio channels — 2 = stereo, 1 = mono (original: numero de canales de audio 2 = stereo, 1 = nomo)

// (!) Flag: 'libvo_aacenc' was removed from FFmpeg upstream circa 2015.
//     At runtime Ffmpeg::get_audio_codec() probes the installed binary and returns
//     the best available AAC encoder ('libfdk_aac', 'aac', etc.), overriding
//     this value before it is interpolated into the shell command. This default
//     therefore acts only as a last-resort fallback on very old installations.
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

// Subdirectory name under the media storage root where converted files are written.
// Matched against DEDALO_MEDIA_PATH + DEDALO_AV_FOLDER when building target paths.
$target_path 	= "1080";			# like '404'
