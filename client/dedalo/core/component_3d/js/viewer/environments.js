// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* ENVIRONMENTS
* Static registry of HDR/EXR lighting environment presets available to the 3-D viewer.
*
* Each entry describes one selectable background/reflection environment that the viewer
* can apply to a Three.js scene via `viewer.update_environment()` and
* `viewer.get_cube_map_texture()`.  The list is consumed in two ways:
*
*   1. Lookup by `name` — `viewer.state.environment` stores the human-readable name;
*      `update_environment` filters this array by `entry.name === state.environment`
*      to obtain the descriptor before loading the texture.
*   2. GUI population — the viewer's lil-gui control maps the array to a dropdown of
*      names: `environments.map((env) => env.name)`.
*
* Dispatch logic in `get_cube_map_texture` (viewer.js):
*   - `id === ''`       → no environment (envMap: null, solid background color).
*   - `id === 'neutral'` → uses the pre-built `THREE.RoomEnvironment` PMREM texture;
*                          `path` is ignored even when present.
*   - anything else     → loads `path` via `EXRLoader` and converts to a PMREM cube-map.
*
* To add a new environment, append an entry to this array; no other file needs changing
* as long as the path points to an equirectangular EXR (or HDR — see flag below).
*
* @module environments
*/
export const environments = [
	// id: '' sentinel — disables environment lighting entirely.
	// viewer.get_cube_map_texture resolves to { envMap: null } for this entry,
	// and the scene background falls back to the solid background_color.
	{
		id: '',
		name: 'None',
		path: null,
	},
	{
		id: 'neutral', // THREE.RoomEnvironment
		// 'neutral' is a special-cased id: the viewer uses its pre-rendered
		// THREE.RoomEnvironment PMREM texture instead of fetching a remote file.
		// path is null because no network request is made for this entry.
		name: 'Neutral',
		path: null,
	},
	{
		id: 'venice-sunset',
		name: 'Venice Sunset',
		// 1k resolution EXR hosted on a public GCS bucket (donmccurdy-static).
		// (!) External URL — availability depends on the remote host; no CDN fallback.
		path: 'https://storage.googleapis.com/donmccurdy-static/venice_sunset_1k.exr',
		// format is declared here for descriptive purposes.
		// (!) viewer.get_cube_map_texture does not read the `format` field; it always
		//     uses EXRLoader regardless of the extension stored here.
		format: '.exr'
	},
	{
		id: 'footprint-court',
		name: 'Footprint Court (HDR Labs)',
		// 2k resolution EXR; higher resolution than venice-sunset for richer reflections.
		// (!) External URL — same caveat as venice-sunset above.
		path: 'https://storage.googleapis.com/donmccurdy-static/footprint_court_2k.exr',
		format: '.exr'
	}
];



// @license-end
