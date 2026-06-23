import { ComponentCommon, type ComponentInit } from './component_common.ts';
import { ExportValue, type ExportAtom, type ExportPathSegment } from './export_value.ts';

/**
 * Read-side port of PHP `component_section_id`
 * (core/component_section_id/class.component_section_id.php).
 *
 * component_section_id is a SYSTEM, read-only component whose value is the section
 * primary key itself — it does NOT read a matrix data column. PHP overrides
 * get_data() to return EXACTLY [(int)section_id] (or [null] when section_id is
 * empty), so get_value() resolves to the section_id rendered as a string,
 * regardless of whether the matrix record exists.
 *
 *   get_data()        → [(int)section_id]                (always one element)
 *   get_export_value() → one atom per item, value = (int)item, cell_type
 *                        'section_id', value_index = (int)key
 *   get_value()       → get_export_value()->to_flat_string()
 *
 * to_flat_string joins the (single) atom with the leaf fields_separator, dropping
 * PHP-empty values ('' and '0'). The only empty case is section_id falsy/0:
 *   - section_id null / 0 → get_data() returns [null] → no atom (json/scalar guard
 *     in PHP: the (int)null = 0 atom value is then dropped by to_flat_string's
 *     empty('0') skip) → '' . We reproduce this by emitting no atom for a null
 *     section_id and letting to_flat_string drop a 0.
 *
 * VERIFIED LIVE: get_value for a MISSING record (section_id 999999999, no matrix
 * row) returns "999999999" — confirming the value is the requested section_id, not
 * a stored column. A populated record (numisdata3/1) returns "1".
 *
 * Data column: none (the value comes from section_id, not a matrix column). The
 * ComponentInit dataColumnName is irrelevant here; getData is overridden.
 */
export class ComponentSectionId extends ComponentCommon {
  // section_id is language-neutral (DEDALO_DATA_NOLAN); the relation/lang machinery
  // never filters it. Kept non-translatable.
  protected override readonly supportsTranslation = false;

  private constructor(init: ComponentInit) {
    super(init);
  }

  static async create(init: ComponentInit): Promise<ComponentSectionId> {
    const instance = new ComponentSectionId(init);
    await instance.resolveLang();
    return instance;
  }

  /** Port of component_section_id::get_export_value(): one int atom for the section_id. */
  async getExportValue(): Promise<ExportValue> {
    const label = await this.ontology.getLabel(this.tipo, this.getLang());
    const exportValue = new ExportValue(label, 'component_section_id');

    // get_data() = [ (int)section_id ] or [ null ] when section_id is empty.
    const sectionId = this.sectionId;
    // PHP !empty($this->section_id) — null/0/'' all empty → [null] → no usable atom.
    if (sectionId === null || sectionId === 0) {
      return exportValue;
    }

    const segment: ExportPathSegment = {
      sectionTipo: this.sectionTipo,
      componentTipo: this.tipo,
      model: 'component_section_id',
      // No properties separators in real data; to_flat_string uses its defaults.
      fieldsSeparator: ', ',
      recordsSeparator: ' | ',
      itemIndex: null,
    };

    const atom: ExportAtom = {
      path: [segment],
      // PHP (int)$item, rendered for the flat string. cell_type 'section_id'
      // only affects the grid cell, not to_flat_string.
      value: String(sectionId),
      valueIndex: 0,
      lang: '',
      isFallback: false,
    };
    exportValue.addAtom(atom);

    return exportValue;
  }

  /** get_value = get_export_value()->to_flat_string(). */
  async getValue(): Promise<string> {
    const exportValue = await this.getExportValue();
    return exportValue.toFlatString();
  }
}
