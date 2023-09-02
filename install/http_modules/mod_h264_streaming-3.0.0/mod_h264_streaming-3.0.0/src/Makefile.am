moddir=${AP_LIBEXECDIR}

mod_h264_streaming_la_SOURCES = mod_h264_streaming.c \
                                mod_streaming_export.h \
                                moov.c moov.h \
                                mp4_io.c mp4_io.h \
                                mp4_reader.c mp4_reader.h \
                                mp4_writer.c mp4_writer.h \
                                mp4_process.c mp4_process.h \
                                output_bucket.c output_bucket.h \
                                output_mp4.c output_mp4.h

mod_h264_streaming_la_CFLAGS = -Wall ${MODULE_CFLAGS} -DBUILDING_H264_STREAMING
mod_h264_streaming_la_LDFLAGS = -rpath ${AP_LIBEXECDIR} -module -avoid-version ${MODULE_LDFLAGS}

mod_LTLIBRARIES = mod_h264_streaming.la

install: install-am
	rm -f $(DESTDIR)${AP_LIBEXECDIR}/mod_h264_streaming.a
	rm -f $(DESTDIR)${AP_LIBEXECDIR}/mod_h264_streaming.la
