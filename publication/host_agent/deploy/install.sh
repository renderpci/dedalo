#!/bin/sh
# Dédalo publication host — THE ONLY ENTRY POINT of `provision init` (spec §1.1, S3, S7).
#
#   sh deploy/install.sh <instance> [--source <dir>] [--draft <file>]
#                        [--offline <bun zip> [<SHASUMS256.txt>]] [--mirror <https base url>]
#                        [--source-digest <sha256>] [-- <init flags>]
#   sh install.sh <instance> --kit <kit.tar.gz> [--kit-sha256 <sha256>] [--offline …] [--mirror …] [-- <init flags>]
#
# First run: --source <dir> (the work checkout, or the copied SOURCE_MANIFEST entries), or
# --kit <file>: the ONE archive `bun run hostagent:pack -- --draft <draft.json>` built on the work
# host (the source layout + the draft + a MANIFEST of every file's sha256).
# Re-runs: no --source; the Bun and agent init installed are reused through rerun.env.
#
# THE KIT. Its sha256 is the trust anchor: the copy staged here is hashed BEFORE any tar reads it
# and must equal --kit-sha256 (the value the work host printed), or the operator confirms it on the
# terminal. Only then is it listed (every member name relative, clean, no '.'/'..' segment) and
# extracted by tar into a root 0700 directory, and the MANIFEST is verified (verify_kit: regular
# files and directories only, the file set exactly the MANIFEST's, every sha256 equal) before
# anything in it is used. The kit consent replaces the source-digest prompt.
#
# ROOT NEVER RUNS CODE OR CONFIG A NON-ROOT ACCOUNT CAN WRITE. Before Bun starts, this file
#   1. stages the source into root-owned 0700 directories, refusing any special file and any
#      symlink that is absolute or resolves outside the tree, and shows its digest for consent;
#   2. verifies Bun against the hash table COMMITTED IN THE SOURCE (.bun-sha256, generated only
#      from Bun's signed SHASUMS256.txt.asc) — a mirror cannot substitute bytes; SHASUMS256.txt
#      is a cross-check that must agree; `bun --version` runs only after the hash matched;
#   3. starts Bun from the stage with `env -i`, --no-env-file, --no-install and an empty bunfig
#      (--config=<file>; see the hand-over below for why never `-c`).
# Whoever can write the source can become root through init: give it only a source you trust.
#
# Library mode (the tests): `set -- --lib; . deploy/install.sh` defines the functions and does
# not run main. The library functions (verify_bun, check_tree, tree_digest, family_of,
# refuse_host, refuse_kernel, hold_install_lock, pick_asset, kit_names_ok, kit_types_ok,
# verify_kit) use POSIX tools plus $SHA256 (and
# hold_install_lock util-linux flock) only; GNU-only forms (stat -c) are confined to main and the
# re-run trust check, which run only on Linux. There is no `set -e`: a function that dies inside
# `$(…)` exits only that subshell, so every such assignment in main ends `|| exit 3`.
#
# Exit codes: 3 refused (every refusal here), else init's own code.

# ── constants: held EQUAL to the TS ones by tests/init_install_sh.test.ts ───────────
INIT_BASE=/var/lib/dedalo_publication_host_init
BUN_ASSETS='bun-linux-aarch64 bun-linux-x64-baseline bun-linux-x64'
BUN_RELEASE_BASE=https://github.com/oven-sh/bun/releases/download
# SOURCE_MANIFEST: <path>:<file|tree>, in init/constants.ts order; excludes are tree children.
SOURCE_MANIFEST='.bun-version:file .bun-sha256:file publication/host_agent:tree publication/server_api/v2/.env.example:file publication/server_api/v1/config_api/sample.server_config_api.php:file'
SOURCE_EXCLUDES='publication/host_agent/.test-tmp'
# May be absent (a kit built from a v2-only draft carries no v1 sample): skipped, never refused.
SOURCE_OPTIONAL='publication/server_api/v1/config_api/sample.server_config_api.php'
# The kit (init/constants.ts KIT_*): its MANIFEST's first line, its fixed top-level names.
KIT_FORMAT_LINE='# dedalo publication-host kit 1'
KIT_MANIFEST_NAME=MANIFEST
KIT_DRAFT_NAME=draft.json
KIT_INSTALL_NAME=install.sh
KIT_SOURCE_DIR=source
KIT_PATH_RE='^[A-Za-z0-9._@+-]+(/[A-Za-z0-9._@+-]+)*$'
KIT_DOT_SEGMENT_RE='(^|/)\.\.?(/|$)'
KIT_MAX_ENTRIES=20000
HANDOVER_FLAGS='--draft --source --source-digest-confirmed --bun-archive --bun-sums'
BUN_HANDOVER_FLAGS='--no-env-file --no-install'
EMPTY_BUNFIG_NAME=empty.bunfig.toml
STAGE_DIR_NAME=stage
INSTALL_LOCK_NAME=install.lock
# EL majors below this have systemd 239 and kernel 4.18 (below Bun's floor): refused here,
# before any Bun is fetched (parse/os.ts OS_SUPPORT holds the supported rows: 9 and 10).
EL_MAJOR_FLOOR=9
BUN_KERNEL_FLOOR=5.1
RERUN_ENV_NAME=rerun.env
INSTANCE_RE='^[a-z][a-z0-9_]{1,31}$'
PIN_RE='^[0-9]+\.[0-9]+\.[0-9]+$'
TABLE_PIN_RE='^# bun-v[0-9]+\.[0-9]+\.[0-9]+$'
TABLE_SIGNED_BY_RE='^# signed-by: [0-9A-F]{40}$'
SAFE_PATH_RE='^/[A-Za-z0-9._/-]+$'
ENTRY_REL=publication/host_agent/src/provision/cli.ts
HANDOVER_PATH=/usr/sbin:/usr/bin:/sbin:/bin

