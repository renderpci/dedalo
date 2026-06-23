import type { MatrixDbManager, ComponentDatum, MatrixFamily } from '@dedalo/db';
import type { OntologyRepository } from '@dedalo/ontology';
import type { SearchQueryer } from '@dedalo/search';
import type { LangConfig } from './lang_config.ts';

/**
 * The matrix family columns the ported get_value models read from. A strict
 * subset of @dedalo/db's MatrixFamily (the families whose models are resolved
 * natively): 'string' (input_text/text_area/email), 'number', 'date', 'iri',
 * 'geo', 'misc' (json). Widening this set is the only change needed to add a
 * model whose column differs.
 */
export type DataColumnName = Extract<
  MatrixFamily,
  'string' | 'number' | 'date' | 'iri' | 'geo' | 'misc' | 'relation' | 'media'
>;

/**
 * Construction params for a component instance, mirroring the PHP
 * component_common::get_instance() / __construct() signature (the read-side
 * subset). `lang` is the REQUESTED lang from the RQO; the constructor resolves
 * the EFFECTIVE lang (forced to nolan for non-translatable components).
 */
export interface ComponentInit {
  tipo: string;
  sectionTipo: string;
  sectionId: number | null;
  /** Requested lang (RQO source.lang); defaults to LangConfig.dataLang upstream. */
  lang: string;
  /**
   * Matrix JSONB family column for this model. Maps 1:1 to PHP
   * section_record_data::$column_map (e.g. component_input_text → 'string',
   * component_number → 'number', component_date → 'date', component_iri → 'iri',
   * component_json → 'misc', component_geolocation → 'geo').
   */
  dataColumnName: DataColumnName;
  /** Matrix table the section lives in (e.g. 'matrix'). */
  matrixTable: string;
  matrix: MatrixDbManager;
  ontology: OntologyRepository;
  langConfig: LangConfig;
  /**
   * Parameterised queryer (a Db) for components whose data is computed by a SQL
   * search rather than a point-read — currently only component_relation_children,
   * whose get_data runs a related-mode search over the relation column. Optional:
   * the point-read models never use it. ComponentRelationChildren throws loudly
   * when its get_data needs it and it is absent.
   */
  searchQueryer?: SearchQueryer;
  /**
   * TIME-MACHINE data source. When set (data_source='tm'), getData() returns this
   * array DIRECTLY instead of reading the live matrix column — a port of PHP
   * component_common::get_data()'s tm branch (sets $this->data_resolved = $data_tm
   * and returns; no live load). The array is the matrix_time_machine `data` column
   * (the snapshotted datum, identical in shape to the live column items). null means
   * "tm row had no data" (PHP returns null). Only SIMPLE non-dataframe/non-relation
   * models inject this — the dataframe/relation tm filtering of get_data() is NOT
   * reproduced here (gated out by the caller). Mutually exclusive with a live read.
   */
  tmData?: ComponentDatum[] | null;
}

/**
 * Minimal read-side port of PHP `component_common` — only the pieces the
 * get_value vertical slice needs: lang resolution (translatable → nolan forcing),
 * matrix data load, and the language-filtering of data items (get_data /
 * get_data_lang). The export/flatten/fallback logic lives in the concrete
 * component (component_input_text) exactly as in PHP.
 *
 * No module-global mutable state: the matrix data is memoised on the instance
 * (PHP did the same via $this->data_resolved), and the instance itself is
 * request-scoped by the caller.
 */
export abstract class ComponentCommon {
  protected readonly tipo: string;
  protected readonly sectionTipo: string;
  protected readonly sectionId: number | null;
  protected readonly dataColumnName: DataColumnName;
  protected readonly matrixTable: string;
  protected readonly matrix: MatrixDbManager;
  protected readonly ontology: OntologyRepository;
  protected readonly langConfig: LangConfig;
  /** Optional SQL queryer for search-computed components (see ComponentInit). */
  protected readonly searchQueryer: SearchQueryer | undefined;
  /**
   * Time-machine data source. When `tmActive` is true, getData() returns
   * `tmData` directly (the matrix_time_machine snapshot) instead of the live
   * matrix column — PHP get_data() tm branch. `tmData` may be null (empty tm row).
   */
  private readonly tmActive: boolean;
  private readonly tmData: ComponentDatum[] | null;

  /**
   * Whether this component supports translation at the data level
   * (component_string_common::$supports_translation = true). When false,
   * get_data_lang() returns the full data unfiltered. Subclasses override.
   */
  protected readonly supportsTranslation: boolean = false;

