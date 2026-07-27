<?php
/**
 * FFMPEG SETTINGS — 288 PAL (progressive, ultra-low-bandwidth mobile/web)
 * Configuration parameter set for transcoding to a 288-line-class PAL delivery profile.
 *
 * This file is `require`d (not `include`d) by Ffmpeg::build_av_alternate_command()
 * in core/media_engine/class.Ffmpeg.php when the requested setting name resolves to
 * '288_pal'. The require() call injects every variable defined here directly into the
 * calling method's local scope, where they are assembled into a two-pass ffmpeg command.
 *
 * Profile characteristics:
 * - Standard:     PAL (Phase Alternating Line), 25 fps / 50 Hz field rate
 * - Scan type:    Progressive (no $progresivo / yadif deinterlace variable is defined;
 *                 the caller will receive an undefined variable warning at runtime — see
 *                 the (!) NOTE below)
 * - Resolution:   360 × 202 pixels — a non-standard, ultra-small widescreen frame
 *                 (≈ 1.78:1 ratio, roughly 288-line height class despite the 202 px height)
 * - Video codec:  H.264 (libx264) at 256 kbps target / 384 kbps ceiling
 * - Audio:        AAC at 22 050 Hz mono/stereo, 32 kbps — minimal footprint for
 *                 constrained mobile or archived speech delivery
 * - Container:    MP4 (ISO Base Media)
 *
 * Relationship to sibling profiles:
 * - 240_pal.php    — one step lower (428 × 240, 384 kbps video, 24 kHz / 28 kbps audio)
 * - 240_pal_16x9   — same bitrate tier but explicit 16:9 flag and slightly wider frame
 * - 404_pal.php    — next step up (720 × 404, 1 024 kbps, stereo 44.1 kHz)
 * - audio.php      — audio-only extract path (no video variables needed)
 *
 * $target_path value:
 * Unusually, this profile sets $target_path = 'low' rather than a numeric resolution
 * string (e.g. '404', '240'). The caller uses $target_path to select the output
 * subdirectory under the AV media root; 'low' maps to a dedicated low-quality bucket
 * that is distinct from all other numeric tiers.
 *
 * Caller contract (Ffmpeg::build_av_alternate_command):
 * - $acodec defined here is a historical fallback. The caller always overrides it via
 *   Ffmpeg::get_audio_codec(), which probes the installed ffmpeg binary for the best
 *   available AAC encoder ('libfdk_aac' > 'libvo_aacenc' > native 'aac').
 * - $target_path drives the subdirectory under the AV media root where the encoded
 *   file is placed; this profile uses the special 'low' bucket (not a numeric tier).
 *
 * (!) CRITICAL — $b vs $vb variable name mismatch:
 *   Every other video settings file in this directory defines the video bitrate as
 *   `$vb`. The caller (build_av_alternate_command step 1 and step 2 commands) references
 *   `$vb` exclusively. This file defines `$b` instead, so at runtime `$vb` will be
 *   undefined (PHP will emit a notice and treat it as an empty string), effectively
 *   omitting the `-vb` flag from the generated ffmpeg command. The encode will proceed
 *   but without a controlled bitrate target.
 *   Do NOT rename $b to $vb here — the rename must be coordinated with a regression
 *   test of the 288_pal encode pipeline.
 *
 * (!) NOTE — $maxrate is unused by the caller:
 *   The `$maxrate` variable is defined here but is never referenced in
 *   build_av_alternate_command() or any other method of class.Ffmpeg.php. It appears
 *   to be a leftover from an earlier implementation that intended to pass a VBV ceiling
 *   (-maxrate) to ffmpeg. It has no effect on the generated command.
 *
 * (!) NOTE — missing $progresivo, $gamma_* / $gammma, and $ac variables:
 *   All sibling video profiles define $progresivo (yadif deinterlace filter),
 *   $gamma_y / $gamma_u / $gamma_v, $gammma (lutyuv gamma-correction filter), and $ac
 *   (audio channel count). This profile omits all five. The caller will encounter
 *   undefined variable notices for each; the empty-string substitution means the ffmpeg
 *   command is built without deinterlace and without gamma-correction filters, and the
 *   audio channel count flag is also absent.
 *
 * (!) NOTE — $ab label typo:
 *   The inline comment reads "adio rate kbs" (missing leading 'u' — should be
 *   "audio rate kbs"). This is a copy-paste artefact present across the sibling file
 *   family. Left unchanged.
 *
 * @package Dédalo
 * @subpackage Core
 */
# FFMPEG SETTING 288_pal

// video bitrate target
// (!) WARNING: caller references $vb, not $b — this assignment is silently ignored
//     at runtime; see header (!) CRITICAL note above.
$b				= '256k';			# video rate kbs

// VBV peak ceiling — unused by the caller; see header (!) NOTE.
$maxrate		= '384k';			# max video rate kbs

// output frame dimensions: 360 × 202 px, ≈ 16:9 widescreen at ultra-low resolution
$s				= '360x202';		# scale

// GOP length in frames at 25 fps PAL (1-second keyframe interval)
$g				= 25;				# keyframes interval (gob)

// H.264 encoder — only libx264 is currently supported by the build_av_alternate_command pipeline
$vcodec			= 'libx264';		# default libx264

// output container; MP4 is required for qt-faststart MOOV relocation performed after encode
$force			= 'mp4';			# default mp4

// audio sample rate: 22 050 Hz — half of CD quality, suitable for speech archives
$ar				= 22050;			# audio sample rate (22050)

// audio bitrate: 32 kbps — minimum practical AAC bitrate for intelligible speech
$ab				= '32k';			# adio rate kbs

// historical fallback codec name; overridden at runtime by Ffmpeg::get_audio_codec()
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

// output subdirectory bucket; 'low' is unique to this profile (all others use a numeric string)
$target_path	= 'low';
