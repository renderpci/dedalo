/*******************************************************************************
 moov.c - A library for splitting Quicktime/MPEG4.

 Copyright (C) 2007-2009 CodeShop B.V.
 http://www.code-shop.com

 For licensing see the LICENSE file
******************************************************************************/ 

#ifdef HAVE_CONFIG_H
#include "config.h"
#endif

#ifdef _MSC_VER
#define _CRTDBG_MAP_ALLOC
#include <stdlib.h>
#include <crtdbg.h>
#endif

#include "moov.h"
#include "mp4_io.h"
#include "mp4_reader.h"
#include "output_bucket.h"
#if defined(BUILDING_H264_STREAMING) || defined(BUILDING_MP4SPLIT)
#include "output_mp4.h"
#endif
#if defined(BUILDING_SMOOTH_STREAMING) || defined(BUILDING_MP4SPLIT)
#include "output_ismv.h"
#endif
#if defined(BUILDING_FLV_STREAMING) || defined(BUILDING_MP4SPLIT)
#include "output_flv.h"
#endif

/* 
  The QuickTime File Format PDF from Apple:
    http://developer.apple.com/techpubs/quicktime/qtdevdocs/PDF/QTFileFormat.pdf
    http://developer.apple.com/documentation/QuickTime/QTFF/QTFFPreface/qtffPreface.html
*/

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <limits.h>
#include <stdint.h>
#include <sys/stat.h>

#ifdef HAVE_STDINT_H
# include <stdint.h>
#endif
#ifdef HAVE_INTTYPES_H
# include <inttypes.h>
#endif

#ifdef WIN32
#define stat _stat64
#define strdup _strdup
#endif

char const* fragment_type_audio = "audio";
char const* fragment_type_video = "video";

/* Returns true when the test string is a prefix of the input */
int starts_with(const char* input, const char* test)
{
  while(*input && *test)
  {
    if(*input != *test)
      return 0;
    ++input;
    ++test;
  }

  return *test == '\0';
}

/* Returns true when the test string is a suffix of the input */
int ends_with(const char* input, const char* test)
{
  const char* it = input + strlen(input);
  const char* pit = test + strlen(test);
  while(it != input && pit != test)
  {
    if(*it != *pit)
      return 0;
    --it;
    --pit;
  }

  return pit == test;
}

////////////////////////////////////////////////////////////////////////////////

// reported by everwanna:
// av out of sync because: 
// audio track 0 without stss, seek to the exact time. 
// video track 1 with stss, seek to the nearest key frame time.
//
// fixed:
// first pass we get the new aligned times for traks with an stss present
// second pass is for traks without an stss
static int get_aligned_start_and_end(struct mp4_context_t const* mp4_context,
                                     unsigned int start, unsigned int end,
                                     unsigned int* trak_sample_start,
                                     unsigned int* trak_sample_end)
{
  unsigned int pass;
  struct moov_t* moov = mp4_context->moov;
  long moov_time_scale = moov->mvhd_->timescale_;

  for(pass = 0; pass != 2; ++pass)
  {
    unsigned int i;
    for(i = 0; i != moov->tracks_; ++i)
    {
      struct trak_t* trak = moov->traks_[i];
      struct stbl_t* stbl = trak->mdia_->minf_->stbl_;
      long trak_time_scale = trak->mdia_->mdhd_->timescale_;

      // 1st pass: stss present, 2nd pass: no stss present
      if(pass == 0 && !stbl->stss_)
        continue;
      if(pass == 1 && stbl->stss_)
        continue;

      // get start
      if(start == 0)
      {
        trak_sample_start[i] = start;
      }
      else
      {
        start = stts_get_sample(stbl->stts_,
          moov_time_to_trak_time(start, moov_time_scale, trak_time_scale));

        MP4_INFO("start=%u (trac time)\n", start);
        MP4_INFO("start=%.2f (seconds)\n",
          stts_get_time(stbl->stts_, start) / (float)trak_time_scale);

        start = stbl_get_nearest_keyframe(stbl, start + 1) - 1;
        MP4_INFO("start=%u (zero based keyframe)\n", start);
        trak_sample_start[i] = start;
        start = (unsigned int)(trak_time_to_moov_time(
          stts_get_time(stbl->stts_, start), moov_time_scale, trak_time_scale));
        MP4_INFO("start=%u (moov time)\n", start);
        MP4_INFO("start=%.2f (seconds)\n", start / (float)moov_time_scale);
      }

      // get end
      if(end == 0)
      {
        // The default is till-the-end of the track
        trak_sample_end[i] = trak->samples_size_;
      }
      else
      {
        end = stts_get_sample(stbl->stts_,
          moov_time_to_trak_time(end, moov_time_scale, trak_time_scale));
        MP4_INFO("end=%u (trac time)\n", end);
        MP4_INFO("end=%.2f (seconds)\n",
          stts_get_time(stbl->stts_, end) / (float)trak_time_scale);

        if(end >= trak->samples_size_)
        {
          end = trak->samples_size_;
        }
        else
        {
          end = stbl_get_nearest_keyframe(stbl, end + 1) - 1;
        }
        MP4_INFO("end=%u (zero based keyframe)\n", end);
        trak_sample_end[i] = end;
//          MP4_INFO("endframe=%u, samples_size_=%u\n", end, trak->samples_size_);
        end = (unsigned int)trak_time_to_moov_time(
          stts_get_time(stbl->stts_, end), moov_time_scale, trak_time_scale);
        MP4_INFO("end=%u (moov time)\n", end);
        MP4_INFO("end=%.2f (seconds)\n", end / (float)moov_time_scale);
      }
    }
  }

  MP4_INFO("start=%u\n", start);
  MP4_INFO("end=%u\n", end);

  if(end && start >= end)
  {
    return 0;
  }

  return 1;
}

