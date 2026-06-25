/**
 * Typed result shapes for the ontology read layer.
 *
 * These mirror the hydrated `dd_ontology` row produced by PHP
 * `dd_ontology_db_manager::read()` (JSONB → object, order_number → int,
 * boolean columns → bool), restricted to the columns the read API needs.
 */

/** A language-keyed label map, e.g. `{ "lg-spa": "Nombre", "lg-eng": "Name" }`. */
export type TermMap = Record<string, string>;

/** A single relation entry as stored in `dd_ontology.relations` (at minimum a `tipo`). */
export interface RelationNode {
  tipo: string;
  [k: string]: unknown;
}

/** The arbitrary JSONB `properties` configuration object. */
export type PropertiesObject = Record<string, unknown>;

/**
 * The hydrated, typed view of one `dd_ontology` node.
 *
 * Fields are nullable exactly where the PHP row hydration leaves them null:
 * a column absent/NULL in the DB stays null here. `term`/`relations`/`properties`
 * are the parsed JSONB payloads. `orderNumber` is the int-cast `order_number`.
 *
 * Note on the PHP→TS field naming: PHP exposes snake_case DB columns; we expose
 * camelCase per the TS conventions, but preserve the underlying semantics 1:1.
 */
export interface OntologyNodeData {
  /** Ontology identifier (primary key), e.g. 'cont2'. Always present. */
  tipo: string;
  /** Parent tipo, or null for a root node. */
  parent: string | null;
  /** Language-keyed label map (parsed `term` JSONB), or null when absent. */
  term: TermMap | null;
  /** Raw `model` column (NOT the resolved model — see resolveModel). */
  model: string | null;
  /** Sibling sort position (int-cast `order_number`), or null. */
  orderNumber: number | null;
  /** Parsed `relations` JSONB array, or null when absent. */
  relations: RelationNode[] | null;
  /** TLD namespace (e.g. 'cont', 'dd'), or null. */
  tld: string | null;
  /** Parsed `properties` JSONB object, or null when absent. */
  properties: PropertiesObject | null;
  /** `model_tipo` — tipo of the model node used in the legacy resolution path. */
  modelTipo: string | null;
  /** `is_model` flag (model node vs descriptor node). */
  isModel: boolean;
  /** `is_translatable` flag (component data is language-sensitive). */
  isTranslatable: boolean;
  /** `is_main` flag (namespace-root node). */
  isMain: boolean;
}

/**
 * A minimal async query interface so the repository is testable with an in-memory
 * stub. Both `@dedalo/db`'s `Db` and `DbSession` satisfy the `query(text, params)`
 * shape; tests pass a fake. The repository only ever issues parameterised SELECTs.
 */
export interface OntologyQueryer {
  query<T = unknown>(text: string, params?: unknown[]): Promise<T[]>;
}
