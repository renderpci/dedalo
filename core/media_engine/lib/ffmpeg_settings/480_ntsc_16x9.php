<?php
/**
* FFMPEG SETTINGS — 480_NTSC_16X9
* Variable definitions for the 480p NTSC 16:9 (SD widescreen) transcoding profile.
*
* This file is NOT executed directly. It is included via require() inside
* Ffmpeg::build_av_alternate_command() when the composed setting name resolves to
* '480_ntsc_16x9'. Upon inclusion, each variable defined here becomes a local
* variable in that method's scope and is spliced directly into the generated
* ffmpeg shell command.
*
* Profile characteristics:
* - Resolution : 854×480 px  (16:9 widescreen, standard-definition NTSC)
* - Video codec : H.264 (libx264), two-pass encode, 1024 kbit/s
* - Keyframe interval : 30 (GOP = 30, matching NTSC 29.97 fps cadence)
* - Audio       : AAC stereo, 44100 Hz, 128 kbit/s
* - Container   : MP4 (mov/mp4 family; MOOV atom relocated by qt-faststart after encode)
*
* Broadcast standard selection:
*   NTSC sources run at ≈29.97 fps (rational 30000/1001). Ffmpeg::get_media_standard()
*   returns 'ntsc' for any frame rate ≥ 29 fps, which causes this file to be selected
*   over the PAL sibling (25 fps) for North-American and Japanese SD material.
*
* Gamma / colour correction:
*   The lutyuv filter applies per-channel gamma correction to compensate for typical
*   encoding artefacts in SD capture cards:
*     Y (luminance) : 0.97  (slight darkening to reduce blown highlights)
*     U (Cb, B-Y)   : 1.01  (very mild chroma boost on blue axis)
*     V (Cr, R-Y)   : 0.98  (very mild chroma reduction on red axis)
*   These coefficients are intentional production choices; do not change them
*   without evaluating the visual impact on SD digitised footage.
*
* Deinterlace:
*   $progresivo applies yadif (Yet Another DeInterlacing Filter) to convert interlaced
*   SD sources (captured from analogue tape or broadcast) to progressive frames before
*   rescaling. Applied unconditionally for this profile.
*
* (!) The $acodec default below ('libvo_aacenc') is a legacy encoder that was removed
*     from ffmpeg >= 3. Ffmpeg::build_av_alternate_command() overrides $acodec at
*     runtime by calling Ffmpeg::get_audio_codec(), which probes the actual build and
*     selects libfdk_aac, libvo_aacenc, or the native 'aac' encoder. The value set
*     here is effectively a documentation placeholder.
*
* @package Dédalo
* @subpackage Core
*/

// (!) Stale label in original: file header read "FFMPEG SETTING 404_pal" — this is
//     480_ntsc_16x9. The label was carried over from a copy-paste of the 404_pal
//     template and was never updated.
# FFMPEG SETTING 404_pal

// Video settings
// -------------

/**
* Video bitrate for the two-pass libx264 encode.
* Higher than the 404-line profiles (960k–1024k range) to accommodate the larger
* 854×480 frame area while remaining below 1080p bandwidth targets.
* @var string $vb
*/
$vb				= '1024k';			# video rate kbs

/**
* Output frame size (width×height in pixels).
* 854×480 is the standard 16:9 anamorphic equivalent of 480-line NTSC, matching
* the DAR 16:9 expected for widescreen SD playback.
* @var string $s
*/
$s				= '854x480';		# scale

/**
* GOP size (Group of Pictures — keyframe interval).
* Set to 30 for NTSC to place an I-frame approximately every second of 29.97 fps
* material, giving acceptable random-access seek performance on web players.
* @var int $g
*/
$g				= 30;				# keyframes interval (gob)

/**
* Video encoder passed as -vcodec to ffmpeg.
* libx264 is the standard H.264 software encoder used by all Dédalo video profiles.
* @var string $vcodec
*/
$vcodec			= 'libx264';		# default libx264

// Deinterlace and gamma filters
// ------------------------------

