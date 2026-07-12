// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL*/
/*eslint no-undef: "error"*/


/**
* VIEWER
* Three.js-based interactive 3-D model viewer for component_3d.
*
* Provides a self-contained WebGL scene that loads, displays, and animates
* glTF 2.0 / GLB assets.  The module is a singleton-like namespace object
* (not a class) whose methods are assigned directly on the exported `viewer`
* function.  Callers must first call `viewer.init()` and then `viewer.build()`
* before loading any model.
*
* Lifecycle (in order):
*   1. viewer.init(options)       — creates loader instances; called once.
*   2. viewer.build(el, options)  — builds the Three.js scene, renderer,
*                                   controls, GUI, and starts the animation loop.
*   3. viewer.load(file_uri)      — fetches and places a glTF model in the scene.
*   4. viewer.get_image(options)  — captures a JPEG thumbnail at custom resolution.
*   5. viewer.clear()             — disposes scene geometry and textures.
*
* The viewer depends on Three.js r≥152 and its add-on loaders/controls.
* All Three.js symbols are resolved via an importmap that maps the bare
* specifier 'three' to '/lib/three/examples/jsm/' (defined in page/index.html).
*
* State object (`self.state`):
*   All mutable viewer settings (environment, lighting, wireframe, etc.) live
*   in `self.state` so that they can be serialised and round-tripped through
*   the GUI without touching the Three.js object graph directly.
*
* Exports: viewer (namespace/singleton)
*/

// imports
	import {dd_request_idle_callback} from '../../../common/js/events.js'
	// used a importmap define in page/index.html to resolve directories
	// the main addons is /lib/three/examples/jsm/ has to be mapped as three/
	import {
		AmbientLight,
		AnimationMixer,
		AxesHelper,
		Box3,
		Cache,
		Color,
		DirectionalLight,
		GridHelper,
		HemisphereLight,
		LoaderUtils,
		LoadingManager,
		PMREMGenerator,
		PerspectiveCamera,
		REVISION,
		Scene,
		SkeletonHelper,
		Vector3,
		WebGLRenderer,
		sRGBEncoding,
		LinearToneMapping,
		ACESFilmicToneMapping
	} from 'three';
	import Stats from 'three/addons/libs/stats.module.js';
	import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
	import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
	import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
	import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
	import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
	import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
	import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
	// environments: pictures to be use as reflection images
	import { environments } from './environments.js';



/**
* VIEWER
* Namespace constructor for the Three.js-based 3-D viewer.
* All functionality is exposed as static properties on this function object
* (e.g. `viewer.init`, `viewer.build`, `viewer.load`).
* The constructor itself is a no-op placeholder; it is never instantiated with `new`.
*/
export const viewer = function () {

}



/**
* INIT
* One-time setup: creates the shared loader instances and enables or disables
* the Three.js asset cache.  Must be called before `build()`.
*
* Loaders are created here so they can be shared across multiple `load()` calls
* without reconstructing the DRACO/KTX2 transcoder pipelines on every model load.
*
* @param {Object} options - initialisation options
* @param {boolean} [options.cache=true] - whether to enable Three.js `Cache`
*   (caches raw XHR responses by URL; set false during development to always
*    reload from disk)
* @param {string} [options.default_camera='[default]'] - name sentinel used to
*   identify the built-in OrbitControls camera vs. cameras embedded in the glTF
* @returns {Promise<Object>} resolves to `self` (the viewer namespace) so callers
*   can chain: `const v = await viewer.init(opts)`
*/
viewer.init = async function (options) {

	const self = this

	// options
		const cache = options.cache ?? true
		const default_camera = options.default_camera ?? '[default]'

	// set main vars
		self.DEFAULT_CAMERA	= default_camera;
		self.MANAGER		= new LoadingManager();
		self.DRACO_LOADER	= new DRACOLoader( self.MANAGER ).setDecoderPath( '../../lib/three/examples/jsm/libs/draco/' );
		self.KTX2_LOADER	= new KTX2Loader( self.MANAGER ).setTranscoderPath( '../../lib/three/examples/jsm/libs/basis/' );

		Cache.enabled = cache;

	return self
}//end init



