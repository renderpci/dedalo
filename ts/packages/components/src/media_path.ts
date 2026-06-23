/**
 * MEDIA path / URL / file-existence layer — port of the recurring
 * `component_media_common` path machinery (core/component_media_common/
 * class.component_media_common.php):
 *
 *   get_media_url_dir(q)  → DEDALO_MEDIA_URL  + folder + initial_media_path + '/' + q + additional_path
 *   get_media_path_dir(q) → DEDALO_MEDIA_PATH + folder + initial_media_path + '/' + q + additional_path
 *   get_url(q,test,abs,…) → media_url_dir(q) + '/' + id + '.' + extension
 *   get_media_filepath(q) → media_path_dir(q) + '/' + id + '.' + extension
 *
 * The component "id" (get_id → get_identifier) is the flat filename stem:
 *   {component_tipo}_{section_tipo}_{section_id}     (locator::DELIMITER = '_')
 * plus '_'+DEDALO_DATA_LANG appended when the component tipo is translatable.
 *
 * ── SHARDING (additional_path) ──
 * component_media_common::get_additional_path resolves a per-record sub-folder:
 *   1. properties.additional_path — a SIBLING component's text value (a value read).
 *      NOT reproduced here (needs a component value read on another tipo) → caller
 *      must DECLINE when this property is present.
 *   2. properties.max_items_folder (an int N, normally 1000) — pure arithmetic bucket:
 *        additional_path = '/' + N * floor(section_id / N)
 *      e.g. section_id 210355, N=1000 → '/210000'. REPRODUCED here.
 *   3. neither → no shard (additional_path = '' / null).
 *
 * ── initial_media_path ──
 * properties.initial_media_path.{tipo} — a top-level sub-dir under the quality root
 * (e.g. '/archive_photos'). A leading '/' is forced. Usually absent (null).
 *
 * ── folder ──
 * Per media model: component_image → DEDALO_IMAGE_FOLDER ('/image'),
 * component_av → DEDALO_AV_FOLDER ('/av'), component_pdf → DEDALO_PDF_FOLDER ('/pdf'),
 * component_3d → DEDALO_3D_FOLDER ('/3d'). Read from MediaPathConfig.
 *
 * ── file_exist / get_url(test_file=true) ──
 * get_url with test_file=true stat()s the on-disk file at get_media_filepath(q):
 *   - exists  → returns the URL (absolute when absolute=true).
 *   - missing → default_add=false → returns null. (dd_agent_api::get_media_url passes
 *     test_file=true, default_add=false, so a missing file yields url=null,
 *     file_exist=false.)
 *
 * NB: get_url's external_source / time-machine / placeholder branches are NOT modelled
 * here — the agent-API caller never sets them for a plain list read (external_source is
 * a DB-derived sibling read handled by component_image.getExternalSource; tm mode is a
 * separate data_source). Callers that hit those branches must DECLINE.
 *
 * Pure functions + a single async fileExists (Bun.file stat). No module-global state;
 * the config is built once from env and passed in (frozen), mirroring MediaConfig.
 */

/** Per-install MEDIA path/URL config (frozen; mirrors the DEDALO_* path constants). */
export interface MediaPathConfig {
  /** DEDALO_MEDIA_URL — the public URL prefix for the media tree (e.g. '/dedalo/media'). */
  readonly mediaUrl: string;
  /** DEDALO_MEDIA_PATH — the absolute filesystem prefix for the media tree. */
  readonly mediaPath: string;
  /** DEDALO_PROTOCOL — e.g. 'http://' (used when absolute=true). */
  readonly protocol: string;
  /** DEDALO_HOST — e.g. 'localhost' (used when absolute=true). */
  readonly host: string;
  /** Per-media-model root folder segment (model → e.g. '/image'). */
  readonly folders: Readonly<Record<string, string>>;
}

/** PHP catalog default folders per media model (config/sample.config.php). */
const DEFAULT_FOLDERS = {
  component_image: '/image',
  component_av: '/av',
  component_pdf: '/pdf',
  component_3d: '/3d',
} as const;

/**
 * Build a frozen MediaPathConfig from a Dédalo-style env map.
 *
 * DEDALO_MEDIA_URL / DEDALO_MEDIA_PATH are read VERBATIM when present (authoritative,
 * since on this install DEDALO_MEDIA_URL='/dedalo/media' comes from DEDALO_ROOT_WEB
 * '/dedalo', NOT the request-time DEDALO_TOOLS_URL prefix). When absent they fall back
 * to DEDALO_ROOT_WEB/DEDALO_ROOT_PATH + '/media' exactly as the PHP catalog derives them.
 */
export function mediaPathConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): MediaPathConfig {
  const rootWeb = (env.DEDALO_ROOT_WEB ?? '/dedalo').replace(/\/$/, '');
  const rootPath = (env.DEDALO_ROOT_PATH ?? '').replace(/\/$/, '');

  const mediaUrl = env.DEDALO_MEDIA_URL ?? `${rootWeb}/media`;
  const mediaPath = env.DEDALO_MEDIA_PATH ?? (rootPath !== '' ? `${rootPath}/media` : '/media');
  const protocol = env.DEDALO_PROTOCOL ?? 'http://';
  const host = env.DEDALO_HOST ?? 'localhost';

  const folders: Record<string, string> = {
    component_image: forceLeadingSlash(env.DEDALO_IMAGE_FOLDER ?? DEFAULT_FOLDERS.component_image),
    component_av: forceLeadingSlash(env.DEDALO_AV_FOLDER ?? DEFAULT_FOLDERS.component_av),
    component_pdf: forceLeadingSlash(env.DEDALO_PDF_FOLDER ?? DEFAULT_FOLDERS.component_pdf),
    component_3d: forceLeadingSlash(env.DEDALO_3D_FOLDER ?? DEFAULT_FOLDERS.component_3d),
  };

  return Object.freeze({
    mediaUrl,
    mediaPath,
    protocol,
    host,
    folders: Object.freeze(folders),
  });
}

