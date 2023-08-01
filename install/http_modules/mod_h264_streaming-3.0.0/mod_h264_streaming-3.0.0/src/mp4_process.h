/*******************************************************************************
 mp4_process.h -

 Copyright (C) 2007-2009 CodeShop B.V.
 http://www.code-shop.com

 For licensing see the LICENSE file
******************************************************************************/ 

#ifndef MP4_PROCESS_H_AKW
#define MP4_PROCESS_H_AKW

#include "mod_streaming_export.h"

#ifndef _MSC_VER
#include <inttypes.h>
#else
#include "inttypes.h"
#endif

#ifdef __cplusplus
extern "C" {
#endif

struct bucket_t;
struct mp4_split_options_t;

MOD_STREAMING_DLL_LOCAL extern
int mp4_process(const char* filename, uint64_t filesize, int verbose,
                struct bucket_t** buckets,
                struct mp4_split_options_t* options);

#ifdef __cplusplus
} /* extern C definitions */
#endif

#endif // MP4_PROCESS_H_AKW

// End Of File

