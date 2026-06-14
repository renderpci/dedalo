<?php
# FFMPEG SETTING 1080i_ntsc
# Encoding parameters for 1080i interlaced NTSC source material (30 fps broadcast standard).
#
# This file is loaded at runtime via require() inside Ffmpeg::build_av_alternate_command()
# when the caller requests a conversion to the '1080_full' quality bucket and ffprobe
# detects the source frame-rate is >= 29 fps (NTSC).  Every variable defined here is
# consumed verbatim by the two-pass ffmpeg command builder in that method.
#
# Signal characteristics handled by this profile:
#   - NTSC interlaced: 1080 active lines, ~29.97 fps (30000/1001).
#   - No deinterlace filter is applied ($progresivo = "").  The interlaced structure of
#     the source is preserved in the encoded output.  If deinterlacing is required for a
#     given workflow, use 1080p_ntsc.php instead, which activates yadif.
#   - Keyframe interval ($g) is aligned to NTSC cadence (30), giving one I-frame per
#     second for reliable seeking.
#   - Gamma correction coefficients target standard-definition luminance/chrominance
#     normalisation commonly needed when ingesting legacy broadcast captures:
#       Y (luminance): 0.97  — slight under-correction to prevent clipping
#       U (B-Y chroma): 1.01 — marginal boost to compensate blue-channel roll-off
#       V (R-Y chroma): 0.98 — slight reduction to match red-channel response
#   - Audio: 44.1 kHz stereo at 256 kbps, suitable for archival-quality preservation.
#
# @see Ffmpeg::build_av_alternate_command()   — the sole consumer of these variables
# @see Ffmpeg::get_setting_name()             — selects this file via '1080i_ntsc' key
# @see Ffmpeg::get_media_standard()           — resolves 'ntsc' from frame-rate >= 29 fps
# @see 1080i_ntsc_16x9.php                   — same profile with explicit 16:9 aspect flag
# @see 1080p_ntsc.php                        — progressive variant (adds yadif deinterlace)
# @see 1080i_pal.php                         — interlaced PAL variant (25 fps, $g = 25)

# ── VIDEO ─────────────────────────────────────────────────────────────────────

$vb				= '10496k';			# video bitrate — 10.496 Mbit/s; high-quality archival ceiling for full-HD 1080i
$s				= '1920x1080';		# output scale — full HD 1920 × 1080 pixels; no downscaling applied
$g				= 30;				# keyframe interval (GOP size) — 30 frames = 1 I-frame per second at ~29.97 fps NTSC
$vcodec			= 'libx264';		# video encoder — H.264 baseline; requires --enable-libx264 in the ffmpeg build

# Deinterlace filter.
# Empty string: the interlaced field structure of the 1080i source is preserved.
# Contrast with progressive profiles (1080p_*) where this holds "-vf yadif".
$progresivo		= "";				# deinterlace filter — intentionally empty for interlaced-preserving output

# Gamma / colour-correction filter variables — the three component values are
# interpolated into $gammma below.
$gamma_y		= "0.97";			# luminance (Y) gamma correction — slightly below 1.0 to avoid highlight clipping
$gamma_u		= "1.01";			# blue-difference (U / Cb) chroma correction — marginal boost for blue-channel
$gamma_v		= "0.98";			# red-difference (V / Cr) chroma correction — slight roll-off for red-channel

# lutyuv filter string built from the three gamma values above.
# Applied as the second -vf pass in the two-pass encode.
# (!) Variable is misspelled '$gammma' (triple-m) in ALL sibling settings files;
#     Ffmpeg::build_av_alternate_command() references it by the same misspelled name —
#     do NOT rename either occurrence without updating the consumer.
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # gamma correction filter string

$force			= 'mp4';			# container format passed to ffmpeg -f flag; mp4 required for qt-faststart compatibility

# ── AUDIO ─────────────────────────────────────────────────────────────────────

$ar				= 44100;			# audio sample rate in Hz — CD-quality 44.1 kHz (22050 Hz was an earlier alternative, kept as inline note)
$ab				= '256k';			# audio bitrate — 256 kbps stereo, archival quality for 1080 full-res output
$ac				= "2";				# audio channel count — 2 = stereo (1 = mono, as used in lower-resolution profiles)

# (!) $acodec is set here as a fallback/legacy hint but is overridden at runtime:
#     Ffmpeg::get_audio_codec() probes the installed ffmpeg build and returns
#     'libfdk_aac', 'libvo_aacenc', or the native 'aac' fallback, whichever is
#     available.  The value assigned here is never used when called via
#     build_av_alternate_command(), which always calls get_audio_codec() separately.
$acodec			= 'libvo_aacenc';	# audio encoder hint — legacy; overridden by Ffmpeg::get_audio_codec() at runtime

# ── TARGET PATH ───────────────────────────────────────────────────────────────

# Subdirectory name under the Dédalo AV media root where the encoded file is placed.
# Shared by all 1080-full variants (1080i and 1080p, PAL and NTSC) so that the
# same logical quality bucket is reused regardless of source standard.
$target_path 	= "1080_full";			# output subdirectory key — maps to the '1080_full' quality bucket used by component_av
