/**
 * Resolve the matrix table a section's records live in, ported from
 * common::get_matrix_table_from_tipo.
 *
 * A section node may carry a related ontology node of model `matrix_table` whose
 * term (in the structure lang) is the table name — e.g. section `test3` →
 * related `test24` (model matrix_table, term `matrix_test`) → table `matrix_test`.
 * Sections without such a relation default to the main `matrix` table.
 *
 * Ported here: the relation-driven path + the `matrix`/default fallback (covers
 * the get_value cutover). Deferred (not yet needed by the ported read paths, and
 * flagged for when they are): the DEDALO_SECTION_PROJECTS_TIPO/USERS_TIPO special
 * cases (→ matrix_projects/matrix_users), the section_id===0 ontology case (→
 * matrix_ontology), and the virtual-section real-tipo fallback.
 */

/** Minimal ontology surface this resolver needs (subset of OntologyRepository). */
export interface OntologyForMatrixTable {
  getRelationTipos(tipo: string): Promise<string[] | null>;
  getModelByTipo(tipo: string): Promise<string | null>;
  getLabel(tipo: string, lang: string): Promise<string | null>;
}

/** DEDALO_STRUCTURE_LANG on this install (matrix_table terms are stored under it). */
export const STRUCTURE_LANG = 'lg-spa';

export async function resolveMatrixTable(
  ontology: OntologyForMatrixTable,
  sectionTipo: string,
  structureLang: string = STRUCTURE_LANG,
): Promise<string> {
  if (!sectionTipo || sectionTipo === 'matrix' || sectionTipo === 'all') {
    return 'matrix';
  }
  const relationTipos = (await ontology.getRelationTipos(sectionTipo)) ?? [];
  for (const relTipo of relationTipos) {
    if ((await ontology.getModelByTipo(relTipo)) === 'matrix_table') {
      const table = await ontology.getLabel(relTipo, structureLang);
      if (table) return table;
    }
  }
  return 'matrix';
}
