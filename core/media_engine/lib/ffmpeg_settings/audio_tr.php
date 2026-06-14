<?php
/**
* FFMPEG SETTINGS PROFILE: audio_tr
* Variable-injection script for audio extraction optimised for speech-to-text
* (transcription) engines.
*
* This file is NOT a standalone script. It is loaded with require() by
* Ffmpeg::build_av_alternate_command() to populate local variables that are
* then available in the calling scope.
*
* Profile identity:
*   - Media type:  audio-only (no video encoding)
*   - Output:      WAV container, mono, 16 kHz — narrow-band format expected
*                  by most automatic speech recognition (ASR) engines
*   - Quality tier label: 'audio' (maps to the $target_path sub-directory name)
*
* This profile is selected when the caller requests quality 'audio_tr' and
* Ffmpeg::get_setting_name() returns 'audio_tr' (broadcast standard and aspect
* ratio tokens are omitted for audio-only files — see get_setting_name()).
*
* Execution context inside build_av_alternate_command():
*   When $setting_name === 'audio_tr', the method takes a dedicated code path
*   that issues a single-pass, hardcoded ffmpeg command:
*
*     nice -n 19 <ffmpeg> -i <src> -vn -ar 16000 -ac 1 <target>
*
*   This command fixes the sample rate at 16 kHz and the channel count at 1
*   (mono) regardless of the source file. The output container format is
*   inferred by ffmpeg from the extension of <target> (i.e. from the
*   $target_file_path provided by the caller), NOT from $force defined here.
*
*   (!) $force = 'wav' is a convention marker that declares the intended
*       output container but is NOT interpolated into the audio_tr command.
*       The 'audio' branch uses -f $force directly; 'audio_tr' does not.
*       If the caller's $target_file_path does not end in '.wav', the
*       $force value here will be silently mismatched.
*
*   The two variables defined by this profile that build_av_alternate_command()
*   actually reads are:
*
*   $target_path — quality tier label; used to derive the output sub-directory
*                  (e.g. 'av/audio/') and to recover the quality token via
*                  Ffmpeg::get_quality_from_setting().
*
*   $force       — intended container format; NOT used by the audio_tr branch
*                  of build_av_alternate_command(), but kept for consistency
*                  with the rest of the settings-file family and to signal
*                  the expected output format to any future tooling or callers
*                  that inspect this variable.
*
* Companion profile:
*   audio.php — identical structure but sets $force = 'mp4', targeting standard
*               stereo audio extraction at 44100 Hz and 128 kbps AAC.
*
* @package Dédalo
* @subpackage Core
*/
# FFMPEG SETTING audio

$force			= 'wav';			# default

$target_path 	= "audio";			# like '404'
