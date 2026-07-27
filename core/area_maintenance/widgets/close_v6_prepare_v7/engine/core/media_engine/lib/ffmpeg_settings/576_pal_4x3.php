<?php
/**
* FFMPEG SETTINGS — 576_PAL_4x3
* Transcoding parameters for a PAL, 4:3 aspect-ratio, 576-line standard-definition output.
*
* This file is a settings fragment, not a standalone script. It is loaded at
* runtime by Ffmpeg::build_av_alternate_command() via require(), which injects all
* variables defined here into the calling method's local scope. The caller then splices
* those variables directly into the two-pass ffmpeg command it builds.
*
* Profile characteristics:
* - Standard-definition PAL video, classic 4:3 aspect ratio at 720 × 576 px.
*   720 × 576 is the ITU-R BT.601 / DVD-Video PAL frame size at 4:3 DAR (using
*   non-square pixel-aspect-ratio 12:11). This is the canonical SD-PAL preservation
*   resolution for tape-originated or broadcast-captured material.
* - 25 fps GOP cadence matching PAL's native 25-frame field rate; one keyframe
*   per second for efficient seeking.
* - 1536 kbit/s video bitrate — higher than the 576_pal (1024 k) variant; suited
*   for archival-quality SD deliverables where the full 4:3 frame must be preserved
*   without the wider 16:9 crop of the 576_pal_16x9 profile.
* - Stereo audio at 128 kbit/s, 44100 Hz sample rate — standard web-quality audio.
* - Output container: MP4 (H.264 + AAC), compatible with progressive download.
*
* Distinguishing this file from related profiles:
*   576_pal.php       — same height, non-square-pixel assumptions (scale 1024x576, 16:9 effective)
*   576_pal_16x9.php  — explicit 16:9 widescreen frame (1024x576)
*   576_ntsc_16x9.php — NTSC variant (30-frame GOP)
*   404_pal_4x3.php   — lower-resolution 4:3 PAL profile (540x404, mono, 1024 k)
*
* Consumed variables (all referenced by name in build_av_alternate_command()):
*   $vb          — video bitrate string passed to ffmpeg's -vb flag
*   $s           — output scale string (WxH) passed to ffmpeg's -s flag
*   $g           — GOP size (keyframe interval in frames) passed to ffmpeg's -g flag
*   $vcodec      — video codec name passed to ffmpeg's -vcodec flag
*   $progresivo  — deinterlace filter string prepended to the filter graph
*   $gamma_y     — luminance (Y) gamma coefficient used in the lutyuv filter
*   $gamma_u     — Cb (blue-difference) gamma coefficient
*   $gamma_v     — Cr (red-difference) gamma coefficient
*   $gammma      — fully assembled lutyuv filter string (note: triple-m typo is
*                  intentional — it matches the identifier hardcoded in class.Ffmpeg.php)
*   $force       — output container format string passed to ffmpeg's -f flag
*   $ar          — audio sample rate in Hz passed to ffmpeg's -ar flag
*   $ab          — audio bitrate string passed to ffmpeg's -ab flag
*   $ac          — audio channel count string ("1" = mono, "2" = stereo)
*   $acodec      — audio codec name (may be overridden by Ffmpeg::get_audio_codec())
*   $target_path — subdirectory label under which the derivative file is stored
*
* @package Dédalo
* @subpackage media_engine
* @see Ffmpeg::build_av_alternate_command()   Sole caller; reads all variables from this scope.
* @see DEDALO_AV_FFMPEG_SETTINGS              Config constant pointing to this directory.
*/

# FFMPEG SETTING 404_pal
// (!) The header comment above reads "404_pal" — this is a stale copy-paste artifact
//     carried over from an earlier template. This file configures 576-line PAL 4:3, not 404 PAL.

$vb				= '1536k';			# video rate kbs
// 1536 kbps is the highest bitrate among the 576-line PAL family, befitting a 4:3 full-frame
// SD profile intended for archival or broadcast-quality derivative storage.

