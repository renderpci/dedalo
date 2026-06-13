<?php
/**
* SCHEMA — declarative configuration manifest
* --------------------------------------------------------------------------
* The single, aligned source of truth that correlates each .env key with its
* type and the legacy constant it emits. dd_config uses it to coerce, validate
* and emit; the lint tool cross-checks it against defaults.env and the emitted
* constants so missing/inconsistent definitions surface immediately.
*
* Row format (compact list):
*   'ENV_KEY' => [ type, 'CONST_NAME', default, [flags], 'phase' ]
*     type    : string | int | float | bool | json | enum
*     CONST   : legacy constant emitted (defaults to ENV_KEY; here always equal)
*     default : native default if no layer/env supplies the key (null = none)
*     flags   : ['required','secret','sentinel:VALUE','enum:a|b|c']
*     phase   : 'main' (default) | 'post_tipos' (emitted after dd_tipos.php)
*
* Values themselves live in config/defaults.env — keep this file to types/flags.
* Computed/derived/request-scoped constants are NOT here (see paths.php/kernel).
* --------------------------------------------------------------------------
*/

return [

// key                                    type     const(=key)                            default flags
// --- identity ---------------------------------------------------------------
'DEDALO_ENTITY'                       => ['string','DEDALO_ENTITY',                       null, []],
'DEDALO_ENTITY_ID'                    => ['int',   'DEDALO_ENTITY_ID',                    null, []],
'DEVELOPMENT_SERVER'                  => ['bool',  'DEVELOPMENT_SERVER',                  null, []],

// --- crypto / secrets -------------------------------------------------------
'DEDALO_SALT_STRING'                  => ['string','DEDALO_SALT_STRING',                  null, ['sentinel:dedalo_six']],
'DEDALO_DIFFUSION_INTERNAL_TOKEN'     => ['string','DEDALO_DIFFUSION_INTERNAL_TOKEN',     null, []],
'ENCRYPTION_MODE'                     => ['string','ENCRYPTION_MODE',                     null, []],

// --- locale / time ----------------------------------------------------------
'DEDALO_TIMEZONE'                     => ['string','DEDALO_TIMEZONE',                     null, []],
'DEDALO_LOCALE'                       => ['string','DEDALO_LOCALE',                       null, []],
'DEDALO_DATE_ORDER'                   => ['enum',  'DEDALO_DATE_ORDER',                   null, ['enum:dmy|mdy|ymd']],

// --- diffusion endpoints ----------------------------------------------------
'DEDALO_DIFFUSION_SOCKET_PATH'        => ['string','DEDALO_DIFFUSION_SOCKET_PATH',        null, []],

// --- sessions ---------------------------------------------------------------
'DEDALO_SESSION_HANDLER'              => ['enum',  'DEDALO_SESSION_HANDLER',              null, ['enum:files|redis|memcached|postgresql|user']],

// --- backups ----------------------------------------------------------------
'DEDALO_BACKUP_ON_LOGIN'              => ['bool',  'DEDALO_BACKUP_ON_LOGIN',              null, []],
'DEDALO_BACKUP_TIME_RANGE'            => ['int',   'DEDALO_BACKUP_TIME_RANGE',            null, []],

// --- languages --------------------------------------------------------------
'DEDALO_STRUCTURE_LANG'               => ['string','DEDALO_STRUCTURE_LANG',               null, []],
'DEDALO_APPLICATION_LANGS'            => ['json',  'DEDALO_APPLICATION_LANGS',            null, []],
'DEDALO_APPLICATION_LANGS_DEFAULT'    => ['string','DEDALO_APPLICATION_LANGS_DEFAULT',    null, []],
'DEDALO_DATA_LANG_DEFAULT'            => ['string','DEDALO_DATA_LANG_DEFAULT',            null, []],
'DEDALO_DATA_LANG_SELECTOR'           => ['bool',  'DEDALO_DATA_LANG_SELECTOR',           null, []],
'DEDALO_DATA_LANG_SYNC'               => ['bool',  'DEDALO_DATA_LANG_SYNC',               null, []],
'DEDALO_DATA_NOLAN'                   => ['string','DEDALO_DATA_NOLAN',                   null, []],
'DEDALO_PROJECTS_DEFAULT_LANGS'       => ['json',  'DEDALO_PROJECTS_DEFAULT_LANGS',       null, []],

// --- default config values --------------------------------------------------
'DEDALO_PREFIX_TIPOS'                 => ['json',  'DEDALO_PREFIX_TIPOS',                 null, []],
'MAIN_FALLBACK_SECTION'               => ['string','MAIN_FALLBACK_SECTION',               null, []],
'NUMERICAL_MATRIX_VALUE_YES'          => ['int',   'NUMERICAL_MATRIX_VALUE_YES',          null, []],
'NUMERICAL_MATRIX_VALUE_NO'           => ['int',   'NUMERICAL_MATRIX_VALUE_NO',           null, []],
'DEDALO_MAX_ROWS_PER_PAGE'            => ['int',   'DEDALO_MAX_ROWS_PER_PAGE',            null, []],
'DEDALO_PROFILE_DEFAULT'              => ['int',   'DEDALO_PROFILE_DEFAULT',              null, []],
'DEDALO_DEFAULT_PROJECT'              => ['int',   'DEDALO_DEFAULT_PROJECT',              null, []],

// --- media: thumb common ----------------------------------------------------
'DEDALO_THUMB_EXTENSION'              => ['string','DEDALO_THUMB_EXTENSION',              null, []],
'DEDALO_QUALITY_THUMB'                => ['string','DEDALO_QUALITY_THUMB',                null, []],
'DEDALO_IMAGE_THUMB_WIDTH'            => ['int',   'DEDALO_IMAGE_THUMB_WIDTH',            null, []],
'DEDALO_IMAGE_THUMB_HEIGHT'           => ['int',   'DEDALO_IMAGE_THUMB_HEIGHT',           null, []],

// --- media: audio / video ---------------------------------------------------
'DEDALO_AV_FOLDER'                    => ['string','DEDALO_AV_FOLDER',                    null, []],
'DEDALO_AV_EXTENSION'                 => ['string','DEDALO_AV_EXTENSION',                 null, []],
'DEDALO_AV_EXTENSIONS_SUPPORTED'      => ['json',  'DEDALO_AV_EXTENSIONS_SUPPORTED',      null, []],
'DEDALO_AV_MIME_TYPE'                 => ['string','DEDALO_AV_MIME_TYPE',                 null, []],
'DEDALO_AV_TYPE'                      => ['string','DEDALO_AV_TYPE',                      null, []],
'DEDALO_AV_QUALITY_ORIGINAL'          => ['string','DEDALO_AV_QUALITY_ORIGINAL',          null, []],
'DEDALO_AV_QUALITY_DEFAULT'           => ['string','DEDALO_AV_QUALITY_DEFAULT',           null, []],
'DEDALO_AV_AR_QUALITY'                => ['json',  'DEDALO_AV_AR_QUALITY',                null, []],
'DEDALO_AV_POSTERFRAME_EXTENSION'     => ['string','DEDALO_AV_POSTERFRAME_EXTENSION',     null, []],
'DEDALO_AV_FFMPEG_PATH'               => ['string','DEDALO_AV_FFMPEG_PATH',               null, []],
'DEDALO_AV_FASTSTART_PATH'            => ['string','DEDALO_AV_FASTSTART_PATH',            null, []],
'DEDALO_AV_FFPROBE_PATH'              => ['string','DEDALO_AV_FFPROBE_PATH',              null, []],
'DEDALO_AV_STREAMER'                  => ['json',  'DEDALO_AV_STREAMER',                  null, []],
'DEDALO_SUBTITLES_FOLDER'             => ['string','DEDALO_SUBTITLES_FOLDER',             null, []],
'DEDALO_AV_SUBTITLES_EXTENSION'       => ['string','DEDALO_AV_SUBTITLES_EXTENSION',       null, []],
'DEDALO_AV_RECOMPRESS_ALL'            => ['int',   'DEDALO_AV_RECOMPRESS_ALL',            null, []],

// --- media: image -----------------------------------------------------------
'DEDALO_IMAGE_FOLDER'                 => ['string','DEDALO_IMAGE_FOLDER',                 null, []],
'DEDALO_IMAGE_EXTENSION'              => ['string','DEDALO_IMAGE_EXTENSION',              null, []],
'DEDALO_IMAGE_MIME_TYPE'              => ['string','DEDALO_IMAGE_MIME_TYPE',              null, []],
'DEDALO_IMAGE_TYPE'                   => ['string','DEDALO_IMAGE_TYPE',                   null, []],
'DEDALO_IMAGE_EXTENSIONS_SUPPORTED'   => ['json',  'DEDALO_IMAGE_EXTENSIONS_SUPPORTED',   null, []],
'DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS' => ['json',  'DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS', null, []],
'DEDALO_IMAGE_QUALITY_ORIGINAL'       => ['string','DEDALO_IMAGE_QUALITY_ORIGINAL',       null, []],
'DEDALO_IMAGE_QUALITY_RETOUCHED'      => ['string','DEDALO_IMAGE_QUALITY_RETOUCHED',      null, []],
'DEDALO_IMAGE_QUALITY_DEFAULT'        => ['string','DEDALO_IMAGE_QUALITY_DEFAULT',        null, []],
'DEDALO_IMAGE_AR_QUALITY'             => ['json',  'DEDALO_IMAGE_AR_QUALITY',             null, []],
'DEDALO_IMAGE_PRINT_DPI'              => ['int',   'DEDALO_IMAGE_PRINT_DPI',              null, []],
'MAGICK_PATH'                         => ['string','MAGICK_PATH',                         null, []],
'MAGICK_CONFIG'                       => ['json',  'MAGICK_CONFIG',                       null, []],
'DEDALO_IMAGE_WEB_FOLDER'             => ['string','DEDALO_IMAGE_WEB_FOLDER',             null, []],

// --- media: pdf -------------------------------------------------------------
'DEDALO_PDF_FOLDER'                   => ['string','DEDALO_PDF_FOLDER',                   null, []],
'DEDALO_PDF_EXTENSION'                => ['string','DEDALO_PDF_EXTENSION',                null, []],
'DEDALO_PDF_EXTENSIONS_SUPPORTED'     => ['json',  'DEDALO_PDF_EXTENSIONS_SUPPORTED',     null, []],
'DEDALO_PDF_ALTERNATIVE_EXTENSIONS'   => ['json',  'DEDALO_PDF_ALTERNATIVE_EXTENSIONS',   null, []],
'DEDALO_PDF_MIME_TYPE'                => ['string','DEDALO_PDF_MIME_TYPE',                null, []],
'DEDALO_PDF_TYPE'                     => ['string','DEDALO_PDF_TYPE',                     null, []],
'DEDALO_PDF_QUALITY_ORIGINAL'         => ['string','DEDALO_PDF_QUALITY_ORIGINAL',         null, []],
'DEDALO_PDF_QUALITY_DEFAULT'          => ['string','DEDALO_PDF_QUALITY_DEFAULT',          null, []],
'DEDALO_PDF_AR_QUALITY'               => ['json',  'DEDALO_PDF_AR_QUALITY',               null, []],
'PDF_AUTOMATIC_TRANSCRIPTION_ENGINE'  => ['string','PDF_AUTOMATIC_TRANSCRIPTION_ENGINE',  null, []],

// --- media: 3d --------------------------------------------------------------
'DEDALO_3D_FOLDER'                    => ['string','DEDALO_3D_FOLDER',                    null, []],
'DEDALO_3D_EXTENSION'                 => ['string','DEDALO_3D_EXTENSION',                 null, []],
'DEDALO_3D_EXTENSIONS_SUPPORTED'      => ['json',  'DEDALO_3D_EXTENSIONS_SUPPORTED',      null, []],
'DEDALO_3D_MIME_TYPE'                 => ['string','DEDALO_3D_MIME_TYPE',                 null, []],
'DEDALO_3D_QUALITY_ORIGINAL'          => ['string','DEDALO_3D_QUALITY_ORIGINAL',          null, []],
'DEDALO_3D_QUALITY_DEFAULT'           => ['string','DEDALO_3D_QUALITY_DEFAULT',           null, []],
'DEDALO_3D_THUMB_DEFAULT'             => ['string','DEDALO_3D_THUMB_DEFAULT',             null, []],
'DEDALO_3D_AR_QUALITY'                => ['json',  'DEDALO_3D_AR_QUALITY',                null, []],
'DEDALO_3D_GLTFPACK_PATH'             => ['string','DEDALO_3D_GLTFPACK_PATH',             null, []],
'DEDALO_3D_FBX2GLTF_PATH'             => ['string','DEDALO_3D_FBX2GLTF_PATH',             null, []],
'DEDALO_3D_COLLADA2GLTF_PATH'         => ['string','DEDALO_3D_COLLADA2GLTF_PATH',         null, []],

// --- media: svg -------------------------------------------------------------
'DEDALO_SVG_FOLDER'                   => ['string','DEDALO_SVG_FOLDER',                   null, []],
'DEDALO_SVG_EXTENSION'                => ['string','DEDALO_SVG_EXTENSION',                null, []],
'DEDALO_SVG_EXTENSIONS_SUPPORTED'     => ['json',  'DEDALO_SVG_EXTENSIONS_SUPPORTED',     null, []],
'DEDALO_SVG_MIME_TYPE'                => ['string','DEDALO_SVG_MIME_TYPE',                null, []],
'DEDALO_SVG_QUALITY_ORIGINAL'         => ['string','DEDALO_SVG_QUALITY_ORIGINAL',         null, []],
'DEDALO_SVG_QUALITY_DEFAULT'          => ['string','DEDALO_SVG_QUALITY_DEFAULT',          null, []],
'DEDALO_SVG_AR_QUALITY'               => ['json',  'DEDALO_SVG_AR_QUALITY',               null, []],

// --- media: html files ------------------------------------------------------
'DEDALO_HTML_FILES_FOLDER'            => ['string','DEDALO_HTML_FILES_FOLDER',            null, []],
'DEDALO_HTML_FILES_EXTENSION'         => ['string','DEDALO_HTML_FILES_EXTENSION',         null, []],

// --- upload -----------------------------------------------------------------
'DEDALO_UPLOAD_SERVICE_CHUNK_FILES'   => ['int',   'DEDALO_UPLOAD_SERVICE_CHUNK_FILES',   null, []],
'DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT'=> ['int',   'DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT',null, []],

// --- geo --------------------------------------------------------------------
'DEDALO_GEO_PROVIDER'                 => ['string','DEDALO_GEO_PROVIDER',                 null, []],

// --- entity menu ------------------------------------------------------------
'DEDALO_ENTITY_MEDIA_AREA_TIPO'       => ['string','DEDALO_ENTITY_MEDIA_AREA_TIPO',       null, []],
'DEDALO_ENTITY_MENU_SKIP_TIPOS'       => ['json',  'DEDALO_ENTITY_MENU_SKIP_TIPOS',       null, []],

// --- install / locks / notifications ----------------------------------------
'DEDALO_TEST_INSTALL'                 => ['bool',  'DEDALO_TEST_INSTALL',                 null, []],
'DEDALO_LOCK_COMPONENTS'              => ['bool',  'DEDALO_LOCK_COMPONENTS',              null, []],
'DEDALO_NOTIFICATIONS'                => ['bool',  'DEDALO_NOTIFICATIONS',                null, []],
'DEDALO_MAINTENANCE_MODE'             => ['bool',  'DEDALO_MAINTENANCE_MODE',             null, []],

// --- media access control ---------------------------------------------------
'DEDALO_MEDIA_ACCESS_MODE'            => ['enum',  'DEDALO_MEDIA_ACCESS_MODE',            null, ['enum:false|private|publication']],
'DEDALO_PROTECT_MEDIA_FILES'          => ['bool',  'DEDALO_PROTECT_MEDIA_FILES',          null, []],

// --- behavior flags ---------------------------------------------------------
'DEDALO_AR_EXCLUDE_COMPONENTS'        => ['json',  'DEDALO_AR_EXCLUDE_COMPONENTS',        null, []],
'DEDALO_FILTER_USER_RECORDS_BY_ID'    => ['bool',  'DEDALO_FILTER_USER_RECORDS_BY_ID',    null, []],
'DEDALO_SEARCH_CLIENT_MAX_LIMIT'      => ['int',   'DEDALO_SEARCH_CLIENT_MAX_LIMIT',      null, []],

// --- diffusion --------------------------------------------------------------
'DEDALO_DIFFUSION_DOMAIN'             => ['string','DEDALO_DIFFUSION_DOMAIN',             null, []],
'DEDALO_DIFFUSION_RESOLVE_LEVELS'     => ['int',   'DEDALO_DIFFUSION_RESOLVE_LEVELS',     null, []],
'DEDALO_PUBLICATION_CLEAN_URL'        => ['bool',  'DEDALO_PUBLICATION_CLEAN_URL',        null, []],
'DEDALO_DIFFUSION_CUSTOM'             => ['json',  'DEDALO_DIFFUSION_CUSTOM',             null, []],
'API_WEB_USER_CODE_MULTIPLE'          => ['json',  'API_WEB_USER_CODE_MULTIPLE',          null, []],

// --- ontology / code servers ------------------------------------------------
'STRUCTURE_FROM_SERVER'               => ['bool',  'STRUCTURE_FROM_SERVER',               null, []],
'IS_AN_ONTOLOGY_SERVER'               => ['bool',  'IS_AN_ONTOLOGY_SERVER',               null, []],
'ONTOLOGY_SERVERS'                    => ['json',  'ONTOLOGY_SERVERS',                    null, []],
'IS_A_CODE_SERVER'                    => ['bool',  'IS_A_CODE_SERVER',                    null, []],
'CODE_SERVERS'                        => ['json',  'CODE_SERVERS',                        null, []],

// --- misc -------------------------------------------------------------------
'IP_API'                              => ['json',  'IP_API',                              null, []],

// =============================================================================
// SECRETS phase — emitted AFTER config_db.php with if(!defined): legacy
// config_db.php still wins when present (zero-touch upgrades), otherwise these
// are sourced from /private/.env (outside the web root). Flagged 'secret' so
// the lint never expects them in the version-controlled defaults.env, and
// 'sentinel:X' so a leftover sample placeholder is reported.
// key                                    type     const(=key)                            default flags                                phase
'DEDALO_DATABASE_CONN'                => ['string','DEDALO_DATABASE_CONN',                null, ['secret'],                             'secrets'],
'DEDALO_USERNAME_CONN'                => ['string','DEDALO_USERNAME_CONN',                null, ['secret','sentinel:myusername'],       'secrets'],
'DEDALO_PASSWORD_CONN'                => ['string','DEDALO_PASSWORD_CONN',                null, ['secret','sentinel:mypassword'],       'secrets'],
'DEDALO_HOSTNAME_CONN'                => ['string','DEDALO_HOSTNAME_CONN',                null, ['secret'],                             'secrets'],
'DEDALO_DB_PORT_CONN'                 => ['string','DEDALO_DB_PORT_CONN',                 null, ['secret'],                             'secrets'],
'DEDALO_SOCKET_CONN'                  => ['string','DEDALO_SOCKET_CONN',                  null, ['secret'],                             'secrets'],
'DEDALO_INFORMATION'                  => ['string','DEDALO_INFORMATION',                  null, ['secret','sentinel:Dédalo install version'], 'secrets'],
'MYSQL_DEDALO_HOSTNAME_CONN'          => ['string','MYSQL_DEDALO_HOSTNAME_CONN',          null, ['secret'],                             'secrets'],
'MYSQL_DEDALO_USERNAME_CONN'          => ['string','MYSQL_DEDALO_USERNAME_CONN',          null, ['secret'],                             'secrets'],
'MYSQL_DEDALO_PASSWORD_CONN'          => ['string','MYSQL_DEDALO_PASSWORD_CONN',          null, ['secret'],                             'secrets'],
'MYSQL_DEDALO_DATABASE_CONN'          => ['string','MYSQL_DEDALO_DATABASE_CONN',          null, ['secret'],                             'secrets'],
'MYSQL_DEDALO_DB_PORT_CONN'           => ['int',   'MYSQL_DEDALO_DB_PORT_CONN',           null, ['secret'],                             'secrets'],
'MYSQL_DEDALO_SOCKET_CONN'            => ['string','MYSQL_DEDALO_SOCKET_CONN',            null, ['secret'],                             'secrets'],

];
