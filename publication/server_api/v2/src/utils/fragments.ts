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
export function splitTerms(terms: string): string[] {
  const words = terms.split(/\s+/).filter(Boolean);

  for (const word of words) {
    if (word.length > MAX_TERM_LENGTH) {
      throw new ValidationError(`Search term too long (max ${MAX_TERM_LENGTH} characters): "${word.slice(0, 32)}..."`);
    }
  }

  return words.slice(0, MAX_FRAGMENT_TERMS);
}

// Extracts highlighted context fragments around each term occurrence.
// Terms are regex-escaped (matched literally) and the scanned text is capped
// at MAX_SCAN_LENGTH to bound CPU on very large transcriptions.
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
    const regex = new RegExp(escaped, 'gi');
    const highlighter = new RegExp(`(${escaped})`, 'gi');
    let match: RegExpExecArray | null;
    let count = 0;

    while ((match = regex.exec(scanText)) !== null && count < maxOccurrences) {
      const start = Math.max(0, match.index - maxChars / 2);
      const end = Math.min(scanText.length, match.index + match[0].length + maxChars / 2);

      let fragment = scanText.slice(start, end);
      if (start > 0) fragment = '...' + fragment;
      if (end < scanText.length) fragment = fragment + '...';

      fragment = fragment.replace(highlighter, '<mark>$1</mark>');

      fragments.push({ text: fragment, position: match.index });
      count++;
    }
  }

  return fragments;
}

// Returns the last [page-n-X] tag before the given position, if any.
export function pageAtPosition(text: string, position: number): number | undefined {
  const pattern = new RegExp(PAGE_TAG_PATTERN.source, 'g');
  let page: number | undefined;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > position) break;
    page = parseInt(match[1], 10);
  }

  return page;
}

// Returns the [tc-in-out] timecode range covering the given position.
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
