/*******************************************************************************
 mod_h264_streaming.c

 mod_h264_streaming - An Apache module for streaming Quicktime/MPEG4 files.

 Copyright (C) 2007-2009 CodeShop B.V.

 Licensing
 The Streaming Module is licened under a Creative Commons License. It
 allows you to use, modify and redistribute the module, but only for
 *noncommercial* purposes. For corporate use, please apply for a
 commercial license.

 Creative Commons License:
 http://creativecommons.org/licenses/by-nc-sa/3.0/

 Commercial License for H264 Streaming Module:
 http://h264.code-shop.com/trac/wiki/Mod-H264-Streaming-License-Version2

 Commercial License for Smooth Streaming Module:
 http://smoothstreaming.code-shop.com/trac/wiki/Mod-Smooth-Streaming-License
******************************************************************************/ 

#include <httpd.h>
#include <http_core.h>
#include <http_config.h>
#include <http_protocol.h>
#include <http_log.h>
#include <http_request.h> // or ap_update_mtime
#include <apr_version.h>
#include <apr_strings.h>  // for apr_itoa, apr_pstrcat
#include <apr_buckets.h>
#include "mp4_io.h"
#include "mp4_process.h"
#include "moov.h"
#include "output_bucket.h"
#ifdef BUILDING_H264_STREAMING
#include "output_mp4.h"
#define X_MOD_STREAMING_KEY X_MOD_H264_STREAMING_KEY
#define X_MOD_STREAMING_VERSION X_MOD_H264_STREAMING_VERSION
#define H264_STREAMING_HANDLER "h264-streaming.extensions"
#endif
#ifdef BUILDING_SMOOTH_STREAMING
#include "ism_reader.h"
#include "output_ismv.h"
#define X_MOD_STREAMING_KEY X_MOD_SMOOTH_STREAMING_KEY
#define X_MOD_STREAMING_VERSION X_MOD_SMOOTH_STREAMING_VERSION
#define H264_STREAMING_HANDLER "smooth-streaming.extensions"
#endif
#ifdef BUILDING_FLV_STREAMING
#define H264_STREAMING_HANDLER "flv-streaming.extensions"
#include "output_flv.h"
#endif

#if 0
/* Mod-H264-Streaming configuration

[httpd.conf]
LoadModule h264_streaming_module /usr/lib/apache2/modules/mod_h264_streaming.so
AddHandler h264-streaming.extensions .mp4

*/

/* Mod-Smooth-Streaming configuration

[httpd.conf]
LoadModule smooth_streaming_module /usr/lib/apache2/modules/mod_smooth_streaming.so
AddHandler smooth-streaming.extensions .ism

[.htaccess]
RewriteEngine On

RewriteRule ^(.*/)?(.*)\.([is])sm/[Mm]anifest$ $1$2.$3sm/$2.ismc [L]
RewriteRule ^(.*/)?(.*)\.([is])sm/QualityLevels\(([0-9]+)\)/Fragments\((.*)=([0-9]+)\)(.*)$ $1$2.$3sm/$2.ism?bitrate=$4&$5=$6 [L]
*/
#endif

