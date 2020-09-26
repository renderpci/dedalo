/*
	TOOL_qr
*/


// TOOL_qr CLASS
var tool_qr = new function() {



	// properties
	this.data
	this.container



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		
		// debug
			if(SHOW_DEBUG===true) {
				console.log("->tool_qr init options:",options);
			}
		
		const self = this

		return new Promise(function(resolve){
			
			self.data		= options.data
			self.container	= document.getElementById(options.container)

			resolve(self)
		})
	};//end init



	/**
	* RENDER
	* @return 
	*/
	this.render = function() {

		const self = this

		return new Promise(function(resolve){		

			const fragment = new DocumentFragment()

			const qr_promises = []
		
			const data_length = self.data.length
			for (let i = 0; i < data_length; i++) {
				
				const item	= self.data[i]
				const url	= item.url

				// item wrapper
					const qr_wrapper = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'qr_wrapper',
						parent			: fragment
					})

				// qr_code add
					const qr_promise = self.generate_qr({
						container	: qr_wrapper,
						text		: url,
						logo		: "/dedalo/lib/dedalo/themes/default/dedalo_logo.svg",
						width		: 160,
						height		: 160
					})
					qr_promises.push(qr_promise)

				// qr_info
					const qr_info = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'qr_info',
						parent			: qr_wrapper
					})
					// qr_info.style.backgroundImage = 'url('+item.logo+')';

					const qr_image = common.create_dom_element({
						element_type	: 'img',
						class_name		: 'qr_image',
						src				: item.image,
						parent			: qr_info
					})

					const qr_section_id = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'qr_section_id',
						text_content	: item.section_id,
						parent			: qr_info
					})

					const qr_label = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'qr_label',
						inner_html		: item.label,
						parent			: qr_info
					})

					const qr_logo = common.create_dom_element({
						element_type	: 'img',
						class_name		: 'qr_logo',
						src				: item.logo,
						parent			: qr_info
					})
			}

			
			Promise.all(qr_promises).then(function(){			

				// self.container.appendChild(fragment)	

				// remove canvas garbage					
					const garbage_canvas = fragment.querySelectorAll("canvas")
					if (garbage_canvas) {
						for (let i = garbage_canvas.length - 1; i >= 0; i--) {
							garbage_canvas[i].remove()
						}
					}
			
				resolve(fragment)
			})
		})
	};//end render



	/**
	* GENERATE_QR
	* @see https://github.com/ushelp/EasyQRCodeJS
	* @return 
	*/
	this.generate_qr = function(options) {

		return new Promise(function(resolve){
		
			const container = options.container
			const text		= options.text || 'www.fmomo.org/dedalo'
			const width		= options.width || 200
			const height	= options.height || 200
			const logo		= options.logo || '/dedalo/lib/dedalo/themes/default/dedalo_logo.svg'

			
			const build_options = {
				text		: text, // "www.easyproject.cn/donation", // Content	
				width		: width, // 240, // Widht
				height		: height, // 240, // Height
				colorDark	: "#000000", // Dark color
				colorLight	: "#ffffff", // Light color
		
				// Logo
				logo						: logo, // LOGO
				// logo						: "http://127.0.0.1:8020/easy-qrcodejs/demo/logo.png",  
				logoWidth					: 20, 
				logoHeight					: 20,
				logoBackgroundColor			: '#ffffff', // Logo backgroud color, Invalid when `logBgTransparent` is true; default is '#ffffff'
				logoBackgroundTransparent	: false, // Whether use transparent image, default is false	
			
				timing_V: '#f78a1c', // orange Dédalo
		
				correctLevel: QRCode.CorrectLevel.H, // L, M, Q, H	
				
				dotScale: 0.5,

				// quietZone
				// quietZone: 0,
				quietZone: 10,
	           	// quietZoneColor: '#00CED1',

				onRenderingEnd:function(options, dataURL){
					// console.info(dataURL);
					resolve(true)
				}
			}
			
			// Create QRCode Object
			const qrcode = new QRCode(container, build_options);

			// return qrcode
		})
	};//end generate_qr



};//end tool_qr