import type { ComponentDatum, MatrixFamily } from '@dedalo/db';
import { ComponentCommon, type ComponentInit } from './component_common.ts';
import type { MediaConfig } from './media_config.ts';

/**
 * Read-side port of `component_image` for the LIST/tm JSON CONTROLLER data half
 * (component_image_json.php). Scope is the {context,data} DATA element:
 *
 *   list/tm: value = get_list_value() (the stored files_info filtered to the
 *            {default_quality, thumb_quality} × {extension|thumb_extension} set);
 *            item = get_data_item(value); item->external_source = get_external_source().
 *
 * ── get_list_value() (component_media_common::get_list_value) ──
 * For each stored datum's `files_info`, KEEP a file_info iff:
 *   - file_info.quality ∈ [default_quality, thumb_quality]   AND
 *   - file_info.extension === (quality==='thumb' ? thumb_extension : extension)
 * The matched file_info objects are emitted VERBATIM (the stored sharded
 * `file_path`, `file_size`, `file_time`, `file_exist` are passed through — NO URL
 * derivation: the path is already stored in the matrix row, verified vs psql).
 * Returns null when the component has NO stored data (get_data() empty); returns
 * [] when it has data but no file_info matches the filter (e.g. all 'highres'
 * extension while the config extension is 'jpg' — verified vs image_external_source).
 *
 * The quality keys (default/thumb) and extensions come from the per-instance
 * MediaConfig (the DEDALO_IMAGE_* constants). For a freshly read instance PHP's
 * $this->quality / $this->extension overrides are unset, so get_default_quality()/
 * get_extension() fall through to the config constants — which is exactly what the
 * MediaConfig models.
 *
 * ── get_external_source() (component_media_common::get_external_source) ──
 * DB-derived (NOT filesystem/protection): when properties->external_source names a
 * sibling component AND section_id is set, read that sibling's get_data()[0]; if its
 * `dataframe` is non-empty AND it has an `iri`, return the iri; else null. The
 * sibling read is at DEDALO_DATA_NOLAN with NO lang filter (get_data()), so it is a
 * pure point-read reproducible here.
 *
 * ── DECLINED (NOT reproduced here; the controller appends them only in edit) ──
 *   - edit-mode entries (full files_info via get_data_lang) + base_svg_url (an
 *     SVG filesystem-existence probe) → out of scope (LIST only). base_svg_url
 *     needs a FS probe → declined precisely.
 *   - av/pdf media families (posterframe_url / subtitles) → still declined.
 */

/** A stored media file_info entry (verbatim from the matrix 'media' column). */
export interface MediaFileInfo {
  quality?: string;
  extension?: string;
  [k: string]: unknown;
}

/** A stored media datum: {id, files_info:[…], original_*}. */
interface MediaDatum extends ComponentDatum {
  files_info?: MediaFileInfo[];
}

/** Model → matrix family column for the external_source sibling point-read. */
const MODEL_FAMILY: Record<string, MatrixFamily> = {
  component_input_text: 'string',
  component_text_area: 'string',
  component_email: 'string',
  component_number: 'number',
  component_date: 'date',
  component_iri: 'iri',
  component_json: 'misc',
  component_geolocation: 'geo',
};

export class ComponentImage extends ComponentCommon {
  // Media components are non-translatable here (image): get_data_lang returns the
  // raw data unfiltered, and the effective lang is forced to nolan.
  protected override readonly supportsTranslation = false;

  static async create(init: ComponentInit): Promise<ComponentImage> {
    const instance = new ComponentImage(init);
    await instance.resolveLang();
    return instance;
  }

  /** Effective lang (after translatable→nolan resolution). Public accessor. */
  effectiveLang(): string {
    return this.getLang();
  }

  /**
   * Port of component_media_common::get_list_value(). Filters the stored files_info
   * to the default/thumb qualities at the config extension(s). Returns null when the
   * component has no data, else the flattened matched file_info array (possibly []).
   */
  async getListValue(mediaConfig: MediaConfig): Promise<MediaFileInfo[] | null> {
    const data = (await this.getData()) as MediaDatum[] | null;
    if (data === null || data.length === 0) return null;

    const extension = mediaConfig.imageExtension;
    const thumbExtension = mediaConfig.thumbExtension;
    const arQualityToInclude = [mediaConfig.imageQualityDefault, mediaConfig.qualityThumb];

    const listValue: MediaFileInfo[] = [];
    for (const item of data) {
      const filesInfo = item.files_info;
      if (!Array.isArray(filesInfo) || filesInfo.length === 0) continue;
      for (const fileInfo of filesInfo) {
        const currentExtension = fileInfo.quality === 'thumb' ? thumbExtension : extension;
        if (
          typeof fileInfo.extension === 'string' &&
          fileInfo.extension === currentExtension &&
          typeof fileInfo.quality === 'string' &&
          arQualityToInclude.includes(fileInfo.quality)
        ) {
          listValue.push(fileInfo);
        }
      }
    }
    return listValue;
  }

  /**
   * Port of component_media_common::get_external_source(). Reads the sibling
   * component named by properties->external_source and returns its iri when its
   * first datum carries a non-empty dataframe AND an iri; null otherwise (incl.
   * when no external_source property, no section_id, or no qualifying datum).
   */
  async getExternalSource(): Promise<string | null> {
    if (this.sectionId === null) return null;
    const properties = (await this.ontology.getProperties(this.tipo)) ?? {};
    const externalSourceTipo = (properties as { external_source?: unknown }).external_source;
    if (typeof externalSourceTipo !== 'string' || externalSourceTipo === '') return null;

    const model = await this.ontology.getModelByTipo(externalSourceTipo);
    if (model === null) return null;
    const family = MODEL_FAMILY[model];
    if (family === undefined) return null;

    // get_data() of the sibling: raw matrix items for the sibling tipo (no lang
    // filter). The sibling lives in the same section/record (section_id/section_tipo).
    const items = await this.matrix.getComponentData(
      this.matrixTable,
      this.sectionTipo,
      this.sectionId,
      family,
      externalSourceTipo,
    );
    const first = items !== null && items.length > 0 ? (items[0] as ComponentDatum) : null;
    if (first === null) return null;

    const dataframe = (first as { dataframe?: unknown }).dataframe;
    const dataframeNonEmpty =
      dataframe !== undefined &&
      dataframe !== null &&
      ((Array.isArray(dataframe) && dataframe.length > 0) ||
        (typeof dataframe === 'object' && Object.keys(dataframe as object).length > 0));
    if (!dataframeNonEmpty) return null;

    const iri = (first as { iri?: unknown }).iri;
    if (typeof iri === 'string' && iri !== '') return iri;
    return null;
  }
}
