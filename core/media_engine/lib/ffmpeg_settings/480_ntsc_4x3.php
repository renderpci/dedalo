<?php
/**
* FFMPEG SETTING — 480 NTSC 4x3
* FFmpeg encoding parameter set for standard-definition NTSC video at a 4:3 aspect ratio.
*
* This file is a plain PHP variable-injection script: it defines no functions or classes.
* It is loaded via require() inside Ffmpeg::build_av_alternate_command() to populate the
* local scope with the encoding parameters needed to transcode a source AV file to this
* target format. The file name is used as the setting key; callers pass the bare name
* ('480_ntsc_4x3') and the method resolves the path through DEDALO_AV_FFMPEG_SETTINGS.
*
* Format characteristics:
* - Standard: NTSC (North American / Japanese broadcast standard)
* - Frame geometry: 640x480 pixels, standard 4:3 aspect ratio
*   640x480 is the classic VGA/NTSC SD resolution, used for square-pixel 4:3 delivery.
*   For widescreen 16:9 output at the same vertical resolution, use 480_ntsc_16x9 (854x480).
* - Scan type: progressive (interlaced sources are deinterlaced by the YADIF filter via $progresivo)
* - GOP interval (keyframe distance): 30 frames, matching NTSC's ~29.97 fps cadence
* - Gamma correction: subtle YUV channel adjustments to normalise luminance and colour balance
*   typical of NTSC analogue capture material
* - Container: MP4 (H.264 video + AAC audio)
*
* (!) The header comment below reads "404_pal" — this is a stale copy-paste artifact
*     from the template. This file configures 480-line NTSC 4:3, not 404 PAL.
*
* @package Dédalo
* @subpackage Core
* @see Ffmpeg::build_av_alternate_command()   The sole caller; reads all variables from this scope.
* @see DEDALO_AV_FFMPEG_SETTINGS              Config constant pointing to this directory.
*/
# FFMPEG SETTING 404_pal

// video bitrate
// 1024 kbps (≈ 1 Mbps) — standard-quality target for 480-line SD output.
$vb				= '1024k';			# video rate kbs

// output resolution
// 640x480 — classic square-pixel NTSC SD frame size, 4:3 aspect ratio.
// (!) For 16:9 widescreen 480-line output use 480_ntsc_16x9 (854x480) instead.
$s				= '640x480';		# scale

// GOP (Group of Pictures) size — keyframe interval in frames.
// 30 matches the NTSC field rate (~29.97 fps), placing one keyframe per second.
// PAL variants use 25 to match the 25 fps field rate instead.
$g				= 30;				# keyframes interval (gob)

// video codec
$vcodec			= 'libx264';		# default libx264

// deinterlace filter — applied to interlaced source material to produce a progressive signal.
// YADIF (Yet Another DeInterlacing Filter) is the standard FFmpeg deinterlace option.
// (!) Unlike interlaced output profiles (e.g. 1080i_ntsc_16x9), this profile always
//     deinterlaces: $progresivo is never empty here. For purely progressive sources the
//     filter is a no-op at the cost of a small CPU overhead.
$progresivo		= "-vf yadif";		# desentrelazar

// YUV gamma correction values — applied via the lutyuv filter in $gammma below.
// These subtle adjustments compensate for the slight luminance and chroma bias common in
// analogue NTSC capture decks and digitisation chains.
$gamma_y		= "0.97";			# correccion de luminancia
$gamma_u		= "1.01";			# correccion de B-y
$gamma_v		= "0.98";			# correccion de R-y

// FFmpeg lutyuv filter string built from the three gamma correction coefficients above.
// (!) Note the triple-m typo in the variable name ($gammma). This must not be changed here
//     because class.Ffmpeg.php reads exactly this identifier from the included scope.
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # corrección de gamma

// output container format
$force			= 'mp4';			# default mp4

// audio sample rate — 44 100 Hz (CD quality); 22 050 Hz is a lower-quality alternative.
$ar				= 44100;			# audio sample rate (22050)

// audio bitrate — 128 kbps stereo, appropriate for standard-definition delivery.
// (!) Typo "adio" in the original comment; the parameter governs audio bitrate.
$ab				= '128k';			# adio rate kbs

// number of audio channels: 2 = stereo, 1 = mono
$ac				= "2";				# numero de canales de audio 2 = stereo, 1 = nomo

// audio codec
// (!) libvo_aacenc was removed from the FFmpeg mainline around 2014. On modern FFmpeg
//     installations this will fall back to or be replaced by the Ffmpeg::build_av_alternate_command()
//     audio-codec resolution logic (which probes for libfdk_aac, native aac, etc.).
//     The value is retained here for historical compatibility; do not silently swap it.
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

// subdirectory under the media store where 480-line alternate files are written.
// Shared by all 480-line variants (NTSC/PAL, 4:3/16:9).
$target_path 	= "480";			# like '404'
