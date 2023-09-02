/*******************************************************************************
 output_mp4.c - A library for writing MPEG4.

 Copyright (C) 2009 CodeShop B.V.
 http://www.code-shop.com

 For licensing see the LICENSE file
******************************************************************************/ 

#ifdef HAVE_CONFIG_H
#include "config.h"
#endif

#ifdef __cplusplus
#define __STDC_FORMAT_MACROS // C++ should define this for PRIu64
#define __STDC_LIMIT_MACROS  // C++ should define this for UINT64_MAX
#endif

#include "output_mp4.h"
#include "mp4_io.h"
#include "mp4_writer.h"
#include "moov.h"
#include "output_bucket.h"
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>  // FreeBSD doesn't define off_t in stdio.h

#if defined HAVE_ZLIB_H && defined HAVE_LIBZ
// Compress the MOOV atom. Turn this off for Flash as it doesn't support it.
// # define COMPRESS_MOOV_ATOM
# include <zlib.h>
#endif

// traffic shaping: create offsets for each second
static void create_traffic_shaping(moov_t* moov,
                                   unsigned int const* trak_sample_start,
                                   unsigned int const* trak_sample_end,
                                   int64_t offset,
                                   mp4_split_options_t* options)
{
  uint64_t moov_duration = moov->mvhd_->duration_;
  long moov_time_scale = moov->mvhd_->timescale_;

  unsigned int track_index;
  int second;
  options->seconds =
    1 + (int)((moov_duration + moov_time_scale - 1) / moov_time_scale);
  options->byte_offsets = (uint64_t*)
    calloc(options->seconds, sizeof(options->byte_offsets[0]));
  for(track_index = 0; track_index != moov->tracks_; ++track_index)
  {
    struct trak_t* trak = moov->traks_[track_index];

    long trak_time_scale = trak->mdia_->mdhd_->timescale_;
    struct samples_t* samples = trak->samples_;

    unsigned int sample = trak_sample_start[track_index];
    unsigned int end_sample = trak_sample_end[track_index];
    uint64_t pts = samples[sample].pts_;

    second = 0;

    while(sample != end_sample)
    {
      uint64_t trak_end_offset = 0;
      while(sample != end_sample && samples[sample].pts_ <= pts)
      {
        trak_end_offset = samples[sample].pos_;
        trak_end_offset += samples[sample].size_;
        trak_end_offset += offset;
        ++sample;
      }

#if 0
      if(second < 20)
      {
        MP4_INFO("moov[%d]: offset=%"PRIu64"\n", second, trak_end_offset);
      }
#endif

      if(options->byte_offsets[second] < trak_end_offset)
        options->byte_offsets[second] = trak_end_offset;

      pts += trak_time_scale; // next second
      ++second;
    }
  }
}

static void stco_shift_offsets_inplace(unsigned char* stco, int offset)
{
  unsigned int entries = read_32(stco + 4);
  unsigned int* table = (unsigned int*)(stco + 8);
  unsigned int i;
  for(i = 0; i != entries; ++i)
    write_32((unsigned char*)&table[i], (read_32((unsigned char*)&table[i]) + offset));
}

static void trak_shift_offsets_inplace(struct trak_t* trak, int64_t offset)
{
//  void* stco = trak->mdia_->minf_->stbl_->stco_inplace_;
  void* stco = trak->mdia_->minf_->stbl_->stco_->stco_inplace_;
  stco_shift_offsets_inplace((unsigned char*)stco, (int32_t)offset);
}

static void moov_shift_offsets_inplace(struct moov_t* moov, int64_t offset)
{
  unsigned int i;
  for(i = 0; i != moov->tracks_; ++i)
  {
    trak_shift_offsets_inplace(moov->traks_[i], offset);
  }
}


