/*******************************************************************************
 output_bucket.h - A library for writing memory / file buckets.

 Copyright (C) 2007-2009 CodeShop B.V.
 http://www.code-shop.com

 For licensing see the LICENSE file
******************************************************************************/ 

#ifndef OUTPUT_BUCKET_H_AKW
#define OUTPUT_BUCKET_H_AKW

#include "mod_streaming_export.h"

#ifndef _MSC_VER
#include <inttypes.h>
#else
#include "inttypes.h"
#endif

#ifdef __cplusplus
extern "C" {
#endif

enum bucket_type_t
{
  BUCKET_TYPE_MEMORY,
  BUCKET_TYPE_FILE,
};
typedef enum bucket_type_t bucket_type_t;

struct bucket_t
{
  int type_;
//  union {
    void* buf_;
    uint64_t offset_;
//  };
  uint64_t size_;
  struct bucket_t* prev_;
  struct bucket_t* next_;
};
typedef struct bucket_t bucket_t;
MOD_STREAMING_DLL_LOCAL extern bucket_t* bucket_init(bucket_type_t bucket_type);
MOD_STREAMING_DLL_LOCAL extern void bucket_exit(bucket_t* bucket);
MOD_STREAMING_DLL_LOCAL extern
bucket_t* bucket_init_memory(void const* buf, uint64_t size);
MOD_STREAMING_DLL_LOCAL extern
bucket_t* bucket_init_file(uint64_t offset, uint64_t size);
MOD_STREAMING_DLL_LOCAL extern
void buckets_exit(bucket_t* buckets);
MOD_STREAMING_DLL_LOCAL extern
void bucket_insert_tail(bucket_t** head, bucket_t* bucket);
MOD_STREAMING_DLL_LOCAL extern
void bucket_insert_head(bucket_t** head, bucket_t* bucket);
MOD_STREAMING_DLL_LOCAL extern
void bucket_remove(bucket_t* bucket);

#ifdef __cplusplus
} /* extern C definitions */
#endif

#endif // OUTPUT_BUCKET_H_AKW

// End Of File

