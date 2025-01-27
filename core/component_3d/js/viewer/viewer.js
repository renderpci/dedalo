// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL*/
/*eslint no-undef: "error"*/


// imports
	import {dd_request_idle_callback} from '../../../common/js/events.js'
	// used a importmap define in page/index.html to resolve directories
	// the main addons is /lib/threejs/jsm/ has to be mapped as three/
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
*/
export const viewer = function () {

}



/**
* INIT
* @param object options
* @return object self
* 	Self instance
*/
viewer.init = async function (options) {

	const self = this

	// options
		const cache = options.cache ?? true
		const default_camera = options.default_camera ?? '[default]'

	// set main vars
		self.DEFAULT_CAMERA	= default_camera;
		self.MANAGER		= new LoadingManager();
		self.DRACO_LOADER	= new DRACOLoader( self.MANAGER ).setDecoderPath( '../../lib/threejs/jsm/libs/draco/' );
		self.KTX2_LOADER	= new KTX2Loader( self.MANAGER ).setTranscoderPath( '../../lib/threejs/jsm/libs/basis/' );

		Cache.enabled = cache;

	return self
}//end init



/**
* BUILD
* @param content_value HTMLElement
* @param options object
* 	saved viewer options
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
* Is triggered for each frame (x frames/sec)
* @return void
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
* When the window is resize it's necessary to update the aspect of the camera and the size of the rendered node
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
* @param string file_uri
* 	uri of the file to be load
* @return promise
* 	resolve object gltf
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
* @param {THREE.Object3D} scene
* @param {Array<THREE.AnimationClip} clips
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
			self.state.punctual_lights = false;
		} else if (node.isMesh) {
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
* get image jpg of the model loaded
* @param options object
* {
* 	width : 720
* 	height: 404
* }
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
* show the object structure in console
* @param object
*/
viewer.dump_graph = function(object) {

	const self = this

	console.group(' <' + object.type + '> ' + object.name);
	object.children.forEach((child) => self.dump_graph(child));
	console.groupEnd();
}//end dump_graph


/**
* DUMP_OBJECT
* show mesh structure in console (alternative view of dump_graph)
* @param object
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
* show mesh structure in console (alternative view of dump_graph)
* @param time number
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
* @param {Array<THREE.AnimationClip} clips
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
* @param {string} name
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
* UPDATE_LIGHTS
* @return void
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
* @return void
*/
viewer.remove_lights = function() {

	const self = this

	self.lights.forEach((light) => light.parent.remove(light));
	self.lights.length = 0;
}//end remove_lights


/**
* REMOVE_LIGHTS
* @return void
*/
viewer.update_environment = function() {

	const self = this

	const environment = environments.filter((entry) => entry.name === self.state.environment)[0];

	self.get_cube_map_texture( environment ).then(( { envMap } ) => {
		self.scene.environment = envMap;
		self.scene.background = self.state.background ? envMap : self.background_color;
	});
}//end update_environment


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
* @return void
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


viewer.update_background = function() {

	const self = this

	self.background_color.setHex(self.state.bg_color);
}


/**
* Adds AxesHelper.
*
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
