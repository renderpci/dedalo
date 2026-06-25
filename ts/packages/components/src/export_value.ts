/**
 * Minimal port of the export_value / export_atom / export_path_segment trio and
 * export_value::to_flat_string() — restricted to the shape a uniform-leaf literal
 * component (component_input_text) produces: a single own path segment, no
 * relation traversal (item_index === null), one atom per data item.
 *
 * For that shape PHP's recursive join_atoms() collapses to: join the atom values
 * with the leaf segment's fields_separator, SKIPPING values that PHP empty()
 * treats as empty ('' and '0' — preserved as a deliberate legacy parity bug,
 * see export_value::join_atoms). The full relation-recursion engine is NOT ported
 * here; it lands with the relation components in a later phase.
 */

export interface ExportPathSegment {
  readonly sectionTipo: string;
  readonly componentTipo: string;
  readonly model: string | null;
  readonly fieldsSeparator: string;
  readonly recordsSeparator: string;
  /** Relation traversal position; null for a top-level literal component. */
  readonly itemIndex: number | null;
}

export interface ExportAtom {
  readonly path: readonly ExportPathSegment[];
  readonly value: string;
  readonly valueIndex: number;
  readonly lang: string;
  readonly isFallback: boolean;
}

export class ExportValue {
  readonly atoms: ExportAtom[] = [];

  constructor(
    public readonly label: string | null = null,
    public readonly model: string | null = null,
  ) {}

  addAtom(atom: ExportAtom): void {
    this.atoms.push(atom);
  }

  /** Last segment of the first atom's path (the leaf that produced the values). */
  private leafSegment(): ExportPathSegment | null {
    const first = this.atoms[0];
    if (!first || first.path.length === 0) return null;
    return first.path[first.path.length - 1] ?? null;
  }

  /**
   * Port of export_value::to_flat_string() for the single-segment literal shape.
   *
   * PHP: empty atoms → ''. Otherwise join_atoms joins the leaf values with the
   * leaf segment's fields_separator (' | ' for input_text), skipping empty()
   * values. PHP empty('') === true and empty('0') === true, so both '' and '0'
   * are dropped from the join.
   */
  toFlatString(): string {
    if (this.atoms.length === 0) return '';
    const sep = this.leafSegment()?.fieldsSeparator ?? ', ';
    const kept: string[] = [];
    for (const atom of this.atoms) {
      // PHP empty() skip: drops '' and '0'.
      if (atom.value === '' || atom.value === '0') continue;
      kept.push(atom.value);
    }
    return kept.join(sep);
  }
}
