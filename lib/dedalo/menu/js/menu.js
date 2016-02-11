


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




}
