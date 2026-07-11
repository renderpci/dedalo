// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
* WORKER_QR
* Dedicated Web Worker that generates a single QR code image using the
* EasyQRCodeJS library (lib/qrcode/easy.qrcode.min.js) and signals
* completion to the main thread.
*
* This file is intended to be loaded as a classic Worker script (not a module)
* because the EasyQRCodeJS library must already be importScripts'd into the
* global scope before this handler runs. In the current implementation the
* worker approach is kept dormant (commented out in render_tool_qr.js), and
* QR generation happens directly on the main thread via generate_qr(); this
* file remains available for future re-activation of the off-thread strategy.
*
* Message protocol (postMessage in / postMessage out):
*   IN  — plain Object posted by the caller via worker.postMessage(options):
*     {
*       container : {HTMLElement} — DOM node that EasyQRCodeJS appends the canvas to
*                                   (!) Only valid when the worker shares a DOM context;
*                                   in a true off-thread worker this would be an
*                                   OffscreenCanvas or a transferable. Keep this in mind
*                                   if the worker path is re-enabled.
*       text      : {string}      — URL or text to encode; defaults to 'https://dedalo.dev/dedalo'
*       width     : {number}      — canvas width in px; defaults to 200
*       height    : {number}      — canvas height in px; defaults to 200
*       logo      : {string}      — path to the overlay logo SVG/PNG; defaults to the
*                                   Dédalo default logo at ../../core/themes/default/dedalo_logo.svg
*     }
*   OUT — boolean `true` sent back via self.postMessage(true) once EasyQRCodeJS
*         has finished rendering (triggered by its onRenderingEnd callback).
*/



/**
* ONMESSAGE
* Web Worker message handler. Receives generation options from the main thread,
* builds an EasyQRCodeJS configuration object with Dédalo-specific defaults, and
* instantiates the QRCode object. When EasyQRCodeJS finishes rendering it fires
* onRenderingEnd, which posts `true` back to the caller so it can resolve any
* awaiting Promise.
*
* Note: `QRCode` is expected to exist in the global scope (self) because the
* EasyQRCodeJS library must be loaded via importScripts() before this handler
* fires. If the library is absent this will throw a ReferenceError at runtime.
*
* Note: the `qrcode` variable (result of `new QRCode(...)`) is created but never
* used after instantiation — the side-effect of rendering is the goal, not the
* object reference itself.
*
* @param {MessageEvent} e - Worker MessageEvent whose `data` property carries the
*                           options object described in the module header.
* @returns {void}
*/
self.onmessage = function(e) {
	// const t1 = performance.now()

	// options
		const options	= e.data // function name

		const container = options.container
		const text		= options.text || 'https://dedalo.dev/dedalo'
		const width		= options.width || 200
		const height	= options.height || 200
		const logo		= options.logo || '../../core/themes/default/dedalo_logo.svg'

	// qr options
		const qr_options = {
			text		: text, // "www.easyproject.cn/donation", // Content
			width		: width, // 240, // Widht
			height		: height, // 240, // Height
			colorDark	: "#000000", // Dark color
			colorLight	: "#ffffff", // Light color

			// Logo
			logo						: logo,
			logoWidth					: 20,
			logoHeight					: 20,
			logoBackgroundColor			: '#ffffff', // Logo background color, Invalid when `logBgTransparent` is true; default is '#ffffff'
			logoBackgroundTransparent	: false, // Whether use transparent image, default is false

			// Dédalo brand colour applied to the timing pattern (the alternating
			// row/column of modules between alignment patterns in the QR matrix).
			timing_V : '#f78a1c', // orange Dédalo

			// Use the highest error-correction level (H = ~30 % recovery capacity)
			// so the embedded logo does not degrade readability.
			correctLevel : QRCode.CorrectLevel.H, // L, M, Q, H

			// Scale each module dot to 50 % of its cell so the pattern has a
			// rounded, airy look rather than a fully-filled grid.
			dotScale : 0.5,

			// quietZone — blank margin around the symbol; helps scanners locate
			// the finder patterns, especially when printed on busy backgrounds.
			// quietZone: 0,
			quietZone : 10,
			// quietZoneColor: '#00CED1',

			// onRenderingEnd fires when EasyQRCodeJS has finished drawing to the
			// canvas. Post `true` to notify the waiting caller that the image is ready.
			onRenderingEnd : function(options, dataURL) {
				// console.info(dataURL);
				// resolve(true)
				self.postMessage(true);
			}
		}

	// Create QRCode Object
	// EasyQRCodeJS performs all drawing as a constructor side-effect; the returned
	// instance is not used directly but must be captured to prevent GC before render.
		const qrcode = new QRCode(container, qr_options);

	// response OK
	// 	response.result	= result
	// 	response.msg	= 'Task done in ms: ' + performance.now()-t1 + ' ms'


	// self.postMessage(response);
}//end onmessage



// @license-end
