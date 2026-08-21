/**
 * sanitizePublishedFileName (src/core/diffusion_bridge/diffusion_delete.ts)
 * — the PHP sanitize_file_name + beautify port that names every published
 * rdf/xml/markdown file on disk. It is the ONLY thing standing between an
 * ontology-supplied name (a term, an owl:Class name, a section tipo) and a
 * filesystem path that `unlinkPublishedFiles` will `unlink()`, so it is
 * BOTH a formatting contract and a path-traversal chokepoint.
 *
 * Before this file the whole function had ONE assertion (the nmo: case in
 * diffusion_delete.test.ts). The six rewrite steps of the pipeline are
 * independent regressions waiting to happen — drop any one of them and the
 * published file name changes, which silently orphans already-published
 * files (delete looks for a name nothing was ever written under). Each
 * group below pins one step so a mutation of that step goes RED here.
 *
 * All expectations are MEASURED against the implementation, not guessed:
 * note that accents are DROPPED, not transliterated ('Técnica' → 'tcnica'),
 * and that separators around dots collapse INTO the dot.
 *
 * Pure logic: no DB, no network, no filesystem.
 */
// Migrated to the generic `test` TLD 2026-08-19: the filename grammar is pure string
// work — the sample name now carries a test-TLD section tipo.

import { describe, expect, test } from 'bun:test';
import { sanitizePublishedFileName } from '../../src/core/diffusion_bridge/diffusion_delete.ts';

