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


dnl TEST_APACHE_VERSION(RELEASE, [MINIMUM-VERSION [, ACTION-IF-FOUND [, ACTION-IF-NOT-FOUND]]])
dnl Test for Apache
dnl
AC_DEFUN([TEST_APACHE_VERSION],
[dnl
    AC_REQUIRE([AC_CANONICAL_TARGET])
    releasetest=$1
    min_apache_version="$2"
    no_apache=""
    ac_save_CFLAGS="$CFLAGS"
    CFLAGS="$CFLAGS $AP_CFLAGS"
    if test $releasetest -eq 20; then
        CFLAGS="$CFLAGS $APU_INCLUDES $APR_INCLUDES"
    fi
    AC_TRY_RUN([
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "httpd.h"

#ifndef AP_SERVER_BASEREVISION
    #define AP_SERVER_BASEREVISION SERVER_BASEREVISION
#endif
        
char* my_strdup (char *str)
{
    char *new_str;

    if (str) {
        new_str = (char *)malloc ((strlen (str) + 1) * sizeof(char));
        strcpy (new_str, str);
    } else
        new_str = NULL;

    return new_str;
}

int main (int argc, char *argv[])
{
    int major1, minor1, micro1;
    int major2, minor2, micro2;
    char *tmp_version;

    { FILE *fp = fopen("conf.apachetest", "a"); if ( fp ) fclose(fp); }

    tmp_version = my_strdup("$min_apache_version");
    if (sscanf(tmp_version, "%d.%d.%d", &major1, &minor1, &micro1) != 3) {
        printf("%s, bad version string\n", "$min_apache_version");
        exit(1);
    }
    tmp_version = my_strdup(AP_SERVER_BASEREVISION);
    if (sscanf(tmp_version, "%d.%d.%d", &major2, &minor2, &micro2) != 3) {
        printf("%s, bad version string\n", AP_SERVER_BASEREVISION);
        exit(1);
    }

    if ( (major2 == major1) &&
        ( (minor2 > minor1) ||
        ((minor2 == minor1) && (micro2 >= micro1)) ) ) {
        exit(0);
    } else {
        exit(1);
    }
}

],, no_apache=yes,[echo $ac_n "cross compiling; assumed OK... $ac_c"])
    CFLAGS="$ac_save_CFLAGS"

    if test "x$no_apache" = x ; then
        ifelse([$3], , :, [$3])
       else
        if test -f conf.apachetest ; then
            :
        else
            echo "*** Could not run Apache test program, checking why..."
            CFLAGS="$CFLAGS $AP_CFLAGS"
            if test $releasetest -eq 20; then
                CFLAGS="$CFLAGS $APU_INCLUDES $APR_INCLUDES"
            fi
            AC_TRY_LINK([
#include <stdio.h>
#include "httpd.h"

int main(int argc, char *argv[])
{ return 0; }
#undef main
#define main K_and_R_C_main
],                [ return 0; ],
                [ echo "*** The test program compiled, but failed to run. Check config.log" ],
                [ echo "*** The test program failed to compile or link. Check config.log" ])
            CFLAGS="$ac_save_CFLAGS"
        fi
         ifelse([$4], , :, [$4])
      fi
      rm -f conf.apachetest
])
