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
	// REMOVED 2026-08-08 — the two remote EXR presets ('venice-sunset',
	// 'footprint-court'), both `https://storage.googleapis.com/donmccurdy-static/…`.
	// They are the upstream three.js glTF-viewer DEMO assets, not heritage content,
	// and selecting one made the browser fetch from a third-party bucket: dead on an
	// air-gapped archive, and on a connected one it told that bucket exactly when a
	// 3D record was being worked on. That is the outbound-request class this engine
	// gates elsewhere (engineering/TRIPWIRES.md), and it was reachable from an
	// ordinary dropdown, so it goes rather than gets a caveat comment.
	//
	// The two entries above need no network at all: 'None' clears the environment and
	// 'Neutral' is three's built-in RoomEnvironment, generated in-process.
	//
	// TO RE-ADD ONE: vendor the .exr under the media tree (or client/dedalo/lib/) and
	// give the entry a SAME-ORIGIN `path`. get_cube_map_texture needs no change — it
	// already loads any non-'neutral' path through EXRLoader — and
	// update_environment now reports a load failure instead of swallowing it.
];



// @license-end