#ifdef COMPRESS_MOOV_ATOM
static void compress_moov(struct mp4_context_t* mp4_context,
                          struct moov_t* moov,
                          unsigned char* moov_data,
                          uint64_t* moov_size)
{
  uLong sourceLen = (uLong)(*moov_size - ATOM_PREAMBLE_SIZE);
  uLong destLen = compressBound(sourceLen);
  unsigned char* cmov = (unsigned char*)malloc(destLen);
  int zstatus = compress(cmov, &destLen, moov_data, sourceLen);
  if(zstatus == Z_OK)
  {
    MP4_INFO("cmov size = %lu (%ld%%)\n", destLen, 100 * destLen / sourceLen);
  }

  {
    const int extra_space = 4096;
    if(destLen + extra_space < sourceLen)
    {
      const int bytes_saved = sourceLen - destLen;
      uLong destLen2;
      int extra = 0;
      MP4_INFO("shifting offsets by %d\n", -bytes_saved);
      moov_shift_offsets_inplace(moov, -bytes_saved);

      extra += ATOM_PREAMBLE_SIZE + 4;            // dcom
      extra += ATOM_PREAMBLE_SIZE + 4;            // cmvd
      extra += ATOM_PREAMBLE_SIZE;                // cmov
      extra += ATOM_PREAMBLE_SIZE + extra_space;  // free

      MP4_INFO("shifting offsets by %d\n", extra);
      moov_shift_offsets_inplace(moov, extra);

      // recompress
      destLen2 = compressBound(sourceLen);
      zstatus = compress(cmov, &destLen2, moov_data, sourceLen);
      if(zstatus == Z_OK)
      {
        MP4_INFO("cmov size = %lu (%ld%%)\n", destLen2, 100 * destLen2 / sourceLen);

        if(destLen2 < destLen + extra_space)
        {
          // copy compressed movie atom
          unsigned char* outbuffer = moov_data;

          uint32_t dcom_size = ATOM_PREAMBLE_SIZE + 4;
          uint32_t cmvd_size = ATOM_PREAMBLE_SIZE + 4 + destLen2;
          uint32_t cmov_size = ATOM_PREAMBLE_SIZE + dcom_size + cmvd_size;
          uint32_t free_size = ATOM_PREAMBLE_SIZE + extra_space + destLen - destLen2;
          *moov_size = ATOM_PREAMBLE_SIZE + cmov_size + free_size;

          outbuffer = write_32(outbuffer, (uint32_t)*moov_size);

          // skip 'moov'
          outbuffer += 4;

          outbuffer = write_32(outbuffer, cmov_size);
          {
            outbuffer = write_32(outbuffer, FOURCC('c', 'm', 'o', 'v'));
            outbuffer = write_32(outbuffer, dcom_size);
            outbuffer = write_32(outbuffer, FOURCC('d', 'c', 'o', 'm'));
            outbuffer = write_32(outbuffer, FOURCC('z', 'l', 'i', 'b'));

            outbuffer = write_32(outbuffer, cmvd_size);
            {
              outbuffer = write_32(outbuffer, FOURCC('c', 'm', 'v', 'd'));
              outbuffer = write_32(outbuffer, sourceLen);
              memcpy(outbuffer, cmov, destLen2);
              outbuffer += destLen2;
            }
          }

          // add final padding
          outbuffer = write_32(outbuffer, free_size);
          outbuffer = write_32(outbuffer, FOURCC('f', 'r', 'e', 'e'));
          {
            const char free_bytes[8] =
            {
              'C', 'o', 'd', 'e','S','h', 'o', 'p'
            };
            uint32_t padding_index;
            for(padding_index = ATOM_PREAMBLE_SIZE; padding_index != free_size; ++padding_index)
            {
              outbuffer[padding_index] = free_bytes[padding_index % 8];
            }
          }
        }
        else
        {
          MP4_ERROR("%s", "2nd pass compress overflow\n");
        }
      }
    }
  }
  free(cmov);
}
#endif

