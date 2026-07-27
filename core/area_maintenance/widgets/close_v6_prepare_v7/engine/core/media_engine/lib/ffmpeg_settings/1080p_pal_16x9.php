<?php
/**
* FFMPEG SETTINGS — 1080p PAL 16x9
* Quality profile for full HD progressive PAL video, widescreen aspect ratio.
*
* This file is a data-only include fragment, not a standalone script.
* It is loaded at runtime by Ffmpeg::build_av_alternate_command() via require()
* after the caller has verified that the settings name ('1080p_pal_16x9') exists
* in the DEDALO_AV_FFMPEG_SETTINGS directory. All variables defined here are
* immediately available in the calling method's local scope and are spliced into
* the two-pass ffmpeg shell command it constructs.
*
* Profile characteristics:
* - Resolution: 1920×1080 (full HD)
* - Standard:   PAL (25 fps); keyframe interval ($g) is set to 25 frames (1 second)
* - Aspect:     16:9 widescreen
* - Video:      H.264 (libx264) at 10,496 kbps — high-quality archival bitrate
* - Audio:      AAC stereo at 44100 Hz / 256 kbps
*               Note: $acodec is set here as a fallback placeholder. The caller
*               (Ffmpeg::build_av_alternate_command) resolves the best available
*               AAC encoder via Ffmpeg::get_audio_codec() and overwrites this value.
* - Container:  MP4 (moved to MOOV-first by qt-faststart after transcoding)
*
* Deinterlacing ($progresivo) and gamma correction ($gammma) ffmpeg filter strings
* are provided but used selectively — both are expanded literally inside the
* two-pass command. The deinterlace filter is appropriate when the source material
* was captured as interlaced SD and is being up-converted; for true progressive
* 1080p sources it has no effect but causes no harm.
*
* Output subdirectory: files are written under a folder named "1080_full" inside
* the Dédalo AV media path, matching the $target_path value below.
*
* @package Dédalo
* @subpackage Core
* @see Ffmpeg::build_av_alternate_command()
* @see Ffmpeg::get_audio_codec()
*/

# FFMPEG SETTING 404_pal
// (!) The header comment above is a stale copy from the 404_pal.php template.
//     The actual profile for this file is 1080p PAL 16x9 as described in the
//     class doc-block above. Do not rely on this # label for identification.

$vb				= '10496k';			# video rate kbs
// High-bitrate ceiling for archival-quality 1080p; approximately 10.5 Mbps.
// Compare: 720p uses ~2968k, 576p uses ~1536k, 404p uses ~960k–1024k.

$s				= '1920x1080';		# scale
// Full HD output dimensions. ffmpeg scales the source to exactly this size,
// which may introduce letterboxing or stretching if the source AR differs.

$g				= 25;				# keyframes interval (gob)
// One keyframe per second at 25 fps (PAL). Determines seek granularity and
// affects both file size and editing/streaming behaviour.

$vcodec			= 'libx264';		# default libx264
// H.264 baseline encoder. Requires ffmpeg to be compiled with --enable-libx264.
// Checked by Ffmpeg::check_lib('libx264') before this profile is used.

$progresivo		= "-vf yadif";		# desentrelazar
// Deinterlace filter (yadif = "yet another deinterlacing filter"). Passed as
// the $progresivo expansion in the two-pass command. "desentrelazar" is Spanish
// for "deinterlace".

$gamma_y		= "0.97";			# correccion de luminancia
// Luma (Y) gamma correction coefficient — slightly darkens the luminance channel
// to compensate for typical broadcast encoding bias. "correccion de luminancia"
// is Spanish for "luminance correction".

$gamma_u		= "1.01";			# correccion de B-y
// Cb (blue-difference chroma) gamma coefficient. Minor boost.
// "correccion de B-y" is Spanish for "B-Y correction" (Cb channel).

$gamma_v		= "0.98";			# correccion de R-y
// Cr (red-difference chroma) gamma coefficient. Slight reduction.
// "correccion de R-y" is Spanish for "R-Y correction" (Cr channel).

$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # corrección de gamma
// Complete ffmpeg lut-yuv filter string built from the three channel coefficients
// above. Applied in the two-pass command alongside $progresivo.
// (!) The variable name contains a deliberate extra 'm' ($gammma). This is a
//     pre-existing typo replicated across every settings file and must NOT be
//     corrected here — the caller references exactly this identifier. "corrección
//     de gamma" is Spanish for "gamma correction".

$force			= 'mp4';			# default mp4
// Container format passed to ffmpeg -f. Must stay 'mp4' so that qt-faststart
// can relocate the MOOV atom to the file head for progressive web streaming.

$ar				= 44100;			# audio sample rate (22050)
// PCM sample rate for the encoded audio track. The parenthetical 22050 is a
// historical note about the older lower-rate option that was considered but not used.

$ab				= '256k';			# adio rate kbs
// Audio bitrate. Higher than the standard 128k used in lower-quality profiles,
// appropriate for HD content. Note: the comment label "adio" is a pre-existing
// typo for "audio" — preserved as-is ("audio bitrate kbps").

$ac				= "2";				# numero de canales de audio 2 = stereo, 1 = nomo
// Number of audio channels: 2 = stereo, 1 = mono. The comment "nomo" is a
// pre-existing typo for "mono". "numero de canales de audio" is Spanish for
// "number of audio channels".

$acodec			= 'libvo_aacenc';	# default libvo_aacenc
// Placeholder AAC encoder name. This value is set for historical reference but
// is always overwritten by Ffmpeg::get_audio_codec() in the caller, which probes
// the ffmpeg build for the best available AAC implementation in priority order:
//   1. libfdk_aac  (highest quality, requires --enable-libfdk-aac)
//   2. libvo_aacenc (legacy, ffmpeg < 3)
//   3. aac         (native ffmpeg >= 3 fallback)

$target_path 	= "1080_full";			# like '404'
// Subdirectory name used when organising the transcoded output inside the Dédalo
// AV media tree. All 1080p variants write to this folder. The comment "like '404'"
// is a legacy cross-reference to the 404_pal.php prototype file.