////////////////////////////////////////////////////////////////////////////////

mp4_split_options_t* mp4_split_options_init()
{
  mp4_split_options_t* options = (mp4_split_options_t*)
    malloc(sizeof(mp4_split_options_t));
  options->client_is_flash = 0;
  options->start = 0.0;
  options->start_integer = 0;
  options->end = 0.0;
  options->adaptive = 0;
  options->fragments = 0;
  options->output_format = OUTPUT_FORMAT_MP4;
  options->input_format = INPUT_FORMAT_MP4;
  options->fragment_type = NULL;
  options->fragment_bitrate = 0;
  options->fragment_track_id = 0;
  options->fragment_start = 0;
  options->seconds = 0;
  options->byte_offsets = 0;

  return options;
}

int mp4_split_options_set(struct mp4_split_options_t* options,
                          const char* args_data,
                          unsigned int args_size)
{
  int result = 1;

  {
    const char* first = args_data;
    const char* last = first + args_size + 1;

    if(*first == '?')
    {
      ++first;
    }

    {
      char const* key = first;
      char const* val = NULL;
      int is_key = 1;
      size_t key_len = 0;

      float vbegin = 0.0f;
      float vend = 0.0f;

      while(first != last)
      {
        // the args_data is not necessarily 0 terminated, so fake it
        int ch = (first == last - 1) ? '\0' : *first;
        switch(ch)
        {
        case '=':
          val = first + 1;
          key_len = first - key;
          is_key = 0;
          break;
        case '&':
        case '\0':
          if(!is_key)
          {
            // make sure the value is zero-terminated (for strtod,atoi64)
            int val_len = first - val;
            char* valz = (char*)malloc(val_len + 1);
            memcpy(valz, val, val_len);
            valz[val_len] = '\0';

            if(!strncmp("client", key, key_len))
            {
              options->client_is_flash = starts_with(valz, "FLASH");
            } else
            if(!strncmp("start", key, key_len))
            {
              options->start = (float)(strtod(valz, NULL));
              options->start_integer = atoi64(valz);
            } else
            if(!strncmp("end", key, key_len))
            {
              options->end = (float)(strtod(valz, NULL));
            } else
            if(!strncmp("vbegin", key, key_len))
            {
              vbegin = (float)(strtod(valz, NULL));
            } else
            if(!strncmp("vend", key, key_len))
            {
              vend = (float)(strtod(valz, NULL));
            } else
            if(!strncmp("adaptive", key, key_len))
            {
              options->adaptive = 1;
            } else
            if(!strncmp("bitrate", key, key_len))
            {
              options->fragment_bitrate = (unsigned int)(atoi64(valz));
            } else
            if(!strncmp("video", key, key_len))
            {
              options->fragments = 1;
              options->fragment_type = fragment_type_video;
              options->fragment_start = atoi64(valz);
            } else
            if(!strncmp("audio", key, key_len))
            {
              options->fragments = 1;
              options->fragment_type = fragment_type_audio;
              options->fragment_start = atoi64(valz);
            } else
            if(!strncmp("format", key, key_len))
            {
              if(!strncmp("flv", val, val_len))
              {
                options->output_format = OUTPUT_FORMAT_FLV;
              } else
              if(!strncmp("ts", val, val_len))
              {
                options->output_format = OUTPUT_FORMAT_TS;
              }
            } else
            if(!strncmp("input", key, key_len))
            {
              if(!strncmp("flv", val, val_len))
              {
                options->input_format = INPUT_FORMAT_FLV;
              }
            }
            free(valz);
          }
          key = first + 1;
          val = NULL;
          is_key = 1;
          break;
        }
        ++first;
      }

      // If we have specified a begin point of the virtual video clip,
      // then adjust the start offset
      options->start += vbegin;

      // If we have specified an end, adjust it in case of a virtual video clip.
      if(options->end)
      {
        options->end += vbegin;
      }
      else
      {
        options->end = vend;
      }

      // Validate the start/end for the virtual video clip (begin).
      if(vbegin)
      {
        if(options->start < vbegin)
          result = 0;
        if(options->end && options->end < vbegin)
          result = 0;
      }
      // Validate the start/end for the virtual video clip (end).
      if(vend)
      {
        if(options->start > vend)
          result =  0;
        if(options->end && options->end > vend)
          result = 0;
      }
    }
  }

  return result;
}

void mp4_split_options_exit(struct mp4_split_options_t* options)
{
  if(options->byte_offsets)
  {
    free(options->byte_offsets);
  }

  free(options);
}

extern int mp4_split(struct mp4_context_t* mp4_context,
                     unsigned int* trak_sample_start,
                     unsigned int* trak_sample_end,
                     mp4_split_options_t const* options)
{
  int result;

  float start_time = options->start;
  float end_time = options->end;

  moov_build_index(mp4_context, mp4_context->moov);

  {
    struct moov_t const* moov = mp4_context->moov;
    long moov_time_scale = moov->mvhd_->timescale_;
    unsigned int start = (unsigned int)(start_time * moov_time_scale + 0.5f);
    unsigned int end = (unsigned int)(end_time * moov_time_scale + 0.5f);

    // for every trak, convert seconds to sample (time-to-sample).
    // adjust sample to keyframe
    result = get_aligned_start_and_end(mp4_context, start, end,
                                       trak_sample_start, trak_sample_end);
  }

  return result;
}

uint64_t get_filesize(const char *path)
{
  struct stat status;
  if(stat(path, &status))
  {
    printf("get_file_length(%s) stat: ", path);
    perror(NULL);
    return 0;
  }
  return status.st_size;
}

// End Of File

