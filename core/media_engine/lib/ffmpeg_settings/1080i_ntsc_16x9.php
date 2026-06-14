<?php
/**
 * FFMPEG SETTING — 1080i NTSC 16x9
 * FFmpeg encoding parameter set for interlaced 1080-line NTSC video at a 16:9 aspect ratio.
 *
 * This file is a plain PHP variable-injection script: it defines no functions or classes.
 * It is loaded via require() inside Ffmpeg::build_av_alternate_command() to populate the
 * local scope with the encoding parameters needed to transcode a source AV file to this
 * target format.  The file name is used as the setting key; callers pass the bare name
 * (e.g. '1080i_ntsc_16x9') and the method resolves the path through DEDALO_AV_FFMPEG_SETTINGS.
 *
 * Format characteristics:
 * - Standard: NTSC (North American / Japanese broadcast standard)
 * - Frame geometry: 1920x1080 pixels, widescreen 16:9 aspect ratio
 * - Scan type: interlaced (1080i) — the source interlaced signal is preserved; no deinterlace
 *   filter is applied.  For progressive output from an interlaced source, use 1080p_ntsc_16x9.
 * - GOP interval (keyframe distance): 30 frames, matching NTSC's ~29.97 fps cadence
 * - Gamma correction: subtle YUV channel adjustments to normalise luminance and colour balance
 *   typical of NTSC analogue capture material
 * - Container: MP4 (H.264 video + AAC audio)
 *
 * @package Dédalo
 * @subpackage Core
 * @see Ffmpeg::build_av_alternate_command()   The sole caller; reads all variables from this scope.
 * @see DEDALO_AV_FFMPEG_SETTINGS              Config constant pointing to this directory.
 */

# FFMPEG SETTING 404_pal

// video bitrate
// 10 496 kbps (≈ 10.5 Mbps) — high-quality target for full HD 1080 output.
$vb				= '10496k';			# video rate kbs

// output resolution
// 1920x1080 is the standard frame size for both 1080i and 1080p HD video.
$s				= '1920x1080';		# scale

// GOP (Group of Pictures) size — keyframe interval in frames.
// 30 matches the NTSC field rate (~29.97 fps), placing one keyframe per second.
// PAL variants use 25 to match the 25 fps field rate instead.
$g				= 30;				# keyframes interval (gob)

// video codec
$vcodec			= 'libx264';		# default libx264

// deinterlace filter (intentionally empty for interlaced output)
// (!) This empty string is the defining difference from the 1080p_ntsc_16x9 profile, which sets
//     "-vf yadif" to run the YADIF deinterlace filter and produce a progressive signal.
//     Leaving $progresivo empty preserves the interlaced field structure in the encoded output,
//     which is correct when the downstream player or broadcast chain expects 1080i material.
$progresivo		= "";				# desentrelazar

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

// audio bitrate — 256 kbps stereo, appropriate for full-HD archival output.
// (!) Typo "adio" in the original comment; the parameter governs audio bitrate.
$ab				= '256k';			# adio rate kbs

// number of audio channels: 2 = stereo, 1 = mono
$ac				= "2";				# numero de canales de audio 2 = stereo, 1 = nomo

// audio codec
// (!) libvo_aacenc was removed from the FFmpeg mainline around 2014.  On modern FFmpeg
//     installations this will fall back to or be replaced by the Ffmpeg::build_av_alternate_command()
//     audio-codec resolution logic (which probes for libfdk_aac, native aac, etc.).
//     The value is retained here for historical compatibility; do not silently swap it.
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

// subdirectory under the media store where 1080 full-HD alternate files are written.
// Shared by all 1080-line variants (1080i/1080p, NTSC/PAL, 4:3/16:9).
$target_path 	= "1080_full";			# like '404'
