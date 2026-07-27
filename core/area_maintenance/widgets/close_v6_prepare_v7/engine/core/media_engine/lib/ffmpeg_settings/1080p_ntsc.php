<?php
/**
* FFMPEG SETTINGS — 1080p NTSC (full-frame progressive)
* Transcoding parameters for 1920×1080 progressive output targeting the NTSC broadcast standard.
*
* This file is loaded via require() by Ffmpeg::build_av_alternate_command() when the
* requested setting name resolves to '1080p_ntsc'. All variables defined here are
* injected into the calling scope and spliced directly into the ffmpeg two-pass shell
* command. No functions or classes are declared here.
*
* NTSC vs. PAL distinction:
* - NTSC runs at ~29.97 fps; the GOP size ($g) is set to 30 frames (≈ 1-second keyframe
*   interval at NTSC frame rate) to align I-frames with second boundaries.
* - The PAL sibling (1080p_pal.php) uses $g = 25 for the same 1-second alignment at
*   25 fps.
*
* Progressive vs. interlaced distinction:
* - The yadif deinterlace filter ($progresivo) is present for safety when the source
*   material is interlaced; for already-progressive sources this is a no-op pass.
*   Interlaced siblings (1080i_ntsc.php) share the same filter.
*
* Variable contract (consumed by Ffmpeg::build_av_alternate_command()):
*   $vb          — video bitrate string for -vb flag
*   $s           — output resolution WxH for -s flag
*   $g           — keyframe (GOP) interval in frames for -g flag
*   $vcodec      — video encoder name for -vcodec flag
*   $progresivo  — ffmpeg video filter fragment to deinterlace (-vf yadif)
*   $gamma_y     — luma gamma correction factor (Y channel)
*   $gamma_u     — chroma blue-difference gamma correction factor (Cb/U channel)
*   $gamma_v     — chroma red-difference gamma correction factor (Cr/V channel)
*   $gammma      — assembled lutyuv filter string combining all three gamma values
*   $force       — container format name for -f flag
*   $ar          — audio sample rate in Hz for -ar flag
*   $ab          — audio bitrate string for -ab flag
*   $ac          — audio channel count (2 = stereo) for -ac flag
*   $acodec      — audio encoder name for -acodec flag (may be overridden by Ffmpeg::get_audio_codec())
*   $target_path — subdirectory token used to build the output file path (e.g. '1080_full')
*
* @package Dédalo
* @subpackage Core
*/

# FFMPEG SETTING 404_pal

$vb				= '10496k';			# video bitrate — ~10.5 Mbit/s suits HD full-frame 1080p web delivery
$s				= '1920x1080';		# output resolution — full-HD 1920×1080 (no downscale from 1080 source)
$g				= 30;				# GOP / keyframe interval in frames — 30 frames ≈ 1 s at NTSC ~29.97 fps
$vcodec			= 'libx264';		# video encoder — H.264 via libx264; hardware alternatives not used here

# Deinterlace + gamma correction filters
$progresivo		= "-vf yadif";		# deinterlace filter — yadif (yet another deinterlacing filter) removes interlace comb artifacts; safe on progressive sources
$gamma_y		= "0.97";			# luma gamma correction — slight darkening of the Y (luma) channel to compensate for common camera gamma over-exposure
$gamma_u		= "1.01";			# chroma Cb/U (blue-difference) gamma correction — minor lift to restore blue balance
$gamma_v		= "0.98";			# chroma Cr/V (red-difference) gamma correction — slight reduction to counter red push from certain analogue tape sources
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # assembled lutyuv filter applying Y/U/V gamma in a single video filter pass
# (!) $gammma has a triple-'m' typo in its name; retained to match the consuming code in Ffmpeg::build_av_alternate_command()
$force			= 'mp4';			# container format — MP4 (ISO Base Media File Format) for broad browser/device compatibility

# Audio settings — stereo 256 kbit/s AAC, CD-quality sample rate
$ar				= 44100;			# audio sample rate in Hz — 44.1 kHz (CD quality); 22050 Hz is an alternative for lower-quality targets
$ab				= '256k';			# audio bitrate — 256 kbit/s stereo AAC gives transparent quality for archival web delivery
# (!) 'adio rate kbs' is a long-standing typo in sibling files; retained comment adjusted to English
$ac				= "2";				# audio channel count — 2 = stereo; 1 = mono
$acodec			= 'libvo_aacenc';	# audio encoder — libvo_aacenc (VO-AAC); may be overridden at runtime by Ffmpeg::get_audio_codec() if libfdk_aac or the native aac encoder is available

$target_path 	= "1080_full";			# output subdirectory token — the transcoded file is placed under a '1080_full' sub-path of the media root