/**
* Deinterlace filter argument string injected verbatim into the ffmpeg command.
* yadif (Yet Another DeInterlacing Filter) converts interlaced SD frames to
* progressive before the scale step, preventing comb artefacts in the output.
* (!) Variable name uses Spanish spelling ('progresivo'); do not rename without
*     a coordinated update of every settings file that defines it and every
*     include-site in Ffmpeg::build_av_alternate_command().
* @var string $progresivo
*/
$progresivo		= "-vf yadif";		# desentrelazar

/**
* Luminance (Y channel) gamma correction coefficient for the lutyuv filter.
* Value 0.97 applies a slight darkening, correcting the luminance lift
* common in analogue-to-digital capture card output.
* @var string $gamma_y
*/
$gamma_y		= "0.97";			# correccion de luminancia

/**
* Chroma Cb / B-Y (U channel) gamma correction coefficient for the lutyuv filter.
* Value 1.01 is a minimal upward correction on the blue–luma difference axis.
* @var string $gamma_u
*/
$gamma_u		= "1.01";			# correccion de B-y

/**
* Chroma Cr / R-Y (V channel) gamma correction coefficient for the lutyuv filter.
* Value 0.98 provides a very slight attenuation of the red–luma difference axis,
* compensating for the mild red bias of typical SD capture hardware.
* @var string $gamma_v
*/
$gamma_v		= "0.98";			# correccion de R-y

/**
* Assembled lutyuv filter string for per-channel gamma correction.
* Applies $gamma_y, $gamma_u, and $gamma_v simultaneously in a single filter
* pass via ffmpeg's lutyuv filter and the gammaval() function.
* (!) Variable name has a typo (triple 'm': '$gammma'). The name is preserved
*     as-is because Ffmpeg::build_av_alternate_command() references exactly this
*     identifier when building the shell command; renaming it here without
*     updating that method would silently omit the gamma filter from the encode.
* @var string $gammma
*/
$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # corrección de gamma

/**
* Container format forced with ffmpeg -f flag.
* 'mp4' selects the MOV/MP4/M4A muxer family, the standard Dédalo delivery container.
* The temporary output is subsequently processed by qt-faststart to relocate the
* MOOV atom for progressive web streaming.
* @var string $force
*/
$force			= 'mp4';			# default mp4

// Audio settings
// ---------------

/**
* Audio sample rate in Hz.
* 44100 Hz (CD quality) is the Dédalo standard for all video profiles.
* The commented value 22050 would halve the frequency range and is not used.
* @var int $ar
*/
$ar				= 44100;			# audio sample rate (22050)

/**
* Audio bitrate.
* 128k stereo at 44100 Hz is appropriate for widescreen SD content with
* dialogue, music, and ambient sound. Contrast with the 64k mono used in
* the narrower 404/576 profiles.
* (!) Comment in the original source contained a typo: "adio rate kbs"
*     (missing leading 'u'). Preserved verbatim below to remain doc-only.
* @var string $ab
*/
$ab				= '128k';			# adio rate kbs

/**
* Number of audio channels: 2 = stereo, 1 = mono.
* Stereo output is used here because 480p NTSC 16:9 content typically
* originates from broadcast or consumer camcorder sources with stereo tracks.
* (!) Original comment was in Spanish ("numero de canales de audio") and contained
*     the typo "nomo" (for "mono"). Both are preserved verbatim below.
* @var string $ac
*/
$ac				= "2";				# numero de canales de audio 2 = stereo, 1 = nomo

/**
* Audio codec name passed to ffmpeg -acodec.
* (!) This value is a legacy placeholder. Ffmpeg::build_av_alternate_command()
*     unconditionally replaces $acodec by calling Ffmpeg::get_audio_codec(), which
*     probes the running ffmpeg build for libfdk_aac, then libvo_aacenc, then
*     falls back to the native 'aac' encoder. 'libvo_aacenc' was removed from
*     ffmpeg >= 3.0; using it on modern installations without the runtime override
*     would cause the encode to fail.
* @var string $acodec
*/
$acodec			= 'libvo_aacenc';	# default libvo_aacenc

// Output path token
// ------------------

/**
* Quality sub-directory label used when storing the transcoded file.
* Corresponds to the numeric height of this profile (480 lines).
* Ffmpeg::get_quality_from_setting() recovers this token from the composite
* setting name to locate the correct output directory under the media tree.
* @var string $target_path
*/
$target_path 	= "480";			# like '404'