static int drive_h264_streaming(request_rec *r)
{
  apr_finfo_t fi;
  apr_bucket_brigade *bb;
  apr_file_t *fp = NULL;
  apr_status_t rv = APR_SUCCESS;
  struct mp4_split_options_t* options;
  struct bucket_t* buckets;
  char filename[256];

  // Module version info
  apr_table_set(r->headers_out, X_MOD_STREAMING_KEY, X_MOD_STREAMING_VERSION);

  options = mp4_split_options_init();
  if(r->args && !mp4_split_options_set(options, r->args, strlen(r->args)))
  {
    return HTTP_FORBIDDEN;
  }

  strncpy(filename, r->filename, sizeof(filename) / sizeof(char) - 1);
  filename[sizeof(filename) / sizeof(char) - 1] = '\0';

#ifdef BUILDING_SMOOTH_STREAMING
  // if it is a fragment request then we read the server manifest file
  // and based on the bitrate and track type we set the filename and track id
  if(ends_with(filename, ".ism"))
  {
    if(options->output_format != OUTPUT_FORMAT_TS)
    {
      ism_t* ism = ism_init(filename);

      if(ism == NULL)
      {
        return HTTP_NOT_FOUND;
      }

      {
        char* dir_end = strrchr(filename, '/');

        const char* src;
        if(!ism_get_source(ism, options->fragment_bitrate,
          options->fragment_type, &src, &options->fragment_track_id))
        {
          return HTTP_NOT_FOUND;
        }

        dir_end = dir_end == NULL ? filename : (dir_end + 1);
        strcpy(dir_end, src);

        ism_exit(ism);
      }
    }
  }
#endif

  rv = apr_stat(&fi, filename, APR_FINFO_SIZE, r->pool);
  
  if(rv)
  {
    /* Let the core handle it. */
    return DECLINED;
  }

  /* Open the file */
  rv = apr_file_open(&fp, filename, APR_READ, APR_OS_DEFAULT, r->pool);
  
  if(rv)
  {
    ap_log_rerror(APLOG_MARK, APLOG_ERR, rv, r,
                  "file permissions deny server access: %s", r->filename);
    return HTTP_FORBIDDEN;
  }

  // our ouput bucket
  buckets = 0;

  {
    int verbose = 0;
    int http_status =
      mp4_process(filename, fi.size, verbose, &buckets, options);

    mp4_split_options_exit(options);

    if(http_status != 200)
    {
      if(buckets)
      {
        buckets_exit(buckets);
      }

      return http_status;
    }

    ap_set_content_type(r, "video/mp4");
  }

  {
    uint64_t content_length = 0;
    bb = apr_brigade_create(r->pool, r->connection->bucket_alloc);
    {
      bucket_t* bucket = buckets;
      if(bucket)
      {
        do
        {
          switch(bucket->type_)
          {
          case BUCKET_TYPE_MEMORY:
            rv = apr_brigade_write(bb, NULL, NULL,
                                   (const char*)bucket->buf_, bucket->size_);
            if(rv)
            {
              ap_log_rerror(APLOG_MARK, APLOG_ERR, rv, r,
                            "unable to write memory bucket in brigade");
              return HTTP_INTERNAL_SERVER_ERROR;
            }
            break;
          case BUCKET_TYPE_FILE:
#if APR_MAJOR_VERSION >= 1 && APR_MINOR_VERSION >= 1
            apr_brigade_insert_file(bb, fp, bucket->offset_, bucket->size_, r->pool);
#else
            {
              apr_bucket *e;
              e = apr_bucket_file_create(fp, bucket->offset_, bucket->size_, r->pool,
                                         r->connection->bucket_alloc);
              APR_BRIGADE_INSERT_TAIL(bb, e); 
            }
#endif
            break;
          }
          content_length += bucket->size_;
          bucket = bucket->next_;
        } while(bucket != buckets);
        buckets_exit(buckets);
      }
    }

    // Add EOS bucket for byterange_filter to work
    {
      apr_bucket* eos_bucket = apr_bucket_eos_create(bb->bucket_alloc);
      APR_BRIGADE_INSERT_TAIL(bb, eos_bucket);
    }

    ap_set_content_length(r, content_length);

    // Add last-modified headers
    ap_update_mtime(r, r->finfo.mtime);
    ap_set_last_modified(r);

    // Create an ETag with an additional mdat_offset and mdat_size. The first
    // character in a vlist_validator string is "W" for weak and also close the
    // ETag header with a ".
    // TODO: Make it strong
    r->vlist_validator = apr_pstrcat(r->pool, "X",
      apr_itoa(r->pool, content_length), "\"", NULL);
    ap_set_etag(r);
    
    // Allow byte range requests
    apr_table_setn(r->headers_out, "Accept-Ranges", "bytes");

    // Check for conditional requests
    {
      int errstatus;
      if((errstatus = ap_meets_conditions(r)) != OK)
      {
        return errstatus;
      }
    }
  }

  return ap_pass_brigade(r->output_filters, bb);
}

static int h264_streaming_handler(request_rec *r)
{
  if ((!r->handler) || (strcmp(r->handler, H264_STREAMING_HANDLER)))
  {
    return DECLINED;
  }
  
  r->allowed |= (AP_METHOD_BIT << M_GET);
  if (r->method_number != M_GET)
  {
    return HTTP_METHOD_NOT_ALLOWED;
  }
  
  return drive_h264_streaming(r);
}

static const command_rec h264_streaming_cmds[] =
{
    {NULL}
};

static void register_hooks(apr_pool_t *p)
{
  ap_hook_handler(h264_streaming_handler, NULL, NULL, APR_HOOK_MIDDLE);
}

#ifdef __cplusplus
extern "C" {
#endif

#ifdef BUILDING_H264_STREAMING
module AP_MODULE_DECLARE_DATA h264_streaming_module =
#elif BUILDING_SMOOTH_STREAMING
module AP_MODULE_DECLARE_DATA smooth_streaming_module =
#endif
{
  STANDARD20_MODULE_STUFF,
  NULL,
  NULL,
  NULL,
  NULL,
  h264_streaming_cmds,
  register_hooks
};

#ifdef __cplusplus
} /* extern C definitions */
#endif

// End Of File

