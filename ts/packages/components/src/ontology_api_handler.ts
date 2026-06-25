/**
 * Native handler for the PHP `dd_ontology_api` class
 * (core/api/v1/common/class.dd_ontology_api.php) — the ontology-read API. A
 * SEPARATE dd_api class; it registers exactly like createCoreApiReadHandler /
 * createTsApiHandler.
 *
 * SCOPE (this brick): the byte-reproducible ontology-READ actions are served
 * natively, re-derived from the already-ported OntologyRepository (+ the
 * dd_ontology_db_manager search SQL, replayed verbatim through the queryer):
 *   - get_node         : the full ontology node descriptor for a tipo.
 *   - resolve_term     : nodes matching `term` text (exact JSONB / fuzzy trigram).
 *   - resolve_section  : section nodes + their component tree (superuser only — see below).
 *   - search           : structured dd_ontology search by column values.
 *   - get_glossary      (sections|section|path) : the LLM/MCP glossary modes.
 *   - resolve_path      : an annotated relational hop-path.
 *
 * DECLINED → proxied to PHP (precise reasons):
 *   - resolve_section for a NON-superuser request. PHP filters each matched section
 *     by security::get_security_permissions(): the superuser always scores 3 (no
 *     filtering), but a regular user's permission comes from the un-ported
 *     permissions table (component_security_access of the user profile). Without
 *     it the section set cannot be byte-reproduced → proxy when userId !== -1.
 *   - resolve_section / get_glossary(section) for a VIRTUAL section (the
 *     exclude_elements override walk in section::get_ar_children_tipo_by_model_name_in_section
 *     is un-ported) → proxy.
 *   - get_glossary(section) / get_glossary(path) / resolve_path whenever a portal
 *     component's section_tipo target is a NON-string (e.g. a component_dataframe
 *     with {value:[4],…}). PHP passes that int to the string-typed
 *     ontology_node::get_term_by_tipo() and throws a TypeError → a generic error
 *     envelope that is not byte-reproducible. The gate pre-walks the relevant
 *     portal components (bounded work) and DECLINES → proxy when any extraction
 *     raises PortalTargetNotString, so dispatch never has to emit that error shape.
 *
 * The PHP API_ACTIONS allowlist is preserved verbatim so the router's SEC-024
 * method check matches PHP; none of the actions are in NO_LOGIN_NEEDED_ACTIONS or
 * CSRF_EXEMPT_ACTIONS, so they require login + CSRF exactly like PHP.
 */

import type { ApiHandler, ApiResponse, GateSession, RqoLike } from '@dedalo/core-api';
import { DEDALO_STRUCTURE_LANG, type OntologyRepository } from '@dedalo/ontology';
import type { OntologyQueryer } from '@dedalo/ontology';
import {
  buildGlossarySectionDescriptor,
  buildGlossarySections,
  buildNodeDescriptor,
  buildSectionDescriptor,
  checkTipoIsValid,
  extractPortalTargets,
  getSectionComponentTipos,
  getSectionRealTipo,
  isPortalModel,
  isSafeTipo,
  PortalTargetNotString,
  resolvePathHops,
  searchExactTerm,
  searchFuzzyTerm,
  searchOntology,
  type GlossaryComponentDescriptor,
  type NodeDescriptor,
  type SectionDescriptor,
} from './ontology_api_actions.ts';

/** PHP DEDALO_SUPERUSER sentinel (core/base/dd_tipos.php). */
const DEDALO_SUPERUSER = -1;

export interface OntologyApiHandlerOptions {
  ontology: OntologyRepository;
  /** Parameterised queryer for the dd_ontology search SQL (the Db). */
  db: OntologyQueryer;
}

/** The dd_ontology_api API_ACTIONS allowlist (verbatim from PHP, exact order). */
const API_ACTIONS = new Set([
  'resolve_term',
  'resolve_section',
  'get_node',
  'search',
  'get_glossary',
  'resolve_path',
]);

