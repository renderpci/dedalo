




// MENU CLASS
var menu = new function() {


	var mainmenus
	var menu_status = false
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

			 	//add listeners to the menu items
			 	// browser
			 	if(window.innerWidth > 980){
				 	mainmenus[i].addEventListener("mouseover",menu.display_drop_menu);
				 	mainmenus[i].addEventListener("mouseout",menu.leave_drop_menu);
				 	menu_wrapper.addEventListener("click",menu.change_menu_status);
				}else{
					// mobil
					mainmenus[i].addEventListener("touchend",menu.display_drop_menu_touch);
					menu_wrapper.addEventListener("click",menu.display_drop_menu_touch);
				}
			 	//}
			}

			// do global click action od the menu items
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
	* LOAD_REF
	* go to the menu selected by the user
	*/
	this.load_ref = function(load_ref){

		if (menu_status === false) {
			document.location.href = load_ref;
		}

	}// end load_ref


	/**
	* CHANGE_MENU_STATUS
	* Open the first menu tree and change the menu status
	*/
	this.change_menu_status = function(event){
		if (menu_status) {
			menu.close_all_drop_menu();
			menu_status = false
		}else{
			// open the first menu tree in the same way that display_drop_menu()
			parent_menu = event.target.parentNode; // Mozilla compatible

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
			//Change the menu status
			menu_status = true
		}
	}// end change_menu_status

	/**
	* DISPLAY_DROP_MENU
	*/
	this.display_drop_menu =function(event){
		//if the menu status is false nothing to do
		if (menu_status === false) {
			return false
		}
		
		//parent_menu=event.currentTarget;
		//parent_menu = event.srcElement.parentNode;
		parent_menu = event.target.parentNode; // Mozilla compatible

		if(SHOW_DEBUG===true) {
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
		//console.log(event.srcElement.id);
		if (event.clientY < 0 || event.srcElement.id =='menu_wrapper') {
			 menu.close_all_drop_menu();
		}
	};//end leave_drop_menu



	/**
	* CLOSE_ALL_DROP_MENU
	*/
	this.close_all_drop_menu = function() {

		menu_status = false
	
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
		
		menu_status = true
		const currentTime 	= new Date().getTime();
	    const tapLength 	= currentTime - lastTap;
	    clearTimeout(timeout);

	    if (tapLength < 300 && tapLength > 0) {
	       //'Double Tap'
			menu_status = false
			event.target.click();
	       	//console.log(event.target )
	        
	    } else {
	        //'Single Tap'
	        //event.preventDefault();
	        	/*console.log(event.srcElement.parentNode);
	        	console.log(event.srcElement.parentNode.classList.contains("has-sub"));;

	        	event.preventDefault();return;*/
			if(event.srcElement.parentNode.classList.contains("has-sub")){
				event.preventDefault();
				menu.display_drop_menu(event);
				
	        }else{
	        	if(event.srcElement.id != 'toggle_menu'){
					menu_status = false
					event.target.click();
					console.log("click");
				}
				
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