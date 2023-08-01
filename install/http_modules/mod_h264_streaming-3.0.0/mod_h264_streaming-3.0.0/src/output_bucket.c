/*******************************************************************************
 output_bucket.c - A library for writing memory / file buckets.

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

#include "output_bucket.h"
#include <stdlib.h>
#include <string.h>

extern bucket_t* bucket_init(enum bucket_type_t bucket_type)
{
  bucket_t* bucket = (bucket_t*)malloc(sizeof(bucket_t));
  bucket->type_ = bucket_type;
  bucket->prev_ = bucket;
  bucket->next_ = bucket;

  return bucket;
}

extern void bucket_exit(bucket_t* bucket)
{
  switch(bucket->type_)
  {
  case BUCKET_TYPE_MEMORY:
    free(bucket->buf_);
    break;
  case BUCKET_TYPE_FILE:
    break;
  }
  free(bucket);
}

extern bucket_t* bucket_init_memory(void const* buf, uint64_t size)
{
  bucket_t* bucket = bucket_init(BUCKET_TYPE_MEMORY);
  bucket->buf_ = malloc((size_t)size);
  memcpy(bucket->buf_, buf, (size_t)size);
  bucket->size_ = size;
  return bucket;
}

extern bucket_t* bucket_init_file(uint64_t offset, uint64_t size)
{
  bucket_t* bucket = bucket_init(BUCKET_TYPE_FILE);
  bucket->offset_ = offset;
  bucket->size_ = size;
  return bucket;
}

static void bucket_insert_after(bucket_t* after, bucket_t* bucket)
{
  bucket->prev_ = after;
  bucket->next_ = after->next_;
  after->next_->prev_ = bucket;
  after->next_ = bucket;
}

extern void bucket_insert_tail(bucket_t** head, bucket_t* bucket)
{
  if(*head == NULL)
  {
    *head = bucket;
  }

  bucket_insert_after((*head)->prev_, bucket);
}

extern void bucket_insert_head(bucket_t** head, bucket_t* bucket)
{
  bucket_insert_tail(head, bucket);
  *head = bucket;
}

extern void bucket_remove(bucket_t* bucket)
{
  bucket_t* prev = bucket->prev_;
  bucket_t* next = bucket->next_;
  bucket->prev_->next_ = next;
  bucket->next_->prev_ = prev;
}

extern void buckets_exit(bucket_t* buckets)
{
  bucket_t* bucket = buckets;
  do
  {
    bucket_t* next = bucket->next_;
    bucket_exit(bucket);
    bucket = next;
  } while(bucket != buckets);
}

// End Of File

