#!/usr/bin/env bash
# new_session.sh — isolated files for a parallel Claude Code session.
#
# Creates a sibling git worktree on its own branch (separate working files,
# shared .git history) and copies the gitignored rewrite/ ledgers into it.
# Nothing else is isolated: same ../private/.env, same Postgres — so the
# scratch-only-DB-writes rule still applies across every worktree.
#
#   scripts/new_session.sh <name> [base-branch]   # default base: v7

set -euo pipefail

name="${1:?usage: new_session.sh <name> [base-branch]}"
base="${2:-v7}"

repo_root="$(git rev-parse --show-toplevel)"
wt="$(dirname "$repo_root")/md-$name"
branch="v7-$name"

if git -C "$repo_root" show-ref --verify --quiet "refs/heads/$branch"; then
	git -C "$repo_root" worktree add "$wt" "$branch"          # branch exists → reuse
else
	git -C "$repo_root" worktree add "$wt" -b "$branch" "$base"
fi

# rewrite/ is gitignored, so a fresh worktree won't have the ledgers — carry them over.
[ -d "$repo_root/rewrite" ] && cp -R "$repo_root/rewrite" "$wt/rewrite"

cat <<EOF

worktree : $wt
branch   : $branch (from $base)

  cd $wt && claude        # start the session here
  git worktree remove $wt # tear down when done
EOF