  /** EFFECTIVE lang after the translatable/nolan resolution (see resolveLang). */
  protected lang!: string;
  /** Whether the ontology marks this tipo translatable; loaded lazily once. */
  private translatable: boolean | undefined;
  /** Memoised raw matrix data (PHP $this->data_resolved). */
  private dataResolved: ComponentDatum[] | null | undefined;
  private readonly requestedLang: string;

  constructor(init: ComponentInit) {
    this.tipo = init.tipo;
    this.sectionTipo = init.sectionTipo;
    this.sectionId = init.sectionId;
    this.dataColumnName = init.dataColumnName;
    this.matrixTable = init.matrixTable;
    this.matrix = init.matrix;
    this.ontology = init.ontology;
    this.langConfig = init.langConfig;
    this.searchQueryer = init.searchQueryer;
    this.requestedLang = init.lang;
    this.tmActive = Object.prototype.hasOwnProperty.call(init, 'tmData');
    this.tmData = init.tmData ?? null;
  }

  /** The component's own tipo. */
  getTipo(): string {
    return this.tipo;
  }

  /** Effective lang (resolveLang must have run). PHP $this->get_lang(). */
  getLang(): string {
    return this.lang;
  }

  /**
   * Resolve the effective lang exactly like component_common::__construct():
   * after structure data is loaded, if the tipo is NOT translatable (and not
   * with_lang_versions, which input_text is not), force $this->lang to nolan.
   * Otherwise keep the requested lang. Must be awaited before any data read.
   */
  protected async resolveLang(): Promise<void> {
    if (this.translatable === undefined) {
      this.translatable = await this.ontology.getTranslatable(this.tipo);
    }
    this.lang = this.translatable ? this.requestedLang : this.langConfig.nolan;
  }

  /**
   * Port of component_common::get_data(): the RAW matrix data array for this
   * component (ALL languages), or null when the record/component has no data.
   * No language filtering. Memoised (PHP $this->data_resolved).
   */
  protected async getData(): Promise<ComponentDatum[] | null> {
    if (this.dataResolved !== undefined) return this.dataResolved;
    // TIME-MACHINE branch: return the injected snapshot directly (PHP get_data()
    // sets $this->data_resolved = $data_tm and returns; no live matrix load). The
    // SIMPLE models carry no dataframe/relation filtering (filterTmData is identity);
    // the RELATION family (component_relation_common) overrides filterTmData to apply
    // PHP get_data()'s tm relation-filter (drop dd490 dataframe frames + non-locator
    // entries), since TM rows store the main + dataframe data merged under one tipo.
    if (this.tmActive) {
      this.dataResolved = this.filterTmData(this.tmData);
      return this.dataResolved;
    }
    if (this.sectionId === null) {
      this.dataResolved = null;
      return null;
    }
    const items = await this.matrix.getComponentData(
      this.matrixTable,
      this.sectionTipo,
      this.sectionId,
      this.dataColumnName,
      this.tipo,
    );
    // PHP parity: section_record::get_key_data returns null whenever the component
    // key is absent from the column (`$this->data->$column->$key ?? null`) — it
    // never returns []. MatrixDbManager.getComponentData returns [] for the
    // "record exists but component absent" case, so collapse that empty array to
    // null here to match PHP get_data(). This is byte-significant for the JSON
    // controller `entries` field: a truly-absent component yields entries=null,
    // whereas a component with data only in OTHER langs yields entries=[] (the
    // empty get_data_lang filter result over a non-empty get_data).
    this.dataResolved = items !== null && items.length === 0 ? null : items;
    return this.dataResolved;
  }

  /**
   * Hook: filter the TIME-MACHINE snapshot for this component's OWN data. The base
   * (simple-model) implementation is identity — the tm row holds only the
   * component's own items. The RELATION family overrides it to drop dd490 dataframe
   * frames + non-locator entries (PHP component_common::get_data tm branch, lines
   * 1166-1226), since a relation TM row stores the main + merged dataframe data.
   */
  protected filterTmData(data: ComponentDatum[] | null): ComponentDatum[] | null {
    return data;
  }

  /**
   * Port of component_common::get_data_lang(): filter data items to those whose
   * `lang` exactly equals the effective (or supplied) lang. When the component
   * does not support translation, returns the full unfiltered data.
   *
   * Exact-equality filter (`el.lang === safeLang`): lg-nolan items are returned
   * only when the effective lang IS nolan.
   */
  protected async getDataLang(lang?: string): Promise<ComponentDatum[] | null> {
    const data = await this.getData();
    if (!this.supportsTranslation) return data;
    if (data === null || data.length === 0) return data;
    const safeLang = lang ?? this.getLang();
    return data.filter(
      (el): el is ComponentDatum =>
        el !== null && typeof el === 'object' && el.lang === safeLang,
    );
  }
}