static void trak_update_index(struct mp4_context_t const* mp4_context,
                              struct trak_t* trak,
                              unsigned int start, unsigned int end)
{
  // write samples [start,end>

  // stts = [entries * [sample_count, sample_duration]
  {
    struct stts_t* stts = trak->mdia_->minf_->stbl_->stts_;

    unsigned int entries = 0;
    unsigned int s = start;

    while(s != end)
    {
      unsigned int sample_count = 1;
      unsigned int sample_duration =
        (unsigned int)(trak->samples_[s + 1].pts_ - trak->samples_[s].pts_);
      while(++s != end)
      {
        if((trak->samples_[s + 1].pts_ - trak->samples_[s].pts_) != sample_duration)
          break;
        ++sample_count;
      }
// TODO: entries may be empty when we read a fragmented movie file. use
// output_mov() instead.
//      if(entries + 1 > stts->entries_)
//      {
//        stts->table_ = (stts_table_t*)
//          realloc(stts->table_, (entries + 1) * sizeof(stts_table_t));
//      }

      stts->table_[entries].sample_count_ = sample_count;
      stts->table_[entries].sample_duration_ = sample_duration;
      ++entries;
    }
    stts->entries_ = entries;

    if(stts_get_samples(stts) != end - start)
    {
      MP4_WARNING("ERROR: stts_get_samples=%d, should be %d\n",
             stts_get_samples(stts), end - start);
    }
  }

  // ctts = [entries * [sample_count, sample_offset]
  {
    struct ctts_t* ctts = trak->mdia_->minf_->stbl_->ctts_;
    if(ctts)
    {
      unsigned int entries = 0;
      unsigned int s = start;

      while(s != end)
      {
        unsigned int sample_count = 1;
        unsigned int sample_offset = trak->samples_[s].cto_;
        while(++s != end)
        {
          if(trak->samples_[s].cto_ != sample_offset)
            break;
          ++sample_count;
        }
        // write entry
        ctts->table_[entries].sample_count_ = sample_count;
        ctts->table_[entries].sample_offset_ = sample_offset;
        ++entries;
      }
      ctts->entries_ = entries;
      if(ctts_get_samples(ctts) != end - start)
      {
        MP4_WARNING("ERROR: ctts_get_samples=%d, should be %d\n",
               ctts_get_samples(ctts), end - start);
      }
    }
  }

  // process chunkmap:
  {
    struct stsc_t* stsc = trak->mdia_->minf_->stbl_->stsc_;
    if(stsc != NULL)
    {
      unsigned int i;

      for(i = 0; i != trak->chunks_size_; ++i)
      {
        if(trak->chunks_[i].sample_ + trak->chunks_[i].size_ > start)
          break;
      }

      {
        unsigned int stsc_entries = 0;
        unsigned int chunk_start = i;
        unsigned int chunk_end;
        // problem.mp4: reported by Jin-seok Lee. Second track contains no samples
        if(trak->chunks_size_ != 0)
        {
          unsigned int samples =
            trak->chunks_[i].sample_ + trak->chunks_[i].size_ - start;
          unsigned int id = trak->chunks_[i].id_;

          // write entry [chunk,samples,id]
          stsc->table_[stsc_entries].chunk_ = 0;
          stsc->table_[stsc_entries].samples_ = samples;
          stsc->table_[stsc_entries].id_ = id;
          ++stsc_entries;

          if(i != trak->chunks_size_)
          {
            for(i += 1; i != trak->chunks_size_; ++i)
            {
              unsigned int next_size = trak->chunks_[i].size_;
              if(trak->chunks_[i].sample_ + trak->chunks_[i].size_ > end)
              {
                next_size = end - trak->chunks_[i].sample_;
              }

              if(next_size != samples)
              {
                samples = next_size;
                id = trak->chunks_[i].id_;
                stsc->table_[stsc_entries].chunk_ = i - chunk_start;
                stsc->table_[stsc_entries].samples_ = samples;
                stsc->table_[stsc_entries].id_ = id;
                ++stsc_entries;
              }

              if(trak->chunks_[i].sample_ + next_size == end)
              {
                break;
              }
            }
          }
        }
        chunk_end = i + 1;
        stsc->entries_ = stsc_entries;

        {
          struct stco_t* stco = trak->mdia_->minf_->stbl_->stco_;
          unsigned int entries = 0;
          for(i = chunk_start; i != chunk_end; ++i)
          {
            stco->chunk_offsets_[entries] = stco->chunk_offsets_[i];
            ++entries;
          }
          stco->entries_ = entries;

          // patch first chunk with correct sample offset
          stco->chunk_offsets_[0] = (uint32_t)trak->samples_[start].pos_;
        }
      }
    }
  }

  // process sync samples:
  if(trak->mdia_->minf_->stbl_->stss_)
  {
    struct stss_t* stss = trak->mdia_->minf_->stbl_->stss_;
    unsigned int entries = 0;
    unsigned int stss_start;
    unsigned int i;

    for(i = 0; i != stss->entries_; ++i)
    {
      if(stss->sample_numbers_[i] >= start + 1)
        break;
    }
    stss_start = i;
    for(; i != stss->entries_; ++i)
    {
      unsigned int sync_sample = stss->sample_numbers_[i];
      if(sync_sample >= end + 1)
        break;
      stss->sample_numbers_[entries] = sync_sample - start;
      ++entries;
    }
    stss->entries_ = entries;
  }

  // process sample sizes
  {
    struct stsz_t* stsz = trak->mdia_->minf_->stbl_->stsz_;
    if(stsz != NULL)
    {
      if(stsz->sample_size_ == 0)
      {
        unsigned int entries = 0;
        unsigned int i;
        for(i = start; i != end; ++i)
        {
          stsz->sample_sizes_[entries] = stsz->sample_sizes_[i];
          ++entries;
        }
      }
      stsz->entries_ = end - start;
    }
  }
}


