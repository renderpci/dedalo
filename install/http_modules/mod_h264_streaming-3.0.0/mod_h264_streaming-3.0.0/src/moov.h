/*******************************************************************************
 moov.h - A library for splitting Quicktime/MPEG4 files.

 Copyright (C) 2007-2009 CodeShop B.V.
 http://www.code-shop.com

 For licensing see the LICENSE file
******************************************************************************/ 

#ifndef MOOV_H_AKW
#define MOOV_H_AKW

// NOTE: don't include stdio.h (for FILE) or sys/types.h (for off_t).
// nginx redefines _FILE_OFFSET_BITS and off_t will have different sizes
// depending on include order

#include "mod_streaming_export.h"

#ifndef _MSC_VER
#include <inttypes.h>
#else
#include "inttypes.h"
#endif

#ifdef __cplusplus
extern "C" {
#endif

struct mp4_context_t;
struct bucket_t;

MOD_STREAMING_DLL_LOCAL extern char const* fragment_type_audio;
MOD_STREAMING_DLL_LOCAL extern char const* fragment_type_video;

enum fragment_type_t
{
  FRAGMENT_TYPE_UNKNOWN,
  FRAGMENT_TYPE_AUDIO,
  FRAGMENT_TYPE_VIDEO
};

enum input_format_t
{
  INPUT_FORMAT_MP4,
  INPUT_FORMAT_FLV
};
typedef enum input_format_t input_format_t;

enum output_format_t
{
  OUTPUT_FORMAT_MP4,
  OUTPUT_FORMAT_MOV,
  OUTPUT_FORMAT_RAW,
  OUTPUT_FORMAT_FLV,
  OUTPUT_FORMAT_TS
};
typedef enum output_format_t output_format_t;

struct mp4_split_options_t
{
  int client_is_flash;
  float start;
  uint64_t start_integer;
  float end;
  int adaptive;
  int fragments;
  enum output_format_t output_format;
  enum input_format_t input_format;
  char const* fragment_type;
  unsigned int fragment_bitrate;
  unsigned int fragment_track_id;
  uint64_t fragment_start;
  int seconds;
  uint64_t* byte_offsets;
};
typedef struct mp4_split_options_t mp4_split_options_t;

MOD_STREAMING_DLL_LOCAL extern
mp4_split_options_t* mp4_split_options_init();
MOD_STREAMING_DLL_LOCAL extern
int mp4_split_options_set(mp4_split_options_t* options,
                          const char* args_data,
                          unsigned int args_size);
MOD_STREAMING_DLL_LOCAL extern
void mp4_split_options_exit(mp4_split_options_t* options);

/* Returns true when the test string is a prefix of the input */
MOD_STREAMING_DLL_LOCAL extern
int starts_with(const char* input, const char* test);
/* Returns true when the test string is a suffix of the input */
MOD_STREAMING_DLL_LOCAL extern
int ends_with(const char* input, const char* test);

MOD_STREAMING_DLL_LOCAL extern
int mp4_split(struct mp4_context_t* mp4_context,
              unsigned int* trak_sample_start,
              unsigned int* trak_sample_end,
              mp4_split_options_t const* options);

MOD_STREAMING_DLL_LOCAL extern uint64_t get_filesize(const char *path);

#ifdef __cplusplus
} /* extern C definitions */
#endif

#endif // MOOV_H_AKW

// End Of File

