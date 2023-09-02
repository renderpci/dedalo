/*******************************************************************************
 mp4_writer.c - A library for writing MPEG4.

 Copyright (C) 2007-2009 CodeShop B.V.
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

#include "mp4_writer.h"
#include "mp4_io.h"
#include <stdlib.h>
#include <string.h>

static unsigned char* atom_writer_unknown(unknown_atom_t* atoms,
                                          unsigned char* buffer)
{
  while(atoms)
  {
    size_t size = read_32((const unsigned char*)atoms->atom_);
    memcpy(buffer, atoms->atom_, size);
    buffer += size;
    atoms = atoms->next_;
  }

  return buffer;
}

extern unsigned char* atom_writer(struct unknown_atom_t* unknown_atoms,
                                  atom_write_list_t* atom_write_list,
                                  unsigned int atom_write_list_size,
                                  unsigned char* buffer)
{
  unsigned i;
  const int write_box64 = 0;

  for(i = 0; i != atom_write_list_size; ++i)
  {
    if(atom_write_list[i].source_ != 0)
    {
      unsigned char* atom_start = buffer;
      // atom size
      if(write_box64)
      {
        write_32(buffer, 1); // box64
      }
      buffer += 4;

      // atom type
      buffer = write_32(buffer, atom_write_list[i].type_);
      if(write_box64)
      {
        buffer += 8; // box64
      }

      // atom payload
      buffer = atom_write_list[i].writer_(atom_write_list[i].source_, buffer);

      if(write_box64)
        write_64(atom_start + 8, buffer - atom_start);
      else
        write_32(atom_start, (uint32_t)(buffer - atom_start));
    }
  }

  if(unknown_atoms)
  {
    buffer = atom_writer_unknown(unknown_atoms, buffer);
  }

  return buffer;
}

static unsigned char* tkhd_write(void const* atom, unsigned char* buffer)
{
  tkhd_t const* tkhd = (tkhd_t const*)atom;
  unsigned int i;

  buffer = write_8(buffer, tkhd->version_);
  buffer = write_24(buffer, tkhd->flags_);

  if(tkhd->version_ == 0)
  {
    buffer = write_32(buffer, (uint32_t)tkhd->creation_time_);
    buffer = write_32(buffer, (uint32_t)tkhd->modification_time_);
    buffer = write_32(buffer, tkhd->track_id_);
    buffer = write_32(buffer, tkhd->reserved_);
    buffer = write_32(buffer, (uint32_t)tkhd->duration_);
  }
  else
  {
    buffer = write_64(buffer, tkhd->creation_time_);
    buffer = write_64(buffer, tkhd->modification_time_);
    buffer = write_32(buffer, tkhd->track_id_);
    buffer = write_32(buffer, tkhd->reserved_);
    buffer = write_64(buffer, tkhd->duration_);
  }

  buffer = write_32(buffer, tkhd->reserved2_[0]);
  buffer = write_32(buffer, tkhd->reserved2_[1]);
  buffer = write_16(buffer, tkhd->layer_);
  buffer = write_16(buffer, tkhd->predefined_);
  buffer = write_16(buffer, tkhd->volume_);
  buffer = write_16(buffer, tkhd->reserved3_);

  for(i = 0; i != 9; ++i)
  {
    buffer = write_32(buffer, tkhd->matrix_[i]);
  }

  buffer = write_32(buffer, tkhd->width_);
  buffer = write_32(buffer, tkhd->height_);

  return buffer;
}

static unsigned char* mdhd_write(void const* atom, unsigned char* buffer)
{
  mdhd_t const* mdhd = (mdhd_t const*)atom;

  buffer = write_8(buffer, mdhd->version_);
  buffer = write_24(buffer, mdhd->flags_);

  if(mdhd->version_ == 0)
  {
    buffer = write_32(buffer, (uint32_t)mdhd->creation_time_);
    buffer = write_32(buffer, (uint32_t)mdhd->modification_time_);
    buffer = write_32(buffer, mdhd->timescale_);
    buffer = write_32(buffer, (uint32_t)mdhd->duration_);
  }
  else
  {
    buffer = write_64(buffer, mdhd->creation_time_);
    buffer = write_64(buffer, mdhd->modification_time_);
    buffer = write_32(buffer, mdhd->timescale_);
    buffer = write_64(buffer, mdhd->duration_);
  }

  buffer = write_16(buffer,
                    ((mdhd->language_[0] - 0x60) << 10) +
                    ((mdhd->language_[1] - 0x60) << 5) +
                    ((mdhd->language_[2] - 0x60) << 0));

  buffer = write_16(buffer, mdhd->predefined_);

  return buffer;
}

static unsigned char* vmhd_write(void const* atom, unsigned char* buffer)
{
  vmhd_t const* vmhd = (vmhd_t const*)atom;
  unsigned int i;

  buffer = write_8(buffer, vmhd->version_);
  buffer = write_24(buffer, vmhd->flags_);
  buffer = write_16(buffer, vmhd->graphics_mode_);
  for(i = 0; i != 3; ++i)
  {
    buffer = write_16(buffer, vmhd->opcolor_[i]);
  }

  return buffer;
}

static unsigned char* smhd_write(void const* atom, unsigned char* buffer)
{
  smhd_t const* smhd = (smhd_t const*)atom;

  buffer = write_8(buffer, smhd->version_);
  buffer = write_24(buffer, smhd->flags_);

  buffer = write_16(buffer, smhd->balance_);
  buffer = write_16(buffer, smhd->reserved_);

  return buffer;
}

static unsigned char* dref_write(void const* atom, unsigned char* buffer)
{
  unsigned int i;
  dref_t const* dref = (dref_t const*)atom;

  buffer = write_8(buffer, dref->version_);
  buffer = write_24(buffer, dref->flags_);
  buffer = write_32(buffer, dref->entry_count_);

  for(i = 0; i != dref->entry_count_; ++i)
  {
    dref_table_t* entry = &dref->table_[i];
    if(entry->flags_ == 0x000001)
    {
      write_32(buffer + 0, 12);
      write_32(buffer + 4, FOURCC('u', 'r', 'l', ' '));
      write_32(buffer + 8, entry->flags_);
      buffer += 12;
    }
    else
    {
    // TODO: implement urn and url
    }
  }

  return buffer;
}

static unsigned char* dinf_write(void const* atom, unsigned char* buffer)
{
  dinf_t const* dinf = (dinf_t const*)atom;
  atom_write_list_t atom_write_list[] = {
    { FOURCC('d', 'r', 'e', 'f'), dinf->dref_, &dref_write },
  };

  buffer = atom_writer(NULL,
                       atom_write_list,
                       sizeof(atom_write_list) / sizeof(atom_write_list[0]),
                       buffer);

  return buffer;
}

static unsigned char* hdlr_write(void const* atom, unsigned char* buffer)
{
  hdlr_t const* hdlr = (hdlr_t const*)atom;
  buffer = write_8(buffer, hdlr->version_);
  buffer = write_24(buffer, hdlr->flags_);

  buffer = write_32(buffer, hdlr->predefined_);
  buffer = write_32(buffer, hdlr->handler_type_);
  buffer = write_32(buffer, hdlr->reserved1_);
  buffer = write_32(buffer, hdlr->reserved2_);
  buffer = write_32(buffer, hdlr->reserved3_);
  if(hdlr->name_)
  {
    char const* p;
    if(hdlr->predefined_ == FOURCC('m', 'h', 'l', 'r'))
    {
      buffer = write_8(buffer, (unsigned int)(strlen(hdlr->name_)));
    }

    for(p = hdlr->name_; *p; ++p)
    {
      buffer = write_8(buffer, *p);
    }
  }

  return buffer;
}

static unsigned char*
video_sample_entry_write(video_sample_entry_t const* sample_entry,
                         unsigned char* buffer)
{
  buffer = write_16(buffer, sample_entry->version_);
  buffer = write_16(buffer, sample_entry->revision_level_);
  buffer = write_32(buffer, sample_entry->vendor_);
  buffer = write_32(buffer, sample_entry->temporal_quality_);
  buffer = write_32(buffer, sample_entry->spatial_quality_);
  buffer = write_16(buffer, sample_entry->width_);
  buffer = write_16(buffer, sample_entry->height_);
  buffer = write_32(buffer, sample_entry->horiz_resolution_);
  buffer = write_32(buffer, sample_entry->vert_resolution_);
  buffer = write_32(buffer, sample_entry->data_size_);
  buffer = write_16(buffer, sample_entry->frame_count_);
  memcpy(buffer, sample_entry->compressor_name_, 32);
  buffer += 32;
  buffer = write_16(buffer, sample_entry->depth_);
  buffer = write_16(buffer, sample_entry->color_table_id_);

  return buffer;
}

static unsigned char*
audio_sample_entry_write(audio_sample_entry_t const* sample_entry,
                         unsigned char* buffer)
{
  buffer = write_16(buffer, sample_entry->version_);
  buffer = write_16(buffer, sample_entry->revision_);
  buffer = write_32(buffer, sample_entry->vendor_);
  buffer = write_16(buffer, sample_entry->channel_count_);
  buffer = write_16(buffer, sample_entry->sample_size_);
  buffer = write_16(buffer, sample_entry->compression_id_);
  buffer = write_16(buffer, sample_entry->packet_size_);
  buffer = write_32(buffer, sample_entry->samplerate_);

  return buffer;
}

static unsigned char* avcc_write(void const* atom, unsigned char* buffer)
{
  sample_entry_t const* sample_entry = (sample_entry_t const*)atom;

  memcpy(buffer, sample_entry->codec_private_data_,
         sample_entry->codec_private_data_length_);
  buffer += sample_entry->codec_private_data_length_;

  return buffer;
}

// returns the size of the descriptor including the tag and length
static unsigned int mp4_desc_len(uint32_t v)
{
  unsigned int bytes = 0;

  if(v >= 0x00200000)
    ++bytes;
  if(v >= 0x00004000)
    ++bytes;
  if(v >= 0x00000080)
    ++bytes;
  ++bytes;

  return 1 + bytes + v;
}

static unsigned char* mp4_write_desc_len(unsigned char* buffer, uint32_t v)
{
  if(v >= 0x00200000)
    buffer = write_8(buffer, (v >> 21) | 0x80);
  if(v >= 0x00004000)
    buffer = write_8(buffer, (v >> 14) | 0x80);
  if(v >= 0x00000080)
    buffer = write_8(buffer, (v >>  7) | 0x80);

  buffer = write_8(buffer, v & 0x7f);

  return buffer;
}

// http://www.geocities.com/xhelmboyx/quicktime/formats/mp4-layout.txt
static unsigned char* esds_write(void const* atom, unsigned char* buffer)
{
  sample_entry_t const* sample_entry = (sample_entry_t const*)atom;

  uint32_t decoder_specific_descriptor_length =
    sample_entry->codec_private_data_length_ ?
      mp4_desc_len(sample_entry->codec_private_data_length_) : 0;
  uint32_t decoder_config_descriptor_length =
    13 + decoder_specific_descriptor_length;
  uint32_t elementary_stream_descriptor_length =
    3 + mp4_desc_len(decoder_config_descriptor_length);

  buffer = write_8(buffer, 0);              // version
  buffer = write_24(buffer, 0);             // flags

  buffer = write_8(buffer, MP4_ELEMENTARY_STREAM_DESCRIPTOR_TAG);
  buffer = mp4_write_desc_len(buffer, elementary_stream_descriptor_length);
  buffer = write_16(buffer, 1);             // track_id
  buffer = write_8(buffer, 0);              // flags

  buffer = write_8(buffer, MP4_DECODER_CONFIG_DESCRIPTOR_TAG);
  buffer = mp4_write_desc_len(buffer, decoder_config_descriptor_length);

  buffer = write_8(buffer, MP4_MPEG4Audio); // object_type_id
  buffer = write_8(buffer, 0x15);           // stream_type (0x11=vid, 0x15=aud)
  buffer = write_24(buffer, 0);             // buffer_size_db
  buffer = write_32(buffer, 0);             // max_bitrate
  buffer = write_32(buffer, 0);             // avg_bitrate

  if(sample_entry->codec_private_data_length_)
  {
    buffer = write_8(buffer, MP4_DECODER_SPECIFIC_DESCRIPTOR_TAG);
    buffer = mp4_write_desc_len(buffer,
      sample_entry->codec_private_data_length_);
    memcpy(buffer, sample_entry->codec_private_data_, 
      sample_entry->codec_private_data_length_);
    buffer += sample_entry->codec_private_data_length_;
  }

  buffer = write_8(buffer, 6);              // SL
  buffer = mp4_write_desc_len(buffer, 1);
  buffer = write_8(buffer, 0x02);

  return buffer;
}

static unsigned char* stsd_write(void const* atom, unsigned char* buffer)
{
  stsd_t const* stsd = (stsd_t const*)atom;
  unsigned int i;

  buffer = write_8(buffer, stsd->version_);
  buffer = write_24(buffer, stsd->flags_);
  buffer = write_32(buffer, stsd->entries_);
  for(i = 0; i != stsd->entries_; ++i)
  {
    sample_entry_t const* sample_entry = &stsd->sample_entries_[i];
    unsigned int j = 0;
    if(sample_entry->buf_ != NULL)
    {
      // just copy the sample_entry as we read it
      buffer = write_32(buffer, sample_entry->len_ + 8);
      buffer = write_32(buffer, sample_entry->fourcc_);
      for(j = 0; j != sample_entry->len_; ++j)
      {
        buffer = write_8(buffer, sample_entry->buf_[j]);
      }
    }
    else
    {
      unsigned char* sample_entry_buffer = buffer;
      buffer = write_32(buffer, 0);
      buffer = write_32(buffer, sample_entry->fourcc_);

      buffer = write_32(buffer, 0); // 6 bytes reserved
      buffer = write_16(buffer, 0);
      buffer = write_16(buffer, 1); // data reference index

      if(sample_entry->video_)
      {
        atom_write_list_t atom_write_list[] = {
          { FOURCC('a', 'v', 'c', 'C'), sample_entry, &avcc_write },
        };

        buffer = video_sample_entry_write(sample_entry->video_, buffer);

        buffer = atom_writer(NULL,
                             atom_write_list,
                             sizeof(atom_write_list) / sizeof(atom_write_list[0]),
                             buffer);
      }
      else if(sample_entry->audio_)
      {
        atom_write_list_t atom_write_list[] = {
          { FOURCC('e', 's', 'd', 's'), sample_entry, &esds_write },
        };

        buffer = audio_sample_entry_write(sample_entry->audio_, buffer);

        buffer = atom_writer(NULL,
                             atom_write_list,
                             sizeof(atom_write_list) / sizeof(atom_write_list[0]),
                             buffer);
      }
      write_32(sample_entry_buffer, buffer - sample_entry_buffer);
    }
  }

  return buffer;
}

static unsigned char* stts_write(void const* atom, unsigned char* buffer)
{
  stts_t const* stts = (stts_t const*)atom;
  unsigned int i;

  buffer = write_8(buffer, stts->version_);
  buffer = write_24(buffer, stts->flags_);
  buffer = write_32(buffer, stts->entries_);
  for(i = 0; i != stts->entries_; ++i)
  {
    buffer = write_32(buffer, stts->table_[i].sample_count_);
    buffer = write_32(buffer, stts->table_[i].sample_duration_);
  }

  return buffer;
}

static unsigned char* stss_write(void const* atom, unsigned char* buffer)
{
  stss_t const* stss = (stss_t const*)atom;
  unsigned int i;

  buffer = write_8(buffer, stss->version_);
  buffer = write_24(buffer, stss->flags_);
  buffer = write_32(buffer, stss->entries_);
  for(i = 0; i != stss->entries_; ++i)
  {
    buffer = write_32(buffer, stss->sample_numbers_[i]);
  }

  return buffer;
}

static unsigned char* stsc_write(void const* atom, unsigned char* buffer)
{
  stsc_t const* stsc = (stsc_t const*)atom;
  unsigned int i;

  buffer = write_8(buffer, stsc->version_);
  buffer = write_24(buffer, stsc->flags_);
  buffer = write_32(buffer, stsc->entries_);
  for(i = 0; i != stsc->entries_; ++i)
  {
    buffer = write_32(buffer, stsc->table_[i].chunk_ + 1);
    buffer = write_32(buffer, stsc->table_[i].samples_);
    buffer = write_32(buffer, stsc->table_[i].id_);
  }

  return buffer;
}

static unsigned char* stsz_write(void const* atom, unsigned char* buffer)
{
  stsz_t const* stsz = (stsz_t const*)atom;
  unsigned int i;

  buffer = write_8(buffer, stsz->version_);
  buffer = write_24(buffer, stsz->flags_);
  buffer = write_32(buffer, stsz->sample_size_);
  buffer = write_32(buffer, stsz->entries_);
  if(!stsz->sample_size_)
  {
    for(i = 0; i != stsz->entries_; ++i)
    {
      buffer = write_32(buffer, stsz->sample_sizes_[i]);
    }
  }

  return buffer;
}

static unsigned char* stco_write(void const* atom, unsigned char* buffer)
{
  stco_t const* stco = (stco_t const*)atom;
  unsigned int i;

  // newly generated stco (patched inplace)
  ((stco_t*)stco)->stco_inplace_ = buffer;

  buffer = write_8(buffer, stco->version_);
  buffer = write_24(buffer, stco->flags_);
  buffer = write_32(buffer, stco->entries_);
  for(i = 0; i != stco->entries_; ++i)
  {
    buffer = write_32(buffer, (uint32_t)(stco->chunk_offsets_[i]));
  }

  return buffer;
}

static unsigned char* ctts_write(void const* atom, unsigned char* buffer)
{
  ctts_t const* ctts = (ctts_t const*)atom;
  unsigned int i;

  buffer = write_8(buffer, ctts->version_);
  buffer = write_24(buffer, ctts->flags_);
  buffer = write_32(buffer, ctts->entries_);
  for(i = 0; i != ctts->entries_; ++i)
  {
    buffer = write_32(buffer, (uint32_t)(ctts->table_[i].sample_count_));
    buffer = write_32(buffer, (uint32_t)(ctts->table_[i].sample_offset_));
  }

  return buffer;
}

static unsigned char* stbl_write(void const* atom, unsigned char* buffer)
{
  stbl_t const* stbl = (stbl_t const*)atom;
  atom_write_list_t atom_write_list[] = {
    { FOURCC('s', 't', 's', 'd'), stbl->stsd_, &stsd_write },
    { FOURCC('s', 't', 't', 's'), stbl->stts_, &stts_write },
    { FOURCC('c', 't', 't', 's'), stbl->ctts_, &ctts_write },
    { FOURCC('s', 't', 's', 's'), stbl->stss_, &stss_write },
    { FOURCC('s', 't', 's', 'c'), stbl->stsc_, &stsc_write },
    { FOURCC('s', 't', 's', 'z'), stbl->stsz_, &stsz_write },
    { FOURCC('s', 't', 'c', 'o'), stbl->stco_, &stco_write },
    
  };

  buffer = atom_writer(0,//stbl->unknown_atoms_, (desactivamos el atom sdtp)
                       atom_write_list,
                       sizeof(atom_write_list) / sizeof(atom_write_list[0]),
                       buffer);

  return buffer;
}

static unsigned char* minf_write(void const* atom, unsigned char* buffer)
{
  minf_t const* minf = (minf_t const*)atom;
  atom_write_list_t atom_write_list[] = {
    { FOURCC('v', 'm', 'h', 'd'), minf->vmhd_, &vmhd_write },
    { FOURCC('s', 'm', 'h', 'd'), minf->smhd_, &smhd_write },
    { FOURCC('d', 'i', 'n', 'f'), minf->dinf_, &dinf_write },
    { FOURCC('s', 't', 'b', 'l'), minf->stbl_, &stbl_write }
  };

  buffer = atom_writer(minf->unknown_atoms_,
                       atom_write_list,
                       sizeof(atom_write_list) / sizeof(atom_write_list[0]),
                       buffer);

  return buffer;
}

static unsigned char* mdia_write(void const* atom, unsigned char* buffer)
{
  mdia_t const* mdia = (mdia_t const*)atom;
  atom_write_list_t atom_write_list[] = {
    { FOURCC('m', 'd', 'h', 'd'), mdia->mdhd_, &mdhd_write },
    { FOURCC('h', 'd', 'l', 'r'), mdia->hdlr_, &hdlr_write },
    { FOURCC('m', 'i', 'n', 'f'), mdia->minf_, &minf_write }
  };

  buffer = atom_writer(mdia->unknown_atoms_,
                       atom_write_list,
                       sizeof(atom_write_list) / sizeof(atom_write_list[0]),
                       buffer);

  return buffer;
}

static unsigned char* elst_write(void const* atom, unsigned char* buffer)
{
  elst_t const* elst = (elst_t const*)atom;
  unsigned int i;

  buffer = write_8(buffer, elst->version_);
  buffer = write_24(buffer, elst->flags_);
  buffer = write_32(buffer, elst->entry_count_);
  for(i = 0; i != elst->entry_count_; ++i)
  {
    if(elst->version_ == 0)
    {
        buffer = write_32(buffer, (uint32_t)(elst->table_[i].segment_duration_));
        buffer = write_32(buffer, (uint32_t)(elst->table_[i].media_time_));
    }
    else
    {
        buffer = write_64(buffer, elst->table_[i].segment_duration_);
      buffer = write_64(buffer, elst->table_[i].media_time_);
    }
    buffer = write_16(buffer, elst->table_[i].media_rate_integer_);
    buffer = write_16(buffer, elst->table_[i].media_rate_fraction_);
  }

  return buffer;
}

static unsigned char* edts_write(void const* atom, unsigned char* buffer)
{
  edts_t const* edts = (edts_t const*)atom;
  atom_write_list_t atom_write_list[] = {
    { FOURCC('e', 'l', 's', 't'), edts->elst_, &elst_write }
  };

  buffer = atom_writer(edts->unknown_atoms_,
                       atom_write_list,
                       sizeof(atom_write_list) / sizeof(atom_write_list[0]),
                       buffer);

  return buffer;
}

static unsigned char* trak_write(void const* atom, unsigned char* buffer)
{
  trak_t const* trak = (trak_t const*)atom;
  atom_write_list_t atom_write_list[] = {
    { FOURCC('t', 'k', 'h', 'd'), trak->tkhd_, &tkhd_write },
    { FOURCC('e', 'd', 't', 's'), trak->edts_, &edts_write },
    { FOURCC('m', 'd', 'i', 'a'), trak->mdia_, &mdia_write }
    
  };

  buffer = atom_writer(0,//trak->unknown_atoms_, (desactivamos el atom load)
                       atom_write_list,
                       sizeof(atom_write_list) / sizeof(atom_write_list[0]),
                       buffer);

  return buffer;
}

static unsigned char* mvhd_write(void const* atom, unsigned char* buffer)
{
  mvhd_t const* mvhd = (mvhd_t const*)atom;
  unsigned int i;

  buffer = write_8(buffer, mvhd->version_);
  buffer = write_24(buffer, mvhd->flags_);

  if(mvhd->version_ == 0)
  {
    buffer = write_32(buffer, (uint32_t)mvhd->creation_time_);
    buffer = write_32(buffer, (uint32_t)mvhd->modification_time_);
    buffer = write_32(buffer, mvhd->timescale_);
    buffer = write_32(buffer, (uint32_t)mvhd->duration_);
  }
  else
  {
    buffer = write_64(buffer, mvhd->creation_time_);
    buffer = write_64(buffer, mvhd->modification_time_);
    buffer = write_32(buffer, mvhd->timescale_);
    buffer = write_64(buffer, mvhd->duration_);
  }

  buffer = write_32(buffer, mvhd->rate_);
  buffer = write_16(buffer, mvhd->volume_);
  buffer = write_16(buffer, mvhd->reserved1_);
  buffer = write_32(buffer, mvhd->reserved2_[0]);
  buffer = write_32(buffer, mvhd->reserved2_[1]);

  for(i = 0; i != 9; ++i)
  {
    buffer = write_32(buffer, mvhd->matrix_[i]);
  }

  for(i = 0; i != 6; ++i)
  {
    buffer = write_32(buffer, mvhd->predefined_[i]);
  }

  buffer = write_32(buffer, mvhd->next_track_id_);

  return buffer;
}

static unsigned char* trex_write(void const* atom, unsigned char* buffer)
{
  trex_t const* trex = (trex_t const*)atom;

  buffer = write_8(buffer, trex->version_);
  buffer = write_24(buffer, trex->flags_);

  buffer = write_32(buffer, trex->track_id_);
  buffer = write_32(buffer, trex->default_sample_description_index_);
  buffer = write_32(buffer, trex->default_sample_duration_);
  buffer = write_32(buffer, trex->default_sample_size_);
  buffer = write_32(buffer, trex->default_sample_flags_);

  return buffer;
}

static unsigned char* mvex_write(void const* atom, unsigned char* buffer)
{
  mvex_t const* mvex = (mvex_t const*)atom;

  unsigned i;

  buffer = atom_writer(mvex->unknown_atoms_, NULL, 0, buffer);

  for(i = 0; i != mvex->tracks_; ++i)
  {
    atom_write_list_t mvex_atom_write_list[] = {
//    { FOURCC('m', 'e', 'h', 'd'), NULL, NULL },
      { FOURCC('t', 'r', 'e', 'x'), mvex->trexs_[i], &trex_write },
    };
    buffer = atom_writer(0,
                         mvex_atom_write_list,
                         sizeof(mvex_atom_write_list) / sizeof(mvex_atom_write_list[0]),
                         buffer);
  }

  return buffer;
}

extern uint32_t moov_write(moov_t* atom, unsigned char* buffer)
{
  unsigned i;

  unsigned char* atom_start = buffer;

  atom_write_list_t atom_write_list[] = {
    { FOURCC('m', 'v', 'h', 'd'), atom->mvhd_, &mvhd_write },
    { FOURCC('m', 'v', 'e', 'x'), atom->mvex_, &mvex_write }
  };

  // atom size
  buffer += 4;

  // atom type
  buffer = write_32(buffer, FOURCC('m', 'o', 'o', 'v'));

  buffer = atom_writer(atom->unknown_atoms_,
                       atom_write_list,
                       sizeof(atom_write_list) / sizeof(atom_write_list[0]),
                       buffer);

  for(i = 0; i != atom->tracks_; ++i)
  {
    atom_write_list_t trak_atom_write_list[] = {
      { FOURCC('t', 'r', 'a', 'k'), atom->traks_[i], &trak_write },
    };
    buffer = atom_writer(0,
                         trak_atom_write_list,
                         sizeof(trak_atom_write_list) / sizeof(trak_atom_write_list[0]),
                         buffer);
  }

  write_32(atom_start, (uint32_t)(buffer - atom_start));

  return buffer - atom_start;
}

static unsigned char* tfra_write(void const* atom, unsigned char* buffer)
{
  tfra_t const* tfra = (tfra_t const*)atom;
  unsigned int i;
  uint32_t length_fields;

  buffer = write_8(buffer, tfra->version_);
  buffer = write_24(buffer, tfra->flags_);

  buffer = write_32(buffer, tfra->track_id_);
  length_fields = ((tfra->length_size_of_traf_num_ - 1) << 4) +
                  ((tfra->length_size_of_trun_num_ - 1) << 2) +
                  ((tfra->length_size_of_sample_num_ - 1) << 0);
  buffer = write_32(buffer, length_fields);

  buffer = write_32(buffer, tfra->number_of_entry_);
  for(i = 0; i != tfra->number_of_entry_; ++i)
  {
    tfra_table_t* table = &tfra->table_[i];
    if(tfra->version_ == 0)
    {
      buffer = write_32(buffer, (uint32_t)table->time_);
      buffer = write_32(buffer, (uint32_t)table->moof_offset_);
    }
    else
    {
      buffer = write_64(buffer, table->time_);
      buffer = write_64(buffer, table->moof_offset_);
    }

    buffer = write_n(buffer, tfra->length_size_of_traf_num_ * 8, 
                     table->traf_number_ + 1);
    buffer = write_n(buffer, tfra->length_size_of_trun_num_ * 8, 
                     table->trun_number_ + 1);
    buffer = write_n(buffer, tfra->length_size_of_sample_num_ * 8, 
                     table->sample_number_ + 1);
  }

  return buffer;
}

extern uint32_t mfra_write(mfra_t const* mfra, unsigned char* buffer)
{
  unsigned i;

  unsigned char* atom_start = buffer;
  uint32_t atom_size;

  // atom size
  buffer += 4;

  // atom type
  buffer = write_32(buffer, FOURCC('m', 'f', 'r', 'a'));

  buffer = atom_writer(mfra->unknown_atoms_, NULL, 0, buffer);

  for(i = 0; i != mfra->tracks_; ++i)
  {
    atom_write_list_t mfra_atom_write_list[] = {
      { FOURCC('t', 'f', 'r', 'a'), mfra->tfras_[i], &tfra_write },
    };
    buffer = atom_writer(0,
                         mfra_atom_write_list,
                         sizeof(mfra_atom_write_list) / sizeof(mfra_atom_write_list[0]),
                         buffer);
  }

  // write Movie Fragment Random Access Offset Box (mfro)
  {
    buffer = write_32(buffer, 16);
    buffer = write_32(buffer, FOURCC('m', 'f', 'r', 'o'));
    buffer = write_32(buffer, 0);
    buffer = write_32(buffer, (uint32_t)(buffer - atom_start + 4));
  }

  atom_size = (uint32_t)(buffer - atom_start);
  write_32(atom_start, atom_size);

  return atom_size;
}

static unsigned char* tfhd_write(void const* atom, unsigned char* buffer)
{
  struct tfhd_t const* tfhd = (struct tfhd_t const*)atom;

  buffer = write_8(buffer, tfhd->version_);
  buffer = write_24(buffer, tfhd->flags_);

  buffer = write_32(buffer, tfhd->track_id_);

  if(tfhd->flags_ & 0x000001)
  {
    buffer = write_64(buffer, tfhd->base_data_offset_);
  }
  if(tfhd->flags_ & 0x000002)
  {
    buffer = write_32(buffer, tfhd->sample_description_index_);
  }
  if(tfhd->flags_ & 0x000008)
  {
    buffer = write_32(buffer, tfhd->default_sample_duration_);
  }
  if(tfhd->flags_ & 0x000010)
  {
    buffer = write_32(buffer, tfhd->default_sample_size_);
  }
  if(tfhd->flags_ & 0x000020)
  {
    buffer = write_32(buffer, tfhd->default_sample_flags_);
  }

  return buffer;
}

static unsigned char* trun_write(void const* atom, unsigned char* buffer)
{
  // TODO: add writing of multiple truns (we can't do that here, as we need to
  // write an atom header for each trun)
  trun_t const* trun = (trun_t const*)atom;
  unsigned int i;

  buffer = write_8(buffer, trun->version_);
  buffer = write_24(buffer, trun->flags_);

  buffer = write_32(buffer, trun->sample_count_);

  // data offset
  if(trun->flags_ & 0x0001)
  {
    buffer = write_32(buffer, trun->data_offset_);
  }
  // first sample flag
  if(trun->flags_ & 0x0004)
  {
    buffer = write_32(buffer, trun->first_sample_flags_);
  }

  for(i = 0; i != trun->sample_count_; ++i)
  {
    if(trun->flags_ & 0x0100)
    {
      buffer = write_32(buffer, trun->table_[i].sample_duration_);
    }
    if(trun->flags_ & 0x0200)
    {
      buffer = write_32(buffer, trun->table_[i].sample_size_);
    }
    if(trun->flags_ & 0x0800)
    {
      buffer = write_32(buffer, trun->table_[i].sample_composition_time_offset_);
    }
  }

  return buffer;
}

static unsigned char* uuid0_write(void const* atom, unsigned char* buffer)
{
  uuid0_t const* uuid = (uuid0_t const*)atom;

  static const unsigned char uuid0[] = {
    0x6d, 0x1d, 0x9b, 0x05, 0x42, 0xd5, 0x44, 0xe6,
    0x80, 0xe2, 0x14, 0x1d, 0xaf, 0xf7, 0x57, 0xb2
  };

  memcpy(buffer, uuid0, sizeof(uuid0));
  buffer += sizeof(uuid0);

  buffer = write_8(buffer, 0x01);
  buffer = write_24(buffer, 0x00);
  buffer = write_64(buffer, uuid->pts_);
  buffer = write_64(buffer, uuid->duration_);

  return buffer;
}

static unsigned char* uuid1_write(void const* atom, unsigned char* buffer)
{
  uuid1_t const* uuid = (uuid1_t const*)atom;

  static const unsigned char uuid1[] = {
    0xd4, 0x80, 0x7e, 0xf2, 0xca, 0x39, 0x46, 0x95,
    0x8e, 0x54, 0x26, 0xcb, 0x9e, 0x46, 0xa7, 0x9f
  };
  unsigned int i;

  memcpy(buffer, uuid1, sizeof(uuid1));
  buffer += sizeof(uuid1);

  buffer = write_8(buffer, 0x01);
  buffer = write_24(buffer, 0x00);

  buffer = write_8(buffer, uuid->entries_);
  for(i = 0; i != uuid->entries_; ++i)
  {
    buffer = write_64(buffer, uuid->pts_[i]);
    buffer = write_64(buffer, uuid->duration_[i]);
  }

#if 0
  // 0x485482a4d55 = 497048.7893333 = 138:04:08.7893333
  // 0x485498ebf55 = 497051.1253333 = 138:04:11.1253333
  // 0x1647200 = 2.3360000
  // 0x1339e00 = 2.0160000

  buffer = write_64(buffer, 0x00000485482a4d55);
  buffer = write_64(buffer, 0x1647200); // next duration?

  buffer = write_64(buffer, 0x00000485498ebf55);
  buffer = write_64(buffer, 0x1339e00); // next next duration?
#endif

  return buffer;
}

static unsigned char* mfhd_write(void const* atom, unsigned char* buffer)
{
  mfhd_t const* mfhd = (mfhd_t const*)atom;

  buffer = write_8(buffer, mfhd->version_);
  buffer = write_24(buffer, mfhd->flags_);

  buffer = write_32(buffer, mfhd->sequence_number_);

  return buffer;
}

static unsigned char* traf_write(void const* atom, unsigned char* buffer)
{
  traf_t const* traf = (traf_t const*)atom;
  atom_write_list_t atom_write_list[] = {
    { FOURCC('t', 'f', 'h', 'd'), traf->tfhd_, &tfhd_write },
    { FOURCC('t', 'r', 'u', 'n'), traf->trun_, &trun_write },
#if 1 // defined(HACK_LIVE_SMOOTH_STREAMING)
    { FOURCC('u', 'u', 'i', 'd'), traf->uuid0_, &uuid0_write },
    { FOURCC('u', 'u', 'i', 'd'), traf->uuid1_, &uuid1_write }
#endif
  };

  buffer = atom_writer(traf->unknown_atoms_,
                       atom_write_list,
                       sizeof(atom_write_list) / sizeof(atom_write_list[0]),
                       buffer);

  return buffer;
}

extern uint32_t moof_write(struct moof_t* atom, unsigned char* buffer)
{
  unsigned i;

  unsigned char* atom_start = buffer;

  atom_write_list_t atom_write_list[] = {
    { FOURCC('m', 'f', 'h', 'd'), atom->mfhd_, &mfhd_write },
  };

  // atom size
  buffer += 4;

  // atom type
  buffer = write_32(buffer, FOURCC('m', 'o', 'o', 'f'));

  buffer = atom_writer(atom->unknown_atoms_,
                       atom_write_list,
                       sizeof(atom_write_list) / sizeof(atom_write_list[0]),
                       buffer);

  for(i = 0; i != atom->tracks_; ++i)
  {
    atom_write_list_t traf_atom_write_list[] = {
      { FOURCC('t', 'r', 'a', 'f'), atom->trafs_[i], &traf_write },
    };
    buffer = atom_writer(0,
                         traf_atom_write_list,
                         sizeof(traf_atom_write_list) / sizeof(traf_atom_write_list[0]),
                         buffer);
  }
  write_32(atom_start, (uint32_t)(buffer - atom_start));

  return buffer - atom_start;
}

// End Of File

