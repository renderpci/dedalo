<?php


// config dedalo
require dirname(dirname(dirname(__FILE__))) .'/config/config.php';


if(login::is_logged()!==true) {
	die("<span class='error'> Auth error: please login </span>");
}

phpinfo();
?>
<script type="text/javascript">
	this.addEventListener("load", function(e){

		setTimeout(function(){
			// document real height
			const h = (this.document.body.scrollHeight + 50)
			// iframe in window.parent
			const php_info = window.parent.document.querySelector('.php_info_iframe')
			if (php_info) {
				php_info.height = h + 'px'
			}
		}, 150)
	})
</script>