/**
* BUILD
* Constructs the entire Three.js scene, renderer, controls, GUI, and axes overlay,
* then starts the render loop via `requestAnimationFrame`.  Must be called once
* after `init()` and before `load()`.
*
* Side effects:
*   - Appends the WebGL canvas (`renderer.domElement`) to `content_value`.
*   - Appends a small axes-overlay `<div class="axes">` to `content_value`.
*   - Appends a `<div class="gui-wrapper">` containing the lil-gui panel.
*   - Attaches a ResizeObserver to `content_value` for responsive resizing
*     (preferred over a global window 'resize' listener so user-resizable
*     component panels update correctly).
*   - Starts an infinite `requestAnimationFrame` animation loop (see `animate`).
*
* State defaults — all values may be overridden via `options`:
*   environment, background, playback_speed, action_states, camera, wireframe,
*   skeleton, grid, punctual_lights, exposure, tone_mapping, ambient_intensity,
*   ambient_color, direct_intensity, direct_color, bg_color
*
* @param {HTMLElement} content_value - container element that will receive the
*   renderer canvas and GUI overlay
* @param {Object} options - saved viewer state; any key absent falls back to
*   the sensible defaults shown in `self.state` below
* @returns {Promise<void>}
*/
viewer.build = async function (content_value, options) {

	const self = this

	self.content_value	= content_value;
	self.options		= options;

	self.lights			= [];
	self.content		= null;
	self.mixer			= null;
	self.clips			= [];
	self.gui 			= null;

	self.state = {
		environment			: options.environments ||  environments.find((el) => el.id==='neutral').name,
		background			: options.background || false,
		playback_speed		: options.playback_speed || 1.0,
		action_states		: options.action_states || {},
		camera				: options.camera || self.DEFAULT_CAMERA,
		wireframe			: options.wireframe || false,
		skeleton			: options.skeleton || false,
		grid				: options.grid || false,

		// Lights
		punctual_lights		: options.punctual_lights || false,
		exposure			: options.exposure || 0.0,
		tone_mapping		: options.tone_mapping || LinearToneMapping,
		ambient_intensity	: options.ambient_intensity || 0.3,
		ambient_color		: options.ambient_color || 0xFFFFFF,
		direct_intensity	: options.direct_intensity || 0.8 * Math.PI,
		direct_color		: options.direct_color || 0xFFFFFF,
		bg_color			: options.bg_color || 0x191919
	};

	self.prev_time = 0;

	// create the stats
	self.stats				= new Stats();
	// [].forEach.call(self.stats.dom.children, (child) => (child.style.display = ''));

	self.background_color	= new Color(self.state.bg_color);

	self.scene				= new Scene();
	self.scene.background	= self.background_color;


	const fov = 45 //0.8 * 180 / Math.PI

	self.default_camera	= new PerspectiveCamera( fov, self.content_value.clientWidth / self.content_value.clientHeight, 0.01, 1000 );
	self.active_camera	= self.default_camera;
	self.scene.add( self.default_camera );

	self.renderer					= new WebGLRenderer({antialias: true});
	self.renderer.useLegacyLights	= false;
	self.renderer.outputEncoding	= sRGBEncoding;
	self.renderer.setClearColor( 0xcccccc );
	self.renderer.setPixelRatio( window.devicePixelRatio );
	self.renderer.setSize( self.content_value.clientWidth, self.content_value.clientHeight );

	self.pmrem_generator				= new PMREMGenerator( self.renderer );
	self.pmrem_generator.compileEquirectangularShader();

	self.neutral_environment			= self.pmrem_generator.fromScene( new RoomEnvironment() ).texture;

	self.controls						= new OrbitControls( self.default_camera, self.renderer.domElement );
	self.controls.screen_space_panning	= true;

	self.content_value.appendChild(self.renderer.domElement);

	self.camera_ctrl		= null;
	self.camera_folder		= null;
	self.anim_folder		= null;
	self.anim_ctrls			= [];
	self.morph_folder		= null;
	self.morph_ctrls		= [];
	self.skeleton_helpers	= [];
	self.grid_helper		= null;
	self.axes_helper		= null;

	self.add_axes_helper();
	self.add_GUI();

	self.animate = self.animate.bind(self);
	requestAnimationFrame( self.animate );

	// resize event. Add to content value instead window to allow user resize manually the component
		// window.addEventListener('resize', self.resize.bind(self), false);
		new ResizeObserver( self.resize.bind(self) ).observe( self.content_value )
}//end build



/**
* RENDER
* Draws one frame: renders the main scene with the active camera, then (when the
* grid overlay is visible) mirrors the default camera's position into the axes
* overlay camera and re-renders the small axes scene.
*
* Called by `animate()` on every `requestAnimationFrame` tick.
* The function is declared `async` to satisfy the Three.js renderer API but does
* not itself perform any asynchronous work — the renderer call is synchronous.
*
* @returns {Promise<void>}
*/
viewer.render = async function() {

	const self = this

	// render each frame
	await self.renderer.render(
		self.scene,
		self.active_camera
	)

	// updates axes camera render
	if (self.state.grid) {
		self.axes_camera.position.copy(self.default_camera.position)
		self.axes_camera.lookAt(self.axes_scene.position)
		self.axes_renderer.render( self.axes_scene, self.axes_camera );
	}
}//end render


/**
* RESIZE
* Responds to a ResizeObserver notification on `content_value` and updates the
* camera aspect ratios and renderer sizes to match the container's new dimensions.
*
* Uses `dd_request_idle_callback` to decouple the layout read from the render
* flush: this prevents layout thrashing during an animated resize where the
* browser would otherwise interleave forced-reflows with repaints.
*
* Both the main renderer and the axes overlay renderer are updated together so
* they stay in sync.
*/
viewer.resize = function() {

	const self = this

	const {clientHeight, clientWidth} = self.content_value

	// set timeout to disengage the container new size calculation
	// and the render making resize more fluid
	dd_request_idle_callback(
		() => {
			self.default_camera.aspect = clientWidth / clientHeight;
			self.default_camera.updateProjectionMatrix();
			self.renderer.setSize(clientWidth, clientHeight);

			self.axes_camera.aspect = self.axes_div.clientWidth / self.axes_div.clientHeight;
			self.axes_camera.updateProjectionMatrix();
			self.axes_renderer.setSize(self.axes_div.clientWidth, self.axes_div.clientHeight);
		}
	)
}//end resize


