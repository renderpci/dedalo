#                                               -*- Autoconf -*-
# Process this file with autoconf to produce a configure script.

AC_PREREQ(2.61)
AC_INIT(mod_h264_streaming, m4_esyscmd([./version.sh | tr -d '\n']), h264@code-shop.com)
AC_CANONICAL_TARGET
AM_INIT_AUTOMAKE()
AC_COPYRIGHT([Copyright (c) 2009 CodeShop B.V.])
AC_CONFIG_SRCDIR([src/mod_h264_streaming.c])
AC_CONFIG_HEADER([config.h])

# Checks for programs.
AC_PROG_LIBTOOL
AC_PROG_CC
AC_PROG_INSTALL

LT_INIT
AC_CONFIG_MACRO_DIR([m4])

AP_VERSION=2.0.55
CHECK_APACHE(,$AP_VERSION,
    :,:,
    AC_MSG_ERROR([*** Apache version $AP_VERSION not found!])
)

prefix=${AP_PREFIX}

LIBTOOL="`${APR_CONFIG} --apr-libtool`"
AC_SUBST(LIBTOOL)

MODULE_CFLAGS="${APXS_CFLAGS} ${AP_INCLUDES} ${APR_INCLUDES} ${APU_INCLUDES}"
AC_SUBST(MODULE_CFLAGS)

MODULE_LDFLAGS=" `${APR_CONFIG} --link-libtool` `${APU_CONFIG} --link-libtool`"
AC_SUBST(MODULE_LDFLAGS)

BIN_LDFLAGS=" `${APR_CONFIG} --link-libtool` `${APU_CONFIG} --link-libtool` `${APU_CONFIG} --ldflags --libs` `${APR_CONFIG} --ldflags --libs`" 
AC_SUBST(BIN_LDFLAGS)

# Checks for libraries.

# Checks for header files.
AC_HEADER_DIRENT
AC_HEADER_STDC
AC_CHECK_HEADERS([inttypes.h limits.h stdint.h stdlib.h string.h])

# Checks for typedefs, structures, and compiler characteristics.
AC_C_CONST
AC_TYPE_INT32_T
AC_TYPE_INT64_T
AC_TYPE_OFF_T
AC_TYPE_SIZE_T
AC_TYPE_UINT16_T
AC_TYPE_UINT32_T
AC_TYPE_UINT64_T
AC_TYPE_UINT8_T

# Checks for library functions.
AC_FUNC_FSEEKO
AC_FUNC_MALLOC
AC_FUNC_STRTOD
AC_FUNC_VPRINTF
AC_CHECK_FUNCS([memset strdup strrchr])

AC_CONFIG_FILES([Makefile src/Makefile])
AC_OUTPUT
