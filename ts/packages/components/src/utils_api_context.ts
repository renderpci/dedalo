/**
 * Response builders for the two byte-reproducible READ/INFO actions of the PHP
 * `dd_utils_api` class (core/api/v1/common/class.dd_utils_api.php):
 *
 *   - get_login_context   → login::get_json({get_context:true}).context
 *   - get_install_context → install::get_json({get_context:true}).context
 *
 * Both methods return `{ result: <context>, msg, [errors] }`, where <context> is
 * the `context` array of the object's JSON controller (a single-element array
 * holding one dd_object). The dd_object is serialized by dd_object::jsonSerialize
 * (= get_object_vars filtered for non-null), so the wire key order is the PHP
 * property DECLARATION order of class dd_object:
 *   typo, type, tipo, section_tipo, parent, parent_grouper, lang, mode, model,
 *   id, info, properties, permissions, label, …
 * After the null-filter, login emits {typo,type,tipo,lang,mode,model,properties,
 * label} and install (installed state) emits {typo,tipo,lang,mode,model,properties}.
 *
 * ── WHAT IS BYTE-REPRODUCIBLE (and what is NOT) ──
 * get_login_context: FULLY reproducible. The properties payload is:
 *   - login_items: the ontology children of dd229 (the login section) as
 *     {tipo, model, label} — model via get_model_by_tipo, label = the child term
 *     in DEDALO_APPLICATION_LANG.
 *   - info: a fixed sequence of {type,label,value} version entries sourced from
 *     install config constants (DEDALO_ENTITY, DEDALO_VERSION, DEDALO_BUILD),
 *     the DB data version (matrix_updates) and the dd1 ontology node properties
 *     (version + date). The dev-only db_user info entries and the demo_user /
 *     saml_config branches are DECLINED (see the handler gate): they only fire
 *     under DEDALO_ENTITY==='development'/'dedalo_demo' or SAML_CONFIG, none of
 *     which is this install — the handler proxies if any of those would fire.
 *
 * get_install_context: reproducible ONLY in the INSTALLED state. PHP's
 * install::get_structure_context returns early with EMPTY properties when
 * DEDALO_INSTALL_STATUS==='installed'. The not-installed branch builds a huge
 * server_info payload (PHP version, RAM, CPU MHz, disk space, ffmpeg/imagemagick
 * versions, …) that is PHP-runtime/host volatile and NOT reproducible from TS →
 * the handler declines (proxies) unless the install status is explicitly
 * 'installed'.
 *
 * No module-global mutable state: every value flows through injected config + the
 * per-request ontology/db reads.
 */

import type { OntologyRepository } from '@dedalo/ontology';

/** A parameterised SQL queryer (a Db / DbSession / test stub). */
export interface UtilsQueryer {
  query<T = unknown>(text: string, params: unknown[]): Promise<T[]>;
}

/**
 * Install-version config the login context embeds. These are PHP install-time
 * define()s (core/base/version.inc + the entity config). Injected, never read
 * from a module global.
 */
export interface UtilsVersionConfig {
  /** DEDALO_ENTITY (e.g. 'monedaiberica'). */
  entity: string;
  /** DEDALO_VERSION (e.g. '7.0.0.dev' when DEVELOPMENT_SERVER). */
  version: string;
  /** DEDALO_BUILD (ISO-8601 build timestamp). */
  build: string;
}

/** A single info entry in the login context properties.info array. */
export interface LoginInfoEntry {
  type: string;
  label: string;
  value: unknown;
}

/** A single login_items entry (ontology child of the login section). */
export interface LoginItem {
  tipo: string;
  model: string | null;
  label: string | null;
}

// ── PHP defines (core constants, verified vs the install) ──
/** DEDALO_LOGIN_TIPO — the login section ontology node. */
export const LOGIN_TIPO = 'dd229';
/** The ontology root node whose properties carry the ontology version + date. */
export const ONTOLOGY_ROOT_TIPO = 'dd1';
/** DEDALO_INSTALL_TIPO — the install section ontology node. */
export const INSTALL_TIPO = 'dd1590';

/**
 * Read the current DB data version (port of get_current_data_version()): the
 * latest matrix_updates row's data->>'dedalo_version', exploded on '.' into a
 * 3-int array. Returns [] when the table/row is absent (PHP returns [] → the
 * imploded string is '').
 */
