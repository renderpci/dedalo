/**
 * Per-instance MEDIA configuration for the media-component value/list resolution.
 *
 * In PHP these are install-time `define()` constants compiled from the config
 * catalog (core/base/config/catalog/domains/media_image.php) with the install
 * `private/.env` allowed to OVERRIDE the catalog default. They are NOT hardcoded
 * here because they vary per install: this dedalo7_mib install, for example,
 * overrides DEDALO_IMAGE_EXTENSIONS_SUPPORTED and sets
 * DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS=["avif"] (NOT the catalog default).
 *
 * Like LangConfig / ContextConfig, a MediaConfig is built once from the env map
 * and passed in explicitly (frozen, process-global config — never per-request
 * mutable state, never read from a module-global ambient).
 *
 * ── PHP SOURCE (component_image / component_media_common) ──
 *   get_extension()        → $this->extension ?? DEDALO_IMAGE_EXTENSION   ('jpg')
 *   get_thumb_extension()  → DEDALO_THUMB_EXTENSION  (defined? : 'jpg')
 *   get_default_quality()  → DEDALO_IMAGE_QUALITY_DEFAULT  ('1.5MB')
 *   get_thumb_quality()    → DEDALO_QUALITY_THUMB  (defined? : 'thumb')
 *   get_original_quality() → DEDALO_IMAGE_QUALITY_ORIGINAL  ('original')
 *   get_ar_quality()       → DEDALO_IMAGE_AR_QUALITY  (the quality ladder)
 *   get_allowed_extensions() → DEDALO_IMAGE_EXTENSIONS_SUPPORTED (upload whitelist)
 *   get_alternative_extensions() → DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS (?: null)
 *
 * The component LIST-mode data-half filter (get_list_value) only consults the
 * first four (imageExtension, thumbExtension, imageQualityDefault, qualityThumb);
 * the remaining fields are exposed for completeness (they belong to the CONTEXT
 * 'features' block, which is the element-context builder's job — not gated here).
 *
 * NB: the per-instance `extension`/`quality` instance OVERRIDES (PHP
 * `$this->extension`/`$this->quality`) are NOT modelled: for a freshly read
 * component instance they are unset, so get_extension()/get_quality() always fall
 * through to the config constants. The read-side LIST path never sets them, which
 * is why the constants alone reproduce the live filter (verified vs psql + bytes).
 */

/** The per-install media config (frozen; mirrors the DEDALO_IMAGE_* constants). */
export interface MediaConfig {
  /** DEDALO_IMAGE_EXTENSION — primary extension for the default/working quality. */
  readonly imageExtension: string;
  /** DEDALO_THUMB_EXTENSION — extension used for the thumb quality. */
  readonly thumbExtension: string;
  /** DEDALO_IMAGE_QUALITY_DEFAULT — the everyday working quality (e.g. '1.5MB'). */
  readonly imageQualityDefault: string;
  /** DEDALO_QUALITY_THUMB — the thumbnail quality key (e.g. 'thumb'). */
  readonly qualityThumb: string;
  /** DEDALO_IMAGE_QUALITY_ORIGINAL — the master/original quality key. */
  readonly imageQualityOriginal: string;
  /** DEDALO_IMAGE_AR_QUALITY — the full ordered quality ladder. */
  readonly arQuality: readonly string[];
  /** DEDALO_IMAGE_EXTENSIONS_SUPPORTED — the upload whitelist. */
  readonly allowedExtensions: readonly string[];
  /** DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS — extra output formats, or null. */
  readonly alternativeExtensions: readonly string[] | null;
}

/** The PHP-source catalog defaults (config/sample.config.php). Install .env overrides. */
const DEFAULTS = {
  imageExtension: 'jpg',
  thumbExtension: 'jpg',
  imageQualityDefault: '1.5MB',
  qualityThumb: 'thumb',
  imageQualityOriginal: 'original',
  arQuality: ['original', 'modified', '100MB', '25MB', '6MB', '1.5MB', 'thumb'] as const,
  allowedExtensions: ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'psd', 'raw', 'webp', 'heic', 'avif'] as const,
} as const;

/** Parse a JSON-array env var to a string[], or undefined when absent/invalid. */
function parseStringArray(raw: string | undefined): string[] | undefined {
  if (raw === undefined || raw === '') return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Build a frozen MediaConfig from a Dédalo-style env map (the DEDALO_IMAGE_*
 * vars in private/.env). Mirrors how PHP's config compiler reads the catalog +
 * .env override. Falls back to the PHP catalog defaults when a var is absent.
 *
 * NB: tests PIN this config (pass an explicit env map) — they do NOT depend on
 * ambient process.env.
 */
export function mediaConfigFromEnv(env: Record<string, string | undefined> = process.env): MediaConfig {
  const allowedExtensions =
    parseStringArray(env.DEDALO_IMAGE_EXTENSIONS_SUPPORTED) ?? [...DEFAULTS.allowedExtensions];
  // DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS is null in the catalog (undefined → null),
  // and set to e.g. ["avif"] by this install's .env.
  const alternativeExtensions = parseStringArray(env.DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS) ?? null;
  const arQuality = parseStringArray(env.DEDALO_IMAGE_AR_QUALITY) ?? [...DEFAULTS.arQuality];

  return Object.freeze({
    imageExtension: env.DEDALO_IMAGE_EXTENSION ?? DEFAULTS.imageExtension,
    thumbExtension: env.DEDALO_THUMB_EXTENSION ?? DEFAULTS.thumbExtension,
    imageQualityDefault: env.DEDALO_IMAGE_QUALITY_DEFAULT ?? DEFAULTS.imageQualityDefault,
    qualityThumb: env.DEDALO_QUALITY_THUMB ?? DEFAULTS.qualityThumb,
    imageQualityOriginal: env.DEDALO_IMAGE_QUALITY_ORIGINAL ?? DEFAULTS.imageQualityOriginal,
    arQuality: Object.freeze(arQuality),
    allowedExtensions: Object.freeze(allowedExtensions),
    alternativeExtensions: alternativeExtensions === null ? null : Object.freeze(alternativeExtensions),
  });
}
