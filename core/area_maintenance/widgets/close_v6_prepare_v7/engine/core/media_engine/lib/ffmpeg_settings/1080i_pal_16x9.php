<?php
/**
 * FFMPEG SETTING: 1080i_pal_16x9
 * Encode parameters for a 1080-line interlaced PAL source at 16:9 aspect ratio.
 *
 * This file is a settings fragment — it is not a class or a standalone script.
 * It is loaded at runtime via require() inside Ffmpeg::build_av_alternate_command()
 * when the caller requests the "1080i_pal_16x9" quality profile. The variables
 * defined here are injected directly into the caller's local scope; Ffmpeg then
 * uses them to assemble the ffmpeg two-pass transcode command.
 *
 * Profile characteristics:
 * - Resolution : 1920×1080 (Full HD)
 * - Frame system: PAL — 25 frames/second (European/Australian broadcast standard)
 * - Scan type  : interlaced (1080i).  $progresivo is intentionally empty so the
 *                interlaced signal is preserved rather than deinterlaced with yadif.
 *                Compare with 1080p_pal_16x9.php, where $progresivo = "-vf yadif".
 * - Aspect ratio: 16:9 widescreen
 * - Container  : MP4 (forced via $force)
 * - Video codec: H.264 (libx264), two-pass, 10 496 kbps
 * - Audio codec: libvo_aacenc, 44 100 Hz stereo, 256 kbps
 *
 * Gamma correction is applied via the lutyuv filter to compensate for luminance
 * and chrominance shifts that commonly arise when transcoding broadcast sources.
 *
 * The output subdirectory name ($target_path = "1080_full") is appended to the
 * media component's derivative base path by the caller; it matches the directory
 * used by all other 1080-line profiles.
 *
 * @see Ffmpeg::build_av_alternate_command() — the sole caller; assembles the
 *      command string from these variables and runs the two-pass encode.
 * @see DEDALO_AV_FFMPEG_SETTINGS — constant pointing to this directory.
 *
 * @package Dédalo
 * @subpackage media_engine
 */

# video settings
$vb				= '10496k';			# video bitrate in kbps
$s				= '1920x1080';		# output scale (width x height)
$g				= 25;				# keyframe interval in frames (GOP size); 25 = one keyframe per second at 25 fps (PAL)
$vcodec			= 'libx264';		# default libx264

# deinterlace filter
# Intentionally empty for interlaced (1080i) sources: the interlaced signal is
# preserved as-is in the output.  Progressive profiles set this to "-vf yadif".
$progresivo		= "";				# deinterlace filter (empty = keep interlaced)

# gamma / colour correction — lutyuv lookup-table applied per YUV channel
# Values below 1.0 darken (luma), values above 1.0 brighten (chroma channels).
# These constants were calibrated for PAL broadcast source material.
$gamma_y		= "0.97";			# luma (Y) correction factor — slight darkening to reduce luma boost
$gamma_u		= "1.01";			# Cb (U, blue-difference) correction factor
$gamma_v		= "0.98";			# Cr (V, red-difference) correction factor
# (!) The variable name $gammma contains a legacy typo (triple 'm').  Do not
#     rename it here — Ffmpeg::build_av_alternate_command() reads this exact
#     name from the required file's scope.
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # gamma correction filter string

$force			= 'mp4';			# output container format forced to MP4

# audio settings
$ar				= 44100;			# audio sample rate in Hz (44 100 Hz; 22 050 Hz is the other common option)
$ab				= '256k';			# audio bitrate in kbps
$ac				= "2";				# audio channel count: 2 = stereo, 1 = mono
$acodec			= 'libvo_aacenc';	# audio codec; libvo_aacenc is a legacy AAC encoder — may not be available on newer ffmpeg builds

# output subdirectory
# All 1080-line profiles share the "1080_full" derivative directory.
$target_path 	= "1080_full";			# derivative subdirectory shared by all 1080-line profiles