/**
* LOAD
* Fetches a glTF / GLB file from the given URI and places it in the scene via
* `set_content()`.  Configures the GLTFLoader with DRACO geometry compression,
* KTX2 texture transcoding (detecting GPU support at runtime), and meshopt
* decoding so that all standard glTF 2.0 extension combinations are handled.
*
* The function validates that the loaded asset contains at least one scene graph;
* sceneless assets (e.g. raw mesh libraries) are rejected with a descriptive error.
*
* @param {string} file_uri - absolute or relative URL of the glTF/GLB asset
* @returns {Promise<Object>} resolves to the raw `gltf` object on success, or
*   resolves to `undefined` after logging an error if the loader fails (the
*   `.catch` swallows the rejection to prevent unhandled promise warnings in the
*   component)
*/
viewer.load = function( file_uri ) {

	const self = this

	// Load.
	return new Promise((resolve, reject) => {

		const loader = new GLTFLoader( self.MANAGER )
			.setCrossOrigin('anonymous')
			.setDRACOLoader( self.DRACO_LOADER )
			.setKTX2Loader( self.KTX2_LOADER.detectSupport( self.renderer ) )
			.setMeshoptDecoder( MeshoptDecoder );

		loader.load(
			// resource URL
			file_uri,
			// called when the resource is loaded
			(gltf) => {

				const clips = gltf.animations || [];
				const scene = gltf.scene || gltf.scenes[0];
				if (!scene) {
					// Valid, but not supported by this viewer.
					throw new Error(
					'This model contains no scene, and cannot be viewed here. However,'
					+ ' it may contain individual 3D resources.'
					);
				}

				self.object = scene
				self.set_content(scene, clips);

				// blob_URLs.forEach(URL.revokeObjectURL);

				resolve(gltf);
			},
			// called while loading is progressing
			undefined,
			// called when loading has errors
			function ( error ) {
				console.log( 'An error happened loading file: ', file_uri);
				reject(false)
			}
		);
	})
	.catch((err) => {
		console.error(err);
	});
}//end load


/**
* SET_CONTENT
* Places a newly loaded glTF scene into the Three.js scene graph and adapts all
* camera, controls, lighting, and GUI settings to the new model's bounding box.
*
* Called automatically by `load()` after a successful glTF parse.
*
* Steps performed:
*   1. Calls `clear()` to dispose any previously loaded geometry/textures.
*   2. Computes the scene's axis-aligned bounding box to derive a canonical size
*      and centre position.
*   3. Translates the scene root so the model's centre sits at the world origin.
*   4. Scales camera near/far planes and orbit control limits to the model size
*      so the clipping planes are always tight regardless of model scale.
*   5. Positions the camera either from a saved `options.cameraPosition` or by
*      computing a sensible default isometric-ish offset from the bounding centre.
*   6. Traverses all nodes: disables `punctual_lights` state flag when the model
*      itself contains lights (model lights take precedence); sets `depthWrite`
*      based on material transparency to avoid z-fighting artefacts on blended
*      surfaces.
*   7. Updates lights, GUI folders, environment, and display state.
*
* @param {Object} scene - Three.js `Object3D` / `Group` that is the root of the
*   loaded glTF scene graph
* @param {Array} clips - array of `THREE.AnimationClip` objects extracted from
*   the glTF; may be empty if the asset contains no animations
*/
viewer.set_content = function( scene, clips ) {

	const self = this

	self.clear();

	const box		= new Box3().setFromObject(scene);
	const size		= box.getSize(new Vector3()).length();
	const center	= box.getCenter(new Vector3());

	self.controls.reset();

	scene.position.x += (scene.position.x - center.x);
	scene.position.y += (scene.position.y - center.y);
	scene.position.z += (scene.position.z - center.z);
	self.controls.maxDistance	= size * 10;
	self.default_camera.near	= size / 100;
	self.default_camera.far		= size * 100;
	self.default_camera.updateProjectionMatrix();

	if (self.options.cameraPosition) {

		self.default_camera.position.fromArray( self.options.cameraPosition );
		self.default_camera.lookAt( new Vector3() );

	} else {

		self.default_camera.position.copy(center);
		self.default_camera.position.x += size / 2.0;
		self.default_camera.position.y += size / 5.0;
		self.default_camera.position.z += size / 2.0;
		self.default_camera.lookAt(center);
	}

	self.set_camera(self.DEFAULT_CAMERA);

	self.axes_camera.position.copy(self.default_camera.position)
	self.axes_camera.lookAt(self.axes_scene.position)
	self.axes_camera.near = size / 100;
	self.axes_camera.far = size * 100;
	self.axes_camera.updateProjectionMatrix();
	self.axes_corner.scale.set(size, size, size);

	self.controls.saveState();

	self.scene.add(scene);
	self.content = scene;

	self.content.traverse((node) => {
		if (node.isLight) {
			// Model contains its own lights — disable the viewer's synthetic
			// punctual lights to avoid double-illumination.
			self.state.punctual_lights = false;
		} else if (node.isMesh) {
			// Transparent materials must not write to the depth buffer; doing so
			// causes opaque objects that render later to incorrectly occlude them.
			node.material.depthWrite = !node.material.transparent;
		}
	});

	self.set_clips(clips);

	self.update_lights();
	self.update_GUI();
	self.update_environment();
	self.update_display();
	//
	// self.dump_graph(self.content);
}//end set_content