function forceLeadingSlash(s: string): string {
  return s.startsWith('/') ? s : '/' + s;
}

/** The minimal media-component identity needed to build paths/URLs. */
export interface MediaIdentity {
  /** Component tipo (e.g. 'rsc29'). */
  readonly tipo: string;
  /** Section tipo (e.g. 'rsc170'). */
  readonly sectionTipo: string;
  /** Section id (e.g. 210355). */
  readonly sectionId: number;
  /** Component model (e.g. 'component_image') — selects the root folder. */
  readonly model: string;
  /** File extension WITHOUT a leading dot (e.g. 'jpg'). */
  readonly extension: string;
  /** Resolved per-record shard, e.g. '/210000', or '' when none. */
  readonly additionalPath: string;
  /** Resolved initial_media_path, e.g. '/archive_photos', or '' when none. */
  readonly initialMediaPath: string;
  /** Whether the component tipo is translatable (appends '_'+dataLang to the id). */
  readonly translatable: boolean;
}

/**
 * Port of component_media_common::get_additional_path's max_items_folder branch.
 * additional_path = '/' + N * floor(section_id / N). Returns '' when N is not a
 * positive int (caller treats a present properties.additional_path as DECLINE).
 */
export function shardPath(sectionId: number, maxItemsFolder: number): string {
  if (!Number.isFinite(maxItemsFolder) || maxItemsFolder <= 0) return '';
  const bucket = maxItemsFolder * Math.floor(sectionId / maxItemsFolder);
  return '/' + bucket;
}

/**
 * Port of component_common::get_identifier (+ get_id's translatable suffix).
 * '{tipo}_{section_tipo}_{section_id}'(+ '_'+dataLang when translatable).
 */
export function mediaId(identity: MediaIdentity, dataLang: string): string {
  const base = `${identity.tipo}_${identity.sectionTipo}_${identity.sectionId}`;
  return identity.translatable ? `${base}_${dataLang}` : base;
}

/** Port of get_media_url_dir: the relative URL directory for a quality (no trailing slash). */
export function getMediaUrlDir(
  cfg: MediaPathConfig,
  identity: MediaIdentity,
  quality: string,
): string {
  const folder = cfg.folders[identity.model] ?? '';
  const base = folder + identity.initialMediaPath + '/' + quality + identity.additionalPath;
  const dir = cfg.mediaUrl + base;
  // PHP collapses a leading double-slash ('//dedalo/…' → '/dedalo/…').
  return dir.replace(/^\/\//, '/');
}

/** Port of get_media_path_dir: the absolute filesystem directory for a quality. */
export function getMediaPathDir(
  cfg: MediaPathConfig,
  identity: MediaIdentity,
  quality: string,
): string {
  const folder = cfg.folders[identity.model] ?? '';
  const base = folder + identity.initialMediaPath + '/' + quality + identity.additionalPath;
  return cfg.mediaPath + base;
}

/** Port of get_media_filepath: absolute file path = media_path_dir + '/' + id + '.' + ext. */
export function getMediaFilepath(
  cfg: MediaPathConfig,
  identity: MediaIdentity,
  quality: string,
  dataLang: string,
): string {
  return getMediaPathDir(cfg, identity, quality) + '/' + mediaId(identity, dataLang) + '.' + identity.extension;
}

/**
 * Port of get_url WITHOUT the external_source/tm/test_file branches:
 * the relative URL = media_url_dir(q) + '/' + id + '.' + extension, made absolute
 * (protocol+host prefix) when `absolute`.
 */
export function buildMediaUrl(
  cfg: MediaPathConfig,
  identity: MediaIdentity,
  quality: string,
  dataLang: string,
  absolute: boolean,
): string {
  const rel = getMediaUrlDir(cfg, identity, quality) + '/' + mediaId(identity, dataLang) + '.' + identity.extension;
  return absolute ? cfg.protocol + cfg.host + rel : rel;
}

/** A filesystem stat probe (mirrors PHP file_exists/is_file). */
export type FileExistsFn = (absPath: string) => Promise<boolean>;

/** Default FileExistsFn backed by Bun.file().exists() (is_file-equivalent for a path). */
export const bunFileExists: FileExistsFn = (absPath) => Bun.file(absPath).exists();

/**
 * Port of get_url(quality, test_file=true, absolute, default_add=false):
 * builds the file path, stat()s it, and returns { url, fileExist }:
 *   - file exists  → url = buildMediaUrl(…), fileExist = true.
 *   - file missing → url = null, fileExist = false (default_add=false).
 */
export async function getMediaUrlWithExistence(
  cfg: MediaPathConfig,
  identity: MediaIdentity,
  quality: string,
  dataLang: string,
  absolute: boolean,
  fileExists: FileExistsFn = bunFileExists,
): Promise<{ url: string | null; fileExist: boolean }> {
  const filepath = getMediaFilepath(cfg, identity, quality, dataLang);
  const exists = await fileExists(filepath);
  if (!exists) return { url: null, fileExist: false };
  return { url: buildMediaUrl(cfg, identity, quality, dataLang, absolute), fileExist: true };
}
