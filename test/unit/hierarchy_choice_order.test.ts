/**
 * THE thesaurus-offer order: hierarchyChoiceView sorts entries and typologies
 * by label in the reader's collation (tld/typology id breaks a tie), ONCE —
 * and the installer's Thesauri question keeps it (groups in the typology
 * order, entries in name order inside each). The manifest's tld order is
 * storage, never presentation: `es` Spain sorts under S, not between Eritrea
 * and Ethiopia. The client widget renders the order it is handed
 * (test_add_hierarchy.js).
 */
import { describe, expect, test } from 'bun:test';
import { hierarchyChoiceView, labelCollator } from '../../src/core/install/hierarchy_meta.ts';
import { buildScreens } from '../../src/core/install/screen_model.ts';
import { modelInput } from '../helpers/install_plain_script.ts';

function isSorted<T>(items: readonly T[], compare: (a: T, b: T) => number): boolean {
	return items.every((item, index) => index === 0 || compare(items[index - 1] as T, item) <= 0);
}

describe('hierarchyChoiceView — by label, in the reader collation', () => {
	for (const lang of ['lg-eng', 'lg-spa']) {
		test(`${lang}: entries and typologies follow the label collation`, () => {
			const collator = labelCollator(lang);
			const view = hierarchyChoiceView(lang);
			expect(view.hierarchies.length).toBeGreaterThan(1);
			expect(isSorted(view.hierarchies, (a, b) => collator.compare(a.label, b.label))).toBe(true);
			expect(
				isSorted(view.hierarchy_typologies, (a, b) => collator.compare(a.label, b.label)),
			).toBe(true);
			// Not vacuous: the manifest's tld order is NOT the name order.
			const tlds = view.hierarchies.map((entry) => entry.tld);
			expect(tlds).not.toEqual([...tlds].sort());
		});
	}

	test('the reported case: Spain sorts under S, not between Eritrea and Ethiopia', () => {
		const labels = hierarchyChoiceView('lg-eng').hierarchies.map((entry) => entry.label);
		const spain = labels.indexOf('Spain');
		expect(spain).toBeGreaterThan(-1);
		expect(labels[spain - 1]?.localeCompare('Spain', 'en')).toBe(-1);
		expect(labels.indexOf('Ethiopia')).toBeLessThan(spain);
	});

	test('labelCollator: accents fold, a non-BCP-47 suffix collates as English', () => {
		expect(['Zambia', 'Åland', 'Egypt'].sort(labelCollator('lg-eng').compare)).toEqual([
			'Åland',
			'Egypt',
			'Zambia',
		]);
		expect(() => labelCollator('lg-vlca')).not.toThrow();
		expect(labelCollator('lg-spa').resolvedOptions().locale).toBe('es');
	});
});

describe('installer Thesauri question — keeps the view order', () => {
	test('groups follow the typology order; entries keep name order inside each group', () => {
		const view = hierarchyChoiceView('lg-eng');
		const question = buildScreens(modelInput({}))
			.flatMap((screen) => screen.questions ?? [])
			.find((item) => item?.key === 'hierarchies');
		expect(question).toBeDefined();
		const options = question?.options ?? [];
		const typologyLabel = new Map(
			view.hierarchy_typologies.map((item) => [item.typology, item.label]),
		);
		const groupOf = (typology: number) => typologyLabel.get(typology) ?? String(typology);
		const groups = [...new Set(options.map((option) => option.group as string))];
		const named = view.hierarchy_typologies
			.map((item) => item.label)
			.filter((label) => groups.includes(label));
		expect(groups.slice(0, named.length)).toEqual(named);
		const expected = groups.flatMap((group) =>
			view.hierarchies
				.filter((entry) => groupOf(entry.typology) === group)
				.map((entry) => entry.tld),
		);
		expect(options.map((option) => option.value)).toEqual(expected);
	});
});