/**
* GET_IMAGE
* Captures a JPEG snapshot of the current scene at an arbitrary resolution and
* returns it as a `Blob`.
*
* The renderer is temporarily resized to the requested dimensions, a single frame
* is rendered, the canvas is exported, and then the renderer is restored to its
* original size.  The aspect ratio of the default camera is updated accordingly
* for each phase so the captured image is not distorted.
*
* Note: pixel dimensions are divided by 2 internally (presumably for HiDPI
* compensation where the canvas logical size is half the physical pixel count).
*
* @param {Object} options - capture options
* @param {number} options.width  - desired output width in pixels (before halving)
* @param {number} options.height - desired output height in pixels (before halving)
* @returns {Promise<Blob>} JPEG blob at quality 0.75
*/
viewer.get_image = function(options){

	const self = this

	const original_width	= self.renderer.domElement.width /2 ;
	const original_height	= self.renderer.domElement.height /2;

	const width		= options.width /2
	const height	= options.height /2

	self.default_camera.aspect = width / height;
	self.default_camera.updateProjectionMatrix();
	self.renderer.setSize(width, height);

	const box		= new Box3().setFromObject(self.object);
	const size		= box.getSize(new Vector3()).length();
	const center	= box.getCenter(new Vector3());

	self.default_camera.lookAt(center);
	self.render()

	return new Promise(function(resolve){
		self.renderer.domElement.toBlob(async (blob) =>{

			self.default_camera.aspect = original_width / original_height;
			self.default_camera.updateProjectionMatrix();
			self.renderer.setSize (original_width, original_height);
			self.render()

			resolve(blob)
		}, 'image/jpeg', 0.75);
	})
}


/**
* DUMP_GRAPH
* Recursively prints the Three.js object hierarchy to the browser console using
* `console.group` / `console.groupEnd`, showing each node's type and name.
* Intended for debugging model structure during development; not called in
* production paths (see the commented-out call in `set_content`).
*
* @param {Object} object - any Three.js `Object3D` node to start the traversal from
*/
viewer.dump_graph = function(object) {

	const self = this

	console.group(' <' + object.type + '> ' + object.name);
	object.children.forEach((child) => self.dump_graph(child));
	console.groupEnd();
}//end dump_graph


/**
* DUMP_OBJECT
* Produces an ASCII-art tree representation of the Three.js object hierarchy
* as an array of strings, using box-drawing characters ('├─', '└─', '│') to
* express parent-child relationships.  Each line shows the node name and type.
*
* This is an alternative to `dump_graph`: where `dump_graph` uses console groups
* (collapsible in DevTools), `dump_object` builds a flat string array that can be
* joined and printed in one shot or inspected programmatically.
*
* The function is called recursively; callers should normally invoke it as:
*   `console.log(viewer.dump_object(root).join('\n'))`
*
* @param {Object} object - Three.js `Object3D` node
* @param {Array} [lines=[]] - accumulator array; pass `[]` on first call
* @param {boolean} [isLast=true] - whether this node is the last child of its
*   parent (controls the branch character used)
* @param {string} [prefix=''] - indentation string built up through recursion
* @returns {Array} flat array of formatted strings, one per scene-graph node
*/
viewer.dump_object = function(object, lines = [], isLast = true, prefix = '') {
	const localPrefix = isLast ? '└─' : '├─';
	lines.push(`${prefix}${prefix ? localPrefix : ''}${object.name || '*no-name*'} [${object.type}]`);
	const newPrefix = prefix + (isLast ? '  ' : '│ ');
	const lastNdx = object.children.length - 1;
	object.children.forEach((child, ndx) => {
		const isLast = ndx === lastNdx;
		viewer.dump_object(child, lines, isLast, newPrefix);
	});

	return lines;
}//end dump_object


/**
* ANIMATE
* The main render loop callback, called by `requestAnimationFrame` on every
* browser paint cycle.  Schedules itself recursively so the loop runs indefinitely
* until the page is navigated away.
*
* Responsibilities per frame:
*   - Advances the OrbitControls damping/auto-rotation.
*   - Updates the Stats (FPS/memory) panel.
*   - Steps the AnimationMixer by the elapsed delta time `dt` (in seconds).
*   - Calls `render()` to draw the frame.
*   - Saves the current timestamp as `prev_time` for the next delta calculation.
*
* `self.animate` is bound to `self` in `build()` so that the `requestAnimationFrame`
* callback receives the correct `this` context.
*
* @param {number} time - DOMHighResTimeStamp provided by `requestAnimationFrame`
*   (milliseconds since navigation start)
*/
viewer.animate = function(time) {

	const self = this

	requestAnimationFrame( self.animate );

	const dt = (time - self.prev_time) / 1000;

	self.controls.update();
	self.stats.update();
	self.mixer && self.mixer.update(dt);
	self.render();

	self.prev_time = time;
}//end animate


/**
* SET_CLIPS
* Replaces the current AnimationMixer and registers the new set of animation
* clips extracted from a just-loaded glTF asset.
*
* When an existing mixer is present (from a previous model load) it is cleanly
* torn down: all actions are stopped and the root's cached data is freed before
* the mixer reference is nulled.  This prevents memory leaks when the user
* reloads the viewer with a different model.
*
* If `clips` is empty the function returns early without creating a new mixer
* because an AnimationMixer with no clips is meaningless overhead.
*
* @param {Array} clips - array of `THREE.AnimationClip` objects; may be empty
*/
viewer.set_clips = function( clips ) {

	const self = this

	if (self.mixer) {
		self.mixer.stopAllAction();
		self.mixer.uncacheRoot(self.mixer.getRoot());
		self.mixer = null;
	}

	self.clips = clips;
	if (!clips.length) return;

	self.mixer = new AnimationMixer( self.content );
}//end set_clips



