<?php
/**
 * FFMPEG SETTINGS — 240 PAL (progressive, low-bandwidth)
 * Configuration parameter set for transcoding to 240-line progressive PAL quality.
 *
 * This file is `require`d (not `include`d) by Ffmpeg::build_av_alternate_command()
 * in core/media_engine/class.Ffmpeg.php when the requested setting name resolves to
 * '240_pal'. The require() call injects every variable defined here directly into the
 * calling method's local scope, where they are assembled into a two-pass ffmpeg command.
 *
 * Profile characteristics:
 * - Standard:     PAL (Phase Alternating Line), 25 fps / 50 Hz field rate
 * - Scan type:    Progressive (interlaced sources are deinterlaced with yadif)
 * - Resolution:   428 × 240 pixels — widescreen PAL at low resolution
 *                 This is a non-square-pixel approximation of a 16:9 SD frame
 *                 without the explicit 16x9 aspect-ratio flag used in 240_pal_16x9.php.
 * - Video codec:  H.264 (libx264) at 384 kbps — low-bandwidth web/mobile derivative
 * - Audio:        Mono AAC at 24 kHz / 28 kbps — minimal footprint for speech-heavy content
 * - Container:    MP4 (ISO Base Media / faststart-ready)
 *
 * Relationship to sibling profiles:
 * - 240_pal_4x3.php    — same bitrate/codec/audio but 320 × 240 (4:3 aspect ratio)
 * - 240_pal_16x9.php   — same bitrate/codec/audio but 428 × 240 with explicit 16:9 flag
 * - 240_ntsc.php       — same resolution (428 × 240) but $g = 30 for ~29.97 fps NTSC cadence
 * - 288_pal.php        — slightly higher PAL resolution variant (wider than 240 lines)
 * - 404_pal.php        — next step up the quality ladder (720 × 404, 960 kbps)
 *
 * Deinterlace behaviour:
 * $progresivo is set to "-vf yadif", which instructs the caller to apply FFmpeg's yadif
 * (Yet Another DeInterlacing Filter) before encoding. This converts interlaced PAL source
 * material to a progressive stream, which is required for H.264 web delivery at this
 * resolution. Compare with 1080i_pal.php where $progresivo = "" to preserve fields.
 *
 * Gamma correction:
 * A lutyuv YUV lut filter is pre-built into $gammma using standard PAL adjustment values:
 *   Y (luma)   0.97 — slight roll-off, preserves headroom against clipping
 *   U (B-Y)    1.01 — near-unity blue-difference chroma boost
 *   V (R-Y)    0.98 — minimal red-difference attenuation
 *
 * Audio note — low-bandwidth choices:
 * At this profile level, audio is deliberately constrained to mono ($ac = "1") at
 * 24 kHz ($ar = 24000) and 28 kbps ($ab = '28k'). The 24 kHz sample rate (rather than
 * the standard 44.1 kHz used by high-resolution profiles) is intentional: it halves
 * the audio payload, suitable for speech archives or network-constrained delivery.
 *
 * Caller contract (Ffmpeg::build_av_alternate_command):
 * - $acodec defined here is a historical fallback. The caller always overrides it via
 *   Ffmpeg::get_audio_codec(), which probes the installed ffmpeg binary for the best
 *   available AAC encoder ('libfdk_aac' > 'libvo_aacenc' > native 'aac').
 * - $target_path drives the subdirectory under the AV media root where the encoded
 *   file is placed; all 240-line profiles share the "240" bucket.
 *
 * (!) NOTE — stale header comment:
 *   The '#  FFMPEG SETTING 240_pal' comment below is a copy-paste fixture present in
 *   every file of the 240 sub-family (ntsc, pal, 4x3, 16x9) regardless of actual
 *   profile. It does NOT distinguish this file from its siblings. Do not use it as
 *   an authoritative profile label.
 *
 * (!) NOTE — $gammma typo (three m's):
 *   The variable $gammma is misspelled with three 'm' characters throughout the entire
 *   ffmpeg_settings family. The same misspelling exists in the consumer
 *   (class.Ffmpeg.php). Do NOT rename it; the caller depends on this exact identifier.
 *
 * (!) NOTE — $ab label typo:
 *   The inline comment reads "adio rate kbs" (missing leading 'u'). This is a
 *   copy-paste artefact present across all sibling files. Left unchanged.
 *
 * (!) NOTE — $ac label typo:
 *   The inline comment reads "nomo" instead of "mono". Copy-paste artefact from
 *   the sibling family. Left unchanged.
 *
 * @package Dédalo
 * @subpackage Core
 */

# FFMPEG SETTING 240_pal

$vb				= '384k';			# video rate kbs
$s				= '428x240';		# scale
$g				= 25;				# keyframes interval (gob)
$vcodec			= 'libx264';		# default libx264

$progresivo		= "-vf yadif";		# desentrelazar
$gamma_y		= "0.97";			# correccion de luminancia
$gamma_u		= "1.01";			# correccion de B-y
$gamma_v		= "0.98";			# correccion de R-y
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # corrección de gamma
$force			= 'mp4';			# default mp4

$ar				= 24000;			# audio sample rate (22050)
$ab				= '28k';			# adio rate kbs
$ac				= "1";				# numero de canales de audio 2 = stereo, 1 = nomo
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

$target_path 	= "240";			# like '404'
