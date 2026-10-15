/**
 * ONE REVIEW BUILD'S MEASUREMENT (campaign C3i-F2, 2026-10-15) — what the
 * session hands both of its Review hooks (hostCommands, preflightRefusals) for
 * one Review build: a slow read-only measurement both of them need (the
 * official image's registry probe) runs ONCE per build, and says what it is
 * waiting for while it waits.
 *
 *  - `once(key, run)`: the first call runs; every later call with the same key
 *    in THIS scope gets the same answer. A scope lives for one build only — a
 *    Review built again (after `back`, an edit, `install` on a refused Review,
 *    the typed `yes`) gets a NEW scope and measures again (campaign 3c D18: a
 *    re-check never shows a cached verdict);
 *  - `say(line)`: a progress line (`checking …`) on the operator's screen —
 *    the full-screen UI draws it with the running mark, plain mode prints it.
 */

export interface ReviewMeasure {
	once<T>(key: string, run: () => Promise<T>): Promise<T>;
	say(line: string): void;
}

/** A fresh scope for one Review build; `say` reaches the operator's screen. */
export function reviewMeasure(say: (line: string) => void): ReviewMeasure {
	const answers = new Map<string, Promise<unknown>>();
	return {
		once: <T>(key: string, run: () => Promise<T>): Promise<T> => {
			const known = answers.get(key);
			if (known !== undefined) return known as Promise<T>;
			const answer = run();
			answers.set(key, answer);
			return answer;
		},
		say,
	};
}