die() {
  printf 'install.sh: %s\n' "$*" >&2
  exit 3
}

# $SHA256 <file> prints '<hex>  <file>'. Resolved once: sha256sum, else shasum -a 256.
resolve_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    SHA256=sha256sum
  elif command -v shasum >/dev/null 2>&1; then
    SHA256='shasum -a 256'
  else
    die 'no sha256sum (coreutils) on this host'
  fi
}

sha_of() {
  # shellcheck disable=SC2086 # $SHA256 is a command with its arguments
  $SHA256 "$1" | cut -d' ' -f1
}

# refuse_host <uid> <kernel name>: main's first refusals.
refuse_host() {
  [ "$1" = 0 ] || die 'run as root (sudo sh deploy/install.sh …)'
  [ "$2" = Linux ] || die "a publication host runs Linux (this is $2)"
}

# family_of <os-release file>: prints debian or el (read as data, never sourced), else exit 3.
# The package family only, plus ONE release check: an EL major below EL_MAJOR_FLOOR (EL 8) is
# refused here, because its kernel is below Bun's floor and Bun must never be fetched for it.
# Every other release question (Ubuntu 22.04, CentOS Stream, Oracle Linux…) is init's host.os.
family_of() {
  [ -f "$1" ] || die "no $1: cannot tell the package family"
  _id=$(sed -n 's/^ID=//p' "$1" | tr -d '"' | head -n 1)
  _like=$(sed -n 's/^ID_LIKE=//p' "$1" | tr -d '"' | head -n 1)
  case " $_id $_like " in
    *' debian '* | *' ubuntu '*) echo debian ;;
    *' rhel '* | *' rocky '* | *' almalinux '* | *' fedora '* | *' centos '*)
      _ver=$(sed -n 's/^VERSION_ID=//p' "$1" | tr -d '"' | head -n 1)
      _major=${_ver%%.*}
      case "$_major" in
        '' | *[!0-9]*) die "EL host without a numeric VERSION_ID ('$_ver'): RHEL/Rocky/Alma 9 and 10 are supported" ;;
      esac
      [ "$_major" -ge "$EL_MAJOR_FLOOR" ] ||
        die "EL $_ver (ID=$_id) is not supported: EL 8 and older ship a kernel below Bun's floor $BUN_KERNEL_FLOOR; upgrade to RHEL, Rocky or Alma 9 or 10"
      echo el
      ;;
    *) die "unsupported OS family (ID=$_id): Debian 12/13, Ubuntu 24.04/26.04 and RHEL/Rocky/Alma 9/10 are supported" ;;
  esac
}

# refuse_kernel <release>: exit 3 when the kernel's <major>.<minor> is below BUN_KERNEL_FLOOR
# (layout.ts, moved with the pin) — checked before any Bun is fetched or run.
refuse_kernel() {
  _k=$(printf '%s\n' "$1" | sed -n 's/^\([0-9][0-9]*\)\.\([0-9][0-9]*\).*/\1 \2/p')
  [ -n "$_k" ] || die "kernel release '$1' has no <major>.<minor>"
  _kmaj=${_k% *} _kmin=${_k#* }
  _fmaj=${BUN_KERNEL_FLOOR%%.*} _fmin=${BUN_KERNEL_FLOOR#*.}
  if [ "$_kmaj" -gt "$_fmaj" ] || { [ "$_kmaj" -eq "$_fmaj" ] && [ "$_kmin" -ge "$_fmin" ]; }; then
    return 0
  fi
  die "kernel $1 is below Bun's floor $BUN_KERNEL_FLOOR: no supported Bun runs here"
}

# hold_install_lock <state dir>: opens <state dir>/INSTALL_LOCK_NAME on fd 9 and
# takes a non-blocking exclusive flock on it, else exit 3. The fd stays open across the exec, so
# the lock lives until init exits: a second install.sh for the instance refuses instead of
# wiping the stage a running one reads.
hold_install_lock() {
  _lock=$1/$INSTALL_LOCK_NAME
  [ -L "$_lock" ] && die "$_lock is a symlink"
  exec 9>>"$_lock" || die "cannot open $_lock"
  flock -n 9 ||
    die "another install.sh (or its init) is running for this instance (it holds $_lock): wait for it to finish, then re-run"
}

# pkg_hint <family>: the command that installs the tools main needs.
pkg_hint() {
  case "$1" in
    debian) echo 'apt install curl unzip coreutils util-linux' ;;
    *) echo 'dnf install curl unzip coreutils util-linux' ;;
  esac
}

