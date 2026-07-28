#!/usr/bin/env bash
# dev_instance.sh — start a Dédalo TS/Bun instance with a custom config overlay.
#
# Same source tree, same Postgres, same ../private/.env — this only overrides
# the three things that collide when a SECOND instance runs beside the default
# one. Env vars win over ../private/.env (src/config/env.ts precedence), so no
# file is touched: the overlay lives only in this process.
#
# What collides, and what this overrides:
#   1. SERVER_UNIX_SOCKET — hard-guarded (server.ts probes it live; a 2nd instance
#      exits FATAL rather than steal it). Always distinct here.
#   2. SERVER_TCP_PORT    — the browser-reachable dev listener. Always distinct.
#   3. DEDALO_SESSION_DB_PATH — shared by default (SQLite handles concurrency, so
#      one login is honored by both instances = the zero-conflict path). Split it
#      only with --isolated, and see the COOKIE-DOMAIN trap below.
#
# COOKIE-DOMAIN trap (--isolated): the session cookie (dedalo_ts_session) is NOT
# port-scoped — the browser sends it to every port on the same hostname. So an
# isolated store on the SAME hostname makes the single cookie valid on one
# instance and rejected by the other → login churn. To get two independent
# logins in one browser, reach the instances by DIFFERENT hostnames (e.g. the
# default on localhost, this one on 127.0.0.1). --isolated prints this reminder.
#
#   scripts/dev_instance.sh [-n name] [-p port] [-s socket] [-d session_db]
#                           [--isolated] [--no-css] [-- <extra args to bun run>]
#
# Examples:
#   scripts/dev_instance.sh                     # 2nd instance: :4001, shared login
#   scripts/dev_instance.sh -n beta -p 4002     # named, own socket, shared login
#   scripts/dev_instance.sh --isolated          # own session store (see trap above)
#   scripts/dev_instance.sh --no-css            # lean: supervised server, no LESS watcher

set -euo pipefail

name="alt"
port="4001"
socket=""
session_db=""
isolated="false"
css="true"
extra=()

while [ $# -gt 0 ]; do
	case "$1" in
		-n|--name)       name="${2:?-n needs a name}"; shift 2 ;;
		-p|--port)       port="${2:?-p needs a port}"; shift 2 ;;
		-s|--socket)     socket="${2:?-s needs a path}"; shift 2 ;;
		-d|--session-db) session_db="${2:?-d needs a path}"; shift 2 ;;
		--isolated)      isolated="true"; shift ;;
		--no-css)        css="false"; shift ;;
		--)              shift; extra=("$@"); break ;;
		-h|--help)       sed -n '2,34p' "$0"; exit 0 ;;
		*) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
	esac
done

# Derive the socket from the name unless one was given explicitly.
socket="${socket:-/tmp/dedalo_ts_${name}.sock}"

# --isolated implies an own session store; an explicit -d does too.
if [ "$isolated" = "true" ] && [ -z "$session_db" ]; then
	session_db="/tmp/dedalo_ts_sessions_${name}.sqlite"
fi

export SERVER_UNIX_SOCKET="$socket"
export SERVER_TCP_PORT="$port"
if [ -n "$session_db" ]; then
	export DEDALO_SESSION_DB_PATH="$session_db"
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

echo "[dev_instance] name=${name}"
echo "[dev_instance] SERVER_UNIX_SOCKET=${SERVER_UNIX_SOCKET}"
echo "[dev_instance] SERVER_TCP_PORT=${SERVER_TCP_PORT}  ->  http://localhost:${port}/dedalo/core/page/"
if [ -n "$session_db" ]; then
	echo "[dev_instance] DEDALO_SESSION_DB_PATH=${DEDALO_SESSION_DB_PATH}  (isolated sessions)"
	echo "[dev_instance] NOTE: reach THIS instance by a different hostname than the other"
	echo "[dev_instance]       (e.g. 127.0.0.1 here vs localhost there) or the shared"
	echo "[dev_instance]       dedalo_ts_session cookie will churn between them."
else
	echo "[dev_instance] session store: SHARED (one login works on both instances)"
fi

# Delegate to the existing npm scripts — never re-implement the exit-75 install
# restart supervisor here (scripts/dev.ts owns it; install_restart_supervisor_
# tripwire.test.ts guards against stale copies of that logic).
#   dev            = CSS watcher + supervised, hot-reloading server (full loop).
#   start:supervised = supervised server only, no LESS watcher (lean 2nd instance;
#                      the primary's watcher already rebuilds the shared main.css).
# ${extra[@]+...} guard: bash 3.2 (macOS default) treats an empty array under
# `set -u` as unbound and aborts; this expands to nothing when there are no
# passthrough args, and to the args otherwise.
if [ "$css" = "true" ]; then
	exec bun run dev ${extra[@]+"${extra[@]}"}
else
	exec bun run start:supervised ${extra[@]+"${extra[@]}"}
fi
