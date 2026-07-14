/**
 * Highlight extraction over published text: given a transcription and the words a
 * client searched for, return the passages around each hit, `<mark>`-tagged, and
 * locate each hit within Dédalo's inline markers.
 *
 * Everything here operates on two pieces of hostile-by-assumption input — a text
 * that can be a book-length transcription, and terms typed by an anonymous caller —
 * so the module is written around BOUNDS rather than around features. All three
 * come from constants.ts and multiply into the cost of one request:
 *
 *   - MAX_SCAN_LENGTH caps the text actually scanned (the first 1 MB);
 *   - MAX_FRAGMENT_TERMS caps how many separate regex passes that text gets;
 *   - MAX_TERM_LENGTH rejects a term no human would type.
 *
 * Take any of them away and a single cheap GET buys an arbitrary amount of CPU.
 * The terms themselves are regex-ESCAPED before use (utils/regex): they are data to
 * be found literally, never a pattern the caller gets to author.
 *
 * The markers this module reads are Dédalo's, written inline into the published
 * text by the diffusion process: `[page-n-N]` marks the start of a printed page and
 * `[tc-in-out]` the start of a timecoded speech segment. Neither delimits a region,
 * they only ANNOUNCE one, which is why both lookups below work by scanning forward
 * and keeping the last marker at or before the position of interest.
 */

import { escapeRegExp } from './regex';
import { ValidationError } from '../errors';
import { MAX_FRAGMENT_TERMS, MAX_TERM_LENGTH, MAX_SCAN_LENGTH, TC_TAG_PATTERN, PAGE_TAG_PATTERN } from '../constants';

export interface RawFragment {
  text: string;
  position: number;
}

// Splits a terms string into bounded search words. Extra words beyond
// MAX_FRAGMENT_TERMS are ignored; oversized words are rejected because they
// indicate abuse rather than a real search.
//
// The two bounds fail differently on purpose: too MANY words is a plausible thing
// for an honest client to send, so the surplus is dropped silently; a single
// 64+-character "word" is not, so it is a 400.
export function splitTerms(terms: string): string[] {
  const words = terms.split(/\s+/).filter(Boolean);

  for (const word of words) {
    if (word.length > MAX_TERM_LENGTH) {
      throw new ValidationError(`Search term too long (max ${MAX_TERM_LENGTH} characters): "${word.slice(0, 32)}..."`);
    }
  }

  return words.slice(0, MAX_FRAGMENT_TERMS);
}

/**
 * Extracts highlighted context fragments around each term occurrence.
 * Terms are regex-escaped (matched literally) and the scanned text is capped
 * at MAX_SCAN_LENGTH to bound CPU on very large transcriptions.
 *
 * Two properties callers depend on:
 *
 * - `position` is an offset into the ORIGINAL text, not into the returned excerpt
 *   and not into the truncated scan window. That holds because the window is a
 *   PREFIX of the text, so offsets coincide — which is what lets search.service
 *   feed these positions straight back to pageAtPosition/timecodesAtPosition
 *   against the full text.
 * - Results are grouped by term, in term order, then by occurrence — they are NOT
 *   sorted by position, and two terms that hit near each other yield two
 *   overlapping fragments rather than one merged passage.
 */
export function extractFragments(
  text: string,
  terms: string,
  maxChars: number,
  maxOccurrences: number,
): RawFragment[] {
  const scanText = text.length > MAX_SCAN_LENGTH ? text.slice(0, MAX_SCAN_LENGTH) : text;
  const words = splitTerms(terms);
  const fragments: RawFragment[] = [];

  for (const word of words) {
    const escaped = escapeRegExp(word);
    // Two regexes from the same escaped word: `regex` walks the text (its `lastIndex`
    // advances across exec calls, which is what makes the loop terminate), while
    // `highlighter` re-finds the term inside one small excerpt. Sharing a single /g
    // regex for both would have the excerpt's scan clobber the text scan's position.
    const regex = new RegExp(escaped, 'gi');
    const highlighter = new RegExp(`(${escaped})`, 'gi');
    let match: RegExpExecArray | null;
    let count = 0;

    while ((match = regex.exec(scanText)) !== null && count < maxOccurrences) {
      // The excerpt is centred on the hit: half the budget of context each side,
      // clamped to the text. The ellipses then say, honestly, which side was cut.
      const start = Math.max(0, match.index - maxChars / 2);
      const end = Math.min(scanText.length, match.index + match[0].length + maxChars / 2);

      let fragment = scanText.slice(start, end);
      if (start > 0) fragment = '...' + fragment;
      if (end < scanText.length) fragment = fragment + '...';

      // Highlighting happens AFTER slicing, over the excerpt only — the alternative
      // (mark the whole text, then cut) would rewrite a megabyte per term. `$1`
      // re-emits the matched text as found, preserving the source's own casing even
      // though the match itself is case-insensitive.
      fragment = fragment.replace(highlighter, '<mark>$1</mark>');

      fragments.push({ text: fragment, position: match.index });
      count++;
    }
  }

  return fragments;
}

/**
 * Returns the last [page-n-X] tag before the given position, if any.
 *
 * `undefined` (not 0) when the position precedes every marker, or the text carries
 * none at all — a text with no page markers is normal, and reporting "page 0" would
 * be a fact the source never asserted.
 */
export function pageAtPosition(text: string, position: number): number | undefined {
  // Rebuilt from `.source` per call rather than reusing the /g constant: a global
  // regex carries a mutable `lastIndex`, so a shared instance would make each call's
  // result depend on where the previous one stopped.
  const pattern = new RegExp(PAGE_TAG_PATTERN.source, 'g');
  let page: number | undefined;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Markers announce what FOLLOWS them, so the answer is the last one at or before
    // the position; once the scan passes it, nothing later can change the answer.
    if (match.index > position) break;
    page = parseInt(match[1], 10);
  }

  return page;
}

/**
 * Returns the [tc-in-out] timecode range covering the given position.
 *
 * Zeroes when no marker precedes the position — an un-timecoded passage yields a
 * media URL that simply starts at the beginning, which is why this returns a range
 * rather than an optional (compare pageAtPosition, where the absence is meaningful).
 */
export function timecodesAtPosition(text: string, position: number): { tcIn: number; tcOut: number } {
  const pattern = new RegExp(TC_TAG_PATTERN.source, 'g');
  let tcIn = 0;
  let tcOut = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > position) break;
    tcIn = parseFloat(match[1]);
    tcOut = parseFloat(match[2]);
  }

  return { tcIn, tcOut };
}