describe('sanitizePublishedFileName', () => {
	describe('step 1 — disallowed characters are DELETED, not dashed', () => {
		// The first pass strips anything outside [\w\s\d\-_~,;[\]().] outright.
		// Regression this catches: turning the strip into a dash replacement
		// (the "obvious" simplification) renames every published rdf file —
		// the live nmo: case would become 'nmo-typeseriesitem-…'.
		test('a colon vanishes rather than becoming a separator', () => {
			expect(sanitizePublishedFileName('nmo:TypeSeriesItem_test6099_15657')).toBe(
				'nmotypeseriesitem-test6099-15657',
			);
			expect(sanitizePublishedFileName('nmo:x')).toBe('nmox');
		});

		test('non-ASCII letters are DROPPED, never transliterated', () => {
			// \w is ASCII-only under this regex, so accented letters do not
			// survive step 1 at all. Catches a "fix" that adds NFD folding or
			// a unicode-aware \w — both would rename existing published files.
			expect(sanitizePublishedFileName('Ficha  Técnica')).toBe('ficha-tcnica');
			expect(sanitizePublishedFileName('café.jpg')).toBe('caf.jpg');
			expect(sanitizePublishedFileName('sección Año 2000.xml')).toBe('seccin-ao-2000.xml');
		});

		test('path separators are removed outright', () => {
			expect(sanitizePublishedFileName('2000/01/02')).toBe('20000102');
			expect(sanitizePublishedFileName('\\\\server\\share\\f.txt')).toBe('serversharef.txt');
		});
	});

	describe('step 2 — dot runs are erased before the dot is treated as an extension mark', () => {
		// '..' collapses to nothing (NOT to a single dot) at this stage; the
		// later '.{2,}' → '.' pass only sees dots created afterwards. If step 2
		// is deleted, 'a..b' comes out 'a.b' instead of 'ab' — and, worse, a
		// traversal segment survives into the path.
		test('an interior dot run disappears entirely', () => {
			expect(sanitizePublishedFileName('a..b')).toBe('ab');
			expect(sanitizePublishedFileName('xxxxx..y')).toBe('xxxxxy');
		});

		test('a single dot is preserved as an extension separator', () => {
			expect(sanitizePublishedFileName('file.name.txt')).toBe('file.name.txt');
			expect(sanitizePublishedFileName('a.b')).toBe('a.b');
		});
	});

	describe('step 3/4 — lowercasing and separator collapsing', () => {
		test('everything is lowercased', () => {
			expect(sanitizePublishedFileName('MAYÚSCULAS')).toBe('maysculas');
		});

		test('spaces, tabs, newlines and underscores all become one dash', () => {
			// The word-separator classes are three different rewrites in the
			// source; a case per shape so dropping any one reddens.
			expect(sanitizePublishedFileName('a_b c')).toBe('a-b-c');
			expect(sanitizePublishedFileName('A B_C-D')).toBe('a-b-c-d');
			expect(sanitizePublishedFileName('a\tb\nc')).toBe('a-b-c');
			expect(sanitizePublishedFileName('über_ding')).toBe('ber-ding');
		});

		test('dash runs collapse to a single dash', () => {
			// NOTE: step 4's `[\s_]+` and `-+` passes are provably dead — step
			// 3's `[^a-z0-9.]+` is already greedy, so it emits one dash per run
			// and leaves no whitespace or underscore behind. Removing step 4
			// changes no output; this case pins the collapsed *behaviour*, which
			// is what the published file name depends on, not the pass that
			// happens to implement it.
			expect(sanitizePublishedFileName('---a---b---')).toBe('a-b');
		});

		test('the punctuation kept by step 1 still becomes separators here', () => {
			// ~ [ ] ( ) , ; survive step 1 but are not [a-z0-9.], so they dash
			// out — proving step 1's allowlist is a *survival* list, not an
			// output list.
			expect(sanitizePublishedFileName('~file[1](2),3;4.txt')).toBe('file-1-2-3-4.txt');
		});
	});

	describe('step 5 — dashes adjacent to a dot collapse into the dot', () => {
		// '-.' / '.-' / '-.-' all normalise to '.', then any dot pair created
		// by that collapse is deduped. Without the second '.{2,}' → '.' pass
		// 'a.-.b' would come out 'a..b' (an illegal double extension mark).
		test('a separator before an extension dot is absorbed', () => {
			expect(sanitizePublishedFileName('doc v2 .pdf')).toBe('doc-v2.pdf');
			expect(sanitizePublishedFileName('a .b')).toBe('a.b');
			expect(sanitizePublishedFileName('a-.b')).toBe('a.b');
			expect(sanitizePublishedFileName('a.-b')).toBe('a.b');
		});

		test('dots re-adjacent after the collapse are deduped', () => {
			expect(sanitizePublishedFileName('a.-.b')).toBe('a.b');
			expect(sanitizePublishedFileName('a. .b')).toBe('a.b');
		});
	});

	describe('step 6 — leading/trailing dashes and dots are trimmed', () => {
		// A leading dot would publish a hidden file; a trailing dot is invalid
		// on some filesystems. Both must be gone.
		test('hidden-file and trailing-dot shapes are normalised', () => {
			expect(sanitizePublishedFileName('.hidden')).toBe('hidden');
			expect(sanitizePublishedFileName('trailing.')).toBe('trailing');
		});

		test('names made only of separators reduce to the empty string', () => {
			// The empty result is the caller's signal that the ontology gave no
			// usable name — it must never degrade to '-' or '.'.
			expect(sanitizePublishedFileName('.')).toBe('');
			expect(sanitizePublishedFileName('-')).toBe('');
			expect(sanitizePublishedFileName('_')).toBe('');
			expect(sanitizePublishedFileName('----')).toBe('');
			expect(sanitizePublishedFileName('...')).toBe('');
			expect(sanitizePublishedFileName('.-.-.')).toBe('');
			expect(sanitizePublishedFileName('  ')).toBe('');
		});

		test('the empty input is returned unchanged', () => {
			expect(sanitizePublishedFileName('')).toBe('');
		});
	});

	describe('path-traversal chokepoint (the security reason this function exists)', () => {
		// unlinkPublishedFiles interpolates the result into MEDIA_PATH/... and
		// unlinks it. A surviving '/' or '..' segment would let an ontology
		// term delete files outside the publication tree. Asserted as a
		// property over the whole hostile corpus so a new escape shape added
		// later is still covered by this one test.
		const hostile = [
			'..',
			'../../etc/passwd',
			'a/../../b',
			'..%2f..',
			'%2e%2e%2f',
			'....//....',
			'/etc/passwd',
			'..\\..\\windows\\system32',
			'~/.ssh/id_rsa',
			'a/./b',
			'....',
		];

		test('no output ever contains a path separator or a traversal segment', () => {
			for (const input of hostile) {
				const out = sanitizePublishedFileName(input);
				expect(out).not.toContain('/');
				expect(out).not.toContain('\\');
				expect(out).not.toContain('..');
				// '..' as a whole segment, defensively, in case a future
				// version reintroduces separators of another kind.
				expect(out.split(/[-.]/u)).not.toContain('..');
			}
		});

		test('the canonical traversal shapes have their measured, defanged values', () => {
			// Pinned exactly, not just "contains no ..": a mutation that
			// returned the input untouched would still need to fail here.
			expect(sanitizePublishedFileName('..')).toBe('');
			expect(sanitizePublishedFileName('../../etc/passwd')).toBe('etcpasswd');
			expect(sanitizePublishedFileName('a/../../b')).toBe('ab');
			expect(sanitizePublishedFileName('..%2f..')).toBe('2f');
			expect(sanitizePublishedFileName('....//....')).toBe('');
		});
	});

	describe('output-shape invariants (deterministic fuzz)', () => {
		// DOCUMENTED HOLE — two mutually redundant passes cannot be killed by
		// ANY test of this function, and this block does not pretend otherwise:
		//
		//   step 3: out.replace(/[^a-z0-9.]+/g, '-')   ← run-collapsing `+`
		//   step 4: out.replace(/-+/g, '-')            ← dash dedup
		//
		// Each is dead while the other stands. Step 3's `+` already emits one
		// dash per run of foreign characters (input dashes included, since '-'
		// is not in [a-z0-9.]), so step 4's `-+` never sees a pair; drop the
		// `+` from step 3 instead and step 4 restores the identical string.
		// Both mutants are therefore EQUIVALENT MUTANTS, not coverage gaps —
		// verified by fuzzing: no input produces different output. Killing one
		// requires deleting the other (a production edit, out of scope here).
		// Step 4's `[\s_]+` pass is dead for the same reason (step 3 leaves no
		// whitespace or underscore behind).
		//
		// What IS testable is the POST-CONDITION the redundant pair exists to
		// guarantee. Pinned as a property over a deterministic corpus so any
		// real regression that lets a '--', a space, an underscore, an
		// uppercase letter or an edge separator reach the filesystem reddens
		// here even for an input shape nobody thought to enumerate above.

		/** Seeded LCG — reproducible corpus, no flaky test. */
		function makeCorpus(count: number): string[] {
			// Alphabet deliberately dense in the characters that drive the
			// rewrite steps: separators, dots, dashes, allowlisted punctuation,
			// accents (dropped), and traversal bytes.
			const alphabet = [
				...'abzAZ09',
				...'  \t\n',
				'_',
				'-',
				'.',
				'/',
				'\\',
				':',
				'~',
				'[',
				']',
				'(',
				')',
				',',
				';',
				'%',
				'é',
				'Ñ',
				'ü',
			];
			let seed = 0x5eed_1234;
			const next = () => {
				seed = (seed * 1_103_515_245 + 12_345) >>> 0;
				return seed / 0x1_0000_0000;
			};
			const corpus: string[] = [];
			for (let i = 0; i < count; i++) {
				const length = 1 + Math.floor(next() * 12);
				let s = '';
				for (let j = 0; j < length; j++) {
					s += alphabet[Math.floor(next() * alphabet.length)];
				}
				corpus.push(s);
			}
			return corpus;
		}

		const corpus = makeCorpus(2000);

		test('no output ever contains a doubled dash', () => {
			// The guarantee the step-3 `+` / step-4 `-+` pair jointly provides.
			// A published name with '--' would not match the name the write
			// side produced → orphaned file on delete.
			for (const input of corpus) {
				expect(sanitizePublishedFileName(input)).not.toContain('--');
			}
			// Explicit worst cases, so the property is not silently vacuous if
			// the generator ever changes shape.
			for (const input of ['a--b', 'a - b', 'a _ - _ b', 'a::;;,,b', 'a  \t\n  b', '-_-_-a-_-']) {
				expect(sanitizePublishedFileName(input)).not.toContain('--');
			}
		});

		test('no whitespace or underscore ever survives to the filename', () => {
			// step 3 + step 4's `[\s_]+` pass: both classes must be gone.
			for (const input of [...corpus, 'a_b', 'a b', 'a\tb', 'a\nb', 'a _\t_ b']) {
				const out = sanitizePublishedFileName(input);
				expect(out).not.toMatch(/[\s_]/u);
			}
		});

		test('the output alphabet is exactly [a-z0-9.-]', () => {
			// Nothing outside the published-name grammar may leak: catches a
			// widened step-1 allowlist or a lost toLowerCase().
			for (const input of corpus) {
				expect(sanitizePublishedFileName(input)).toMatch(/^[a-z0-9.-]*$/u);
			}
		});

		test('no output has a leading/trailing separator, a dot run or a traversal segment', () => {
			for (const input of corpus) {
				const out = sanitizePublishedFileName(input);
				expect(out).not.toMatch(/^[-.]/u); // hidden file / bare dash
				expect(out).not.toMatch(/[-.]$/u); // invalid trailing dot
				expect(out).not.toContain('..'); // traversal segment
				expect(out).not.toMatch(/-\.|\.-/u); // dash adjacent to the extension dot
			}
		});

		test('every fuzz output is a fixed point of the function', () => {
			// Idempotence as a property, not just over the hand-picked samples
			// below: the delete side re-sanitizes write-side names.
			for (const input of corpus) {
				const once = sanitizePublishedFileName(input);
				expect(sanitizePublishedFileName(once)).toBe(once);
			}
		});
	});

	describe('idempotence', () => {
		// The delete side re-sanitizes names that the write side already
		// sanitized; if a second pass changed the name, delete would look for
		// a file that was never written under that name (orphaned publications).
		test('sanitizing an already-sanitized name is a no-op', () => {
			const samples = [
				'nmo:TypeSeriesItem_test6099_15657',
				'Ficha  Técnica',
				'~file[1](2),3;4.txt',
				'doc v2 .pdf',
				'sección Año 2000.xml',
				'../../etc/passwd',
				'---a---b---',
			];
			for (const sample of samples) {
				const once = sanitizePublishedFileName(sample);
				expect(sanitizePublishedFileName(once)).toBe(once);
			}
		});
	});
});
