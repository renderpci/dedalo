/**
 * CONFIG CATALOG — domain: media
 *
 * GENERATED SCAFFOLD (probe_emit_catalog.ts). Hand-edit from here on.
 */

import { join } from 'node:path';
import type { CatalogEntry, CatalogGet } from '../catalog_types.ts';
import { projectRoot } from '../env.ts';

export const MEDIA_KEYS = {
	DEDALO_3D_ALTERNATIVE_EXTENSIONS: {
		type: 'string_list',
		scope: 'operator',
		default: [],
		heading: '3D',
		typeLabel: 'array',
		typeSuffix: '*optional*',
		doc: `This parameter defines the standards file types that will use to create alternative versions of the uploaded 3d files.

Dédalo will use this parameter to create extra versions of every 3d file, besides the standard defined in DEDALO_3D_EXTENSION. When the parameter is active, every 3d file uploaded will be processed in every quality with every format defined here, so the storage and the processing time grow with each format added.

By default the list is empty: no alternative version is created and Dédalo stores only the original file and the standard format.

\`\`\`bash
DEDALO_3D_ALTERNATIVE_EXTENSIONS=["gltf"]
\`\`\``,
	},
	DEDALO_3D_AR_QUALITY: {
		type: 'string_list',
		scope: 'operator',
		default: ['original', 'web'],
		heading: '3D',
		typeLabel: 'array',
		doc: `This parameter defines the different qualities that can be used for store 3d files.

This parameter will use to store files to specific quality.

\`\`\`bash
DEDALO_3D_AR_QUALITY=[DEDALO_3D_QUALITY_ORIGINAL, DEDALO_3D_QUALITY_DEFAULT]
\`\`\``,
	},
	DEDALO_3D_EXTENSION: {
		type: 'string',
		scope: 'operator',
		default: 'glb',
		heading: '3D',
		typeLabel: 'string',
		doc: `This parameter defines the standard file type of 3d files.

By default Dédalo use glb standard definition for the 3d files. All other formats will be exported to this standard.

\`\`\`bash
DEDALO_3D_EXTENSION="glb"
\`\`\``,
	},
	DEDALO_3D_EXTENSIONS_SUPPORTED: {
		type: 'string_list',
		scope: 'operator',
		default: ['glb', 'gltf', 'obj', 'fbx', 'dae', 'zip'],
		heading: '3D',
		typeLabel: 'array',
		doc: `This parameter defines the standards file type admitted for the 3d files.

Dédalo will use this parameter to identify the file format of the original files uploaded by the users before transform it to the standard defined in the DEDALO_3D_EXTENSION parameter.

\`\`\`bash
DEDALO_3D_EXTENSIONS_SUPPORTED=["glb"]
\`\`\`

> Note: in current version only glb files are available, in future versions other format files will be supported: as 'gltf', 'obj', 'fbx', 'dae', 'zip'`,
	},
	DEDALO_3D_FOLDER: {
		type: 'string',
		scope: 'operator',
		default: '/3d',
		heading: '3D',
		typeLabel: 'string',
		doc: `This parameter define the main directory for the 3d files.

\`\`\`bash
DEDALO_3D_FOLDER="/3d"
\`\`\``,
	},
	DEDALO_3D_QUALITY_DEFAULT: {
		type: 'string',
		scope: 'operator',
		default: 'web',
		heading: '3D',
		typeLabel: 'string',
		doc: `This parameter defines the default quality used for the 3d files.

This parameter will use to transform all 3d files to specific format, unifying the quality used by all sections. By default Dédalo use glb format for web quality.

\`\`\`bash
DEDALO_3D_QUALITY_DEFAULT="web"
\`\`\``,
	},
	DEDALO_3D_QUALITY_ORIGINAL: {
		type: 'string',
		scope: 'operator',
		default: 'original',
		heading: '3D',
		typeLabel: 'string',
		doc: `This parameter defines the quality original for the 3d files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit lots of different formats from different sources and qualities, and it define this files as "original" quality. Dédalo will transform all supported formats to web standard format, unify all different qualities and codecs, and will store the original file without touch. In some cases, if the institution has a protocol for manage image files, is possible to use one specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

\`\`\`bash
DEDALO_3D_QUALITY_ORIGINAL="original"
\`\`\``,
	},
	DEDALO_AV_ALTERNATIVE_EXTENSIONS: {
		type: 'string_list',
		scope: 'operator',
		default: [],
		heading: 'Audiovisual',
		typeLabel: 'array',
		typeSuffix: '*optional*',
		doc: `This parameter defines the standards file types that will use to create alternative versions of the uploaded audiovisual files.

Dédalo will use this parameter to compress extra versions of every audiovisual file, besides the encapsulation defined in DEDALO_AV_EXTENSION. When the parameter is active, every file uploaded will be compressed in every quality of DEDALO_AV_AR_QUALITY with every format defined here — a second format therefore doubles the transcoding time and the disk used by the derivatives.

By default the list is empty: Dédalo keeps the original file untouched and compresses only to the standard mp4 encapsulation.

\`\`\`bash
DEDALO_AV_ALTERNATIVE_EXTENSIONS=["webm"]
\`\`\``,
	},
	DEDALO_AV_AR_QUALITY: {
		type: 'string_list',
		scope: 'operator',
		default: ['original', '1080', '720', '576', '404', '240', 'audio'],
		heading: 'Audiovisual',
		typeLabel: 'string',
		doc: `This parameter defines the different qualities that can be used for compress the audiovisual files.

This parameter will use to compress audiovisual files to specific quality. The compression will use the original file and will compress to those qualities when the user demand a specific quality.

\`\`\`bash
DEDALO_AV_AR_QUALITY=[DEDALO_AV_QUALITY_ORIGINAL,"4k","1080","720","576","404","240","audio"]
\`\`\``,
	},
	DEDALO_AV_EXTENSION: {
		type: 'string',
		scope: 'operator',
		default: 'mp4',
		heading: 'Audiovisual',
		typeLabel: 'string',
		doc: `This parameter defines the standard file type of encapsulation for the audiovisual files.

By default Dédalo use mp4 encapsulation definition for the audiovisual files with codec h264 or h265. All other formats will be compressed to this parameters.

\`\`\`bash
DEDALO_AV_EXTENSION="mp4"
\`\`\``,
	},
	DEDALO_AV_EXTENSIONS_SUPPORTED: {
		type: 'string_list',
		scope: 'operator',
		default: [
			'mp4',
			'wave',
			'wav',
			'aiff',
			'aif',
			'mp3',
			'mov',
			'avi',
			'mpg',
			'mpeg',
			'vob',
			'zip',
			'flv',
		],
		heading: 'Audiovisual',
		typeLabel: 'array',
		doc: `This parameter defines the standards file type admitted for the audiovisual files.

Dédalo will use this parameter to identify the file format of the original files uploaded by the users before compress it to the standard defined in the DEDALO_AV_EXTENSION parameter.

\`\`\`bash
DEDALO_AV_EXTENSIONS_SUPPORTED=["mp4","wave","wav","aiff","aif","mp3","mov","avi","mpg","mpeg","vob","zip","flv"]
\`\`\``,
	},
	DEDALO_AV_FASTSTART_PATH: {
		type: 'string',
		scope: 'operator',
		default: (get: CatalogGet) => `${get('DEDALO_BINARY_BASE')}/qt-faststart`,
		defaultDoc: '`<DEDALO_BINARY_BASE>/qt-faststart`',
		heading: 'Audiovisual',
		typeLabel: 'string',
		doc: `This parameter defines the path to the qt-faststart library in the server.

qt-faststart is used to move the av header from last bytes of the av file to the start of the av file, this change improve the load of the av because the header is at the beginning of the file and it can read first when loads begin.

\`\`\`bash
DEDALO_AV_FASTSTART_PATH="/usr/bin/qt-faststart"
\`\`\``,
	},
	DEDALO_AV_FFMPEG_PATH: {
		type: 'string',
		scope: 'operator',
		default: (get: CatalogGet) => `${get('DEDALO_BINARY_BASE')}/ffmpeg`,
		defaultDoc: '`<DEDALO_BINARY_BASE>/ffmpeg`',
		heading: 'Audiovisual',
		typeLabel: 'string',
		doc: `This parameter defines the path to the ffmpeg library in the server. ffmpeg will use to compress the audiovisual files.

\`\`\`bash
DEDALO_AV_FFMPEG_PATH="/usr/bin/ffmpeg"
\`\`\``,
	},
	DEDALO_AV_FFPROBE_PATH: {
		type: 'string',
		scope: 'operator',
		default: (get: CatalogGet) => `${get('DEDALO_BINARY_BASE')}/ffprobe`,
		defaultDoc: '`<DEDALO_BINARY_BASE>/ffprobe`',
		heading: 'Audiovisual',
		typeLabel: 'string',
		doc: `This parameter defines the path to the ffprobe library in the server. ffprobe is used to analyze the audiovisual files and get his metadata.

\`\`\`bash
DEDALO_AV_FFPROBE_PATH="/usr/bin/ffprobe"
\`\`\``,
	},
	DEDALO_AV_FOLDER: {
		type: 'string',
		scope: 'operator',
		default: '/av',
		heading: 'Audiovisual',
		typeLabel: 'string',
		doc: `This parameter defines the main directory for the audiovisual files.

\`\`\`bash
DEDALO_AV_FOLDER="/av"
\`\`\``,
	},
	DEDALO_AV_POSTERFRAME_EXTENSION: {
		type: 'string',
		scope: 'operator',
		default: 'jpg',
		heading: 'Audiovisual',
		typeLabel: 'string',
		doc: `This parameter defines the type of the image file used to create the posterframe of the audiovisual files.

The posterframe is the image that will show before load the audiovisual files and identify it. This parameter define the type of this image. By default Dédalo use jpg standard to create the posterframe.

\`\`\`bash
DEDALO_AV_POSTERFRAME_EXTENSION="jpg"
\`\`\``,
	},
	DEDALO_AV_QUALITY_DEFAULT: {
		type: 'number',
		scope: 'operator',
		default: 404,
		heading: 'Audiovisual',
		typeLabel: 'string',
		doc: `This parameter defines the default quality used for the audiovisual files.

This parameter will use to compress all audiovisual files to specific quality, unifying the quality used by all sections. By default Dédalo use 720x404 h264 quality.

\`\`\`bash
DEDALO_AV_QUALITY_DEFAULT="404"
\`\`\``,
	},
	DEDALO_AV_QUALITY_ORIGINAL: {
		type: 'string',
		scope: 'operator',
		default: 'original',
		heading: 'Audiovisual',
		typeLabel: 'string',
		doc: `This parameter defines the quality original for the audiovisual files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit lots of different formats from different sources and qualities, and it define this files as "original" quality. Dédalo will compress all formats to web standard format, unify all different qualities and codecs, and will store the original file without touch. In some cases, if the institution has a protocol for manage av files, is possible to use one specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

\`\`\`bash
DEDALO_AV_QUALITY_ORIGINAL="original"
\`\`\``,
	},
	DEDALO_AV_SUBTITLES_EXTENSION: {
		type: 'string',
		scope: 'operator',
		default: 'vtt',
		heading: 'Audiovisual',
		typeLabel: 'string',
		doc: `This parameter defines the standard used to create the subtitles.

By default Dédalo use VTT format to create the subtitles.

\`\`\`bash
DEDALO_AV_SUBTITLES_EXTENSION="vtt"
\`\`\``,
	},
	DEDALO_BINARY_BASE: {
		type: 'string',
		scope: 'operator',
		default: () => (process.platform === 'darwin' ? '/opt/homebrew/bin' : '/usr/bin'),
		defaultDoc: '`/opt/homebrew/bin` on macOS, `/usr/bin` elsewhere',
		heading: 'External binaries',
		typeLabel: 'string',
		doc: `This parameter defines the directory where the external media binaries are installed.

All media processing is done by external programs — ImageMagick, ffmpeg, ffprobe, qt-faststart, pdfinfo, pdftotext, pdftohtml, ocrmypdf — and Dédalo does not search the \`PATH\` for them: every binary key derives its default from this directory (\`DEDALO_AV_FFMPEG_PATH\` = \`<DEDALO_BINARY_BASE>/ffmpeg\`, and so on). Set this one key and the whole family follows; set an individual key only when that single binary lives somewhere else.

By default Dédalo uses \`/usr/bin\` (the location the system packages install to) and \`/opt/homebrew/bin\` on macOS. A source build or a local install (\`/usr/local/bin\`) is the usual reason to change it.

\`\`\`bash
DEDALO_BINARY_BASE="/usr/local/bin"
\`\`\``,
	},
	DEDALO_FILE_BIN_PATH: {
		type: 'string',
		scope: 'operator',
		default: (get: CatalogGet) => `${get('DEDALO_BINARY_BASE')}/file`,
		defaultDoc: '`<DEDALO_BINARY_BASE>/file`',
		heading: 'External binaries',
		typeLabel: 'string',
		doc: `This parameter defines the path to the \`file\` utility in the server, the program that reports the type of a file from its content.

The path is derived from DEDALO_BINARY_BASE and is resolved together with the rest of the external binaries when the server boots, so on a standard install there is nothing to set. Point it at an explicit location only when the utility is not installed alongside the other binaries.

Note that Dédalo does not depend on it to accept an upload: the upload endpoint validates every file by reading its signature bytes with its own detector and refuses anything whose content does not match the declared extension, so an install without this utility still uploads and processes media normally.

\`\`\`bash
DEDALO_FILE_BIN_PATH="/usr/bin/file"
\`\`\``,
	},
	DEDALO_GEO_PROVIDER: {
		type: 'string',
		scope: 'operator',
		default: 'VARIOUS',
		heading: 'Georeferencing variables',
		typeLabel: 'string',
		doc: `This parameter defines the tile maps provider to be used.

The param can be change the provider to specific configurations, for ex, if you want to use the ancient roman map and the actual OSM map you can use the "NUMISDATA" provider that include both maps. values supported: OSM | ARCGIS | GOOGLE | VARIOUS | ARCGIS | NUMISDATA

\`\`\`bash
DEDALO_GEO_PROVIDER="VARIOUS"
\`\`\``,
	},
	DEDALO_IDENTIFY_PATH: {
		type: 'string',
		scope: 'operator',
		default: (get: CatalogGet) => `${get('DEDALO_BINARY_BASE')}/identify`,
		defaultDoc: '`<DEDALO_BINARY_BASE>/identify`',
		heading: 'Image',
		typeLabel: 'string',
		doc: `This parameter defines the path to the ImageMagick \`identify\` program in the server. Dédalo uses it to read the attributes of an image file — dimensions, format, colorspace, orientation, transparency — before deciding how to compress it.

The path is derived from DEDALO_BINARY_BASE, so a normal ImageMagick install needs no configuration. Dédalo prefers the modern single-entry-point form (\`magick identify\`, see DEDALO_MAGICK_PATH) and falls back to this standalone binary, which is what the older ImageMagick packages ship. Set this key only to point at a binary in a non-standard location.

\`\`\`bash
DEDALO_IDENTIFY_PATH="/usr/bin/identify"
\`\`\``,
	},
	DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS: {
		type: 'string_list',
		scope: 'operator',
		default: [],
		heading: 'Image',
		typeLabel: 'array',
		typeSuffix: '*optional*',
		doc: `This parameter defines the standards file types that will use to create versions of the uploaded image files.

Dédalo will use this parameter to create alternative versions of the images uploaded, the files formats that will use to convert from the original files uploaded by the users. This parameter is optional and can be used to add other image formats. When the parameter is active, every image uploaded will be processed in every quality with every format define it.

\`\`\`bash
DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS=["avif","png"]
\`\`\`

Example:

Original file: **my_image.tif**

Default format defined in DEDALO_IMAGE_EXTENSION: **jpg**

Alternatives formats defined in DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS: **\\['avif','png'\\]**

Result:

In original quality directory:
> ../media/image/original/rsc29_rsc170_1.tif
>
> ../media/image/original/rsc29_rsc170_1.jpg
>
> ../media/image/original/rsc29_rsc170_1.avif
>
> ../media/image/original/rsc29_rsc170_1.png

In 1.5MB quality directory:
> ../media/image/1.5MB/rsc29_rsc170_1.jpg
>
> ../media/image/1.5MB/rsc29_rsc170_1.avif
>
> ../media/image/1.5MB/rsc29_rsc170_1.png`,
	},
	DEDALO_IMAGE_AR_QUALITY: {
		type: 'string_list',
		scope: 'operator',
		default: ['original', 'modified', '100MB', '25MB', '6MB', '1.5MB', 'thumb'],
		heading: 'Image',
		typeLabel: 'serialized array',
		doc: `This parameter defines the different qualities that can be used for compress the image files.

This parameter will use to compress image files to specific quality. The compression will use the original file and will compress to those qualities when the user demand a specific quality.

\`\`\`bash
DEDALO_IMAGE_AR_QUALITY=[DEDALO_IMAGE_QUALITY_ORIGINAL,DEDALO_IMAGE_QUALITY_RETOUCHED,"25MB","6MB","1.5MB",DEDALO_QUALITY_THUMB]
\`\`\``,
	},
	DEDALO_IMAGE_EXTENSION: {
		type: 'string',
		scope: 'operator',
		default: 'jpg',
		heading: 'Image',
		typeLabel: 'string',
		doc: `This parameter defines the standard file type of image files.

By default Dédalo use jpg standard definition for the image files. All other formats will be compressed to this standard.

\`\`\`bash
DEDALO_IMAGE_EXTENSION="jpg"
\`\`\``,
	},
	DEDALO_IMAGE_EXTENSIONS_SUPPORTED: {
		type: 'string_list',
		scope: 'operator',
		default: ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'psd', 'raw', 'webp', 'heic', 'avif'],
		heading: 'Image',
		typeLabel: 'array',
		doc: `This parameter defines the standards file type admitted for the image files.

Dédalo will use this parameter to identify the file format of the original files uploaded by the users before compress it to the standard defined in the DEDALO_IMAGE_EXTENSION parameter.

\`\`\`bash
DEDALO_IMAGE_EXTENSIONS_SUPPORTED=["jpg","jpeg","png","tif","tiff","bmp","psd","raw","webp","heic"]
\`\`\``,
	},
	DEDALO_IMAGE_FOLDER: {
		type: 'string',
		scope: 'operator',
		default: '/image',
		heading: 'Image',
		typeLabel: 'string',
		doc: `This parameter defines the main directory for the image files.

\`\`\`bash
DEDALO_IMAGE_FOLDER="/image"
\`\`\``,
	},
	DEDALO_IMAGE_PRINT_DPI: {
		type: 'number',
		scope: 'operator',
		default: 150,
		heading: 'Image',
		typeLabel: 'int',
		doc: `This parameter defines the resolution in pixels per inch that will be used in the image compression to be apply when the images will be printed.

\`\`\`bash
DEDALO_IMAGE_PRINT_DPI=150
\`\`\``,
	},
	DEDALO_IMAGE_QUALITY_DEFAULT: {
		type: 'string',
		scope: 'operator',
		default: '1.5MB',
		heading: 'Image',
		typeLabel: 'string',
		doc: `This parameter defines the default quality used for the image files.

This parameter will use to compress all image files to specific quality, unifying the quality used by all sections. By default Dédalo use 1.5MB file size (524.217px or 887x591px) quality.

\`\`\`bash
DEDALO_IMAGE_QUALITY_DEFAULT="1.5MB"
\`\`\``,
	},
	DEDALO_IMAGE_QUALITY_ORIGINAL: {
		type: 'string',
		scope: 'operator',
		default: 'original',
		heading: 'Image',
		typeLabel: 'string',
		doc: `This parameter defines the quality original for the image files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit lots of different formats from different sources and qualities, and it define this files as "original" quality. Dédalo will compress all formats to web standard format, unify all different qualities and codecs, and will store the original file without touch. In some cases, if the institution has a protocol for manage image files, is possible to use one specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

\`\`\`bash
DEDALO_IMAGE_QUALITY_ORIGINAL="original"
\`\`\``,
	},
	DEDALO_IMAGE_QUALITY_RETOUCHED: {
		type: 'string',
		scope: 'operator',
		default: 'modified',
		heading: 'Image',
		typeLabel: 'string',
		doc: `This parameter defines the quality for the image files that has been retouched.

Retouched images are the processed images to improve the image, this quality will be a copy of the original that has any kind of process (color balance, background removed, contrasted, etc)

\`\`\`bash
DEDALO_IMAGE_QUALITY_RETOUCHED="modified"
\`\`\``,
	},
	// DEDALO_IMAGE_THUMB_DEFAULT was DELETED here (2026-07-13). It was documented for
	// operators but read by NOTHING — not in src/, not in tools/, not in the v6 fixture,
	// not even in the retired engine's own config. It configured nothing, anywhere, ever.
	// The real setting is DEDALO_QUALITY_THUMB. The census tripwire now makes a
	// documented-but-unread key impossible to reintroduce.
	DEDALO_IMAGE_THUMB_HEIGHT: {
		type: 'number',
		scope: 'operator',
		default: 148,
		heading: 'Thumb',
		typeLabel: 'int',
		doc: `This parameter defines height size in pixels to the thumb images, it will be used to compress the images with the thumb quality (the smaller version to be used in lists).

\`\`\`bash
DEDALO_IMAGE_THUMB_HEIGHT=148
\`\`\``,
	},
	DEDALO_IMAGE_THUMB_WIDTH: {
		type: 'number',
		scope: 'operator',
		default: 222,
		heading: 'Thumb',
		typeLabel: 'int',
		doc: `This parameter defines width size in pixels to the thumb images, it will be used to compress the images with the thumb quality (the smaller version to be used in lists).

\`\`\`bash
DEDALO_IMAGE_THUMB_WIDTH=222
\`\`\``,
	},
	DEDALO_MAGICK_PATH: {
		type: 'string',
		scope: 'operator',
		default: (get: CatalogGet) => `${get('DEDALO_BINARY_BASE')}/magick`,
		defaultDoc: '`<DEDALO_BINARY_BASE>/magick`',
		heading: 'Image',
		typeLabel: 'string',
		doc: `This parameter defines the path to image magick library in the server (when image magick library is installed)

\`\`\`bash
DEDALO_MAGICK_PATH="/usr/bin/"
\`\`\``,
	},
	DEDALO_MEDIA_BASE_URL: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the public media base URL',
		typeLabel: 'string',
		typeSuffix: '*optional*',
		doc: `This parameter defines the public address that media files are reachable at, and it is used to build ABSOLUTE media URLs where a relative one would be meaningless.

Inside the application every media URL is relative (\`/dedalo/media/image/1.5MB/…\`), because the browser already knows the host. But an exported list, a relation list or any cell that leaves the application must carry a URL a third party can open — so those cells are built as this base plus the file path of the model's default quality.

The parameter is unset by default. When it is unset, media cells cannot be resolved and are reported as unresolved rather than guessed: the export leaves the cell empty and names the models it could not build. Set it to the public root that fronts the installation, without a trailing slash.

\`\`\`bash
DEDALO_MEDIA_BASE_URL="https://my_institution.org"
\`\`\``,
	},
	DEDALO_MEDIA_DIR: {
		type: 'string',
		scope: 'operator',
		default: 'media',
		heading: 'Defining the media URL directory',
		typeLabel: 'string',
		doc: `This parameter defines the NAME of the media directory as it appears in the URL. Every media URL Dédalo builds is \`/dedalo/<DEDALO_MEDIA_DIR>/\` plus the file path.

Do not confuse it with MEDIA_PATH, which is the directory on disk: this one is the public folder name, and the web server maps the two together (the media rules and the reverse-proxy configuration are generated from both, and they must agree — \`<web root> + /dedalo/<DEDALO_MEDIA_DIR>/…\` must resolve to \`MEDIA_PATH/…\`).

The default is \`media\` and a new installation should keep it. The reason to change it is an existing installation whose media were published under another folder name (\`media_mib\`, say): setting the old name keeps every URL already diffused to the public working.

\`\`\`bash
DEDALO_MEDIA_DIR="media"
\`\`\``,
	},
	DEDALO_MEDIA_JOB_CONCURRENCY: {
		type: 'number',
		scope: 'operator',
		default: 3,
		heading: 'Defining media job concurrency',
		typeLabel: 'int',
		doc: `This parameter defines how many media jobs Dédalo will run at the same time.

Media processing (video transcoding, image derivatives, OCR) is heavy and runs inside the server process, so it is capped: a job that arrives while the lanes are busy is queued and starts as soon as one is free. The upload and the interface never block — only the processing waits.

By default Dédalo uses 3 lanes, a safe figure for a modest server. Raise it on a machine with cores to spare and a heavy ingest workload (bulk imports, long interviews); lower it to 1 when the server also serves the public site and must stay responsive while it transcodes. Values below 1 are raised to 1.

\`\`\`bash
DEDALO_MEDIA_JOB_CONCURRENCY=3
\`\`\``,
	},
	DEDALO_MEDIA_PROCESSES_DIR: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the media job process files directory',
		typeLabel: 'string',
		doc: `This parameter defines the directory holding the process files of the media jobs.

Every media job writes a small JSON file with its state (progress, errors, result) that the client polls while it waits, and that lets a job be resumed after a restart. Terminal files are pruned automatically.

By default Dédalo writes them to \`processes/\` inside the private directory, which the server creates on demand. Change it when the private directory is on a read-only or network volume, or when several installations share one host and their job files must stay apart. The server needs read/write access to the directory as its owner.

\`\`\`bash
DEDALO_MEDIA_PROCESSES_DIR="/var/lib/dedalo/processes"
\`\`\``,
	},
	DEDALO_PDF_ALTERNATIVE_EXTENSIONS: {
		type: 'string_list',
		scope: 'operator',
		default: ['jpg'],
		heading: 'PDF',
		typeLabel: 'array',
		typeSuffix: '*optional*',
		doc: `This parameter defines the standards file types that will use to create versions of the uploaded PDF files.

Dédalo will use this parameter to create alternative versions of the PDF uploaded, the files formats that will use to convert from the original files uploaded by the users. This parameter is optional and can be used to add other image formats. When the parameter is active, every PDF uploaded will be processed for every quality with every alternative format defines.

\`\`\`bash
DEDALO_PDF_ALTERNATIVE_EXTENSIONS=["avif","jpg"]
\`\`\`

Example:

Original file: **my_pfd.pdf**

Alternatives formats defined in DEDALO_PDF_ALTERNATIVE_EXTENSIONS: **\\['avif','jpg'\\]**

Result:

In original quality directory:
> ../media/pdf/original/rsc37_rsc176_1.pdf
>
> ../media/pdf/original/rsc37_rsc176_1.avif
>
> ../media/pdf/original/rsc37_rsc176_1.jpg

In web quality directory:
> ../media/pdf/web/rsc37_rsc176_1.pdf
>
> ../media/pdf/web/rsc37_rsc176_1.avif
>
> ../media/pdf/web/rsc37_rsc176_1.jpg

!!! warning "About increment time when uploaded PDF files render alternative versions"
    Alternative versions of PDF increase the rendering process time of uploaded PDF files by ~5 times.
    The render PDF use a high density dpi and reduce the final image to get a good anti-aliased image.
    This process increases the waiting time until the PDF is displayed and usable.`,
	},
	DEDALO_PDF_AR_QUALITY: {
		type: 'string_list',
		scope: 'operator',
		default: ['original', 'web'],
		heading: 'PDF',
		typeLabel: 'array',
		doc: `This parameter defines the different qualities that can be used for compress the PDF files.

This parameter will use to compress PDF files to specific quality. The compression will use the original file and will compress to those qualities when the user demand a specific quality.

\`\`\`bash
DEDALO_PDF_AR_QUALITY=[DEDALO_PDF_QUALITY_ORIGINAL, DEDALO_PDF_QUALITY_DEFAULT]
\`\`\``,
	},
	DEDALO_PDF_EXTENSION: {
		type: 'string',
		scope: 'operator',
		default: 'pdf',
		heading: 'PDF',
		typeLabel: 'string',
		doc: `This parameter defines the standard file type of pdf files.

\`\`\`bash
DEDALO_PDF_EXTENSION="pdf"
\`\`\``,
	},
	DEDALO_PDF_EXTENSIONS_SUPPORTED: {
		type: 'string_list',
		scope: 'operator',
		default: ['pdf', 'doc', 'pages', 'odt', 'ods', 'rtf', 'ppt'],
		heading: 'PDF',
		typeLabel: 'array',
		doc: `This parameter define the standards file type admitted for the pdf files. Dédalo will use this parameter to identify the file format of the original files uploaded by the users. Defaults to \`["pdf","doc","pages","odt","ods","rtf","ppt"]\`.

\`\`\`bash
DEDALO_PDF_EXTENSIONS_SUPPORTED=["pdf","doc","pages","odt","ods","rtf","ppt"]
\`\`\``,
	},
	DEDALO_PDF_FOLDER: {
		type: 'string',
		scope: 'operator',
		default: '/pdf',
		heading: 'PDF',
		typeLabel: 'int',
		doc: `This parameter defines the main directory for the pdf files.

\`\`\`bash
DEDALO_PDF_FOLDER="/pdf"
\`\`\``,
	},
	DEDALO_PDF_QUALITY_DEFAULT: {
		type: 'string',
		scope: 'operator',
		default: 'web',
		heading: 'PDF',
		typeLabel: 'string',
		doc: `This parameter defines the default quality used for the PDF files.

This parameter will use to compress all pdf files to specific format, unifying the quality used by all sections. By default Dédalo will compress images to jpg for web quality.

\`\`\`bash
DEDALO_PDF_QUALITY_DEFAULT="web"
\`\`\``,
	},
	DEDALO_PDF_QUALITY_ORIGINAL: {
		type: 'string',
		scope: 'operator',
		default: 'original',
		heading: 'PDF',
		typeLabel: 'string',
		doc: `This parameter defines the quality original for the pdf files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit hight quality for PDF files (print formats or preservation formats), and it define this files as "original" quality. Dédalo will compress to web standard format, unify all different qualities and will store the original file without touch. In some cases, if the institution has a protocol for manage PDF files, is possible to use a specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

\`\`\`bash
DEDALO_PDF_QUALITY_ORIGINAL="original"
\`\`\``,
	},
	// DEDALO_PDF_THUMB_DEFAULT was DELETED here (2026-07-13) — same story as
	// DEDALO_IMAGE_THUMB_DEFAULT above: documented, never read, configured nothing.
	DEDALO_PDFINFO_PATH: {
		type: 'string',
		scope: 'operator',
		default: (get: CatalogGet) => `${get('DEDALO_BINARY_BASE')}/pdfinfo`,
		defaultDoc: '`<DEDALO_BINARY_BASE>/pdfinfo`',
		heading: 'PDF',
		typeLabel: 'string',
		doc: `This parameter defines the path to the \`pdfinfo\` program in the server, usually shipped with [Poppler](https://poppler.freedesktop.org/). Dédalo uses it to read the metadata of the uploaded PDF files — the number of pages and the creation date that feeds the automatic date components.

The path is derived from DEDALO_BINARY_BASE, so a normal Poppler install needs no configuration; set the key only to point at a binary in a non-standard location. When the binary is missing, the PDF is stored and converted normally but its date and page metadata are not extracted.

\`\`\`bash
DEDALO_PDFINFO_PATH="/usr/bin/pdfinfo"
\`\`\``,
	},
	DEDALO_PDFTOHTML_PATH: {
		type: 'string',
		scope: 'operator',
		default: (get: CatalogGet) => `${get('DEDALO_BINARY_BASE')}/pdftohtml`,
		defaultDoc: '`<DEDALO_BINARY_BASE>/pdftohtml`',
		heading: 'PDF',
		typeLabel: 'string',
		doc: `This parameter defines the path to the \`pdftohtml\` program in the server, usually shipped with [Poppler](https://poppler.freedesktop.org/). The PDF extractor tool uses it to pull the content of a PDF out as formatted HTML, keeping the layout of the page; the plain-text alternative is PDF_AUTOMATIC_TRANSCRIPTION_ENGINE, and the user chooses between them in the tool.

The path is derived from DEDALO_BINARY_BASE, so a normal Poppler install needs no configuration. Set this key only to point at a binary in a non-standard location.

\`\`\`bash
DEDALO_PDFTOHTML_PATH="/usr/bin/pdftohtml"
\`\`\``,
	},
	DEDALO_QUALITY_THUMB: {
		type: 'string',
		scope: 'operator',
		default: 'thumb',
		heading: 'Thumb',
		typeLabel: 'string',
		doc: `This parameter defines the thumb quality definition that can be used for compress the media files.

This parameter will use to compress and store image files used in lists. The compression will use the default file.

| Media | Remark |
| --- | --- |
| PDF | Will render the first page of the website in quality, if the default image does not exist it will try to use the original quality.|
| AV | Will render the posterframe.|
| Image | Will render the default quality, if the default image does not exist it will try to use the original quality.|
| SVG | Will render the default quality, if the default image does not exist it will try to use the original quality.|
| 3d | Will render the posterframe.|

\`\`\`bash
DEDALO_QUALITY_THUMB="thumb"
\`\`\``,
	},
	DEDALO_SUBTITLES_FOLDER: {
		type: 'string',
		scope: 'operator',
		default: '/subtitles',
		heading: 'Audiovisual',
		typeLabel: 'string',
		doc: `This parameter defines the path to the subtitles directory.

Dédalo will store the VTT files generated by the subtitle engine in this directory.

\`\`\`bash
DEDALO_SUBTITLES_FOLDER="/subtitles"
\`\`\``,
	},
	DEDALO_SVG_ALTERNATIVE_EXTENSIONS: {
		type: 'string_list',
		scope: 'operator',
		default: [],
		heading: 'SVG',
		typeLabel: 'array',
		typeSuffix: '*optional*',
		doc: `This parameter defines the standards file types that will use to create alternative versions of the uploaded svg files.

Dédalo will use this parameter to create extra versions of every svg file, besides the standard defined in DEDALO_SVG_EXTENSION. When the parameter is active, every svg uploaded will be processed in every quality with every format defined here — a raster copy of a vector drawing, typically, for a consumer that cannot render svg.

By default the list is empty: Dédalo stores the original file and the web version, and nothing else.

\`\`\`bash
DEDALO_SVG_ALTERNATIVE_EXTENSIONS=["png"]
\`\`\``,
	},
	DEDALO_SVG_AR_QUALITY: {
		type: 'string_list',
		scope: 'operator',
		default: ['original', 'web'],
		heading: 'SVG',
		typeLabel: 'array',
		doc: `This parameter defines the different qualities that can be used transformed svg files.

This parameter will use to store different svg version files to specific quality.

\`\`\`bash
DEDALO_SVG_AR_QUALITY=[DEDALO_SVG_QUALITY_DEFAULT, DEDALO_SVG_QUALITY_DEFAULT]
\`\`\``,
	},
	DEDALO_SVG_EXTENSION: {
		type: 'string',
		scope: 'operator',
		default: 'svg',
		heading: 'SVG',
		typeLabel: 'string',
		doc: `This parameter defines the standard file type of svg files.

\`\`\`bash
DEDALO_SVG_EXTENSION="svg"
\`\`\``,
	},
	DEDALO_SVG_EXTENSIONS_SUPPORTED: {
		type: 'string_list',
		scope: 'operator',
		default: ['svg'],
		heading: 'SVG',
		typeLabel: 'array',
		doc: `This parameter defines the standards file type admitted for the svg files.

Dédalo will use this parameter to identify the file format of the original files uploaded by the users.

\`\`\`bash
DEDALO_SVG_EXTENSIONS_SUPPORTED=["svg"]
\`\`\``,
	},
	DEDALO_SVG_FOLDER: {
		type: 'string',
		scope: 'operator',
		default: '/svg',
		heading: 'SVG',
		typeLabel: 'string',
		doc: `This parameter defines the main directory for the svg files.

\`\`\`bash
DEDALO_SVG_FOLDER="/svg"
\`\`\``,
	},
	DEDALO_SVG_QUALITY_DEFAULT: {
		type: 'string',
		scope: 'operator',
		default: 'web',
		heading: 'SVG',
		typeLabel: 'string',
		doc: `This parameter defines the default quality used for the SVG files.

This parameter will use to store all svg files, unifying the quality used by all sections. By default Dédalo will use a flat svg for web quality.

\`\`\`bash
DEDALO_SVG_QUALITY_DEFAULT="web"
\`\`\``,
	},
	DEDALO_SVG_QUALITY_ORIGINAL: {
		type: 'string',
		scope: 'operator',
		default: 'original',
		heading: 'SVG',
		typeLabel: 'string',
		doc: `This parameter defines the quality original for the svg files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit different editing vector formats, and it define this files as "original" quality, Dédalo will store the original file without touch. In some cases, if the institution has a protocol for manage SVG files, is possible to use a specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

\`\`\`bash
DEDALO_SVG_QUALITY_ORIGINAL="original"
\`\`\``,
	},
	DEDALO_THUMB_EXTENSION: {
		type: 'string',
		scope: 'operator',
		default: 'jpg',
		heading: 'Thumb',
		typeLabel: 'string',
		doc: `This parameter defines the standard file type of thumb files.

\`\`\`bash
DEDALO_THUMB_EXTENSION="jpg"
\`\`\``,
	},
	DEDALO_UPLOAD_MAX_SIZE_BYTES: {
		type: 'number',
		scope: 'operator',
		default: 2 * 1024 * 1024 * 1024,
		heading: 'Defining the maximum upload size',
		typeLabel: 'int',
		doc: `This parameter defines the largest file, in BYTES, that Dédalo will accept in an upload.

The limit is enforced twice. The server publishes it to the client (the upload service reads it when it starts), so the interface can refuse an oversize file before a single byte travels and tell the user why; and the server checks the size of every part it receives, so the limit holds even against a client that ignores it.

By default the limit is 2 GB (\`2147483648\`). Raise it for collections of long, high-resolution video — and remember that the web server in front of Dédalo has a limit of its own (\`client_max_body_size\` in nginx, \`LimitRequestBody\` in Apache) which must be at least as large, or the upload dies before it reaches the engine. Splitting the file into chunks (DEDALO_UPLOAD_SERVICE_CHUNK_FILES) is what keeps a single request small; this ceiling applies to the file as a whole.

\`\`\`bash
DEDALO_UPLOAD_MAX_SIZE_BYTES=2147483648
\`\`\``,
	},
	DEDALO_UPLOAD_SERVICE_CHUNK_FILES: {
		type: 'number',
		scope: 'operator',
		default: 4,
		heading: 'Defining upload split files in chunks',
		typeLabel: 'int || false',
		doc: `Defines the size at which files are split into chunks for upload.

This parameter allows you to break large files into smaller, more manageable pieces for reliable resumable uploads.

This parameter will use to split files at specific size into small chunks or blobs. The value is expressed in MB, but do not use the MB string, the value is a integer, for ex: 5 will be interpreted as 5MB.

When an integer is provided, any file larger than this value will be automatically segmented into chunks. The value is interpreted as Megabytes (MB). For example, chunkSize: 95 will create chunks of approximately 95MB each.

When set to \`false\`, the chunking feature is disabled, and all files are uploaded in a single request.

\`\`\`bash
DEDALO_UPLOAD_SERVICE_CHUNK_FILES=false); // 5 = 5MB
\`\`\``,
	},
	DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT: {
		type: 'number',
		scope: 'operator',
		default: 50,
		heading: 'Defining the maximum number of simultaneous connections for uploading chunked files',
		typeLabel: 'int || false',
		doc: `Defines the maximum number of simultaneous HTTP requests that can be open to the server when uploading a file in chunks.

When set to \`false\`, the internal limit is removed. The browser will then determine the maximum number of concurrent requests, which is typically based on the HTTP protocol version (see below).
When set to a positive integer (e.g., 50), the client will enforce that limit, ensuring no more than the specified number of chunks are uploaded simultaneously.

Protocol Dependencies:
This parameter is highly dependent on the HTTP protocol version in use:

For HTTP/1.1: The standard limits the number of simultaneous requests per domain to a very low number (typically 4-6). In this environment, setting a value higher than ~6 is ineffective and will be ignored by the browser. For optimal performance with HTTP/1.1, it is recommended to set this value to 4.
For HTTP/2: The protocol supports multiplexing, allowing many requests to be sent concurrently over a single connection. While this allows for a higher limit, setting the value too high can overwhelm the server with simultaneous processing load. This parameter should be used to throttle the requests to a level your server can handle reliably.

Purpose:
This setting allows you to optimize upload performance and ensure server stability by defining a number of concurrent chunk upload requests that your server can process efficiently.

\`\`\`bash
DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT=50
\`\`\``,
	},
	DEDALO_UPLOAD_TMP_SUBDIR: {
		type: 'string',
		scope: 'operator',
		default: 'upload/service_upload/tmp',
		heading: 'Defining the upload staging directory',
		typeLabel: 'string',
		doc: `This parameter defines the staging directory where an upload is assembled, RELATIVE to the media root (MEDIA_PATH).

A file arriving in chunks is written there piece by piece, under a subdirectory of the user who is uploading it, and only when the last chunk has landed and the content has been verified is the finished file moved into its media folder. Nothing outside the staging tree is ever written by an upload in flight, and the path is confined to the media root: a value that escapes it is refused.

The default is \`upload/service_upload/tmp\`, and there is normally no reason to change it. A change is only useful to move the staging tree to a different subdirectory of the media volume — it must stay inside it, because the final move has to be a rename on the same filesystem, not a copy.

\`\`\`bash
DEDALO_UPLOAD_TMP_SUBDIR="upload/service_upload/tmp"
\`\`\``,
	},
	MEDIA_DEV_ROUTE_ENABLED: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Serving media from the engine (development only)',
		typeLabel: 'bool',
		typeSuffix: '*optional — unset is NOT the same as `false`*',
		doc: `**You normally leave this unset.** Media files are served by the WEB SERVER, which enforces the access rules Dédalo generates for it. But Dédalo can also serve them itself, straight from the media root — with no per-record access control at all. That fallback exists for the one setup that has no web server in the request path: a developer running the engine on its local TCP port.

Unset, the fallback is bound to conditions a production install cannot meet, so it needs no flag: it answers ONLY on the development TCP listener (production serves through a unix socket) and ONLY while media protection is unconfigured (once it is, the generated rules are authoritative and the engine must never undercut them).

Set the key only to override that decision. \`true\` FORCES the fallback on for every listener, the production socket included, serving every file under the media root to any logged-in session with no per-record or per-project check — never do this on a shared or public host; the server logs a loud warning when you do. \`false\` forces it off even in development.

\`\`\`bash
MEDIA_DEV_ROUTE_ENABLED=false
\`\`\``,
	},
	MEDIA_PATH: {
		type: 'string',
		scope: 'operator',
		default: () => join(projectRoot, 'media'),
		defaultDoc: '`<install dir>/media` — auto-derived; set only to relocate the media tree',
		heading: 'Defining media base path',
		typeLabel: 'string',
		doc: `This parameter defines the root media directory in the directory tree.

Normally this directory sits alongside the install, but it can be set to any path. The server needs read/write access to this directory as its owner. Unset in dev leaves media handling disabled.

\`\`\`bash
MEDIA_PATH="/srv/dedalo/media"
\`\`\``,
	},
	PDF_AUTOMATIC_TRANSCRIPTION_ENGINE: {
		type: 'string',
		scope: 'operator',
		default: (get: CatalogGet) => `${get('DEDALO_BINARY_BASE')}/pdftotext`,
		defaultDoc: '`<DEDALO_BINARY_BASE>/pdftotext`',
		heading: 'PDF',
		typeLabel: 'string',
		doc: `This parameter defines the path to the library, usually [xpdf](http://www.xpdfreader.com/download.html) (pdftotext), to be used for process the pdf to extract the information, this library will be used get the text fo the pdf files and store in the component_text_area. The text will be use to search inside the pdf information.

\`\`\`bash
PDF_AUTOMATIC_TRANSCRIPTION_ENGINE="/usr/bin/pdftotext"
\`\`\``,
	},
	PDF_OCR_ENGINE: {
		type: 'string',
		scope: 'operator',
		default: (get: CatalogGet) => `${get('DEDALO_BINARY_BASE')}/ocrmypdf`,
		defaultDoc: '`<DEDALO_BINARY_BASE>/ocrmypdf`',
		heading: 'PDF',
		typeLabel: 'string',
		doc: `This parameter defines the path to the library, usually [ocrmypdf](https://ocrmypdf.readthedocs.io/en/latest/index.html) that will be used for OCR processing of the pdf uploaded files. Optical Character Recognition or OCR is a technology that converts images of typed or handwritten text, such as in a scanned document, into computer text that can be selected, searched and copied.

\`\`\`bash
PDF_OCR_ENGINE="/usr/bin/ocrmypdf"
\`\`\``,
	},
} as const satisfies Record<string, CatalogEntry>;
