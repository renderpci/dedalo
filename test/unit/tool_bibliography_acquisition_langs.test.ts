/**
 * tool_bibliography_acquisition — abstract language planning (pure, no DB, no network).
 *
 * An OAI `xml:lang` the install does not declare used to reach saveComponentData, which refuses
 * it and rolled the whole publication back; codes outside a private 7-entry table fell back to
 * the request data lang and overwrote each other (last wins). planAbstractLangs maps through the
 * install's own {code, alpha2} list (getAlpha2FromCode ∘ installedDataLangs), skips and REPORTS
 * what it cannot write, and keeps the first variant per slot.
 *
 * Also: isOaiPmhDocument — a well-formed OAI-PMH body is never treated as a bot wall.
 */

import { describe, expect, test } from 'bun:test';
import { looksBlocked } from '../../tools/tool_bibliography_acquisition/server/lib/acquisition/block-signals.ts';
import {
	type AbstractLangs,
	planAbstractLangs,
	resolveAbstractLang,
} from '../../tools/tool_bibliography_acquisition/server/lib/domain/abstract_langs.ts';
import { isOaiPmhDocument } from '../../tools/tool_bibliography_acquisition/server/lib/sources/ojs_oai/acquisition.ts';

const LANGS: AbstractLangs = {
	data: [
		{ code: 'lg-spa', alpha2: 'es' },
		{ code: 'lg-eng', alpha2: 'en' },
		{ code: 'lg-cat', alpha2: 'ca' },
	],
	current: 'lg-spa',
};

describe('resolveAbstractLang', () => {
	test('ISO 639-1 maps through the install list', () => {
		expect(resolveAbstractLang('es', LANGS)).toBe('lg-spa');
		expect(resolveAbstractLang('EN', LANGS)).toBe('lg-eng');
	});
	test('region tags normalise to the primary subtag', () => {
		expect(resolveAbstractLang('es-ES', LANGS)).toBe('lg-spa');
		expect(resolveAbstractLang('en_US', LANGS)).toBe('lg-eng');
		expect(resolveAbstractLang('ca-ES-valencia', LANGS)).toBe('lg-cat');
	});
	test('3-letter ISO 639-2/T codes match the installed lg- code', () => {
		expect(resolveAbstractLang('spa', LANGS)).toBe('lg-spa');
		expect(resolveAbstractLang('eng', LANGS)).toBe('lg-eng');
	});
	test('a language the install lacks, or garbage, is null', () => {
		expect(resolveAbstractLang('eu', LANGS)).toBeNull();
		expect(resolveAbstractLang('glg', LANGS)).toBeNull();
		expect(resolveAbstractLang('la', LANGS)).toBeNull();
		expect(resolveAbstractLang('', LANGS)).toBeNull();
		expect(resolveAbstractLang('x', LANGS)).toBeNull();
	});
});

describe('planAbstractLangs', () => {
	test('one write per installed language, each in its own slot', () => {
		const plan = planAbstractLangs(
			[
				{ lang: 'es-ES', text: 'resumen' },
				{ lang: 'en-US', text: 'abstract' },
			],
			LANGS,
		);
		// the WHOLE plan, exactly: two writes and no skip (an empty plan cannot pass)
		expect(plan).toEqual({
			writes: [
				{ lang: 'lg-spa', text: 'resumen' },
				{ lang: 'lg-eng', text: 'abstract' },
			],
			skipped: [],
		});
	});

	test('a language not installed is skipped and reported, the rest still written', () => {
		const plan = planAbstractLangs(
			[
				{ lang: 'eu', text: 'laburpena' },
				{ lang: 'es', text: 'resumen' },
			],
			LANGS,
		);
		expect(plan.writes).toEqual([{ lang: 'lg-spa', text: 'resumen' }]);
		expect(plan.skipped).toEqual([{ lang: 'eu', reason: 'language_not_installed' }]);
	});

	test('two variants for one slot: the first is kept, the second reported', () => {
		const plan = planAbstractLangs(
			[
				{ lang: 'es', text: 'primero' },
				{ lang: 'spa', text: 'segundo' },
			],
			LANGS,
		);
		expect(plan.writes).toEqual([{ lang: 'lg-spa', text: 'primero' }]);
		expect(plan.skipped).toEqual([{ lang: 'spa', reason: 'duplicate_language' }]);
	});

	test('an untagged variant takes the request data lang only when free', () => {
		const free = planAbstractLangs(
			[
				{ lang: null, text: 'sin idioma' },
				{ lang: 'en', text: 'abstract' },
			],
			LANGS,
		);
		expect(free).toEqual({
			writes: [
				{ lang: 'lg-eng', text: 'abstract' },
				{ lang: 'lg-spa', text: 'sin idioma' },
			],
			skipped: [],
		});

		// A LATER tagged variant still wins the slot over an earlier untagged one.
		const taken = planAbstractLangs(
			[
				{ lang: null, text: 'sin idioma' },
				{ lang: 'es', text: 'resumen' },
				{ lang: '', text: 'vacio' },
			],
			LANGS,
		);
		expect(taken.writes).toEqual([{ lang: 'lg-spa', text: 'resumen' }]);
		expect(taken.skipped).toEqual([
			{ lang: null, reason: 'duplicate_language' },
			{ lang: null, reason: 'duplicate_language' },
		]);
	});

	test('nothing installed with an ISO code: every tagged variant is skipped, none written', () => {
		const plan = planAbstractLangs([{ lang: 'en', text: 'abstract' }], {
			data: [],
			current: 'lg-spa',
		});
		expect(plan).toEqual({
			writes: [],
			skipped: [{ lang: 'en', reason: 'language_not_installed' }],
		});
	});
});

