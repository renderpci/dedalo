




// MENU CLASS
var menu = new function() {

	this.import_str = function(button_obj) {
		if( confirm('\!!!!!!!!!!!!!!!!!!!!!!!!!!! WARNING !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\
			\n!!!!!!!!!!!!!!! DELETING ACTUAL DATABASE !!!!!!!!!!!!!!!!\
			\n\nAre you sure to IMPORT and overwrite current structure data with LOCAL FILE \
			\n \"dedalo4_development_str.custom.backup\" ?\n\
			')){ 
			window.open(DEDALO_LIB_BASE_URL + "/backup/trigger.db_utils.php?action=import",'Export','width=710,height=600')
		}
	}

	this.export_str = function(button_obj) {
		if( confirm('\nAre you sure to EXPORT and overwrite structure data in file \n "dedalo4_development_str.custom.backup" ?\n') ) {
			window.open(DEDALO_LIB_BASE_URL + "/backup/trigger.db_utils.php?action=export",'Export','width=600,height=600');
		} 
	}


	
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
			 	mainmenus[i].addEventListener("mouseover",menu.display_drop_menu);
			 	mainmenus[i].addEventListener("mouseout",menu.leave_drop_menu);
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
	* DISPLAY_DROP_MENU
	*/
	this.display_drop_menu =function(event){
		
		parent_menu=event.currentTarget;

			//console.log(event.eventPhase);

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
	}
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


};//end class