extern int output_mp4(struct mp4_context_t* mp4_context,
                      unsigned int const* trak_sample_start,
                      unsigned int const* trak_sample_end,
                      struct bucket_t** buckets,
                      struct mp4_split_options_t* options)
{
  unsigned int i;

  uint64_t mdat_start = mp4_context->mdat_atom.start_;
  uint64_t mdat_size = mp4_context->mdat_atom.size_;
  int64_t offset;

  struct moov_t* moov = mp4_context->moov;
//  unsigned char* moov_data = mp4_context->moov_data;
  unsigned char* moov_data = (unsigned char*)
    malloc((size_t)mp4_context->moov_atom.size_ + ATOM_PREAMBLE_SIZE + 1024);

  uint64_t moov_size;

  long moov_time_scale = moov->mvhd_->timescale_;
  uint64_t skip_from_start = UINT64_MAX;
  uint64_t end_offset = 0;

  uint64_t moov_duration = 0;

#if 1
  uint64_t new_mdat_start = 0;
  {
    static char const free_data[] = {
      0x0, 0x0, 0x0,  42, 'f', 'r', 'e', 'e',
      'v', 'i', 'd', 'e', 'o', ' ', 's', 'e',
      'r', 'v', 'e', 'd', ' ', 'b', 'y', ' ',
      'm', 'o', 'd', '_', 'h', '2', '6', '4',
      '_', 's', 't', 'r', 'e', 'a', 'm', 'i',
      'n', 'g'
    };
      uint32_t size_of_header = (uint32_t)mp4_context->ftyp_atom.size_ ;
      // +  sizeof(free_data);
    unsigned char* buffer = (unsigned char*)malloc(size_of_header);

    if(mp4_context->ftyp_atom.size_)
    {
      fseeko(mp4_context->infile, mp4_context->ftyp_atom.start_, SEEK_SET);
      if(fread(buffer, (off_t)mp4_context->ftyp_atom.size_, 1, mp4_context->infile) != 1)
      {
        MP4_ERROR("%s", "Error reading ftyp atom\n");
        free(buffer);
        return 0;
      }
    }

    // copy free data
      
    /*  memcpy(buffer + mp4_context->ftyp_atom.size_, free_data,
             sizeof(free_data));*/

    if(options->output_format == OUTPUT_FORMAT_MP4)
    {
      bucket_t* bucket = bucket_init_memory(buffer, size_of_header);
      bucket_insert_tail(buckets, bucket);
    }
    free(buffer);

    new_mdat_start += size_of_header;
  }

//  new_mdat_start += mp4_context->moov_atom.size_;
#endif

  offset = new_mdat_start - mp4_context->mdat_atom.start_;
  // subtract old moov size
//  offset -= mp4_context->moov_atom.size_;