# pick_asset <uname -m> <cpuinfo file>
pick_asset() {
  case "$1" in
    x86_64)
      if grep -qw avx2 "$2" 2>/dev/null; then echo bun-linux-x64; else echo bun-linux-x64-baseline; fi
      ;;
    aarch64 | arm64) echo bun-linux-aarch64 ;;
    *) die "no Bun build for CPU '$1'" ;;
  esac
}

# bad_links <resolved root>: every symlink below it that is absolute, dangling or resolves outside.
bad_links() {
  find "$1" -type l -print | while IFS= read -r _link; do
    _target=$(readlink "$_link")
    case "$_target" in
      /*) printf '%s\n' "$_link"; continue ;;
    esac
    if ! _real=$(readlink -f "$_link" 2>/dev/null) || [ ! -e "$_real" ]; then
      printf '%s\n' "$_link"
      continue
    fi
    case "$_real" in
      "$1"/*) ;;
      *) printf '%s\n' "$_link" ;;
    esac
  done
}

# kit_names_ok <listing file>: every line (a `tar -tzf` member name; a directory's trailing '/'
# dropped) is relative, in KIT_PATH_RE, without a '.' or '..' segment, and there are at most
# KIT_MAX_ENTRIES of them. Exit 3 naming the first offender. Run BEFORE tar extracts anything.
kit_names_ok() {
  [ -f "$1" ] || die "kit_names_ok: no listing $1"
  _count=$(wc -l <"$1" | tr -d ' ')
  [ "$_count" -le "$KIT_MAX_ENTRIES" ] || die "the kit lists $_count entries (at most $KIT_MAX_ENTRIES)"
  _bad=$(sed 's#/$##' "$1" | grep -Ev "$KIT_PATH_RE" | head -n 1)
  [ -z "$_bad" ] || die "the kit holds a member outside the kit path grammar: '$_bad'"
  _bad=$(sed 's#/$##' "$1" | grep -E "$KIT_DOT_SEGMENT_RE" | head -n 1)
  [ -z "$_bad" ] || die "the kit holds a member with a '.' or '..' segment: '$_bad'"
  return 0
}

# kit_types_ok <verbose listing file>: every line of `tar -tvzf` starts with '-' (a regular file)
# or 'd' (a directory) — GNU tar and bsdtar both print the member type first. A link, a device or
# a FIFO member is refused BEFORE extraction (verify_kit refuses one after it, too).
kit_types_ok() {
  [ -f "$1" ] || die "kit_types_ok: no listing $1"
  _bad=$(grep -Ev '^[-d]' "$1" | head -n 1)
  [ -z "$_bad" ] || die "the kit holds a member that is not a regular file or directory: '$_bad'"
  return 0
}

# verify_kit <extracted dir>: the MANIFEST is the kit's whole truth. Its first line is
# KIT_FORMAT_LINE; every other line is '<sha256>  <path>' (path in the kit grammar, no dot
# segment); the dir holds regular files and directories ONLY (a symlink, FIFO or device is a
# refusal); the regular files other than MANIFEST are EXACTLY the listed paths (an extra or a
# missing file, a duplicated line: refused); every file's sha256 equals its line; the draft,
# install.sh and the source directory are present. Exit 3 on any failure.
verify_kit() {
  _kit=$(cd "$1" 2>/dev/null && pwd -P) || die "verify_kit: cannot enter $1"
  _manifest=$_kit/$KIT_MANIFEST_NAME
  if [ -L "$_manifest" ] || [ ! -f "$_manifest" ]; then die "the kit has no $KIT_MANIFEST_NAME"; fi
  [ "$(sed -n 1p "$_manifest")" = "$KIT_FORMAT_LINE" ] || die "the kit's $KIT_MANIFEST_NAME does not start with '$KIT_FORMAT_LINE'"
  _odd=$(find "$_kit" ! -type f ! -type d -print | head -n 1)
  [ -z "$_odd" ] || die "the kit holds something that is not a regular file or directory: ${_odd#"$_kit"/}"
  _bad=$(sed 1d "$_manifest" | grep -Ev "^[0-9a-f]{64}  " | head -n 1)
  [ -z "$_bad" ] || die "a $KIT_MANIFEST_NAME line is not '<sha256>  <path>': '$_bad'"
  _paths=$(sed 1d "$_manifest" | cut -c 67-)
  _bad=$(printf '%s\n' "$_paths" | grep -Ev "$KIT_PATH_RE" | head -n 1)
  [ -z "$_bad" ] || die "a $KIT_MANIFEST_NAME path is outside the kit path grammar: '$_bad'"
  _bad=$(printf '%s\n' "$_paths" | grep -E "$KIT_DOT_SEGMENT_RE" | head -n 1)
  [ -z "$_bad" ] || die "a $KIT_MANIFEST_NAME path has a '.' or '..' segment: '$_bad'"
  _listed=$(printf '%s\n' "$_paths" | LC_ALL=C sort)
  _found=$(cd "$_kit" && find . -type f ! -path "./$KIT_MANIFEST_NAME" -print | sed 's#^\./##' | LC_ALL=C sort)
  if [ "$_listed" != "$_found" ]; then
    _extra=$(printf '%s\n' "$_found" | while IFS= read -r _f; do printf '%s\n' "$_listed" | grep -Fqx -- "$_f" || printf '%s\n' "$_f"; done | head -n 1)
    [ -z "$_extra" ] || die "the kit holds '$_extra', which its $KIT_MANIFEST_NAME does not list"
    die "the kit's files are not exactly its $KIT_MANIFEST_NAME's (a listed file is missing, or a line is repeated)"
  fi
  sed 1d "$_manifest" | while IFS= read -r _line; do
    _want=${_line%%  *}
    _rel=${_line#*  }
    _got=$(sha_of "$_kit/$_rel")
    [ "$_got" = "$_want" ] || die "the kit's '$_rel' has sha256 $_got, its $KIT_MANIFEST_NAME says $_want: the kit was altered"
  done || exit 3
  for _need in "$KIT_DRAFT_NAME" "$KIT_INSTALL_NAME"; do
    if [ -L "$_kit/$_need" ] || [ ! -f "$_kit/$_need" ]; then die "the kit has no $_need"; fi
  done
  [ -d "$_kit/$KIT_SOURCE_DIR" ] || die "the kit has no $KIT_SOURCE_DIR/ directory"
  return 0
}

# check_tree <dir>: regular files, directories and RELATIVE symlinks that resolve to an existing
# path inside <dir> only; no name holding a newline. Exit 3 on any failure.
check_tree() {
  _root=$(readlink -f "$1") || die "check_tree: cannot resolve $1"
  [ -d "$_root" ] || die "check_tree: $1 is not a directory"
  _nl=$(printf '\n_')
  _nl=${_nl%_}
  _odd=$(find "$_root" -name "*${_nl}*" -print | head -n 1)
  [ -z "$_odd" ] || die 'the source holds a file name with a newline'
  _odd=$(find "$_root" ! -type f ! -type d ! -type l -print | head -n 1)
  [ -z "$_odd" ] || die "the source holds a special file (not a file, directory or symlink): $_odd"
  _bad=$(bad_links "$_root" | head -n 1)
  [ -z "$_bad" ] || die "a symlink is absolute, dangling or leaves the source: $_bad"
}

# tree_digest <dir>: sha256 over, for every entry below <dir> in LC_ALL=C byte order of its
# './…' path, 'F <sha256> <path>' | 'L <target> <path>' | 'D <path>', joined with '\n'
# (no final newline). Equal to init/source.ts sourceDigest (spec §1.3).
tree_digest() {
  _lines=$(
    cd "$1" || exit 3
    find . ! -path . -print | LC_ALL=C sort | while IFS= read -r _p; do
      if [ -L "$_p" ]; then
        printf 'L %s %s\n' "$(readlink "$_p")" "$_p"
      elif [ -d "$_p" ]; then
        printf 'D %s\n' "$_p"
      else
        printf 'F %s %s\n' "$(sha_of "$_p")" "$_p"
      fi
    done
  ) || die "tree_digest: cannot walk $1"
  # $(…) dropped the final newline: the lines are joined with '\n', nothing after the last
  printf '%s' "$_lines" | $SHA256 | cut -d' ' -f1
}

# verify_bun <zip> <sums|-> <asset> <pin> <table> <dir>: the committed table, then the
# cross-check, then unzip, then --version. Any failure removes <dir> and exits 3.
verify_bun() {
  _zip=$1 _sums=$2 _asset=$3 _pin=$4 _table=$5 _dir=$6
  _fail() {
    rm -rf "$_dir"
    die "$*"
  }
  case " $BUN_ASSETS " in
    *" $_asset "*) ;;
    *) _fail "'$_asset' is not a Bun asset ($BUN_ASSETS)" ;;
  esac
  printf '%s\n' "$_pin" | grep -Eq "$PIN_RE" || _fail "pin '$_pin' is not <major>.<minor>.<patch>"
  [ -f "$_table" ] || _fail "no hash table $_table"
  sed -n 1p "$_table" | grep -Eq "$TABLE_PIN_RE" || _fail ".bun-sha256 line 1 is not '# bun-v<pin>'"
  [ "$(sed -n 1p "$_table")" = "# bun-v$_pin" ] || _fail ".bun-sha256 line 1 is not '# bun-v$_pin' (table and .bun-version disagree)"
  sed -n 2p "$_table" | grep -Eq "$TABLE_SIGNED_BY_RE" || _fail ".bun-sha256 line 2 is not '# signed-by: <fingerprint>'"
  _n=$(grep -Ec "^[0-9a-f]{64}  $_asset\\.zip\$" "$_table")
  [ "$_n" = 1 ] || _fail ".bun-sha256 names $_asset.zip $_n times (exactly once required)"
  _want=$(grep -E "^[0-9a-f]{64}  $_asset\\.zip\$" "$_table" | cut -d' ' -f1)
  [ -f "$_zip" ] || _fail "no archive $_zip"
  _got=$(sha_of "$_zip")
  [ "$_got" = "$_want" ] || _fail "$_asset.zip has sha256 $_got, .bun-sha256 says $_want: not the pinned release"
  if [ "$_sums" != - ]; then
    [ -f "$_sums" ] || _fail "no SHASUMS file $_sums"
    _n=$(grep -c "  $_asset\\.zip\$" "$_sums")
    [ "$_n" = 1 ] || _fail "SHASUMS256.txt names $_asset.zip $_n times (exactly once required)"
    _line=$(grep "  $_asset\\.zip\$" "$_sums" | tr -d '\r')
    [ "$_line" = "$_want  $_asset.zip" ] || _fail "SHASUMS256.txt disagrees with .bun-sha256 for $_asset.zip: refusing both"
  fi
  mkdir -p "$_dir" || _fail "cannot create $_dir"
  unzip -q -o -j "$_zip" "$_asset/bun" -d "$_dir" || _fail "unzip of $_asset.zip failed"
  _said=$("$_dir/bun" --version 2>/dev/null)
  _rc=$?
  if [ "$_rc" = 126 ]; then
    _fail "$INIT_BASE is on a noexec filesystem (or fapolicyd denies it): see \`findmnt -T $INIT_BASE\` / \`fapolicyd-cli --list\`"
  fi
  [ "$_rc" = 0 ] || _fail "bun --version failed (exit $_rc): the pinned Bun may need a newer glibc (\`getconf GNU_LIBC_VERSION\`)"
  [ "$_said" = "$_pin" ] || _fail "bun --version says '$_said', the pin is $_pin"
}

# root_dir <path>: when present, a root:root real directory not writable by group/other; else made 0700.
root_dir() {
  if [ -e "$1" ] || [ -L "$1" ]; then
    if [ -L "$1" ] || [ ! -d "$1" ]; then die "$1 must be a real directory (not a symlink)"; fi
    _meta=$(stat -c '%u %g %a' "$1")
    case "$_meta" in
      '0 0 '*) ;;
      *) die "$1 must be root:root (is uid/gid ${_meta% *}); fix: chown root:root '$1' && chmod 0700 '$1'" ;;
    esac
    _mode=${_meta##* }
    _go=$(printf '%s' "$_mode" | sed 's/.*\(..\)$/\1/')
    case "$_go" in
      [0145][0145]) ;;
      *) die "$1 is group- or other-writable (mode $_mode); fix: chmod 0700 '$1'" ;;
    esac
  else
    mkdir -m 0700 "$1" || die "cannot create $1"
  fi
}

# trusted_chain <path>: the path and every ancestor up to / root-owned, not g/o-writable, no symlink.
trusted_chain() {
  _p=$1
  while :; do
    [ -L "$_p" ] && die "$_p is a symlink (re-run trust)"
    _meta=$(stat -c '%u %a' "$_p" 2>/dev/null) || die "$_p does not exist (re-run trust)"
    [ "${_meta%% *}" = 0 ] || die "$_p is not root-owned (re-run trust)"
    _go=$(printf '%s' "${_meta#* }" | sed 's/.*\(..\)$/\1/')
    case "$_go" in
      [0145][0145]) ;;
      *) die "$_p is group- or other-writable (re-run trust)" ;;
    esac
    [ "$_p" = / ] && break
    _p=$(dirname "$_p")
  done
}

usage() {
  die 'usage: sh deploy/install.sh <instance> [--source <dir> | --kit <kit.tar.gz> [--kit-sha256 <sha256>]] [--draft <file>] [--offline <bun zip> [<SHASUMS256.txt>]] [--mirror <https base url>] [--source-digest <sha256>] [-- <init flags>]'
}

main() {
  PATH=$HANDOVER_PATH
  export PATH
  umask 077
  refuse_host "$(id -u)" "$(uname -s)"
  [ $# -ge 1 ] || usage
  INSTANCE=$1
  shift
  printf '%s\n' "$INSTANCE" | grep -Eq "$INSTANCE_RE" || die "instance '$INSTANCE' must match $INSTANCE_RE"
  SOURCE='' DRAFT='' OFFLINE='' OFFLINE_SUMS='' MIRROR='' DIGEST_GIVEN='' KIT='' KIT_SHA_GIVEN=''
  while [ $# -gt 0 ]; do
    case "$1" in
      --source) [ $# -ge 2 ] || usage; SOURCE=$2; shift 2 ;;
      --kit) [ $# -ge 2 ] || usage; KIT=$2; shift 2 ;;
      --kit-sha256) [ $# -ge 2 ] || usage; KIT_SHA_GIVEN=$2; shift 2 ;;
      --draft) [ $# -ge 2 ] || usage; DRAFT=$2; shift 2 ;;
      --offline)
        [ $# -ge 2 ] || usage
        OFFLINE=$2
        shift 2
        if [ $# -gt 0 ]; then
          case "$1" in
            -*) ;;
            *) OFFLINE_SUMS=$1; shift ;;
          esac
        fi
        ;;
      --mirror) [ $# -ge 2 ] || usage; MIRROR=$2; shift 2 ;;
      --source-digest) [ $# -ge 2 ] || usage; DIGEST_GIVEN=$2; shift 2 ;;
      --) shift; break ;;
      *) usage ;;
    esac
  done
  # what remains in "$@" are the operator's init flags; the hand-over flags are ours alone
  for _arg in "$@"; do
    case " $HANDOVER_FLAGS " in *" $_arg "*) die "$_arg is set by install.sh itself, not after --" ;; esac
  done
  if [ -n "$KIT" ]; then
    [ -z "$SOURCE" ] || die '--kit and --source are exclusive (the kit IS the source)'
    [ -z "$DRAFT" ] || die '--kit carries its draft: drop --draft (or build a new kit from the draft you want)'
    [ -z "$DIGEST_GIVEN" ] || die '--source-digest is for --source; a kit is confirmed by --kit-sha256'
  fi
  [ -z "$KIT_SHA_GIVEN" ] || [ -n "$KIT" ] || die '--kit-sha256 needs --kit'
  if [ -n "$KIT_SHA_GIVEN" ] && ! printf '%s\n' "$KIT_SHA_GIVEN" | grep -Eqx '[0-9a-f]{64}'; then
    die '--kit-sha256 must be 64 lowercase hex (the sha256 the work host printed)'
  fi
  if [ -z "$SOURCE" ] && [ -z "$KIT" ] && { [ -n "$OFFLINE" ] || [ -n "$MIRROR" ] || [ -n "$DIGEST_GIVEN" ]; }; then
    die '--offline, --mirror and --source-digest need --source or --kit (a re-run installs no Bun)'
  fi

  for _musl in /lib/ld-musl-*; do
    [ -e "$_musl" ] && die "musl libc ($_musl): no supported Bun build"
  done
  FAMILY=$(family_of /etc/os-release) || exit 3
  refuse_kernel "$(uname -r)"
  _tools='unzip sha256sum stat find readlink runuser setsid flock'
  [ -n "$OFFLINE" ] || _tools="curl $_tools"
  [ -z "$KIT" ] || _tools="$_tools tar gzip"
  for _t in $_tools; do
    command -v "$_t" >/dev/null 2>&1 || die "missing '$_t': $(pkg_hint "$FAMILY")"
  done
  resolve_sha256
  if [ -e /sys/fs/selinux/enforce ]; then
    _ctx=$(id -Z 2>/dev/null)
    _type=$(printf '%s' "$_ctx" | cut -d: -f3)
    [ "$_type" = unconfined_t ] || die "run install.sh from an unconfined root shell (\`id -Z\` shows $_ctx)"
  fi

  STATE=$INIT_BASE/$INSTANCE
  STAGE=$STATE/$STAGE_DIR_NAME
  if [ -z "$SOURCE" ] && [ -z "$KIT" ]; then
    _rerun=$STATE/$RERUN_ENV_NAME
    if [ -L "$_rerun" ] || [ ! -f "$_rerun" ]; then die "no --source and no $_rerun: the first run needs --source <dir>"; fi
    [ "$(stat -c '%u %g %a' "$_rerun")" = '0 0 600' ] || die "$_rerun must be root:root 0600"
    [ "$(wc -l <"$_rerun" | tr -d ' ')" = 2 ] || die "$_rerun must hold exactly two lines"
    BUN=$(sed -n 's/^BUN=//p' "$_rerun")
    AGENT=$(sed -n 's/^AGENT=//p' "$_rerun")
    if ! grep -Eqx 'BUN=/[A-Za-z0-9._/-]+' "$_rerun" || ! grep -Eqx 'AGENT=/[A-Za-z0-9._/-]+' "$_rerun"; then
      die "$_rerun must hold exactly BUN=<path> and AGENT=<path>"
    fi
  fi
  if [ -z "$DRAFT" ] && [ -z "$KIT" ] && [ ! -f "/etc/dedalo_publication_host/$INSTANCE.json" ]; then
    die "first run: give the draft with --draft <file>"
  fi

  root_dir "$INIT_BASE"
  root_dir "$STATE"
  hold_install_lock "$STATE"
  root_dir "$STAGE"
  rm -rf "$STAGE" || die "cannot clear $STAGE"
  mkdir -m 0700 "$STAGE" || die "cannot create $STAGE"
  if ! : >"$STAGE/$EMPTY_BUNFIG_NAME" || ! chmod 0600 "$STAGE/$EMPTY_BUNFIG_NAME"; then die 'cannot write the empty bunfig'; fi

  if [ -n "$DRAFT" ]; then
    if [ -L "$DRAFT" ] || [ ! -f "$DRAFT" ]; then die "--draft $DRAFT must be a regular file (not a symlink)"; fi
    _meta=$(stat -c '%u %a' "$DRAFT")
    [ "${_meta%% *}" = 0 ] || die "--draft $DRAFT must be root-owned"
    _go=$(printf '%s' "${_meta#* }" | sed 's/.*\(..\)$/\1/')
    case "$_go" in [0145][0145]) ;; *) die "--draft $DRAFT is group- or other-writable" ;; esac
    if ! cp "$DRAFT" "$STAGE/draft.json" || ! chmod 0600 "$STAGE/draft.json"; then die 'cannot copy the draft'; fi
  fi

  if [ -n "$KIT" ]; then
    if [ -L "$KIT" ] || [ ! -f "$KIT" ]; then die "--kit $KIT must be a regular file (not a symlink)"; fi
    # The hash is taken of root's OWN copy: what is verified is what is read.
    _kitcopy=$STAGE/kit.tar.gz
    cp "$KIT" "$_kitcopy" || die "cannot copy $KIT"
    KIT_SHA=$(sha_of "$_kitcopy")
    if [ -n "$KIT_SHA_GIVEN" ]; then
      [ "$KIT_SHA_GIVEN" = "$KIT_SHA" ] ||
        die "the kit $KIT has sha256 $KIT_SHA, not the --kit-sha256 $KIT_SHA_GIVEN the work host printed: refusing it (nothing was extracted)"
    elif [ -t 0 ] && [ -t 1 ]; then
      printf 'Kit %s (sha256 %s): compare it with the sha256 the work host printed. Its code will run as root. Continue? [y/N] ' "$KIT" "$KIT_SHA"
      read -r _answer || _answer=''
      case "$_answer" in y | Y | yes | YES) ;; *) die 'declined: nothing was extracted' ;; esac
    else
      die "not a terminal: confirm the kit with --kit-sha256 <the sha256 the work host printed> (this file is $KIT_SHA)"
    fi
    tar -tzf "$_kitcopy" >"$STAGE/kit.list" || die 'the kit is not a gzip-compressed tar archive'
    kit_names_ok "$STAGE/kit.list"
    tar -tvzf "$_kitcopy" >"$STAGE/kit.vlist" || die 'the kit is not a gzip-compressed tar archive'
    kit_types_ok "$STAGE/kit.vlist"
    mkdir -m 0700 "$STAGE/kit" || die 'cannot create the kit stage'
    tar -xzf "$_kitcopy" -C "$STAGE/kit" --no-same-owner --no-same-permissions || die 'tar could not extract the kit'
    verify_kit "$STAGE/kit"
    mv "$STAGE/kit/$KIT_SOURCE_DIR" "$STAGE/source" || die 'cannot stage the kit source'
    if ! cp "$STAGE/kit/$KIT_DRAFT_NAME" "$STAGE/draft.json" || ! chmod 0600 "$STAGE/draft.json"; then die "cannot stage the kit's draft"; fi
    DRAFT=$KIT
    rm -rf "$STAGE/kit" "$STAGE/kit.list" "$STAGE/kit.vlist" "$_kitcopy" || die 'cannot clear the kit stage'
    printf 'kit %s: sha256 %s, MANIFEST verified\n' "$KIT" "$KIT_SHA"
  fi

  if [ -n "$SOURCE" ]; then
    [ -d "$SOURCE" ] || die "--source $SOURCE is not a directory"
    SOURCE=$(cd "$SOURCE" && pwd -P) || die "cannot enter $SOURCE"
    mkdir -m 0700 "$STAGE/source" || die 'cannot create the staged source'
    for _entry in $SOURCE_MANIFEST; do
      _path=${_entry%:*}
      _kind=${_entry##*:}
      if [ ! -e "$SOURCE/$_path" ] && [ ! -L "$SOURCE/$_path" ]; then
        case " $SOURCE_OPTIONAL " in *" $_path "*) continue ;; esac
        die "the source lacks $_path"
      fi
      mkdir -p "$STAGE/source/$(dirname "$_path")" || die "cannot stage $_path"
      if [ "$_kind" = tree ]; then
        if [ -L "$SOURCE/$_path" ] || [ ! -d "$SOURCE/$_path" ]; then die "$_path must be a real directory"; fi
        mkdir -m 0700 "$STAGE/source/$_path" || die "cannot stage $_path"
        for _child in "$SOURCE/$_path"/* "$SOURCE/$_path"/.[!.]* "$SOURCE/$_path"/..?*; do
          [ -e "$_child" ] || [ -L "$_child" ] || continue
          _rel=$_path/${_child##*/}
          case " $SOURCE_EXCLUDES " in *" $_rel "*) continue ;; esac
          cp -RP "$_child" "$STAGE/source/$_path/" || die "cannot copy $_rel"
        done
      else
        if [ -L "$SOURCE/$_path" ] || [ ! -f "$SOURCE/$_path" ]; then die "$_path must be a regular file"; fi
        cp -P "$SOURCE/$_path" "$STAGE/source/$_path" || die "cannot copy $_path"
      fi
    done
  fi

  if [ -n "$SOURCE" ] || [ -n "$KIT" ]; then
    check_tree "$STAGE/source"
    chown -R root:root "$STAGE/source" || die 'cannot chown the staged source'
    chmod -R u=rwX,go=rX,-s "$STAGE/source" || die 'cannot chmod the staged source'

    DIGEST=$(tree_digest "$STAGE/source") || exit 3
  fi

  if [ -n "$SOURCE" ]; then
    _owner=$(stat -c '%U' "$SOURCE")
    if [ -d "$SOURCE/.git" ] && command -v git >/dev/null 2>&1; then
      _head=$(runuser -u "$_owner" -- git -C "$SOURCE" rev-parse HEAD 2>/dev/null)
      _dirty=$(runuser -u "$_owner" -- git -C "$SOURCE" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
      printf 'source %s: git %s, %s uncommitted change(s)\n' "$SOURCE" "${_head:-unknown}" "${_dirty:-?}"
    fi
    if [ -t 0 ] && [ -t 1 ]; then
      printf 'Code from %s (digest %s) will run as root. Continue? [y/N] ' "$SOURCE" "$DIGEST"
      read -r _answer || _answer=''
      case "$_answer" in y | Y | yes | YES) ;; *) die 'declined: nothing was run' ;; esac
    else
      [ "$DIGEST_GIVEN" = "$DIGEST" ] || die "not a terminal: confirm the source with --source-digest $DIGEST"
    fi
  fi

  if [ -n "$SOURCE" ] || [ -n "$KIT" ]; then
    PIN=$(cat "$STAGE/source/.bun-version")
    if [ "$(wc -l <"$STAGE/source/.bun-version" | tr -d ' ')" -gt 1 ] || ! printf '%s\n' "$PIN" | grep -Eq "$PIN_RE"; then
      die ".bun-version '$PIN' is not <major>.<minor>.<patch>"
    fi
    ASSET=$(pick_asset "$(uname -m)" /proc/cpuinfo) || exit 3
    mkdir -m 0700 "$STAGE/bun" || die 'cannot create the Bun stage'
    ZIP=$STAGE/bun/$ASSET.zip
    SUMS=$STAGE/bun/SHASUMS256.txt
    if [ -n "$OFFLINE" ]; then
      cp "$OFFLINE" "$ZIP" || die "cannot copy $OFFLINE"
      if [ -n "$OFFLINE_SUMS" ]; then cp "$OFFLINE_SUMS" "$SUMS" || die "cannot copy $OFFLINE_SUMS"; else SUMS=-; fi
    else
      BASE=${MIRROR:-$BUN_RELEASE_BASE}
      case "$BASE" in https://*) ;; *) die '--mirror must start with https://' ;; esac
      curl -fsSL --proto =https --proto-redir =https --tlsv1.2 --max-filesize 200000000 \
        -o "$ZIP" "$BASE/bun-v$PIN/$ASSET.zip" || die "download of $ASSET.zip failed"
      curl -fsSL --proto =https --proto-redir =https --tlsv1.2 --max-filesize 1000000 \
        -o "$SUMS" "$BASE/bun-v$PIN/SHASUMS256.txt" || die 'download of SHASUMS256.txt failed'
    fi
    verify_bun "$ZIP" "$SUMS" "$ASSET" "$PIN" "$STAGE/source/.bun-sha256" "$STAGE/bun"
    BUNX=$STAGE/bun/bun
    ENTRY=$STAGE/source/$ENTRY_REL
    [ "$SUMS" = - ] || set -- --bun-sums "$SUMS" "$@"
    set -- --source "$STAGE/source" --source-digest-confirmed "$DIGEST" --bun-archive "$ZIP" "$@"
  else
    if printf '%s\n%s\n' "$BUN" "$AGENT" | grep -Evq "$SAFE_PATH_RE"; then die 'rerun.env paths are not clean'; fi
    trusted_chain "$BUN"
    trusted_chain "$AGENT"
    [ -f "$BUN" ] || die "$BUN is not a regular file"
    BUNX=$BUN
    ENTRY=$AGENT/src/provision/cli.ts
  fi
  [ -z "$DRAFT" ] || set -- --draft "$STAGE/draft.json" "$@"

  cd "$STAGE" || die "cannot enter $STAGE"
  # --config=<file> ONLY: measured on bun 1.4.2, `-c <file>` takes <file> as the ENTRY (nothing
  # of ours runs) and `-c=<file>` still loads $cwd/bunfig.toml (a preload there runs) — only the
  # long form replaces the cwd bunfig. tests/init_install_sh.test.ts pins this spelling.
  # shellcheck disable=SC2086 # BUN_HANDOVER_FLAGS is a constant list of flags
  exec env -i PATH=$HANDOVER_PATH HOME=/root LC_ALL=C \
    "$BUNX" $BUN_HANDOVER_FLAGS --config="$STAGE/$EMPTY_BUNFIG_NAME" "$ENTRY" init "$INSTANCE" "$@"
}

if [ "${1:-}" = --lib ]; then
  resolve_sha256
else
  main "$@"
fi