/**
* PLAY_ALL_CLIPS
* Resets and starts playback of every animation clip in `self.clips` simultaneously,
* updating `self.state.action_states` so the GUI checkboxes stay in sync.
*
* Intended to be wired to the 'Play All' button in the Animation GUI folder.
* Requires that `self.mixer` is already initialised (i.e. `set_clips` has been
* called with a non-empty clips array).
*/
viewer.play_all_clips = function() {

	const self = this

	self.clips.forEach((clip) => {
		self.mixer.clipAction(clip).reset().play();
		self.state.action_states[clip.name] = true;
	});
}//end play_all_clips


/**
* SET_CAMERA
* Switches the active camera used by the renderer.
*
* When `name` equals `DEFAULT_CAMERA` the built-in OrbitControls camera is
* activated and orbit interaction is re-enabled.  When `name` matches a camera
* node embedded in the loaded glTF model, that node is promoted to active and
* OrbitControls are disabled (the glTF camera provides a fixed/scripted viewpoint
* that the user should not be able to orbit away from).
*
* @param {string} name - camera name; use the value of `self.DEFAULT_CAMERA` for
*   the built-in orbit camera, or the exact `node.name` of an embedded glTF camera
*/
viewer.set_camera = function( name ) {

	const self = this

	if (name === self.DEFAULT_CAMERA) {
		self.controls.enabled = true;
		self.active_camera = self.default_camera;
	} else {
		self.controls.enabled = false;
		self.content.traverse((node) => {
			if (node.isCamera && node.name === name) {
				self.active_camera = node;
			}
		});
	}
}//end set_camera



/**
* UPDATE_LIGHTS
* Synchronises the Three.js scene lighting to the current `self.state` values.
*
* Behaviour:
*   - Adds synthetic punctual lights if `state.punctual_lights` is true and none
*     exist yet; removes them if the flag is false and they are present.
*     (Lights embedded in the glTF model set `state.punctual_lights = false` in
*      `set_content()` to avoid double-illumination.)
*   - Updates tone mapping and exposure on the renderer.
*   - Applies new intensity / colour values to the two synthetic lights when they
*     are active.  Assumes `self.lights` contains exactly the two lights created
*     by `add_lights()`: index 0 = AmbientLight, index 1 = DirectionalLight.
*/
viewer.update_lights = function() {

	const self = this

	const state = self.state;
	const lights = self.lights;

	if (state.punctual_lights && !lights.length) {
		self.add_lights();
	} else if (!state.punctual_lights && lights.length) {
		self.remove_lights();
	}

	self.renderer.toneMapping = Number(state.tone_mapping);
	self.renderer.toneMappingExposure = Math.pow(2, state.exposure);

	if (lights.length === 2) {
		lights[0].intensity = state.ambient_intensity;
		lights[0].color.setHex(state.ambient_color);
		lights[1].intensity = state.direct_intensity;
		lights[1].color.setHex(state.direct_color);
	}
}//end update_lights



/**
* ADD_LIGHTS
* Creates and attaches the two synthetic lights used when a glTF model does not
* supply its own light nodes.
*
*   Light 0: AmbientLight — fills the scene with uniform soft light at
*     `state.ambient_intensity` / `state.ambient_color`.
*   Light 1: DirectionalLight — positioned at (0.5, 0, 0.866) relative to the
*     default camera, approximating a ~60° sun angle.  Attaching both lights to
*     `default_camera` rather than the scene root means they follow the camera as
*     the user orbits, providing consistent illumination from any viewpoint.
*
* @returns {void}
*/
viewer.add_lights = function() {

	const self = this

	const state = self.state;

	const light1	= new AmbientLight(state.ambient_color, state.ambient_intensity);
		light1.name = 'ambient_light';
		self.default_camera.add( light1 );

	const light2	= new DirectionalLight(state.direct_color, state.direct_intensity);
		light2.position.set(0.5, 0, 0.866); // ~60º
		light2.name = 'main_light';
		self.default_camera.add( light2 );

	self.lights.push(light1, light2);
}//end add_lights


/**
* REMOVE_LIGHTS
* Detaches and discards all entries in `self.lights`.
*
* Each light is removed from its parent (the default camera) via the standard
* Three.js `parent.remove()` API.  The array is then truncated to zero length
* (by setting `.length = 0`) so `update_lights()` can detect the empty state
* on the next call.
*
* @returns {void}
*/
viewer.remove_lights = function() {

	const self = this

	self.lights.forEach((light) => light.parent.remove(light));
	self.lights.length = 0;
}//end remove_lights


/**
* UPDATE_ENVIRONMENT
* Resolves the environment descriptor whose name matches `self.state.environment`
* and loads its cube-map texture via `get_cube_map_texture()`.
*
* Once the texture is available:
*   - Sets it as the scene's IBL (image-based lighting) environment so materials
*     with env-map reflections update automatically.
*   - Applies it as the scene background only when `self.state.background` is
*     true; otherwise the flat `self.background_color` is used.
*
* Triggered by: initial `build()`, GUI background/environment controls, and
* any reload that changes the active model.
*
* @returns {void}
*/
viewer.update_environment = function() {

	const self = this

	const environment = environments.filter((entry) => entry.name === self.state.environment)[0];

	self.get_cube_map_texture( environment ).then(( { envMap } ) => {
		self.scene.environment = envMap;
		self.scene.background = self.state.background ? envMap : self.background_color;
	});
}//end update_environment


