<?php
/**
* FFMPEG SETTINGS — 404_pal_4x3
* Transcoding parameters for a PAL, 4:3 aspect-ratio, 404-line output quality.
*
* This file is a settings fragment, not a standalone script. It is loaded at
* runtime by Ffmpeg::build_av_alternate_command() via require(), which
* injects all variables defined here into the calling method's local scope.
* The caller then splices those variables directly into the two-pass ffmpeg
* command it builds.
*
* Profile characteristics:
* - Standard-definition PAL video, 4:3 aspect ratio (540 × 404 px).
*   The 540 px width corresponds to the 4:3 pixel-aspect-ratio equivalent
*   of a 576-line PAL source sampled at square-pixel (720 × 576 → 540 × 404).
* - 25 fps GOP cadence (matching PAL's native 25-frame field rate).
* - Conservative bitrate (1024 kbit/s) suited for low-bandwidth delivery or
*   archival web access without high-quality requirement.
* - Mono audio at 64 kbit/s — appropriate for speech-dominant cultural-heritage
*   recordings where bandwidth is the primary constraint.
* - Output container: MP4 (H.264 + AAC), optimised for progressive download.
*
* Consumed variables (all referenced by name in build_av_alternate_command()):
*   $vb          — video bitrate passed to ffmpeg's -vb flag
*   $s           — output scale passed to ffmpeg's -s flag (WxH)
*   $g           — GOP size (keyframe interval) passed to ffmpeg's -g flag
*   $vcodec      — video codec name passed to ffmpeg's -vcodec flag
*   $progresivo  — deinterlace filter string (prepended to filter graph)
*   $gamma_y     — luminance gamma coefficient used in the lutyuv filter
*   $gamma_u     — Cb (blue-difference) gamma coefficient
*   $gamma_v     — Cr (red-difference) gamma coefficient
*   $gammma      — fully assembled lutyuv filter string (note: triple-m typo
*                  is intentional to match the variable name used in Ffmpeg.php)
*   $force       — output container format passed to ffmpeg's -f flag
*   $ar          — audio sample rate in Hz passed to ffmpeg's -ar flag
*   $ab          — audio bitrate passed to ffmpeg's -ab flag
*   $ac          — audio channel count (1 = mono, 2 = stereo)
*   $acodec      — audio codec name (may be overridden by Ffmpeg::get_audio_codec())
*   $target_path — subdirectory label under which the derivative is stored
*
* @package Dédalo
* @subpackage media_engine
* @see Ffmpeg::build_av_alternate_command()
*/

# FFMPEG SETTING 404_pal

// Video parameters
// -------------------------------------------------------------------------
// video bitrate — 1024 kbit/s is the lowest of the 404-line PAL variants;
// the 16:9 counterpart uses 1280 k. The reduced bitrate reflects the
// narrower 4:3 frame which requires less bandwidth for the same visual
// quality target.
$vb				= '1024k';			# video rate kbs

// Output scale — 540 × 404 px.
// 540 px is the square-pixel equivalent of PAL's 4:3 DAR at this height:
//   PAL 4:3 pixel-aspect-ratio (12:11) × 496 ≈ 540. This avoids the
//   non-square pixel artefacts that would arise from simply cropping to
//   720 × 576 and reducing height alone.
$s				= '540x404';		# scale

// GOP size — 25 frames matches PAL's 25-frame-per-second cadence, placing
// one keyframe exactly every second for efficient seeking.
$g				= 25;				# keyframes interval (gob)

$vcodec			= 'libx264';		# default libx264

// Deinterlace / gamma filters
// -------------------------------------------------------------------------
// yadif (Yet Another DeInterlacing Filter) removes interlace combing from
// PAL source material captured from tape or broadcast. Applied as a simple
// -vf chain; the caller is responsible for combining this with $gammma.
$progresivo		= "-vf yadif";		# deinterlace filter

// Gamma correction coefficients for the YUV colour space.
// These mild corrections compensate for the slight luminance and chroma
// shifts that often occur when transcoding from analogue PAL captures:
//   y (luminance): pulled slightly below 1.0 to reduce overall brightness
//   u (Cb / blue-difference): raised slightly above 1.0 to restore blue warmth
//   v (Cr / red-difference): pulled slightly below 1.0 to reduce reddish cast
$gamma_y		= "0.97";			# luminance gamma correction
$gamma_u		= "1.01";			# Cb (blue-difference) gamma correction
$gamma_v		= "0.98";			# Cr (red-difference) gamma correction

// Assembled lutyuv filter string — applies per-channel gamma via ffmpeg's
// lutyuv filter. The variable name contains a triple-m typo ('$gammma')
// that is intentional here; Ffmpeg::build_av_alternate_command() references
// exactly this identifier throughout its command-building code.
// (!) Do not rename this variable to '$gamma' or '$gamma_filter' — it would
//     break all settings files simultaneously because the consumer hardcodes
//     the '$gammma' identifier.
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # gamma correction filter

// Output container — MP4 is required for the qt-faststart MOOV relocation
// step that Ffmpeg::build_av_alternate_command() appends to the two-pass
// encode chain, enabling progressive download before full file transfer.
$force			= 'mp4';			# default mp4

// Audio parameters
// -------------------------------------------------------------------------
// 44100 Hz is the standard CD/web audio sample rate. The legacy alternative
// of 22050 Hz (shown in the inline comment below) would be acceptable for
// speech-only content but 44100 is safer for general AV preservation work.
$ar				= 44100;			# audio sample rate (22050)

// (!) '$ab' comment contains a typo ('adio' instead of 'audio') — inherited
//     from the original; not corrected here to avoid code changes.
$ab				= '64k';			# adio rate kbs

// Mono audio (1 channel) — typical choice for legacy SD cultural-heritage
// recordings where the source is mono or near-mono; saves bandwidth at this
// low-bitrate profile. Set to "2" in the 576-line PAL 4:3 profile where
// stereo is more commonly required.
$ac				= "1";				# audio channel count: 2 = stereo, 1 = mono

// (!) libvo_aacenc is an older Fraunhofer VO AAC encoder that has been
//     removed from recent FFmpeg builds. Ffmpeg::get_audio_codec() may
//     override this with 'aac' or 'libfdk_aac' at runtime based on the
//     codecs available in the local FFmpeg binary.
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

// Target path label
// -------------------------------------------------------------------------
// The value '404' matches the height of the output frame and is used by
// Ffmpeg::build_av_alternate_command() to construct the derivative's storage
// subdirectory path beneath the master media root.
$target_path 	= "404";			# like '404'
