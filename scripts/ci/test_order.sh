#!/usr/bin/env bash
#
# TEST-FILE ORDER for the shell tiers — the bash twin of scripts/lib/test_order.ts
# (read its header for the measurement). In short, on the pinned bun:
#   `bun test a.test.ts b.test.ts`     bare names are SUBSTRING FILTERS, run in raw
#                                      readdir order — which differs per host filesystem;
#   `bun test ./a.test.ts ./b.test.ts` PATH mode, run in argv order;
#   a missing `./path` is dropped SILENTLY.
# So a tier never hands bun its array as-is: `order_test_paths "${ARR[@]}"` fills
# TEST_ORDER_PATHS with the codepoint-sorted (LC_ALL=C), de-duplicated, `./`-prefixed
# list, and RETURNS NON-ZERO (printing the culprits) when an entry is not a file.
# Gate: test/unit/tier_file_order_tripwire.test.ts. Sourced; bash 3.2-safe (no mapfile).

TEST_ORDER_PATHS=()

order_test_paths() {
	TEST_ORDER_PATHS=()
	local f missing=0
	while IFS= read -r f; do
		[ -n "$f" ] || continue
		if [ ! -f "$f" ]; then
			echo "test_order: '$f' is not a file — bun would drop it silently" >&2
			missing=1
			continue
		fi
		TEST_ORDER_PATHS+=("./${f#./}")
	done < <(printf '%s\n' "$@" | sed 's#^\./##' | LC_ALL=C sort -u)
	[ "$missing" -eq 0 ]
}