/**
 * A standard {result,msg,errors} envelope body (pre-router-decoration). Typed as
 * ApiResponse (Record<string,unknown>) so it is returnable from dispatch directly;
 * the key order (result, msg, errors) matches PHP's envelope.
 */
type Envelope = ApiResponse;

function ok(result: unknown, msg: string): Envelope {
  return { result, msg, errors: [] };
}
function err(msg: string, code: string): Envelope {
  return { result: false, msg, errors: [code] };
}

export function createOntologyApiHandler(opts: OntologyApiHandlerOptions): ApiHandler {
  const { ontology, db } = opts;

  // ──────────────────────────── gate helpers ────────────────────────────────

  function sourceOf(rqo: RqoLike): Record<string, unknown> {
    const s = (rqo as { source?: unknown }).source;
    return s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
  }

  /**
   * resolve_section is byte-reproducible only for the superuser (no permission
   * filtering) AND only for REAL (non-virtual) sections. Pre-walk the matched
   * sections to confirm none are virtual / would be permission-filtered.
   */
  async function canHandleResolveSection(rqo: RqoLike, session?: GateSession): Promise<boolean> {
    if (!session || session.userId !== DEDALO_SUPERUSER) return false; // non-superuser → proxy
    const source = sourceOf(rqo);
    const text = source['text'];
    if (typeof text !== 'string' || text === '') return true; // missing_text → native error (matches PHP)
    const lang = typeof source['lang'] === 'string' ? (source['lang'] as string) : DEDALO_STRUCTURE_LANG;
    const mode = source['mode'] === 'exact' ? 'exact' : 'fuzzy';
    const limit = toInt(source['limit'], 20);
    const tipos =
      mode === 'fuzzy'
        ? await searchFuzzyTerm(db, text, 'section', false, limit)
        : await searchExactTerm(db, text, lang, 'section', false, limit);
    if (tipos === null) return true; // db_search_failed → native error (matches PHP)
    for (const sectionTipo of tipos) {
      if ((await ontology.getModelByTipo(sectionTipo)) !== 'section') continue;
      // VIRTUAL section → the exclude_elements override walk is un-ported → proxy.
      const real = await getSectionRealTipo(ontology, sectionTipo);
      if (real !== sectionTipo) return false;
    }
    return true;
  }

  /**
   * get_glossary(section) is reproducible only for a REAL section whose component
   * portal targets are all strings (no PHP get_term_by_tipo(int) fatal).
   */
  async function canHandleGlossarySection(sectionTipo: unknown): Promise<boolean> {
    if (typeof sectionTipo !== 'string' || sectionTipo === '') return true; // missing → native error
    if (!isSafeTipo(sectionTipo)) return true; // PHP would still run build → section_not_found path
    const real = await getSectionRealTipo(ontology, sectionTipo);
    if (real !== sectionTipo) return false; // virtual → proxy
    return portalTargetsAllStrings(await getSectionComponentTipos(ontology, sectionTipo));
  }

  /** resolve_path / get_glossary(path): reproducible only if no portal hop has an int target. */
  async function canHandlePath(path: unknown): Promise<boolean> {
    if (!Array.isArray(path) || path.length < 2) return true; // → native error (matches PHP)
    return portalTargetsAllStrings(path.filter((p): p is string => typeof p === 'string'));
  }

  /** True when every portal-model tipo in the list extracts only string targets. */
  async function portalTargetsAllStrings(tipos: string[]): Promise<boolean> {
    for (const tipo of tipos) {
      const model = await ontology.getModelByTipo(tipo);
      if (model === null || !isPortalModel(model)) continue;
      try {
        await extractPortalTargets(ontology, tipo);
      } catch (e) {
        if (e instanceof PortalTargetNotString) return false;
        throw e;
      }
    }
    return true;
  }

  // ──────────────────────────── action builders ─────────────────────────────

  async function doResolveTerm(rqo: RqoLike): Promise<Envelope> {
    const source = sourceOf(rqo);
    const text = source['text'];
    if (typeof text !== 'string' || text === '') {
      return err('Error. Missing or invalid source.text parameter', 'missing_text');
    }
    const lang = typeof source['lang'] === 'string' ? (source['lang'] as string) : DEDALO_STRUCTURE_LANG;
    const mode = source['mode'] === 'fuzzy' ? 'fuzzy' : 'exact';
    const model = typeof source['model'] === 'string' ? (source['model'] as string) : null;
    const isMain = source['is_main'] === true;
    const limit = toInt(source['limit'], 50);

    const tipos =
      mode === 'fuzzy'
        ? await searchFuzzyTerm(db, text, model, isMain, limit)
        : await searchExactTerm(db, text, lang, model, isMain, limit);
    if (tipos === null) return err('Error. Database search failed', 'db_search_failed');

    const result: NodeDescriptor[] = [];
    for (const tipo of tipos) result.push(await buildNodeDescriptor(ontology, tipo));
    return ok(result, 'OK. resolve_term request done successfully');
  }

  async function doResolveSection(rqo: RqoLike): Promise<Envelope> {
    const source = sourceOf(rqo);
    const text = source['text'];
    if (typeof text !== 'string' || text === '') {
      return err('Error. Missing or invalid source.text parameter', 'missing_text');
    }
    const lang = typeof source['lang'] === 'string' ? (source['lang'] as string) : DEDALO_STRUCTURE_LANG;
    const mode = source['mode'] === 'exact' ? 'exact' : 'fuzzy';
    const limit = toInt(source['limit'], 20);

    const tipos =
      mode === 'fuzzy'
        ? await searchFuzzyTerm(db, text, 'section', false, limit)
        : await searchExactTerm(db, text, lang, 'section', false, limit);
    if (tipos === null) return err('Error. Database search failed', 'db_search_failed');

    const sections: SectionDescriptor[] = [];
    const resolvedTipos: string[] = [];
    for (const sectionTipo of tipos) {
      if ((await ontology.getModelByTipo(sectionTipo)) !== 'section') continue;
      const real = await getSectionRealTipo(ontology, sectionTipo);
      if (resolvedTipos.includes(real)) continue;
      resolvedTipos.push(real);
      // Superuser-only gate already guaranteed perms >= 1 (no filtering).
      sections.push(await buildSectionDescriptor(ontology, sectionTipo));
    }
    return ok(sections, 'OK. resolve_section request done successfully');
  }

  async function doGetNode(rqo: RqoLike): Promise<Envelope> {
    const source = sourceOf(rqo);
    const tipo = source['tipo'];
    if (typeof tipo !== 'string' || tipo === '') {
      return err('Error. Missing or invalid source.tipo parameter', 'missing_tipo');
    }
    if (!(await checkTipoIsValid(ontology, tipo))) {
      return err('Error. Invalid tipo: ' + tipo, 'invalid_tipo');
    }
    const node = await ontology.getInstance(tipo);
    if (node === null) {
      return err('Error. Ontology node not found: ' + tipo, 'node_not_found');
    }
    const result = await buildNodeDescriptor(ontology, tipo);
    return ok(result, 'OK. get_node request done successfully');
  }

  async function doSearch(rqo: RqoLike): Promise<Envelope> {
    const source = sourceOf(rqo);
    const options = (rqo as { options?: unknown }).options;
    const includeData =
      options && typeof options === 'object' && 'include_data' in options
        ? (options as { include_data: unknown }).include_data !== false
        : true;

    const searchValues: Record<string, string | number | boolean> = {};
    for (const col of ['model', 'parent', 'tld', 'is_model', 'is_translatable']) {
      if (col in source && source[col] !== null && source[col] !== undefined) {
        searchValues[col] = source[col] as string | number | boolean;
      }
    }
    if (Object.keys(searchValues).length === 0) {
      return err('Error. At least one search criterion is required', 'empty_criteria');
    }
    const limit = toInt(source['limit'], 100);
    const tipos = await searchOntology(db, searchValues, true, limit);
    if (tipos === null) return err('Error. Database search failed', 'db_search_failed');

    if (!includeData) return ok(tipos, 'OK. search request done successfully');
    const result: NodeDescriptor[] = [];
    for (const tipo of tipos) result.push(await buildNodeDescriptor(ontology, tipo));
    return ok(result, 'OK. search request done successfully');
  }

  async function doGetGlossary(rqo: RqoLike): Promise<Envelope> {
    const source = sourceOf(rqo);
    const mode = typeof source['mode'] === 'string' ? (source['mode'] as string) : 'sections';

    if (mode === 'sections') {
      const sections = await buildGlossarySections(ontology, db);
      return ok(sections, 'OK. glossary_sections request done successfully');
    }
    if (mode === 'section') {
      const sectionTipo = source['section_tipo'];
      if (typeof sectionTipo !== 'string' || sectionTipo === '') {
        return err('Error. Missing source.section_tipo parameter', 'missing_section_tipo');
      }
      const descriptor = await buildGlossarySectionDescriptor(ontology, sectionTipo);
      if (descriptor === null) {
        return err('Error. Section not found: ' + sectionTipo, 'section_not_found');
      }
      return ok(descriptor, 'OK. glossary_section request done successfully');
    }
    if (mode === 'path') {
      const path = source['path'];
      if (!Array.isArray(path) || path.length < 2) {
        return err('Error. Path must be an array with at least 2 tipos', 'invalid_path');
      }
      const resolved = await resolvePathHops(ontology, path as string[]);
      if (resolved === null) return err('Error. Failed to resolve path', 'path_resolution_failed');
      return ok(resolved, 'OK. glossary_path request done successfully');
    }
    return err(
      'Error. Invalid mode: ' + mode + '. Use "sections", "section", or "path"',
      'invalid_mode',
    );
  }

  async function doResolvePath(rqo: RqoLike): Promise<Envelope> {
    const source = sourceOf(rqo);
    const path = source['path'];
    if (!Array.isArray(path) || path.length === 0) {
      return err(
        'Error. Missing or invalid source.path parameter (array of tipos required)',
        'missing_path',
      );
    }
    if (path.length < 2) {
      return err('Error. Path must contain at least 2 elementos', 'path_too_short');
    }
    const resolved = await resolvePathHops(ontology, path as string[]);
    if (resolved === null) return err('Error. Failed to resolve path', 'path_resolution_failed');
    return ok(resolved, 'OK. resolve_path request done successfully');
  }

  // ───────────────────────────────── handler ────────────────────────────────

  return {
    ddApi: 'dd_ontology_api',
    apiActions: API_ACTIONS,

    async canHandleRequest(rqo: RqoLike, session?: GateSession): Promise<boolean> {
      const action = (rqo as { action?: unknown }).action;
      switch (action) {
        case 'get_node':
        case 'resolve_term':
        case 'search':
          return true; // always byte-reproducible
        case 'resolve_section':
          return canHandleResolveSection(rqo, session);
        case 'resolve_path':
          return canHandlePath(sourceOf(rqo)['path']);
        case 'get_glossary': {
          const source = sourceOf(rqo);
          const mode = typeof source['mode'] === 'string' ? source['mode'] : 'sections';
          if (mode === 'sections') return true;
          if (mode === 'section') return canHandleGlossarySection(source['section_tipo']);
          if (mode === 'path') return canHandlePath(source['path']);
          return true; // invalid_mode → native error (matches PHP)
        }
        default:
          return false;
      }
    },

    async dispatch(action: string, rqo: RqoLike): Promise<ApiResponse> {
      switch (action) {
        case 'resolve_term':
          return doResolveTerm(rqo);
        case 'resolve_section':
          return doResolveSection(rqo);
        case 'get_node':
          return doGetNode(rqo);
        case 'search':
          return doSearch(rqo);
        case 'get_glossary':
          return doGetGlossary(rqo);
        case 'resolve_path':
          return doResolvePath(rqo);
        default:
          // Defensive: the router only dispatches when canHandleRequest was true.
          return { result: false, msg: `Error. Request failed [${action}]`, errors: ['not ported'] };
      }
    },
  };
}

/** PHP `(int)$source->x ?? default` — coerce to int, falling back on null/NaN. */
function toInt(v: unknown, fallback: number): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
