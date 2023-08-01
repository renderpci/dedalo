dnl -------------------------------------------------------- -*- autoconf -*-
dnl Copyright 2005 The Apache Software Foundation
dnl
dnl Licensed under the Apache License, Version 2.0 (the "License");
dnl you may not use this file except in compliance with the License.
dnl You may obtain a copy of the License at
dnl
dnl     http://www.apache.org/licenses/LICENSE-2.0
dnl
dnl Unless required by applicable law or agreed to in writing, software
dnl distributed under the License is distributed on an "AS IS" BASIS,
dnl WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
dnl See the License for the specific language governing permissions and
dnl limitations under the License.

dnl CHECK_APACHE([MINIMUM13-VERSION [, MINIMUM20-VERSION [, 
dnl            ACTION-IF-FOUND13 [, ACTION-IF-FOUND20 [, ACTION-IF-NOT-FOUND]]])
dnl Test for Apache apxs, APR, and APU

AC_DEFUN([CHECK_APACHE],
[dnl
AC_ARG_WITH(
    apxs,
    [AC_HELP_STRING([--with-apxs=PATH],[Path to apxs])],
    apxs_prefix="$withval",
    apxs_prefix="/usr"
    )

AC_ARG_ENABLE(
        apachetest,
        [AC_HELP_STRING([--disable-apxstest],[Do not try to compile and run apache version test program])],
        ,
        enable_apachetest=yes
    )

    if test -x $apxs_prefix -a ! -d $apxs_prefix; then
        APXS_BIN=$apxs_prefix
    else
        test_paths="$apxs_prefix:$apxs_prefix/bin:$apxs_prefix/sbin"
        test_paths="${test_paths}:/usr/bin:/usr/sbin"
        test_paths="${test_paths}:/usr/local/bin:/usr/local/sbin:/usr/local/apache2/bin"
        AC_PATH_PROG(APXS_BIN, apxs, no, [$test_paths])
    fi
    min_apache13_version=ifelse([$1], ,no,$1)
    min_apache20_version=ifelse([$2], ,no,$2)
    no_apxs=""
    if test "$APXS_BIN" = "no"; then
        AC_MSG_ERROR([*** The apxs binary installed by apache could not be found!])
        AC_MSG_ERROR([*** Use the --with-apxs option with the full path to apxs])
    else
        AP_INCLUDES="-I`$APXS_BIN -q INCLUDEDIR 2>/dev/null`"
        AP_INCLUDEDIR="`$APXS_BIN -q INCLUDEDIR 2>/dev/null`"

        AP_PREFIX="`$APXS_BIN -q prefix 2>/dev/null`"

        AP_BINDIR="`$APXS_BIN -q bindir 2>/dev/null`"
        AP_SBINDIR="`$APXS_BIN -q sbindir 2>/dev/null`"

        APXS_CFLAGS=""
        for flag in CFLAGS EXTRA_CFLAGS EXTRA_CPPFLAGS NOTEST_CFLAGS; do
            APXS_CFLAGS="$APXS_CFLAGS `$APXS_BIN -q $flag 2>/dev/null`"
        done

        AP_CPPFLAGS="$APXS_CPPFLAGS $AP_INCLUDES"
        AP_CFLAGS="$APXS_CFLAGS $AP_INCLUDES"

        AP_LIBEXECDIR=`$APXS_BIN -q LIBEXECDIR 2>/dev/null`

        if test "x$enable_apachetest" = "xyes" ; then
            if test "$min_apache20_version" != "no"; then
                APR_CONFIG="`$APXS_BIN -q APR_BINDIR 2>/dev/null`/apr-1-config"
                if test ! -x $APR_CONFIG; then
                    APR_CONFIG="`$APXS_BIN -q APR_BINDIR 2>/dev/null`/apr-config"
                fi
                APR_INCLUDES=`$APR_CONFIG --includes 2>/dev/null`
                APR_VERSION=`$APR_CONFIG --version 2>/dev/null`
                APU_CONFIG="`$APXS_BIN -q APU_BINDIR 2>/dev/null`/apu-1-config"
                if test ! -x $APU_CONFIG; then
                    APU_CONFIG="`$APXS_BIN -q APU_BINDIR 2>/dev/null`/apu-config"
                fi
                APU_INCLUDES=`$APU_CONFIG --includes 2>/dev/null`
                APU_VERSION=`$APU_CONFIG --version 2>/dev/null`

                AC_MSG_CHECKING(for Apache 2.0 version >= $min_apache20_version)
                TEST_APACHE_VERSION(20,$min_apache20_version,
                    AC_MSG_RESULT(yes)
                    AC_DEFINE(WITH_APACHE20,1,[Define to 1 if we are compiling with Apache 2.0.x])
                    AP_VERSION="2.0"
                    APXS_EXTENSION=.la
                    AP_CFLAGS="$AP_CFLAGS $APU_INCLUDES $APR_INCLUDES"
                    AP_CPPFLAGS="$AP_CPPFLAGS $APU_INCLUDES $APR_INCLUDES"
                    AP_DEFS="-DWITH_APACHE20"
                    ifelse([$4], , , $4),
                    AC_MSG_RESULT(no)
                    if test "x$min_apache13_version" = "xno"; then
                        ifelse([$5], , , $5)
                    fi
                )
            fi
            if test "$min_apache13_version" != "no" -a "x$AP_VERSION" = "x"; then
                APR_INCLUDES=""
                APR_VERSION=""
                APU_INCLUDES=""
                APU_VERSION=""
                AC_MSG_CHECKING(for Apache 1.3 version >= $min_apache13_version)
                TEST_APACHE_VERSION(13,$min_apache13_version,
                    AC_MSG_RESULT(yes)
                    AC_DEFINE(WITH_APACHE13,1,[Define to 1 if we are compiling with Apache 1.3.x])
                    AP_VERSION="1.3"
                    APXS_EXTENSION=.so
                    AP_CFLAGS="-g $AP_CFLAGS"
                    AP_DEFS="-DWITH_APACHE13"
                    ifelse([$3], , , $3),
                    AC_MSG_RESULT(no)
                    ifelse([$5], , , $5)
                )
            fi
        fi
        AC_SUBST(AP_DEFS)
        AC_SUBST(AP_PREFIX)
        AC_SUBST(AP_CFLAGS)
        AC_SUBST(AP_CPPFLAGS)
        AC_SUBST(AP_INCLUDES)
        AC_SUBST(AP_INCLUDEDIR)
        AC_SUBST(AP_LIBEXECDIR)
        AC_SUBST(AP_VERSION)
        AC_SUBST(AP_BINDIR)
        AC_SUBST(AP_SBINDIR)
        AC_SUBST(APR_CONFIG)
        AC_SUBST(APU_CONFIG)
        AC_SUBST(APR_INCLUDES)
        AC_SUBST(APU_INCLUDES)
        AC_SUBST(APXS_EXTENSION)
        AC_SUBST(APXS_BIN)
        AC_SUBST(APXS_CFLAGS)
    fi
])
