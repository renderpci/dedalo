/**
 * Builds a sixbid image-cdn URL from a lot's `googleBucketImagePath` at the given size. Defaults
 * to "o" (original) - confirmed live that "l" (large) is a meaningfully downsized/recompressed
 * variant (~41KB vs "o"'s ~107KB for the same lot), not full quality, and this archive should
 * preserve the same image quality sixbid itself shows.
 */
export function sixbidImageUrl(bucketPath: string, size: 's' | 'm' | 'l' | 'o' = 'o'): string {
	return `https://image-cdn.sixbid.com/v7/lots/${bucketPath}?p=lot_${size}`;
}
