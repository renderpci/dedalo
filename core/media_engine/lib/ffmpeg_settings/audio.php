<?php
/**
* FFMPEG SETTINGS PROFILE: audio
* Variable-injection script for audio-only extraction from any AV source.
*
* This file is NOT a standalone script. It is loaded with require() by
* Ffmpeg::build_av_alternate_command() to populate local variables that are
* then interpolated directly into the generated ffmpeg shell command.
*
* Profile identity:
*   - Media type:  audio-only (no video encoding)
*   - Output:      MP4 container carrying an AAC audio track
*   - Quality tier label: 'audio' (maps to the $target_path sub-directory name)
*
* This profile is selected when the caller requests quality 'audio' and
* Ffmpeg::get_setting_name() returns 'audio' (broadcast standard and aspect
* ratio tokens are omitted for audio-only files — see get_setting_name()).
*
* Execution context inside build_av_alternate_command():
*   When $setting_name === 'audio', the method takes a dedicated code path that
*   issues a single-pass ffmpeg command rather than the two-pass libx264 pipeline
*   used by video profiles. Audio parameters ($ar, $ab, $ac, $acodec) that other
*   profiles set from their settings file are hard-coded in the audio branch of
*   build_av_alternate_command() (-ar 44100 -ab 128k -ac 2). The variables defined
*   here are therefore reduced to only what that branch actually reads:
*
*   $force       — output container format; must match the file extension chosen
*                  by the caller (mp4 / m4a).
*   $target_path — quality tier label; used to derive the output sub-directory
*                  (e.g. 'av/audio/') and recover the quality token via
*                  Ffmpeg::get_quality_from_setting().
*
* Companion profile:
*   audio_tr.php — identical structure but sets $force = 'wav', targeting speech
*                  recognition input (16 kHz mono, produced in a separate command).
*
* (!) The qt-faststart post-processing step (MOOV atom relocation) is intentionally
*     disabled for audio in build_av_alternate_command(); see the commented-out
*     fast-start lines in that method. This variable-injection file does not control
*     that decision — it is a hard-coded choice in the audio command branch.
*
* @package Dédalo
* @subpackage Core
*/
# FFMPEG SETTING audio

$force			= 'mp4';			# default mp4

$target_path 	= "audio";			# like '404'