export async function getCurrentDataVersion(db: UtilsQueryer): Promise<number[]> {
  let rows: Array<{ dedalo_version?: unknown }>;
  try {
    rows = await db.query<{ dedalo_version?: unknown }>(
      `SELECT data->>'dedalo_version' AS dedalo_version FROM "matrix_updates" ORDER BY data->>'dedalo_version' DESC LIMIT 1;`,
      [],
    );
  } catch {
    return [];
  }
  const raw = rows[0]?.dedalo_version;
  if (typeof raw !== 'string' || raw === '') return [];
  const parts = raw.split('.');
  // PHP indexes [0],[1],[2] explicitly; a malformed version with fewer parts
  // would PHP-warn + cast undefined→0. Reproduce: (int)part, missing→0.
  return [0, 1, 2].map((i) => {
    const n = Number.parseInt(parts[i] ?? '', 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/**
 * Build the `info` array of the login context properties (login::
 * get_structure_context lines 2024-2059), in EXACT order:
 *   dedalo_entity, version (code), version (build), data_version, version (ontology).
 *
 * The dev-only db_user entries + demo_user + saml_config are intentionally NOT
 * emitted here; the handler declines (proxies) when any of those branches would
 * fire (non-prod entity / SAML), so this builder only covers the production shape.
 */
export async function buildLoginInfo(
  ontology: OntologyRepository,
  db: UtilsQueryer,
  config: UtilsVersionConfig,
): Promise<LoginInfoEntry[]> {
  const dataVersion = await getCurrentDataVersion(db);
  const ontoProps = await ontology.getProperties(ONTOLOGY_ROOT_TIPO);
  const ontoVersion = (ontoProps?.['version'] as unknown) ?? null;
  const ontoDate = (ontoProps?.['date'] as unknown) ?? null;

  return [
    { type: 'dedalo_entity', label: 'Dédalo entity', value: config.entity },
    { type: 'version', label: 'Code version', value: config.version },
    { type: 'version', label: 'Code Build', value: config.build },
    { type: 'data_version', label: 'Data version', value: dataVersion.join('.') },
    { type: 'version', label: 'Ontology version', value: [ontoVersion, ontoDate] },
  ];
}

/**
 * Build the login_items array: the ontology children of the login section, each
 * as {tipo, model, label}. model = get_model_by_tipo; label = the child term in
 * DEDALO_APPLICATION_LANG (with PHP's fallback chain).
 */
export async function buildLoginItems(
  ontology: OntologyRepository,
  applicationLang: string,
): Promise<LoginItem[]> {
  const children = await ontology.getChildren(LOGIN_TIPO);
  const items: LoginItem[] = [];
  for (const childTipo of children) {
    items.push({
      tipo: childTipo,
      model: await ontology.getModelByTipo(childTipo),
      label: await ontology.getLabel(childTipo, applicationLang),
    });
  }
  return items;
}

/** The dd_object envelope as serialized to the wire (null fields already filtered). */
export type LoginContextDdo = {
  typo: 'ddo';
  type: 'login';
  tipo: string;
  lang: string;
  mode: 'edit';
  model: 'login';
  properties: { login_items: LoginItem[]; info: LoginInfoEntry[] };
  label: string;
};

/**
 * Build the full get_login_context response: { result: [ddo], msg, errors }.
 * The dd_object is wrapped in a single-element array (the `context` array of the
 * login JSON controller). Key order is fixed to match dd_object::jsonSerialize.
 */
export async function buildLoginContextResponse(
  ontology: OntologyRepository,
  db: UtilsQueryer,
  config: UtilsVersionConfig,
  applicationLang: string,
  dataLang: string,
): Promise<{ result: LoginContextDdo[]; msg: string; errors: never[] }> {
  const login_items = await buildLoginItems(ontology, applicationLang);
  const info = await buildLoginInfo(ontology, db, config);
  const label = (await ontology.getLabel(LOGIN_TIPO, applicationLang)) ?? '';

  const ddo: LoginContextDdo = {
    typo: 'ddo',
    type: 'login',
    tipo: LOGIN_TIPO,
    lang: dataLang,
    mode: 'edit',
    model: 'login',
    properties: { login_items, info },
    label,
  };

  return { result: [ddo], msg: 'OK. Request done', errors: [] };
}

/** The install dd_object envelope (installed state: empty properties, no type/label). */
export type InstallContextDdo = {
  typo: 'ddo';
  tipo: string;
  lang: string;
  mode: 'install';
  model: 'install';
  properties: Record<string, never>;
};

/**
 * Build the get_install_context response for the INSTALLED state only:
 * { result: [ddo], msg } with an EMPTY-properties install dd_object. The
 * not-installed branch is NOT reproducible (server_info) → the handler declines.
 *
 * Note: install's get_structure_context never calls set_type (model 'install'
 * does not resolve to a dd_object type) and never sets a label, so the wire shape
 * is {typo,tipo,lang,mode,model,properties} — no `type`, no `label`.
 */
export function buildInstallContextResponse(
  dataLang: string,
): { result: InstallContextDdo[]; msg: string } {
  const ddo: InstallContextDdo = {
    typo: 'ddo',
    tipo: INSTALL_TIPO,
    lang: dataLang,
    mode: 'install',
    model: 'install',
    properties: {},
  };
  return { result: [ddo], msg: 'OK. Request done' };
}