$s				= '720x576';		# scale
// 720x576 — the canonical ITU-R BT.601 / DVD-Video PAL frame dimensions at 4:3 DAR.
// Non-square pixel-aspect-ratio (12:11) is implied by this resolution; the display
// aspect ratio is 4:3 even though the pixel grid is slightly narrower than square.
// Contrast with 576_pal_16x9 which uses 1024x576 (square-pixel widescreen).

$g				= 25;				# keyframes interval (gob)
// 25-frame GOP matches PAL's native 25 fps field rate, placing one keyframe every
// second and enabling sub-second random access for archival media players.

$vcodec			= 'libx264';		# default libx264

$progresivo		= "-vf yadif";		# desentrelazar
// deinterlace filter — "desentrelazar" is Spanish for "deinterlace"
// YADIF (Yet Another DeInterlacing Filter) removes interlace combing from PAL tape
// or broadcast captures. Always applied in this profile; build_av_alternate_command()
// decides whether to include it in the filter chain based on the source scan type.

$gamma_y		= "0.97";			# correccion de luminancia
// "correccion de luminancia" = luminance gamma correction
// Y channel pulled slightly below 1.0 to reduce the overall brightness boost
// typical of analogue PAL capture chains.

$gamma_u		= "1.01";			# correccion de B-y
// "correccion de B-y" = Cb (blue-difference) channel correction
// Raised slightly above 1.0 to restore the blue warmth that tends to be
// attenuated during PAL digitisation.

$gamma_v		= "0.98";			# correccion de R-y
// "correccion de R-y" = Cr (red-difference) channel correction
// Pulled slightly below 1.0 to reduce the reddish cast common in analogue PAL captures.

$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # corrección de gamma
// "corrección de gamma" = gamma correction
// Assembled lutyuv filter string applying the three per-channel coefficients above.
// (!) The variable name contains a deliberate triple-m typo ('$gammma'). Do NOT rename
//     it — class.Ffmpeg.php hard-codes the identifier '$gammma' when reading this scope,
//     so any rename would silently break every settings file at once.

$force			= 'mp4';			# default mp4
// MP4 container is required for the qt-faststart MOOV-relocation step that
// build_av_alternate_command() appends to the two-pass encode, enabling
// progressive download before the full file has transferred.

$ar				= 44100;			# audio sample rate (22050)
// 44100 Hz (CD quality) is the standard web-audio sample rate.
// The parenthesised 22050 Hz alternative would be acceptable for speech-only
// content but 44100 is preferred for general AV cultural-heritage preservation.

$ab				= '128k';			# adio rate kbs
// (!) Typo "adio" in the original comment — should read "audio rate kbs". Not corrected
//     here to avoid altering code; documented as a known artifact shared across all
//     576-line settings files.
// 128 kbps is the standard stereo AAC bitrate for SD web delivery.

$ac				= "2";				# numero de canales de audio 2 = stereo, 1 = nomo
// "numero de canales de audio 2 = stereo, 1 = nomo" = number of audio channels: 2 = stereo, 1 = mono
// "nomo" in the original is a typo for "mono" — not corrected here.
// Stereo (2 channels) is the default for this 576-line profile, matching the higher
// bitrate and broadcast-quality intent. Contrast with 404_pal_4x3 which uses mono (1).

$acodec			= 'libvo_aacenc';	# default libvo_aacenc
// (!) libvo_aacenc (Fraunhofer VO AAC encoder) was removed from the FFmpeg mainline
//     around 2014. On modern FFmpeg installations this value will be overridden at
//     runtime by Ffmpeg::get_audio_codec(), which probes for libfdk_aac, the native
//     'aac' encoder, or another available AAC implementation. The value is retained
//     here for historical compatibility; do not silently swap it in code.

$target_path 	= "576";			# like '404'
// Subdirectory label under the master media root where the 576-line alternate derivative
// is stored. Shared by all 576-line variants (PAL/NTSC, 4:3/16:9). The comment
// "like '404'" is a legacy reference to the 404_pal profile which served as the
// template for this family of settings files.