/**
* GET_CUBE_MAP_TEXTURE
* Loads and returns the pre-filtered environment (PMREM) texture for the given
* environment descriptor.
*
* Three cases:
*   'neutral' — returns the pre-computed `RoomEnvironment` PMREM that was built
*     during `build()` without any network request.
*   '' (none) — resolves immediately with `envMap: null` to clear the environment.
*   Any other — fetches the EXR HDR file from `environment.path`, converts it to
*     a PMREM via `PMREMGenerator.fromEquirectangular`, and disposes the generator
*     to free GPU memory.
*
* (!) The generator is disposed after the first EXR load.  If `get_cube_map_texture`
* is called again for another EXR environment after this point, `self.pmrem_generator`
* will be in a disposed state and the call will throw.  The neutral environment
* is safe to re-request because it does not use the generator.
*
* @param {Object} environment - environment descriptor from `environments.js`
* @param {string} environment.id   - unique id; '' = none, 'neutral' = RoomEnvironment
* @param {string} environment.path - URL to the .exr HDR file (null for none/neutral)
* @returns {Promise<{envMap: Object|null}>} resolves to an object with `envMap`
*   set to the PMREM texture, or `null` for the 'none' environment
*/
viewer.get_cube_map_texture = function( environment ) {

	const self = this

	const { id, path } = environment;

	// neutral (THREE.RoomEnvironment)
	if ( id === 'neutral' ) {
		return Promise.resolve( { envMap: self.neutral_environment } );
	}

	// none
	if ( id === '' ) {
		return Promise.resolve( { envMap: null } );
	}

	return new Promise( ( resolve, reject ) => {

		new EXRLoader()
		.load( path, ( texture ) => {

			const envMap = self.pmrem_generator.fromEquirectangular( texture ).texture;
			self.pmrem_generator.dispose();

			resolve( { envMap } );

		}, undefined, reject );

	});
}


/**
* UPDATE_DISPLAY
* Synchronises scene display settings (wireframe, skeleton helpers, grid) with
* `self.state` after a state change from the GUI.
*
* Steps:
*   1. Removes any previously added SkeletonHelpers from the scene.
*   2. Traverses all materials via `traverse_materials()` to toggle wireframe mode.
*   3. Re-builds SkeletonHelper instances for every skinned mesh when
*      `self.state.skeleton` is true.
*   4. Toggles the GridHelper and AxesHelper: adds them when `state.grid` becomes
*      true; removes them and clears the axes renderer when it becomes false.
*
* The `axes_helper` managed here (a world-space AxesHelper added to the main scene)
* is distinct from the `axes_corner` in the separate axes overlay renderer that
* always shows orientation.
*
* @returns {void}
*/
viewer.update_display = function() {

	const self = this

	if (self.skeleton_helpers.length) {
		self.skeleton_helpers.forEach((helper) => self.scene.remove(helper));
	}

	traverse_materials(self.content, (material) => {
		material.wireframe = self.state.wireframe;
	});

	self.content.traverse((node) => {
		if (node.isMesh && node.skeleton && self.state.skeleton) {
			const helper = new SkeletonHelper(node.skeleton.bones[0].parent);
			helper.material.linewidth = 3;
			self.scene.add(helper);
			self.skeleton_helpers.push(helper);
		}
	});

	if (self.state.grid !== Boolean(self.grid_helper)) {
		if (self.state.grid) {
			self.grid_helper = new GridHelper();
			self.axes_helper = new AxesHelper();
			self.axes_helper.renderOrder = 999;
			// Force-clear the depth buffer before rendering the axes so they
			// always draw on top of scene geometry regardless of depth values.
			self.axes_helper.onBeforeRender = (renderer) => renderer.clearDepth();
			self.scene.add(self.grid_helper);
			self.scene.add(self.axes_helper);
		} else {
			self.scene.remove(self.grid_helper);
			self.scene.remove(self.axes_helper);
			self.grid_helper = null;
			self.axes_helper = null;
			self.axes_renderer.clear();
		}
	}
}//end update_display


/**
* UPDATE_BACKGROUND
* Applies the current `self.state.bg_color` hex value to `self.background_color`,
* which is the Three.js `Color` instance used as the scene's solid background when
* the environment skybox is disabled.
*
* Called by the GUI's bg_color color-picker `onChange` handler; changes take effect
* on the next rendered frame.
*/
viewer.update_background = function() {

	const self = this

	self.background_color.setHex(self.state.bg_color);
}


/**
* ADD_AXES_HELPER
* Creates a small secondary WebGL canvas in the corner of `content_value` that
* renders a persistent world-axis indicator (red=X, green=Y, blue=Z) using a
* separate scene, camera, and renderer.
*
* The overlay is implemented as a second `WebGLRenderer` (with `alpha: true`) so
* it is composited transparently over the main canvas at the CSS level.  This
* avoids the complexity of rendering two scenes in one renderer pass and ensures
* the axis gizmo is always visible even when the main scene's background is opaque.
*
* The `axes_camera` shares its `up` vector with `default_camera` so the gizmo
* orientation is always consistent with the main view.  Its position and lookAt
* are updated each frame in `render()` when the grid is active.
*
* `self.axes_corner` is an `AxesHelper` scaled to match the loaded model's bounding
* size in `set_content()` so axis lines are always a sensible proportion of the model.
*/
viewer.add_axes_helper = function() {

	const self = this

	self.axes_div = document.createElement('div');
	self.content_value.appendChild( self.axes_div );
	self.axes_div.classList.add('axes');

	const {clientWidth, clientHeight} = self.axes_div;

	self.axes_scene		= new Scene();
	self.axes_camera	= new PerspectiveCamera( 50, clientWidth / clientHeight, 0.1, 10 );
	self.axes_scene.add( self.axes_camera );

	self.axes_renderer = new WebGLRenderer( { alpha: true } );
	self.axes_renderer.setPixelRatio( window.devicePixelRatio );
	self.axes_renderer.setSize( self.axes_div.clientWidth, self.axes_div.clientHeight );

	self.axes_camera.up = self.default_camera.up;

	self.axes_corner = new AxesHelper(5);
	self.axes_scene.add( self.axes_corner );
	self.axes_div.appendChild(self.axes_renderer.domElement);
}


