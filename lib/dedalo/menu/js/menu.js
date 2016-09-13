




// MENU CLASS
var menu = new function() {



	/**
	* IMPORT_STR
	*/
	this.import_str = function(button_obj) {
		if( confirm('\!!!!!!!!!!!!!!!!!!!!!!!!!!! WARNING !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\
			\n!!!!!!!!!!!!!!! DELETING ACTUAL DATABASE !!!!!!!!!!!!!!!!\
			\n\nAre you sure to IMPORT and overwrite current structure data with LOCAL FILE \
			\n \"dedalo4_development_str.custom.backup\" ?\n\
			')){ 
			window.open(DEDALO_LIB_BASE_URL + "/backup/trigger.db_utils.php?action=import",'Export','width=710,height=600')
		}
	};



	/**
	* EXPORT_STR
	*/
	this.export_str = function(button_obj) {
		if( confirm('\nAre you sure to EXPORT and overwrite structure data in file \n "dedalo4_development_str.custom.backup" ?\n') ) {
			window.open(DEDALO_LIB_BASE_URL + "/backup/trigger.db_utils.php?action=export",'Export','width=600,height=600');
		} 
	};


	
	var mainmenus,
		general_menu;

	/* When the user clicks on the button, 
	toggle between hiding and showing the dropdown content */
	window.addEventListener("load", function (event) {
		//var menucontainer = document.querySelector('#menucontainer');
		general_menu = document.getElementById("menu");
		menu_wrapper = document.getElementById("menu_wrapper");
		
		if (general_menu) {

			mainmenus = general_menu.getElementsByTagName('li');	
			for (var i = 0; i < mainmenus.length; i++) {
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
				//var exist = mainmenus.indexOf(event.target);
					//console.log(event.target.tagName);
					//return;
			    if (event.target.tagName.toLowerCase() != 'a') {
			        menu.close_all_drop_menu();
			    }
			});

			if (menu_wrapper) {
				menu_wrapper.addEventListener("mouseout",menu.leave_drop_menu);

			}

		}//end if (general_menu) {		
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
	}

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
		
		var nodesLI = parent_menu.parentNode.getElementsByTagName('li');

		for (var i = 0; i < nodesLI.length; i++) {
			nodesLI[i].classList.add( "menu_li_inactive");
			nodesLI[i].classList.remove( "menu_li_active");

			if(nodesLI[i] == parent_menu){
				nodesLI[i].classList.add( "menu_li_active");
				nodesLI[i].classList.remove( "menu_li_inactive");
			}
		}
		event.stopPropagation();
		//event.preventDefault();

		/*parent_node = parent_menu.parentNode;
		var count = 1;
		while(parent_node.getAttribute('id') != "menu") {
			if (parent_node.tagName.toLowerCase() == 'li') {
				parent_node.classList.add( "menu_li_active");
				parent_node.classList.remove( "menu_li_inactive");
			}
				
			parent_node = parent_node.parentNode;
		  count++;
		}*/
	};
	/**
	* DISPLAY_DROP_MENU
	*/
	this.leave_drop_menu =function(event){
			//console.log(event.clientY);
			if (event.clientY < 15) {
				 menu.close_all_drop_menu();
			}
	};
	/**
	* CLOSE_ALL_DROP_MENU
	*/
	this.close_all_drop_menu =function() {
	
		if (typeof mainmenus!='undefined') {
			for (var i = 0; i < mainmenus.length; i++){
				mainmenus[i].classList.add( "menu_li_inactive");
				mainmenus[i].classList.remove( "menu_li_active");
			}
		}			
	};



	/**
	* DISPLAY_DROP_MENU_TOUCH
	*/
	var timeout;
	var lastTap = 0;
	var eventTouch;
	this.display_drop_menu_touch =function(event){
		var currentTime = new Date().getTime();
	    var tapLength = currentTime - lastTap;
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
	};



};//end class
