/*******************************************************************************
 output_mp4.h - A library for writing MPEG4.

 Copyright (C) 2009 CodeShop B.V.
 http://www.code-shop.com

 For licensing see the LICENSE file
******************************************************************************/ 

#ifndef OUTPUT_MP4_H_AKW
#define OUTPUT_MP4_H_AKW

#include "mod_streaming_export.h"

#ifndef _MSC_VER
#include <inttypes.h>
#else
#include "inttypes.h"
#endif

#ifdef __cplusplus
extern "C" {
#endif

#define HAVE_OUTPUT_MP4

struct mp4_context_t;
struct bucket_t;
struct mp4_split_options_t;

MOD_STREAMING_DLL_LOCAL extern
int output_mp4(struct mp4_context_t* mp4_context,
               unsigned int const* trak_sample_start,
               unsigned int const* trak_sample_end,
               struct bucket_t** buckets,
               struct mp4_split_options_t* options);

#ifdef __cplusplus
} /* extern C definitions */
#endif

#endif // OUTPUT_MP4_H_AKW

// End Of File

