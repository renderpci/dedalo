// JavaScript Document
$(document).ready(function() {
	
	var $login_button = $('.css_button_login');
	if ( $login_button.length ) {
		$('.css_button_login').each(function() {			
			$(this).bind("click", function(event) {
				login.Login();
			});
		});
	}

});