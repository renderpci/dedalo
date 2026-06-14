<?php
/**
 * FFMPEG SETTINGS — 1080i PAL (interlaced)
 * Configuration parameter set for transcoding to 1080-line interlaced PAL quality.
 *
 * This file is `require`d (not `include`d) by Ffmpeg::build_av_alternate_command()
 * in core/media_engine/class.Ffmpeg.php when the requested quality/setting name
 * resolves to 'ffmpeg_settings/1080i_pal'. The require injects the variables
 * defined here directly into the calling method's scope, where they are assembled
 * into a two-pass ffmpeg command string.
 *
 * Profile characteristics:
 * - Standard:     PAL (Phase Alternating Line), 25 fps / 50 Hz field rate
 * - Scan type:    Interlaced (1080i) — fields are NOT deinterlaced before encode
 * - Resolution:   1920 × 1080 pixels (Full HD)
 * - Video codec:  H.264 (libx264) at ~10.5 Mbps — high-fidelity archival derivative
 * - Audio:        Stereo AAC at 44.1 kHz / 256 kbps
 * - Container:    MP4 (ISO Base Media / faststart-ready)
 *
 * Interlaced vs. progressive behaviour:
 * The $progresivo variable controls whether a deinterlace filter (-vf yadif) is
 * inserted into the ffmpeg command. This file sets $progresivo to an empty string,
 * which tells the caller to skip deinterlacing. This is intentional: the source
 * material is natively interlaced PAL, and the derivative retains the interlaced
 * structure — the 'i' suffix in the filename signals exactly that.
 * Compare with 1080p_pal.php (progressive, uses -vf yadif) or 1080_pal.php
 * (progressive with deinterlace) to see the difference across the profile family.
 *
 * Gamma correction:
 * A YUV lut filter (lutyuv) is pre-built into $gammma using standard adjustment
 * values tuned for PAL broadcast material:
 *   Y (luma)   0.97 — slight roll-off, preserves headroom
 *   U (B-Y)    1.01 — near-unity blue-difference chroma
 *   V (R-Y)    0.98 — minimal red-difference attenuation
 * The $gammma string is empty when gamma correction is not needed (see 404_pal.php).
 *
 * Caller contract (Ffmpeg::build_av_alternate_command):
 *   Sets $acodec at runtime via Ffmpeg::get_audio_codec(), which overrides the
 *   $acodec value defined here. The value in this file is therefore the historical
 *   default / documentation anchor, not the live codec used in production.
 *
 * (!) NOTE — stale header comment:
 *   The first comment in this file reads "FFMPEG SETTING 404_pal", which is a
 *   copy-paste artefact from 404_pal.php and does NOT describe this file.
 *   Do not use it as a reference for the actual profile name.
 *
 * (!) NOTE — $gammma typo (three m's):
 *   The variable $gammma is misspelled with three 'm' characters throughout the
 *   entire ffmpeg_settings family. The same misspelling appears in the caller
 *   (class.Ffmpeg.php, see build_av_alternate_command). Do NOT rename it; the
 *   caller depends on this exact identifier.
 *
 * @package Dédalo
 * @subpackage Core
 */

# FFMPEG SETTING 404_pal

$vb				= '10496k';			# video rate kbs
$s				= '1920x1080';		# scale
$g				= 25;				# keyframes interval (gob)
$vcodec			= 'libx264';		# default libx264

$progresivo		= "";				# desentrelazar
$gamma_y		= "0.97";			# correccion de luminancia
$gamma_u		= "1.01";			# correccion de B-y
$gamma_v		= "0.98";			# correccion de R-y
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # corrección de gamma
$force			= 'mp4';			# default mp4

$ar				= 44100;			# audio sample rate (22050)
$ab				= '256k';			# adio rate kbs
$ac				= "2";				# numero de canales de audio 2 = stereo, 1 = nomo
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

$target_path 	= "1080_full";			# like '404'