/**
* ADD_GUI
* Builds the lil-gui control panel and wires all its controls to the viewer's
* state and update methods.
*
* The GUI is mounted in a `<div class="gui-wrapper">` appended to `content_value`
* so it can be positioned absolutely over the canvas via CSS.
*
* Folders and what they control:
*   Display    — background toggle, wireframe, skeleton, grid, screen-space panning,
*                background colour picker.
*   Lighting   — environment map selector, tone mapping (Linear / ACES Filmic),
*                exposure slider, punctual lights toggle, ambient & directional
*                intensity and colour.
*   Animation  — playback speed, 'Play All' button.  Hidden until a model with
*                animations is loaded (see `update_GUI`).
*   Morph Targets — per-mesh morph influence sliders.  Hidden until a model with
*                   morph targets is loaded.
*   Cameras    — dropdown to switch between the default orbit camera and any
*                cameras embedded in the glTF.  Hidden until a model with cameras
*                is loaded.
*   Performance — embeds the Stats.js DOM node (FPS / memory counters).
*
* The GUI is initialised in the closed state (`gui.close()`) to minimise visual
* clutter when the viewer first appears.
*/
viewer.add_GUI = function() {

	const self = this

	const gui_wrap = document.createElement('div');
		self.content_value.appendChild( gui_wrap );
		gui_wrap.classList.add('gui-wrapper');

	const gui = self.gui = new GUI({
		autoPlace: false,
		container: gui_wrap,
		closeFolders: false
	});

	// Display controls.
		const display_folder	= gui.addFolder('Display');
		const background_ctrl	= display_folder.add(self.state, 'background');
		background_ctrl.onChange(() => self.update_environment());

		const wireframe_ctrl = display_folder.add(self.state, 'wireframe');
		wireframe_ctrl.onChange(() => self.update_display());

		const skeleton_ctrl = display_folder.add(self.state, 'skeleton');
		skeleton_ctrl.onChange(() => self.update_display());

		const grid_ctrl = display_folder.add(self.state, 'grid');
		grid_ctrl.onChange(() => self.update_display());
		display_folder.add(self.controls, 'screen_space_panning');

		const bg_color_ctrl = display_folder.addColor(self.state, 'bg_color');
		bg_color_ctrl.onChange(() => self.update_background());

	// Lighting controls.
		const light_folder = gui.addFolder('Lighting');
		const env_map_ctrl = light_folder.add(self.state, 'environment', environments.map((env) => env.name));
		env_map_ctrl.onChange(() => self.update_environment());
		[
			light_folder.add(self.state, 'tone_mapping', {Linear: LinearToneMapping, 'ACES Filmic': ACESFilmicToneMapping}),
			light_folder.add(self.state, 'exposure', -10, 10, 0.01),
			light_folder.add(self.state, 'punctual_lights').listen(),
			light_folder.add(self.state, 'ambient_intensity', 0, 2),
			light_folder.addColor(self.state, 'ambient_color'),
			light_folder.add(self.state, 'direct_intensity', 0, 4),
			light_folder.addColor(self.state, 'direct_color')
		].forEach((ctrl) => ctrl.onChange(() => self.update_lights()));

	// Animation controls.
		self.anim_folder = gui.addFolder('Animation');
		self.anim_folder.domElement.style.display = 'none';
		const playback_speed_ctrl = self.anim_folder.add(self.state, 'playback_speed', 0, 1);
		playback_speed_ctrl.onChange((speed) => {
			if (self.mixer) self.mixer.timeScale = speed;
		});
		self.anim_folder.add({playAll: () => self.play_all_clips()}, 'playAll');

	// Morph target controls.
		self.morph_folder = gui.addFolder('Morph Targets');
		self.morph_folder.domElement.style.display = 'none';

	// Camera controls.
		self.camera_folder = gui.addFolder('Cameras');
		// self.camera_folder.domElement.style.display = 'none';

	// Stats.
		const stats_folder	= gui.addFolder('Performance');
		const stats_li		= document.createElement('li');
		self.stats.dom.style.position = 'static';
		stats_li.appendChild(self.stats.dom);
		stats_li.classList.add('gui-stats');
		stats_folder.$children.appendChild( stats_li );

	// by default gui will be show closed
	gui.close();
}


