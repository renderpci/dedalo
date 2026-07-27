<?php
// FFMPEG SETTING 404_ntsc_16x9
// FFmpeg encoding profile for 404-line NTSC video, widescreen 16:9.
//
// This file is a configuration fragment. It is loaded via require() inside
// Ffmpeg::build_av_alternate_command() (core/media_engine/class.Ffmpeg.php) and injects
// its variables directly into the caller's scope. It must never be included standalone
// or autoloaded as a class — it has no namespace, no class, and no return value.
//
// Profile characteristics:
//   - Resolution : 720x404 (sub-SD, ~404-line approximation of widescreen SD)
//   - Scan type  : progressive (no interlace; the yadif deinterlace filter is available
//                  but is applied only when the source is detected as interlaced by the caller)
//   - Frame system: NTSC, ~29.97 fps — keyframe interval ($g) is 30 frames;
//                   the PAL sibling (404_pal_16x9.php) uses $g = 25
//   - Aspect ratio: 16:9 widescreen (720x404 preserves that ratio)
//   - Video bitrate: 1280k — higher than the PAL-16x9 sibling (1024k), compensating for
//                   the slightly higher NTSC frame rate delivering more temporal data per second
//   - Audio: 44100 Hz mono, 64k AAC — low-bandwidth mono suitable for web streaming
//   - Container: MP4
//   - Output sub-directory: "404" (see $target_path)
//
// Relationship to sibling profiles:
//   404_pal_16x9.php  — same resolution/aspect, PAL standard ($g = 25, $vb = '1024k')
//   404_ntsc.php      — NTSC standard without an explicit aspect-ratio suffix;
//                       kept for backward-compatibility (same resolution but may differ in bitrate)
//   404_pal.php       — PAL standard without the 16:9 suffix (older/generic variant)
//   576_ntsc_16x9.php — next quality tier up in the NTSC 16:9 family
//
// (!) The file-header label on line 58 (the original # FFMPEG SETTING line) was copy-pasted
//     from 404_pal.php and left stale. It reads "404_pal" but the actual profile is
//     404_ntsc_16x9. The corrected label appears above; the stale inline comment is a
//     pre-existing defect — do not rename or reorder code lines.
//
// (!) $acodec is set to 'libvo_aacenc', which was removed from FFmpeg around version 2.8.
//     Modern builds will reject this encoder. The caller (build_av_alternate_command) resolves
//     the actual audio codec at runtime via Ffmpeg::get_audio_codec(), which may override
//     $acodec after the require(). Verify that override path is active on the target server.
//
// (!) The variable name $gammma (triple 'm') is a pre-existing typo shared across all
//     ffmpeg_settings files. Do not rename it here; the consuming code in class.Ffmpeg.php
//     references the same misspelled identifier.
//
// Variables injected into the caller's scope:
//   $vb          string  Video bitrate (e.g. '1280k')
//   $s           string  Output frame dimensions WxH (e.g. '720x404')
//   $g           int     GOP size / keyframe interval in frames (30 for NTSC)
//   $vcodec      string  FFmpeg video codec name
//   $progresivo  string  FFmpeg filter fragment for deinterlacing (yadif)
//   $gamma_y     string  Luma (Y) gamma correction coefficient for lutyuv
//   $gamma_u     string  Cb (U / B-Y) gamma correction coefficient for lutyuv
//   $gamma_v     string  Cr (V / R-Y) gamma correction coefficient for lutyuv
//   $gammma      string  Full -vf lutyuv filter string built from the three coefficients above
//   $force       string  Container format override (e.g. 'mp4')
//   $ar          int     Audio sample rate in Hz
//   $ab          string  Audio bitrate (e.g. '64k')
//   $ac          string  Number of audio channels ('1' = mono, '2' = stereo)
//   $acodec      string  FFmpeg audio codec name (may be overridden at runtime; see (!) above)
//   $target_path string  Sub-directory name under the media root for this quality tier

# FFMPEG SETTING 404_pal

$vb				= '1280k';			# video rate kbs
$s				= '720x404';		# scale
$g				= 30;				# keyframes interval (gob)
$vcodec			= 'libx264';		# default libx264

$progresivo		= "-vf yadif";		# deinterlace filter (applied to interlaced sources by the caller)
$gamma_y		= "0.97";			# luminance (Y) gamma correction coefficient
$gamma_u		= "1.01";			# blue-luminance (B-Y / Cb) gamma correction coefficient
$gamma_v		= "0.98";			# red-luminance (R-Y / Cr) gamma correction coefficient
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # assembled lutyuv gamma filter; note triple-m typo in $gammma is intentional — matches consuming code
$force			= 'mp4';			# default mp4

$ar				= 44100;			# audio sample rate (22050)
$ab				= '64k';			# audio bitrate in kbps (note: original comment had "adio" typo — pre-existing)
$ac				= "1";				# number of audio channels: 2 = stereo, 1 = mono (original comment had "nomo" typo — pre-existing)
$acodec			= 'libvo_aacenc';	# default libvo_aacenc (!) deprecated encoder removed in FFmpeg >= 2.8; runtime override via Ffmpeg::get_audio_codec() is expected

$target_path 	= "404";			# like '404'
