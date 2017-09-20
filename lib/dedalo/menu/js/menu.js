




// MENU CLASS
var menu = new function() {


	var mainmenus
	//var general_menu
	/* When the user clicks on the button, 
	toggle between hiding and showing the dropdown content */
	window.addEventListener("load", function (event) {
		//var menucontainer = document.querySelector('#menucontainer');
		var general_menu = document.getElementById("menu");		
		if (general_menu) {

			var menu_wrapper = document.getElementById("menu_wrapper");

			mainmenus = general_menu.getElementsByTagName('li');
			var len   = mainmenus.length
			for (var i = len - 1; i >= 0; i--) {				
			 	//if ( mainmenus[i].tagName.toLowerCase() == 'li' ) {
			 	if(window.innerWidth > 980){
				 	mainmenus[i].addEventListener("mouseover",menu.display_drop_menu);
				 	mainmenus[i].addEventListener("mouseout",menu.leave_drop_menu);
				}else{
					mainmenus[i].addEventListener("touchend",menu.display_drop_menu_touch);
					menu_wrapper.addEventListener("click",menu.display_drop_menu_touch);
				}
			 	//}
			}
			document.addEventListener('click', function(event) {	
			    if (event.target.tagName.toLowerCase() != 'a') {
			        menu.close_all_drop_menu();
			    }
			});

			if (menu_wrapper) {
				menu_wrapper.addEventListener("mouseout",menu.leave_drop_menu);
			}

		}//end if (general_menu) 	
	});



	/**
	* TOGGLE_MENU
	*/
	this.toggle_menu =function(event){

		var menu_ul = document.getElementById("menu");
		if(menu_ul.style.display == "none" || menu_ul.style.display == ''){
			menu_ul.style.display = "block"
		}else{
			menu_ul.style.display = "none"
		}
		return;
	};//end toggle_menu



	/**
	* DISPLAY_DROP_MENU
	*/
	this.display_drop_menu =function(event){
		
		//parent_menu=event.currentTarget;
		//parent_menu = event.srcElement.parentNode;
		parent_menu = event.target.parentNode; // Mozilla compatible

		if(DEBUG) {
			//console.log(event.eventPhase);
			//console.log(parent_menu);
		}
		
		var nodes_li = parent_menu.parentNode.getElementsByTagName('li');
		var len 	 = nodes_li.length
		for (var i = len - 1; i >= 0; i--) {

			nodes_li[i].classList.add("menu_li_inactive");
			nodes_li[i].classList.remove("menu_li_active");

			if(nodes_li[i] == parent_menu){
				nodes_li[i].classList.add("menu_li_active");
				nodes_li[i].classList.remove("menu_li_inactive");
			}
		}
		event.stopPropagation();		
	};//end display_drop_menu



	/**
	* DISPLAY_DROP_MENU
	*/
	this.leave_drop_menu = function(event) {
		//console.log(event.clientY);
		if (event.clientY < 15) {
			 menu.close_all_drop_menu();
		}
	};//end leave_drop_menu



	/**
	* CLOSE_ALL_DROP_MENU
	*/
	this.close_all_drop_menu = function() {
	
		if (typeof mainmenus!='undefined') {
			var len = mainmenus.length
			for (var i = len - 1; i >= 0; i--) {			
				mainmenus[i].classList.add("menu_li_inactive");
				mainmenus[i].classList.remove("menu_li_active");
			}
		}			
	};//end close_all_drop_menu



	/**
	* DISPLAY_DROP_MENU_TOUCH
	*/
	var timeout;
	var lastTap = 0;
	var eventTouch;
	this.display_drop_menu_touch = function(event) {

		var currentTime = new Date().getTime();
	    var tapLength 	= currentTime - lastTap;
	    clearTimeout(timeout);

	    if (tapLength < 300 && tapLength > 0) {
	       //'Double Tap'
	       event.target.click();
	       	//console.log(event.target )
	        
	    } else {
	        //'Single Tap'
	        //event.preventDefault();
	        	/*console.log(event.srcElement.parentNode);
	        	console.log(event.srcElement.parentNode.classList.contains("has-sub"));;

	        	event.preventDefault();return;*/
	        if(event.srcElement.parentNode.classList.contains("has-sub")){
	        	//console.log("123");
				event.preventDefault();
				menu.display_drop_menu(event);
	        }else{
	        	//console.log("click");
	        }

	       	/* if(eventTouch == event.target){
	        	menu.close_all_drop_menu(event);
	        	eventTouch= 0;
	        }else{
	        	eventTouch = event.target;
	        }*/
	        timeout = setTimeout(function() {
	           // elm2.innerHTML = 'Single Tap (timeout)';	           	
	           clearTimeout(timeout);
	        }, 300);
	    }
	    lastTap = currentTime;
	};//end display_drop_menu_touch



};//end class