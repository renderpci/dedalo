





var login = new function() {

	this.url_trigger = DEDALO_LIB_BASE_URL + '/login/trigger.login.php',
	this.wrap_login  = []


	$(function() {
	
		login.wrap_login = $(".css_wrap_login")

		// ENTER KEY : Submit
		login.wrap_login.keydown(function(event) {
			var keycode = (event.keyCode ? event.keyCode : event.which);	//console.log(keycode)
			// ENTER
		    if (keycode === 13) {
				event.preventDefault();		
				login.Login();
			}
		});		
		
		// FOCUS
		login.wrap_login.fadeIn(500, function(){
			$('input:text').delay(600).focus();
		});		
	});



	/**
	* QUIT
	* Quits from Dedalo
	*/
	this.Quit = function() {
		
		var page_url 	= window.location.pathname;	
		
		var mode 		= 'Quit';
		var mydata		= {
			'mode' 		: mode,
			'top_tipo'	: page_globals.top_tipo
		}

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type	: "POST",
		})
		// DONE
		.done(function(received_data) {

			// Elimina las cookies que empiezan por ..  (component_autocomplete_ts)			
			clear_some_local_storage('component_autocomplete_ts')
			
			if(received_data=='ok') {
				if (DEBUG) console.log("Starting Dédalo Quit")
				window.location.href = window.location
			}else{							
				alert( received_data );
			}			
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			// Notify to log messages in top of page
			if (DEBUG) console.log("Error quit: " +error_data);	//if (DEBUG) console.log(data['responseText'].toSource());
			alert("Error on quit")
			window.location.href = window.location
		})
		// ALWAYS
		.always(function() {			
		})
	}//end Quit


	
	/**
	* LOGIN
	*/
	this.Login = function (obj) {

		switch(true) {
			case (navigator.userAgent.indexOf('Chrome') != -1) :
			case (navigator.userAgent.indexOf('AppleWebKit') != -1) :
				// Nothing to show
				break;
			default:
				alert("Sorry. Your browser is not supported by Dédalo. Only Webkit browsers are tested by now. \
					   Please download the last version of official Dédalo browser (Google Chrome)")
		}		
		
		var username			= login.wrap_login.find('#login_username').val();
		var password			= login.wrap_login.find('#login_password').val();			
		var tipo_login			= login.wrap_login.find('#tipo_login').val();
		var tipo_username		= login.wrap_login.find('#tipo_username').val();
		var tipo_password		= login.wrap_login.find('#tipo_password').val();
		var tipo_active_account	= login.wrap_login.find('#tipo_active_account').val();
		
		if(username == null || username.length <1) {
			login.wrap_login.find('.css_input_text').focus(); return false;
		}
		if(password == null || password.length <1)	 {
			login.wrap_login.find('.css_password').focus(); return false;
		}
			
		var target_div	= $('.login_ajax_response');

		if ( $(target_div).length != 1 ) { return alert("Error en login secuence.."); };	
		
		var mode 		= 'Login';
		var mydata		= {
			'mode': mode, 
			'username': username,
			'password': password,
			'tipo_login': tipo_login,
			'tipo_username': tipo_username,
			'tipo_password': tipo_password,
			'tipo_active_account': tipo_active_account,
			'top_tipo'	: page_globals.top_tipo
		};				
	
		//if (DEBUG) console.log("Login data vars: " + 'mode:'+ mode+ ' username:'+ username+ ' password:'+ password);		//return false;	
		target_div.html(' ')
			//.addClass('css_spinner')
			//.css({'padding':'30px','height':'60px'});
		$( "<div class='css_spinner'></div>" ).appendTo(target_div);
	

		if (DEBUG) console.log("Starting Dédalo Login");

		if(DEDALO_BACKUP_ON_LOGIN==1) {
			//target_div.append("<span class='building_backup'>Building system backup</span>");
		}
		// Hide submit button
		$('.css_button_login, .dedalo_version').hide(0)

		var jsPromise = Promise.resolve(

			// AJAX REQUEST
			$.ajax({
				url		: this.url_trigger,
				data	: mydata,
				type	: "POST",
			})
			// DONE
			.done(function(received_data) {
				
				// Search 'error' string in response
				var error_response = /error/i.test(received_data);	//alert(error_response)

				// If received_data contains 'error' show alert error with (received_data), else reload the page
				if(error_response) {
					// ERROR : Show error
					target_div.fadeIn(500, function(){
						$(this).html("<span class='error'>" + received_data + "</span>");					
					})
				}else{

					// OK		
					//target_div.html("<br><span class='ok'> "+received_data+" </span>");	return;
					$( "<span class='ok'> "+received_data+" </span>" ).appendTo(target_div);

					// Apply defaults
					login.apply_defaults();

					// Reload page
					setTimeout(function() {
						//return null;
						window.location.href = window.location.href ;
					},10)				
				}			
			})
			// FAIL ERROR 
			.fail(function(error_data) {
				// Notify to log messages in top of page
				if (DEBUG) console.log("Error: "+error_data);
				alert("Error on Login " + error_data)

				target_div.append(" <span class='error'>Error on Login \n"+ error_data +"</span>");

				$('.css_button_login').fadeIn(300)
			})
			// ALWAYS
			.always(function() {
				//target_div.removeClass('css_spinner');
			})
		)//end promise


		//return jsPromise;
		/*
		jsPromise.then(function(response) {
		  	console.log(jsPromise);
		  	console.log(response);

		}, function(xhrObj) {
		  	console.log(xhrObj);
		});
		*/
		return false;
	}//end Login method



	/**
	* APPLY_DEFAULTS
	*/
	this.apply_defaults = function() {

		// Collapse some tabs by default
		var collapse_tabs = [
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
		for (var i = 0; i < collapse_tabs.length; i++) {
			set_localStorage(collapse_tabs[i], 1);
		}
	}//end apply_defaults



	/**
	* SET_PSW
	*/
	this.set_psw = function(  ) {

		var form_obj = $('#form_set_psw'),
			psw 	 = $('#psw').val(),
			psw2 	 = $('#psw2').val()

	
		// Test password is aceptable string
		var verify_password = component_password.verify_password( $('#psw'), psw);						
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
		var target_div	= $('.login_ajax_response');
		if ( $(target_div).length != 1 ) { return alert("Error en login secuence.."); };
		
		var url_trigger = DEDALO_ROOT_WEB + '/install/set_psw/trigger.set_psw.php'
		var mydata		= {
			'mode': 'set_psw', 
			'username': 'admin',
			'password': psw,
			'reference': 'rfC' + psw,			
			'top_tipo': page_globals.top_tipo
		};
		//return console.log(mydata);
		
		//if (DEBUG) console.log("Login data vars: " + 'mode:'+ mode+ ' username:'+ username+ ' password:'+ password);		//return false;	
		target_div.html(' ').addClass('css_spinner');


		// AJAX REQUEST
		$.ajax({
			url		: url_trigger,
			data	: mydata,
			type	: "POST",
		})
		// DONE
		.done(function(received_data) {
				console.log(received_data);
			// Search 'error' string in response
			var error_response = /error/i.test(received_data);	//alert(error_response)

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			if(error_response) {
				// ERROR : Show error
				//target_div.fadeOut(500, function(){
					$(target_div).html("<span class='error'>" + received_data + "</span>");					
				//})
			}else{
				// OK		
				target_div.empty().append("<span class='ok'> OK. Password is set </span>\n" + received_data);

				setTimeout(function() {
					window.location.href = window.location.href ;
				},1500)				
			}			
		})
		// FAIL ERROR 
		.fail(function(jqXHR, error_data) {
			// Notify to log messages in top of page
			if (DEBUG) console.log("Error: "+error_data);
			//alert("Error on set password " + error_data)
			target_div.append(" <span class='error'>Error on set password \n"+ error_data +"</span>");
		})
		// ALWAYS
		.always(function() {
			target_div.removeClass('css_spinner');
		})

		return false;
	}//end this.set_psw = function() {




}//end login class