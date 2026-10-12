/**
 * QUOTING for what the host steps SHOW and WRITE (terminal installer phase 4,
 * 2026-10-12): an argv as a POSIX shell line (the Review, the transcript —
 * display only, nothing is ever run through a shell), and a value inside a
 * systemd unit (`Environment="KEY=value"` — campaign 2 L8: an unquoted
 * Environment= value with a space was split into two assignments and the
 * backup store list was truncated, yet the run reported success).
 */

/** One argv token as a POSIX shell word (display only). */
export function shellWord(token: string): string {
	return /^[A-Za-z0-9_./:=,@%+-]+$/.test(token) ? token : `'${token.replace(/'/g, `'\\''`)}'`;
}

/** An argv as one shell line (display only). */
export function shellLine(argv: readonly string[]): string {
	return argv.map(shellWord).join(' ');
}

/**
 * A systemd assignment value in double quotes (systemd.syntax(7): `\` and `"`
 * escaped, `%` doubled so no specifier expands). A newline is refused by the
 * caller's validation long before this (an answer never carries one).
 */
export function systemdQuoted(value: string): string {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%')}"`;
}

/**
 * `Environment="KEY=value"` — every Environment= line the installer writes,
 * quoted. (An entry object, not `(key, value)`: these keys are WRITTEN into a
 * unit, and the config census reads a call's leading key literal as a read.)
 */
export function systemdEnvironment(entry: { key: string; value: string }): string {
	return `Environment=${systemdQuoted(`${entry.key}=${entry.value}`)}`;
}