  for(i = 0; i != moov->tracks_; ++i)
  {
    struct trak_t* trak = moov->traks_[i];
    struct stbl_t* stbl = trak->mdia_->minf_->stbl_;

    unsigned int start_sample = trak_sample_start[i];
    unsigned int end_sample = trak_sample_end[i];

    trak_update_index(mp4_context, trak, start_sample, end_sample);

    if(trak->samples_size_ == 0)
    {
      MP4_WARNING("Trak %u contains no samples. Maybe a fragmented file?", i);
      return 1;
    }

    {
      uint64_t skip =
        trak->samples_[start_sample].pos_ - trak->samples_[0].pos_;
      if(skip < skip_from_start)
        skip_from_start = skip;
      MP4_INFO("Trak can skip %"PRIu64" bytes\n", skip);

      if(end_sample != trak->samples_size_)
      {
        uint64_t end_pos = trak->samples_[end_sample].pos_;
        if(end_pos > end_offset)
          end_offset = end_pos;
        MP4_INFO("New endpos=%"PRIu64"\n", end_pos);
        MP4_INFO("Trak can skip %"PRIu64" bytes at end\n",
               mdat_start + mdat_size - end_offset);
      }
    }

    {
      // fixup trak (duration)
      uint64_t trak_duration = stts_get_duration(stbl->stts_);
      long trak_time_scale = trak->mdia_->mdhd_->timescale_;
      {
        uint64_t duration = trak_time_to_moov_time(trak_duration,
          moov_time_scale, trak_time_scale);
        trak->mdia_->mdhd_->duration_= trak_duration;
        trak->tkhd_->duration_ = duration;
          //añadimos la duración a atom elst
        trak->edts_->elst_->table_[0].segment_duration_ = duration;
        MP4_INFO("trak: new_duration=%"PRIu64"\n", duration);

        if(duration > moov_duration)
          moov_duration = duration;
      }
    }

//      MP4_INFO("stco.size=%d, ", read_int32(stbl->stco_ + 4));
//      MP4_INFO("stts.size=%d samples=%d\n", read_int32(stbl->stts_ + 4), stts_get_samples(stbl->stts_));
//      MP4_INFO("stsz.size=%d\n", read_int32(stbl->stsz_ + 8));
//      MP4_INFO("stsc.samples=%d\n", stsc_get_samples(stbl->stsc_));
  }
  moov->mvhd_->duration_ = moov_duration;
  MP4_INFO("moov: new_duration=%.2f seconds\n", moov_duration / (float)moov_time_scale);

  // subtract bytes we skip at the front of the mdat atom
  offset -= skip_from_start;

  MP4_INFO("%s", "moov: writing header\n");

  moov_write(moov, moov_data);
  moov_size = read_32(moov_data);

  // add new moov size
  offset += moov_size;

  MP4_INFO("shifting offsets by %"PRId64"\n", offset);
  moov_shift_offsets_inplace(moov, offset);

  // traffic shaping: create offsets for each second
  create_traffic_shaping(moov,
                         trak_sample_start,
                         trak_sample_end,
                         offset,
                         options);

#ifdef COMPRESS_MOOV_ATOM
  if(!options->client_is_flash)
  {
    compress_moov(mp4_context, moov, moov_data, &moov_size);
  }
#endif

  if(end_offset != 0)
  {
    MP4_INFO("mdat_size=%"PRId64" end_offset=%"PRId64"\n",
             mdat_size, end_offset);
    mdat_size = end_offset - mdat_start;
  }
  mdat_start += skip_from_start;
  mdat_size -= skip_from_start;

  MP4_INFO("mdat_bucket(%"PRId64", %"PRId64")\n", mdat_start, mdat_size);

  bucket_insert_tail(buckets, bucket_init_memory(moov_data, moov_size));
  free(moov_data);

  {
    struct mp4_atom_t mdat_atom;
    mdat_atom.type_ = FOURCC('m', 'd', 'a', 't');
    mdat_atom.short_size_ = 0; // TODO: use original small/wide mdat box

    if(options->adaptive)
    {
      // empty mdat atom
      mdat_atom.size_ = ATOM_PREAMBLE_SIZE;
    }
    else
    {
      mdat_atom.size_ = mdat_size;
    }

    {
      unsigned char buffer[32];
      int mdat_header_size = mp4_atom_write_header(buffer, &mdat_atom);
      bucket_insert_tail(buckets,
        bucket_init_memory(buffer, mdat_header_size));

      if(mdat_atom.size_ - mdat_header_size)
      {
        bucket_insert_tail(buckets,
          bucket_init_file(mdat_start + mdat_header_size,
                           mdat_atom.size_ - mdat_header_size));
      }
    }
  }

  return 1;
}

// End Of File

