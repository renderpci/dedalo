



var thematic_search = {


	trigger_url : "trigger.thematic_search.php",


	/**
	* LOAD_CHILDRENS
	*/
	load_childrens : function(button_obj) { // , target_id, ar_childrens

		var container = document.getElementById(button_obj.dataset.container_id)
			if (!container) {
				console.warn("[thematic_search.load_childrens] Error on locate container: ",button_obj.dataset.container_id);
				return false
			}
			if (container.dataset.status && container.dataset.status==="loaded") {
				while (container.firstChild) container.removeChild(container.firstChild)
				container.dataset.status=""
				return false;
			}
			
			container.innerHTML = ' Loading... '
			

		var trigger_vars = {
			mode  			: "load_childrens",			
			lang 			: page_globals.WEB_CURRENT_LANG_CODE,
			ar_term_id 		: button_obj.dataset.ar_childrens
		}
		//console.log("[thematic_search.load_childrens] trigger_vars ",trigger_vars); return;			

		// Http request directly in javascript to the API is possible too..
		common.get_json_data(this.trigger_url, trigger_vars).then(function(response){
				if(SHOW_DEBUG===true) {
					console.log("[thematic_search.load_childrens] response:" , response);
				}

				if (!response) {
					// Error
					console.warn("[thematic_search.load_childrens] Error. Received response data is null");

				}else{

					container.innerHTML = ''
					
					// Recreate again (now with javascript) the dom for each term
					// This is a sample only. You can build all DOM elements in javascript or with PHP, etc.. in unified way
					var len = response.result.length
					for (var i = 0; i < len; i++) {

						var ts_term = response.result[i]

						var term_div = document.createElement("div")
							term_div.innerHTML = "- <strong>Term:</strong> " + ts_term.term + " <em> ["+ts_term.term_id +"]</em> "
							container.appendChild(term_div)
						
						// Childrens
						//console.log("ts_term.ar_childrens.length", ts_term.ar_childrens.length);
						if (ts_term.ar_childrens.length > 0) {

							var container_id = "ts_container_" + ts_term.term_id
							//var ar_childrens = ts_term.ar_childrens

							var a = document.createElement("a")
								a.href="javascript:void(0)"
								a.dataset.ar_childrens = JSON.stringify(ts_term.ar_childrens)
								a.dataset.container_id = container_id
								a.appendChild( document.createTextNode("Load childrens") )
								a.addEventListener("click",function(e){
									thematic_search.load_childrens(this)
								},false)
							term_div.appendChild(a)

							var sub_container = document.createElement("div")
								sub_container.id = container_id
								sub_container.style.paddingLeft = '20px'
							term_div.appendChild(sub_container)
						}
						
						// Indexations
						var indexations = JSON.parse(ts_term.indexation)
						if (indexations.length>0) {

							let container_id   = "index_container_" + ts_term.term_id							
							let ar_indexations = indexations
							let term_id 	   = ts_term.term_id

							let a = document.createElement("a")
								a.href="javascript:void(0)"
								a.appendChild( document.createTextNode("Load indexations") )
								a.addEventListener("click",function(e){
									thematic_search.load_indexations(this, container_id, ar_indexations, term_id)
								},false)
							term_div.appendChild(a)

							let sub_container = document.createElement("div")
								sub_container.id = container_id
								sub_container.style.paddingLeft = '20px'
							term_div.appendChild(sub_container)
						}						
					}

					container.dataset.status = "loaded"
				}
		})
	},//end get_json_data



	/**
	* LOAD_INDEXATIONS
	*/
	load_indexations : function (button_obj, target_id, ar_indexations, term_id) {
		//console.log("ar_indexations: ", JSON.stringify(ar_indexations) );

		var container = document.getElementById(target_id)
			if (!container) {
				console.warn("[thematic_search.load_indexations] container not found. "+target_id);
				return false
			}
			if (container.dataset.status && container.dataset.status==="loaded") {
				while (container.firstChild) container.removeChild(container.firstChild)
				container.dataset.status=""
				return false;
			}
			container.innerHTML = "Loading.."		

		var trigger_vars = {
			mode  			: 'load_indexations',		
			lang 			: page_globals.WEB_CURRENT_LANG_CODE,
			term_id 		: term_id,
			ar_locators 	: ar_indexations,
		}
		//console.log("[thematic_search.load_indexations] trigger_vars",trigger_vars); return;		

		// Http request directly in javascript to the API is possible too..
		common.get_json_data(this.trigger_url, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[thematic_search.load_indexations] response", response);
			}			
			
			container.innerHTML = ""

			container.dataset.term_id 		 = term_id
			container.dataset.ar_indexations = JSON.stringify(ar_indexations)				

			// Create video container
			let video_container_id = "video_container_" + term_id

			var ar_interview_id = []
			var len = response.result.length
			
			for (let i = 0; i < len; i++) {
				var node 	= response.result[i]					
				if (ar_interview_id.indexOf(node.node_id) === -1) {

					let ar_locators = ar_indexations

					let img = document.createElement("img")
						img.src = page_globals.__WEB_BASE_URL__ + node.image_url
						img.style.height = "60px"
						//img.dataset.term_id = term_id
						//img.dataset.ar_indexations = JSON.stringify(ar_indexations)						
						img.addEventListener("click",function(e){
							thematic_search.load_video_data(video_container_id, this.parentNode.dataset.term_id, this.parentNode.dataset.ar_indexations, i)
						},false)
						container.appendChild(img)

					ar_interview_id.push(node.node_id)
				}								
			}//end for (var i = 0; i < len; i++)

			var video_container = document.createElement("div")
				video_container.id = video_container_id				
				container.appendChild(video_container)	

			container.dataset.status = "loaded"
		})
	},//end load_indexations



	/**
	* LOAD_VIDEO_DATA
	*/
	load_video_data : function(video_container_id, term_id, ar_locators, ar_locators_key) {

		var video_container = document.getElementById(video_container_id)
			if (!video_container) {
				console.warn("[thematic_search.load_video_data] video_container not found. "+video_container_id);
				return false
			}
			video_container.style.paddingTop 	= "15px"
			video_container.style.paddingBottom = "20px"
			video_container.innerHTML 			= ' Loading... '

		var trigger_vars = {
			mode 			: "load_video_data",			
			lang 			: page_globals.WEB_CURRENT_LANG_CODE,
			term_id 		: term_id,
			ar_locators 	: ar_locators,
			ar_locators_key : ar_locators_key
		}
		console.log("load_video_data trigger_vars",trigger_vars); //return;

		// Http request 
		common.get_json_data(this.trigger_url, trigger_vars).then(function(response){
				if(SHOW_DEBUG===true) {
					console.log("[thematic_search.load_video_data] response", response);
				}
				
				if (!response || typeof response.result=="undefined") {
					video_container.innerHTML = "<h4>Ops.. empty received data for API call with vars: <pre>"+ JSON.stringify(trigger_vars, null, 2)+"</pre></h4>"; return false
				}

				if (response.result===true) {

					video_container.innerHTML = '<h4>Video player</h4>'
					/*
					var video = document.createElement("video")
						video.controls 	= true
						video.height 	= 404 
						video.src 		= page_globals.__WEB_BASE_URL__ + response.fragments[0].video_url
						video.poster 	= page_globals.__WEB_BASE_URL__ + response.image_url
						*/
					var video = common.build_player({
						src 	: [ page_globals.__WEB_BASE_URL__ + response.fragments[0].video_url ],
						poster  : page_globals.__WEB_BASE_URL__ + response.image_url,
						height  : 404,
						ar_subtitles : [
							{
								src 	: "http://mdcat:8080/dedalo4/media_test/media_mdcat/av/subtitles/rsc35_rsc167_1_lg-cat.vtt",
								srclang : "es",
								label 	: "Spanish",
								default : true
							}
						]
					})
				

					video_container.appendChild(video)
					// Build extended fragment text and instert into video_container div
					var fragment_text = document.createElement("div")
						fragment_text.innerHTML = '<h4>Fragment</h4>' +response.fragments[0].fragm
					video_container.appendChild(fragment_text)

				}else{

					console.log("[thematic_search.load_video_data] False response received", response);
				}				
		})			
	}//end load_video_data	



}//end thematic_search