describe('isOaiPmhDocument', () => {
	const oai = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/lib/pkp/xml/oai2.xsl" ?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"><GetRecord><record><metadata>
<dc:title>Access denied: The Forbidden City and the captcha of history</dc:title>
</metadata></record></GetRecord></OAI-PMH>`;

	test('a well-formed OAI-PMH body is recognised, even with block-like article text', () => {
		// Anti-vacuity: the body DOES trip the weak heuristic on its own.
		expect(looksBlocked(oai)).toBe(true);
		expect(isOaiPmhDocument(oai, 'text/xml; charset=utf-8')).toBe(true);
		expect(isOaiPmhDocument(oai, null)).toBe(true);
	});

	test('HTML, or a body without the OAI-PMH root, is not', () => {
		expect(isOaiPmhDocument(oai, 'text/html')).toBe(false);
		expect(isOaiPmhDocument('<html><body>Access denied</body></html>', 'text/xml')).toBe(false);
		expect(isOaiPmhDocument('<p>x</p><OAI-PMH>', 'text/xml')).toBe(false);
	});

	test('prolog forms the former regex accepted are still accepted', () => {
		expect(isOaiPmhDocument('\uFEFF  <!-- c --> <?pi x?>\n<OAI-PMH/>', 'text/xml')).toBe(true);
		expect(isOaiPmhDocument('<oai:OAI-PMH xmlns:oai="x">', null)).toBe(true);
		expect(isOaiPmhDocument('<OAI-PMHX>', null)).toBe(false);
		expect(isOaiPmhDocument('<?unterminated <OAI-PMH>', null)).toBe(false);
		expect(isOaiPmhDocument('<!-- unterminated <OAI-PMH>', null)).toBe(false);
	});

	// ReDoS regression: the former prolog regex backtracked exponentially on an unterminated run
	// ('<?a?>'.repeat(24) + 'X' took 45ms, x4 per +2), and the body comes from any public OAI host.
	// The scan is linear, so 5000-token runs must finish far under the budget.
	test('pathological prologs are rejected in linear time', () => {
		const pathological = [
			`${'<?a?>'.repeat(5000)}X`,
			`${'<!--a-->'.repeat(5000)}X`,
			'<?'.repeat(5000),
			'<!--'.repeat(5000),
		];
		const started = performance.now();
		for (const body of pathological) expect(isOaiPmhDocument(body, 'text/xml')).toBe(false);
		expect(performance.now() - started).toBeLessThan(50);
	});

	test('positive control: a valid document behind many PIs and comments is recognised', () => {
		const body = `${'<?a?>\n<!--c-->'.repeat(5000)}${oai.slice(oai.indexOf('<OAI-PMH'))}`;
		const started = performance.now();
		expect(isOaiPmhDocument(body, 'text/xml')).toBe(true);
		expect(performance.now() - started).toBeLessThan(50);
	});
});