/**
* UPDATE_GUI
* Rebuilds the dynamic GUI sections (Cameras, Morph Targets, Animation) after a
* new model is loaded.  Static sections (Display, Lighting, Performance) are
* built once in `add_GUI()` and are not touched here.
*
* Steps:
*   1. Hides all three dynamic folders and destroys all previously created controls
*      to avoid accumulating stale controllers across model reloads.
*   2. Traverses the loaded scene to collect embedded camera names and meshes with
*      morph targets.
*   3. If the model contains cameras, shows the Cameras folder and populates a
*      dropdown with the default camera name plus all embedded camera names.
*   4. If the model contains morph targets, shows the Morph Targets folder and adds
*      a slider per influence per mesh, labelled from `morphTargetDictionary` where
*      available.
*   5. If the model contains animations, shows the Animation folder, auto-plays the
*      first clip, and adds a toggle control per clip that plays/stops the action
*      via the AnimationMixer.
*
* (!) The first animation clip is auto-played on every model load (clipIndex === 0).
* `action_states` is reset to a fresh object so stale action names from a previous
* model do not persist in the GUI state.
*/
viewer.update_GUI = function() {

	const self = this

	self.camera_folder.domElement.style.display = 'none';

	self.morph_ctrls.forEach((ctrl) => ctrl.destroy());
	self.morph_ctrls.length = 0;
	self.morph_folder.domElement.style.display = 'none';

	self.anim_ctrls.forEach((ctrl) => ctrl.destroy());
	self.anim_ctrls.length = 0;
	self.anim_folder.domElement.style.display = 'none';

	const camera_names = [];
	const morph_meshes = [];
	self.content.traverse((node) => {
		if (node.isMesh && node.morphTargetInfluences) {
		morph_meshes.push(node);
		}
		if (node.isCamera) {
		node.name = node.name || `VIEWER__camera_${camera_names.length + 1}`;
		camera_names.push(node.name);
		}
	});

	if (camera_names.length) {
		self.camera_folder.domElement.style.display = '';
		if (self.camera_ctrl){
			self.camera_ctrl.remove();
		}
		const camera_options	= [self.DEFAULT_CAMERA].concat(camera_names);
		self.camera_ctrl		= self.camera_folder.add(self.state, 'camera', camera_options);
		self.camera_ctrl.onChange((name) => self.set_camera(name));
	}

	if (morph_meshes.length) {
		self.morph_folder.domElement.style.display = '';
		morph_meshes.forEach((mesh) => {
		if (mesh.morphTargetInfluences.length) {
			const nameCtrl = self.morph_folder.add({name: mesh.name || 'Untitled'}, 'name');
			self.morph_ctrls.push(nameCtrl);
		}
		for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
			const ctrl = self.morph_folder.add(mesh.morphTargetInfluences, i, 0, 1, 0.01).listen();
			Object.keys(mesh.morphTargetDictionary).forEach((key) => {
			if (key && mesh.morphTargetDictionary[key] === i) ctrl.name(key);
			});
			self.morph_ctrls.push(ctrl);
		}
		});
	}

	if (self.clips.length) {
		self.anim_folder.domElement.style.display = '';
		const action_states = self.state.action_states = {};
		self.clips.forEach((clip, clipIndex) => {
		clip.name = `${clipIndex + 1}. ${clip.name}`;

		// Autoplay the first clip.
		let action;
		if (clipIndex === 0) {
			action_states[clip.name] = true;
			action = self.mixer.clipAction(clip);
			action.play();
		} else {
			action_states[clip.name] = false;
		}

		// Play other clips when enabled.
		const ctrl = self.anim_folder.add(action_states, clip.name).listen();
		ctrl.onChange((playAnimation) => {
			action = action || self.mixer.clipAction(clip);
			action.setEffectiveTimeScale(1);
			playAnimation ? action.play() : action.stop();
		});
		self.anim_ctrls.push(ctrl);
		});
	}
}


/**
* CLEAR
* Removes the current scene content from the Three.js scene graph and disposes
* all associated GPU resources (geometry buffers and textures) to prevent memory
* leaks when loading a new model.
*
* Returns early if no content is currently loaded (`self.content === null`).
*
* Geometry: traverses the scene and calls `geometry.dispose()` on every mesh node.
*
* Textures: traverses materials via `traverse_materials()` and disposes every
* texture property that is not 'envMap'.  The environment map is intentionally
* excluded because it belongs to the viewer's environment system and must persist
* across model loads.
*/
viewer.clear = function() {

	const self = this

	if ( !self.content ) return;

	self.scene.remove( self.content );

	// dispose geometry
	self.content.traverse((node) => {
		if ( !node.isMesh ) return;
		node.geometry.dispose();
	} );

	// dispose textures
	traverse_materials( self.content, (material) => {

		for ( const key in material ) {
			if ( key !== 'envMap' && material[ key ] && material[ key ].isTexture ) {
				material[ key ].dispose();
			}
		}
	});
}



/**
* TRAVERSE_MATERIALS
* Module-private helper that visits every `THREE.Material` instance on every mesh
* in the given object hierarchy and invokes `callback` with the material.
*
* Handles multi-material meshes (where `node.material` is an array) by normalising
* the value to an array before iterating, so `callback` always receives a single
* material object.
*
* @param {Object} object - Three.js `Object3D` node; traversal descends into all
*   children recursively via `object.traverse()`
* @param {Function} callback - called once per material with signature
*   `(material: THREE.Material) => void`
*/
function traverse_materials (object, callback) {
	object.traverse((node) => {
		if (!node.isMesh) return;
		const materials = Array.isArray(node.material)
			? node.material
			: [node.material];
		materials.forEach(callback);
	});
}



// @license-end
