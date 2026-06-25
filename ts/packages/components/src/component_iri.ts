import type { ComponentDatum } from '@dedalo/db';
import { ComponentCommon, type ComponentInit } from './component_common.ts';
import { ExportValue, type ExportAtom, type ExportPathSegment } from './export_value.ts';

/**
 * Read-side port of PHP `component_iri` (extends component_common). The get_value
 * path is:
 *
 *   get_value() = get_export_value()->to_flat_string()   (inherited from component_common)
 *
 * component_iri::get_export_value() (class.component_iri.php line 560):
 *   1. fields_separator = ddo > properties.fields_separator > ', '
 *      records_separator = ddo > properties.records_separator > ' | '
 *   2. own segment: fields_separator = records_separator = the resolved
 *      records_separator, so to_flat_string joins ATOMS with records_separator.
 *      (!) The per-item iri+title join uses the SEPARATE $fields_separator (', '),
 *      NOT the segment one — a deliberate two-level separator design. Verified
 *      against the live golden iri_multi: "iri, title | iri, title".
 *   3. data = get_data_lang() (supports_translation = true).
 *   4. per item: ar_parts = [iri?, resolve_title()?]; atom value = implode(
 *      fields_separator, ar_parts). Empty iri (falsy) and empty title (empty())
 *      are dropped.
 *
 * resolve_title(): when the item has no `id`, returns item.title ?? null. When it
 * has an `id`, PHP first looks up a paired DATAFRAME label (component_iri label
 * slot) by item id, falling back to item.title ?? null. This port reproduces the
 * literal-title fallback (item.title) only — the dataframe-label lookup is NOT
 * ported this phase (no dataframe port exists yet). The captured goldens
 * deliberately use records whose iri titles come straight from the literal `title`
 * field (no paired dataframe label), so they are byte-green; a record whose title
 * is materialized from a dataframe would diverge and is out of scope (guarded:
 * see resolveTitle's dataframe note).
 *
 * Empty/falsy iri uses PHP truthiness: '' and '0' are falsy → dropped. Empty title
 * uses PHP empty(): '' / '0' / null → dropped.
 */
export class ComponentIri extends ComponentCommon {
  protected override readonly supportsTranslation = true;

  private constructor(init: ComponentInit) {
    super(init);
  }

  static async create(init: ComponentInit): Promise<ComponentIri> {
    const instance = new ComponentIri(init);
    await instance.resolveLang();
    return instance;
  }

  private async getLabel(): Promise<string | null> {
    return this.ontology.getLabel(this.tipo, this.getLang());
  }

  /** [fields_separator (', '), records_separator (' | ')], properties-overridable. */
  private async getSeparators(): Promise<[string, string]> {
    const properties = await this.ontology.getProperties(this.tipo);
    const fs = properties?.['fields_separator'];
    const rs = properties?.['records_separator'];
    return [
      typeof fs === 'string' ? fs : ', ',
      typeof rs === 'string' ? rs : ' | ',
    ];
  }

  /**
   * Port of component_iri::resolve_title() — literal fallback only.
   *
   * (!) PHP additionally resolves a paired dataframe label by item id BEFORE the
   * literal title. That dataframe path is not ported here; this returns the
   * literal `title` (PHP `$value->title ?? null`). If a record relied on a
   * dataframe-materialized title it would diverge — out of scope this phase.
   */
  private static resolveTitle(item: ComponentDatum): string | null {
    const title = item['title'];
    return typeof title === 'string' ? title : title == null ? null : String(title);
  }

  /** PHP truthiness for the iri value: non-empty and not '0'. */
  private static iriIsTruthy(iri: unknown): iri is string {
    return typeof iri === 'string' && iri !== '' && iri !== '0';
  }

  /** PHP empty() for the resolved title: drops null / '' / '0'. */
  private static titleIsNonEmpty(title: string | null): title is string {
    return title !== null && title !== '' && title !== '0';
  }

  /** Port of component_iri::get_export_value(). */
  async getExportValue(): Promise<ExportValue> {
    const [fieldsSeparator, recordsSeparator] = await this.getSeparators();
    const label = await this.getLabel();

    const segment: ExportPathSegment = {
      sectionTipo: this.sectionTipo,
      componentTipo: this.tipo,
      model: 'component_iri',
      // PHP sets both to records_separator → to_flat_string joins atoms with it.
      fieldsSeparator: recordsSeparator,
      recordsSeparator,
      itemIndex: null,
    };
    const path = [segment];

    const exportValue = new ExportValue(label, 'component_iri');

    const data = await this.getDataLang();
    if (data === null || data.length === 0) {
      return exportValue;
    }

    let valueIndex = 0;
    for (const item of data) {
      const parts: string[] = [];

      const iri = item['iri'];
      if (ComponentIri.iriIsTruthy(iri)) {
        parts.push(iri);
      }

      const title = ComponentIri.resolveTitle(item);
      if (ComponentIri.titleIsNonEmpty(title)) {
        parts.push(title);
      }

      const atom: ExportAtom = {
        path,
        // per-item join uses the SEPARATE fields_separator (', '), see docblock.
        value: parts.join(fieldsSeparator),
        valueIndex: valueIndex++,
        lang: typeof item.lang === 'string' ? item.lang : this.getLang(),
        isFallback: false,
      };
      exportValue.addAtom(atom);
    }

    return exportValue;
  }

  /** get_value = get_export_value()->to_flat_string(). */
  async getValue(): Promise<string> {
    const exportValue = await this.getExportValue();
    return exportValue.toFlatString();
  }
}
