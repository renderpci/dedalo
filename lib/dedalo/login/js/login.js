/**
* LOGIN
*
*
*
*/
var login = new function() {

	'use strict';

	this.url_trigger = DEDALO_LIB_BASE_URL + '/login/trigger.login.php'
	this.wrap_login  = []


	/**
	* INIT
	* @return bool true
	*/
	this.init = function(options) {
		
		// form show
			const wrap_login = document.getElementById('wrap_login')	//$(".css_wrap_login")
			if (wrap_login) {				
				// fade-in form and focus username input
					$(wrap_login).fadeIn(500, function(){
						setTimeout(function(){
							const input = document.getElementById('login_username')
							if (input) input.focus()
						},300)					
					});
				// press enter key event fires form submit
					wrap_login.addEventListener("keydown", function(event){
						const keycode = (event.keyCode ? event.keyCode : event.which)
						if (keycode===13) { // enter key
							event.preventDefault()
							login.Login()
						}
					},false)
			}//if (wrap_login)


		// maintenance mode. if true, reload every 30 secs
			if (options.dedalo_maintenance_mode===true) {
				setTimeout(function(){window.location.reload(true);},30000);
			}

		// debug info. on true, show collected browser info
			if (options.development_server===true) {
				console.log('[login] browser_info:',login.get_browser_info());
			}

		return true
	}//end init



	/**
	* LOGIN
	* @return promise js_promise
	*/
	this.Login = function () {
		
		// Broser validation
			if (!login.validate_browser()) {
				console.log("[login.Login] Invalid browser");
				return false;
			}

		// inputs
			const wrap_login				= document.getElementById('wrap_login')
			const input_username			= wrap_login.querySelector("#login_username")
			const input_password			= wrap_login.querySelector("#login_password")
			const input_tipo_login			= wrap_login.querySelector("#tipo_login")
			const input_tipo_username		= wrap_login.querySelector("#tipo_username")
			const input_tipo_password		= wrap_login.querySelector("#tipo_password")
			const input_tipo_active_account	= wrap_login.querySelector("#tipo_active_account")

		// values
			const username					= (input_username) ? input_username.value : null //	login.wrap_login.find('#login_username').val();
			const password					= (input_password) ? input_password.value : null // login.wrap_login.find('#login_password').val();			
			const tipo_login				= (input_tipo_login) ? input_tipo_login.value : null // login.wrap_login.find('#tipo_login').val();
			const tipo_username				= (input_tipo_username) ? input_tipo_username.value : null // login.wrap_login.find('#tipo_username').val();
			const tipo_password				= (input_tipo_password) ? input_tipo_password.value : null // login.wrap_login.find('#tipo_password').val();
			const tipo_active_account		= (input_tipo_active_account) ? input_tipo_active_account.value : null // login.wrap_login.find('#tipo_active_account').val();
		
		// focus input if empty value
			if(username===null || username.length<1) {
				if(input_username) input_username.focus();
				return false;
			}
			if(password===null || password.length<1) {
				if(input_password) input_password.focus()
				return false;
			}		
		
		// trigger_vars
			const trigger_vars = {
				mode				: 'Login',
				username			: username,
				password			: password,
				tipo_login			: tipo_login,
				tipo_username		: tipo_username,
				tipo_password		: tipo_password,
				tipo_active_account	: tipo_active_account,
				top_tipo			: page_globals.top_tipo
			}

		// target_div . Where messages are showed
			const target_div = document.getElementById('login_ajax_response');	
			while (target_div.firstChild) {
				target_div.removeChild(target_div.firstChild);
			}	

		// Spinner loading
			const spinner = document.createElement("div")
				  spinner.classList.add("css_spinner")
				  target_div.appendChild(spinner)
		
		// Hide submit button and dedalo_version
			const elems		= document.querySelectorAll('.css_button_login, .dedalo_version');
			const values	= [].map.call(elems, function(obj) {
				obj.style.display = "none"
			})

		//html_page.loading_content( wrap_login, 1 );

		const js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[login.Login] response",response);
				}
				
				if (response===null) {
					// Trigger error in process script. Null value is returned
					const server_null_msg = "Sorry, a server error has occurred. Null response is received. Anyway, I will try recover and enter.";
					const msg  = document.createTextNode(server_null_msg)
					const span = document.createElement("span")
						  span.appendChild( document.createTextNode(msg) )
						  span.classList.add("error")
						  target_div.appendChild(span)

					// Show hidden submit button again
					document.querySelector('.css_button_login').style.display = ""

					// remove spinner
					spinner.remove()

					// Reload anyway
					setTimeout(function() {
						//span.innerHTML = "Going to main page.."
						// Reload without force update browser cache
						window.location.reload(false)
					},1000)
				
				}else{

					if (response.result===true) {						
						// TRUE. ACCEES GRANTED	
						
						// Show trigger ok message
						const msg  = document.createTextNode(response.msg)
						const span = document.createElement("span")
							  span.appendChild( msg )
							  span.classList.add("ok")
							  target_div.appendChild(span)

						// Apply js defaults
						login.apply_defaults();

						// remove spinner
						//spinner.remove()

						// Show error to user
							if (response.errors && response.errors.length>0) {
								let error_msg = response.errors.join("\n")
								alert( error_msg );
							}
						
						// Reload page
						setTimeout(function() {
							//span.innerHTML = "Going to main page.."
							// Reload without force update browser cache
							window.location.reload(false)
						},100)

						// event to parent window (on iframen cases)
							if (window.parent) {
								const detail	= response
								const event		= new CustomEvent('login_success', { detail: detail })
								window.parent.document.dispatchEvent(event)
							}

					}else{
						// FALSE. ACCESS DENIED

						// Show trigger error message
						let span = document.createElement("span")
							span.appendChild( document.createTextNode(response.msg) )
							span.classList.add("error")
						target_div.appendChild(span)

						// Show hidden submit button again
						document.querySelector('.css_button_login').style.display = ""

						// remove spinner
						spinner.remove()
					}
				}
				//html_page.loading_content( wrap_login, 0 );
		}, function(error) {
				console.error("[login.Login] Failed get_json!", error);
				
				// Show trigger error messag
					const span = document.createElement("span")
						  span.appendChild( document.createTextNode("Error on Login (trigger request error)") )
						  span.classList.add("error")
						  target_div.append(span);

				// Show hidden submit button again
				document.querySelector('.css_button_login').style.display = ""
				
				// remove spinner
				spinner.remove()
		})//end js_promise


		return js_promise
	}//end Login method



	/**
	* QUIT
	* Quits from Dédalo
	* @return promise js_promise
	*/
	this.Quit = function() {
		
		const trigger_url  = this.url_trigger
		const trigger_vars = {
			mode 	 : 'Quit',
			top_tipo : page_globals.top_tipo
		}

		const wrap_obj = document.getElementById('html_page_wrap')

		html_page.loading_content( wrap_obj, 1 );

		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[login.Quit] response",response)
				}

				html_page.loading_content( wrap_obj, 0 );

				//html_page.loading_content( wrap_div, 0 );
				if (response===null) {
					//alert("<pre>An error has occurred. Null data is received on Quit</pre>");
					console.log("[login.Quit] An error has occurred. Null data is received on Quit");
					
				}else{
					// Elimina las cookies que empiezan por ..  (component_autocomplete_ts)
					clear_some_local_storage("component_autocomplete_ts")
					clear_some_local_storage("components_save_track")
					
					if(response.result===true) {

						// SAML redirection check
							if (typeof response.saml_redirect!=="undefined" && response.saml_redirect.length>2) {

								window.location.href = response.saml_redirect

							}else{
								//window.location.href = window.location
								window.location.reload(false)
							}						
					}else{							
						//alert( response.msg );
						console.log("[login.Quit] ",response.msg);
					}
				}
				//html_page.loading_content( wrap_obj, 0 );
		}, function(error) {
				console.error("[login.Quit] Failed get_json!", error);

				// Reloads page
				window.location.reload(false)

				html_page.loading_content( wrap_obj, 0 );
		})//end js_promise


		return js_promise
	}//end Quit



	/**
	* APPLY_DEFAULTS
	*/
	this.apply_defaults = function() {

		// Collapse some tabs by default
		const collapse_tabs = [
						'dd782', // Users : filters sg
						'debug_info_wrapper',
						'dd361',
						'dd136',
						'dd483',
						'filter_tap',
						// PCI
						//'ich3',	//dd655
						'ich4',	//dd660
						'ich5',	//dd666
						'ich6',	//dd681
						'ich7',	//dd602
						'ich8',	//dd622
						'ich9',	//dd721
						// OH
						'oh4',	//dd908
						'oh5',	//dd929
						]
		const len = collapse_tabs.length
		for (let i = len - 1; i >= 0; i--) {
			set_localStorage(collapse_tabs[i], 1)			
		}

		// Elimina las cookies que empiezan por ..  (component_autocomplete_ts)
		clear_some_local_storage("component_autocomplete_ts")
		clear_some_local_storage("components_save_track")
		
		return true
	}//end apply_defaults



	/**
	* SET_PSW
	*/
	this.set_psw = function( ) {

		const form_obj 	= $('#form_set_psw')
		const psw 	 	= $('#psw').val()
		const psw2 	 	= $('#psw2').val()

	
		// Test password is aceptable string
		const verify_password = component_password.verify_password( $('#psw'), psw);						
		if( verify_password ) {
			// ALL IS OK
		}else{				
			return false;	//alert("Invalid password format!");	
		}

		// Test retype password is equal
		if (psw!=psw2) {
			return alert("Password retype is different")
		}

		// SAVE PASSWORD
		const target_div = $('.login_ajax_response');
		if ( $(target_div).length != 1 ) { return alert("Error ajax_response container not found"); };

		const form_container = document.getElementById("form_container")
		
		const url_trigger = DEDALO_ROOT_WEB + '/install/set_psw/trigger.set_psw.php'
		const mydata 	  = {
			mode 		: 'set_psw',
			username 	: 'admin',
			password 	: psw,
			reference 	: 'rfC' + psw,
			top_tipo 	: page_globals.top_tipo
		}; //return console.log(mydata);
		
		//if(SHOW_DEBUG===true) console.log("Login data vars: " + 'mode:'+ mode+ ' username:'+ username+ ' password:'+ password);		//return false;	
		target_div.html(' ').addClass('css_spinner');

		// AJAX REQUEST
		$.ajax({
			url		: url_trigger,
			data	: mydata,
			type	: "POST",
		})
		// DONE
		.done(function(received_data) {
			
			// Search 'error' string in response
			const error_response = /error/i.test(received_data)

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			if(error_response) {
				// ERROR : Show error
				//target_div.fadeOut(500, function(){
					$(target_div).html("<span class='error'>" + received_data + "</span>");					
				//})
			}else{
				// OK		
				target_div.empty().append("<span class='ok'> OK. Password is set. <br>Reset and reloading user <b>root</b> <br>Please wait.</span>\n" + received_data);

				// hide form container inputs
					form_container.classList.add("hide")

				setTimeout(function() {
					window.location.href = DEDALO_LIB_BASE_URL + '/main/?m=tool_administration&t=dd242&menu=1'
				}, 4000)				
			}			
		})
		// FAIL ERROR 
		.fail(function(jqXHR, error_data) {
			// Notify to log messages in top of page
			if(SHOW_DEBUG===true) console.log("Error: "+error_data);
			//alert("Error on set password " + error_data)
			target_div.append(" <span class='error'>Error on set password \n"+ error_data +"</span>");
		})
		// ALWAYS
		.always(function() {
			target_div.removeClass('css_spinner');
		})

		return false;
	}//end this.set_psw



	/**
	* VALIDATE_BROWSER
	* @return bool
	*/
	this.validate_browser = function() {
		
		const browser_info = login.get_browser_info()
		
		console.log("-> browser_info:", browser_info);
		
		try {
		   // Browser warning
			switch(true) {
				case (navigator.userAgent.indexOf('Chrome') != -1) :

					if (browser_info.name==='Edge') {
						
						// edge case
						if (browser_info.version && parseInt(browser_info.version)<17) {
							alert("Sorry, your Edge browser version is too old ("+browser_info.version+"). \nPlease update your Edge version to >=17");
							return false;
						}
					
					}else if (browser_info && browser_info.version && parseInt(browser_info.version) < 50) {
						
						// chrome case
						alert("Sorry, your Chrome browser version is too old ("+browser_info.version+"). \nPlease update your Google Chrome version to >=50");
						return false;
					}

				case (navigator.userAgent.indexOf('AppleWebKit') != -1) :
					// Nothing to show
					break;

				case (navigator.userAgent.indexOf('Firefox') != -1):
					
					//let browser_info = this.get_browser_info()
					if (browser_info.name ==='Firefox' && parseInt(browser_info.version) > 50){
					//console.log(browser_info.name ==='Firefox' && parseInt(browser_info.version) > 50);
						//alert("Attention. Your browser is not full verified to work with Dédalo. \n\nFirefox is in a testing time \n\nIf you experiment any issues, please comment it in https://github.com/renderpci/dedalo-4.")
					}else{
						alert("Sorry, your Firefox browser version is too old ("+browser_info.version+"). \nPlease update your Firefox version to >=50");
						return false
					}
					break;
	
				default:
					alert("Sorry. Your browser is not verified to work with Dédalo. \n\nOnly Webkit browsers are tested by now. \n\nPlease download the last version of official Dédalo browser (Google Chrome - Safari) to sure a good experience.")
			}
			//console.log("browser_info",browser_info); return;
		}
		catch (e) {
			console.log("error",e)
		}			

		return true;	
	}//end validate_browser



	/**
	* GET_BROWSER_INFO
	* @return object
	*/
	this.get_browser_info = function() {

		let ua = navigator.userAgent,tem,M=ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || []; 
		if(/trident/i.test(M[1])){
			tem=/\brv[ :]+(\d+)/g.exec(ua) || []; 
			return {name:'IE',version:(tem[1]||'')};
			}   
		if(M[1]==='Chrome'){
			tem=ua.match(/\bOPR|Edge\/(\d+)/)
			if(tem!=null)   {return {name:'Edge', version:tem[1]};}
			}   
		M=M[2]? [M[1], M[2]]: [navigator.appName, navigator.appVersion, '-?'];
		if((tem=ua.match(/version\/(\d+)/i))!=null) {M.splice(1,1,tem[1]);}

		const target_div	= document.getElementById('login_ajax_response');
		if (target_div) {
			target_div.innerHTML = "Using " + M[0] + " " + M[1] + ""
		}

		return {
		  name: M[0],
		  version: M[1]
		};
	}//end get_browser_info



	/**
	* AUTOLOGIN
	*/
	this.autologin = function(url) {
		
		//window.location.replace(url);
		window.location.href = url;

		return true
	};//end autologin



}//end login class