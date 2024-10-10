// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
* ONMESSAGE
* Called from caller 'postMessage' action like:
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

			timing_V : '#f78a1c', // orange Dédalo

			correctLevel : QRCode.CorrectLevel.H, // L, M, Q, H

			dotScale : 0.5,

			// quietZone
			// quietZone: 0,
			quietZone : 10,
			// quietZoneColor: '#00CED1',

			onRenderingEnd : function(options, dataURL) {
				// console.info(dataURL);
				// resolve(true)
				self.postMessage(true);
			}
		}

	// Create QRCode Object
		const qrcode = new QRCode(container, qr_options);

	// response OK
	// 	response.result	= result
	// 	response.msg	= 'Task done in ms: ' + performance.now()-t1 + ' ms'


	// self.postMessage(response);
}//end onmessage



// @license-end
