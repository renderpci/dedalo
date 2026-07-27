<?php
/**
 * FFMPEG SETTINGS — 1080p PAL (progressive)
 * Configuration parameter set for transcoding to 1080-line progressive PAL quality.
 *
 * This file is `require`d (not `include`d) by Ffmpeg::build_av_alternate_command()
 * in core/media_engine/class.Ffmpeg.php when the requested quality/setting name
 * resolves to 'ffmpeg_settings/1080p_pal'. The require injects the variables
 * defined here directly into the calling method's scope, where they are assembled
 * into a two-pass ffmpeg command string.
 *
 * Profile characteristics:
 * - Standard:     PAL (Phase Alternating Line), 25 fps / 50 Hz field rate
 * - Scan type:    Progressive (1080p) — interlaced source fields are deinterlaced
 *                 before encode using the yadif filter (see $progresivo below)
 * - Resolution:   1920 × 1080 pixels (Full HD)
 * - Video codec:  H.264 (libx264) at ~10.5 Mbps — high-fidelity archival derivative
 * - Audio:        Stereo AAC at 44.1 kHz / 256 kbps
 * - Container:    MP4 (ISO Base Media / faststart-ready)
 *
 * Progressive vs. interlaced behaviour:
 * The $progresivo variable controls whether a deinterlace filter (-vf yadif) is
 * inserted into the ffmpeg command. This file sets $progresivo to "-vf yadif",
 * which tells the caller to apply the yadif deinterlace filter. This is intentional:
 * the source material may be interlaced PAL, and this profile produces a progressive
 * (non-interlaced) derivative — the 'p' suffix in the filename signals exactly that.
 * Compare with 1080i_pal.php (interlaced, $progresivo is empty) or 1080_pal.php
 * (progressive with deinterlace) to understand the difference across the profile family.
 *
 * Gamma correction:
 * A YUV lut filter (lutyuv) is pre-built into $gammma using standard adjustment
 * values tuned for PAL broadcast material:
 *   Y (luma)   0.97 — slight roll-off, preserves headroom
 *   U (B-Y)    1.01 — near-unity blue-difference chroma
 *   V (R-Y)    0.98 — minimal red-difference attenuation
 * The caller splices $gammma into the ffmpeg command alongside $progresivo.
 * Only one video-filter (-vf) argument can be active at once in this pattern;
 * when both deinterlace and gamma are needed, the caller must merge them (not done here).
 *
 * Caller contract (Ffmpeg::build_av_alternate_command):
 *   Sets $acodec at runtime via Ffmpeg::get_audio_codec(), which overrides the
 *   $acodec value defined here. The value in this file is therefore the historical
 *   default / documentation anchor, not the live codec used in production.
 *
 * (!) NOTE — stale header comment:
 *   The `# FFMPEG SETTING 404_pal` comment below is a copy-paste artefact from
 *   404_pal.php and does NOT describe this file. It is preserved unchanged because
 *   the doc-only rule forbids removing code; treat it as inert.
 *
 * (!) NOTE — $gammma typo (three m's):
 *   The variable $gammma is misspelled with three 'm' characters throughout the
 *   entire ffmpeg_settings family. The same misspelling appears in the caller
 *   (class.Ffmpeg.php). Do NOT rename it; the caller depends on this exact identifier.
 *
 * (!) NOTE — $ab inline comment typo:
 *   The inline comment on $ab reads "adio rate kbs" instead of "audio rate kbs".
 *   This is a copy-paste artefact present in all settings files and is not corrected here.
 *
 * (!) NOTE — $ac inline comment typo:
 *   The inline comment on $ac reads "nomo" instead of "mono". This is a
 *   copy-paste artefact present in all settings files; the typo is preserved
 *   unchanged to keep the family consistent.
 *
 * (!) NOTE — $acodec value 'libvo_aacenc':
 *   'libvo_aacenc' is a legacy Vo-AAC encoder removed from ffmpeg since ~2015.
 *   At runtime, Ffmpeg::get_audio_codec() probes the installed binary and overrides
 *   this value with 'libfdk_aac', 'libvo_aacenc', or the built-in 'aac' fallback.
 *   This file's $acodec value is therefore only a historical default; it does not
 *   determine the actual encoder used.
 *
 * @package Dédalo
 * @subpackage Core
 */

# FFMPEG SETTING 404_pal

$vb				= '10496k';			# video bitrate in kbps; ~10.5 Mbps for Full-HD archival quality
$s				= '1920x1080';		# output frame dimensions (width x height) — Full HD 1920×1080
$g				= 25;				# keyframe interval in frames (GOP size); 25 = one I-frame per second at PAL 25 fps
$vcodec			= 'libx264';		# default libx264

$progresivo		= "-vf yadif";		# deinterlace filter: yadif converts interlaced fields to progressive frames; non-empty here (progressive profile)
$gamma_y		= "0.97";			# luma (Y) gamma correction factor — slight roll-off to preserve headroom
$gamma_u		= "1.01";			# blue-difference chroma (U / B-Y) correction — near-unity
$gamma_v		= "0.98";			# red-difference chroma (V / R-Y) correction — minimal attenuation
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # YUV lut gamma correction filter; (!) $gammma is intentionally misspelled with three m's — matches the identifier used in class.Ffmpeg.php
$force			= 'mp4';			# default mp4

$ar				= 44100;			# audio sample rate in Hz; 22050 is an alternative (noted in-line) but 44100 is standard CD-quality
$ab				= '256k';			# adio rate kbs
$ac				= "2";				# number of audio channels: 2 = stereo, 1 = nomo
$acodec			= 'libvo_aacenc';	# historical default AAC encoder; overridden at runtime by Ffmpeg::get_audio_codec() — see file-level note

$target_path 	= "1080_full";			# like '404'
