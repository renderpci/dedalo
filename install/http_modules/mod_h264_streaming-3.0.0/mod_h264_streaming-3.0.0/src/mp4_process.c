/*******************************************************************************
 mp4_process.c - .

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

#if !defined(BUILDING_NGINX)
#include "mp4_process.h"
#endif
#include "moov.h"

#include "mp4_io.h"
#include "output_bucket.h"

#if defined(BUILDING_H264_STREAMING) || defined(BUILDING_MP4SPLIT)
#include "output_mp4.h"
#endif
#if defined(BUILDING_MP4SPLIT)
#include "output_mov.h"
#endif
#if defined(BUILDING_SMOOTH_STREAMING) || defined(BUILDING_MP4SPLIT)
#include "output_ismv.h"
#endif
#if defined(BUILDING_FLV_STREAMING) || defined(BUILDING_MP4SPLIT)
#include "output_flv.h"
#endif
#if defined(BUILDING_SMOOTH_STREAMING) || defined(BUILDING_MP4SPLIT)
#include "output_ts.h"
#endif

#include <stdlib.h>
#include <string.h>

#ifdef WIN32
#define snprintf _snprintf
#endif

static int rxs_get_bucket(char const* filename, bucket_t** buckets,
                          mp4_split_options_t* options)
{
  // fragment request?
  if(!options->fragments)
    return 0;

  {
    char rxs_filename[256];
    mem_range_t* mem_range;
    unsigned char const* first;
    unsigned char const* last;

    // create rxs filename
    snprintf(rxs_filename, sizeof(rxs_filename), "%s.%u.rxs",
             filename, options->fragment_track_id);

    mem_range = mem_range_init_read(rxs_filename);
    if(!mem_range)
    {
      // TODO: CHANGE BACK TO 0, otherwise VOD won't work
//    return 409; // 409 Conflict
      return 0;
    }

    first = (unsigned char const*)(mem_range_map(mem_range, 0, (uint32_t)mem_range->filesize_));
    last = first + mem_range->filesize_;
    while(first != last)
    {
      uint64_t time = read_64(first);
      if(time == options->fragment_start)
      {
        uint64_t offset = read_64(first + 8);
        uint64_t size = read_64(first + 16);
        bucket_insert_tail(buckets, bucket_init_file(offset, size));
        break;
      }
      first += sizeof(rxs_t);
    }
    mem_range_exit(mem_range);

    return first == last ? 404 : 200;
  }
}

#if defined(BUILDING_NGINX)
static
#else
extern
#endif
int mp4_process(const char* filename, uint64_t filesize, int verbose,
                bucket_t** buckets,
                mp4_split_options_t* options)
{
  int result = 1;

  // implement mod_flv_streaming for convenience
  if(ends_with(filename, ".flv") || options->input_format == INPUT_FORMAT_FLV)
  {
    static const unsigned char flv_header[13] = {
			'F', 'L', 'V', 0x01, 0x01, 0x00, 0x00, 0x00, 0x09,
      0x00, 0x00, 0x00, 0x09
    };
    uint64_t start = options->start_integer;
    if(start != 0)
    {
      bucket_insert_tail(buckets, bucket_init_memory(flv_header, 13));
    }
    bucket_insert_tail(buckets, bucket_init_file(start, filesize - start));

    return 200; // HTTP_OK;
  }

  // check for serving fragments using the fast random access file
  {
    int http_status = rxs_get_bucket(filename, buckets, options);
    if(http_status)
    {
      return http_status;
    }
  }

#ifdef HAVE_OUTPUT_TS
  if(options->fragments && options->output_format == OUTPUT_FORMAT_TS)
  {
    result = output_ts(filename, buckets, options);

    return result == 0 ? 415 : 200;
  }
#endif

  // Open the file
  {
    mp4_open_flags flags = options->fragments ? MP4_OPEN_MFRA : MP4_OPEN_ALL;
    mp4_context_t* mp4_context =
      mp4_open(filename, filesize, flags, verbose);

    if(mp4_context == NULL)
    {
      result = 0;
    }

    if(result)
    {
#ifdef HAVE_OUTPUT_ISMV
      if(options->fragments)
      {
        result = output_ismv(mp4_context, buckets, options);
      }
      else
#endif
      {
        // split the movie
        unsigned int trak_sample_start[MAX_TRACKS];
        unsigned int trak_sample_end[MAX_TRACKS];
        result = mp4_split(mp4_context, trak_sample_start, trak_sample_end,
                           options);
        if(result)
        {
          if(0)
          {
          }
#ifdef HAVE_OUTPUT_FLV
          else if(options->output_format == OUTPUT_FORMAT_FLV)
          {
            result = output_flv(mp4_context,
                                trak_sample_start,
                                trak_sample_end,
                                buckets, options);
          }
#endif
#ifdef HAVE_OUTPUT_MP4
          else if(options->output_format == OUTPUT_FORMAT_MP4)
          {
            result = output_mp4(mp4_context,
                                trak_sample_start,
                                trak_sample_end,
                                buckets, options);
          }
#endif
#ifdef HAVE_OUTPUT_MOV
          else if(options->output_format == OUTPUT_FORMAT_MOV)
          {
            result = output_mov(mp4_context,
                                trak_sample_start,
                                trak_sample_end,
                                buckets, options);
          }
#endif
        }
      }

      // close the file
      mp4_close(mp4_context);
    }
  }

  if(!result)
  {
    return 415; // HTTP_UNSUPPORTED_MEDIA_TYPE;
  }

  return 200; // HTTP_OK;
}

// End Of File

