/**
 * THE TEMP-SIBLING NAME of every temp+rename write outside the media tree
 * (diffusion's atomicWriteFile, tool_export's export store): `<final>.tmp-<base36>`
 * in the SAME directory — same filesystem, so the rename is atomic. A kernel
 * helper so neither subsystem imports the other's internals for it; tool_export's
 * sweep recognizes a leftover with isTempSibling below — the ONE definition of
 * the suffix, so a change to the name cannot leave the sweep matching an old
 * spelling (gate: test/unit/temp_path_native.test.ts). The media tree has its own, extension-preserving rule
 * (core/media/atomic.ts tempSibling: ImageMagick infers the format from it).
 */

/** A sibling temp path for `finalPath` (same dir ⇒ same filesystem ⇒ atomic rename). */
export function tempPathFor(finalPath: string): string {
	const random = Math.random().toString(36).slice(2, 10);
	return `${finalPath}.tmp-${random}`;
}

/** The suffix tempPathFor appends; kept next to it so the two cannot drift. */
const TEMP_SUFFIX_PATTERN = /\.tmp-[a-z0-9]+$/;

/** True when `name` (a basename or a path) is a temp sibling tempPathFor produced. */
export function isTempSibling(name: string): boolean {
	return TEMP_SUFFIX_PATTERN.test(name);
}
