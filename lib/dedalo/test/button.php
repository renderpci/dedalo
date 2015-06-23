<?php

#echo "Button";


?>
<html>
<html>
<head>
<title></title>
<style type="text/css" media="all">
@import url("css/bootstrap.css");
@import url("css/bootstrap-theme.css");
</style>
<style type="text/css">

ol, ul { list-style:none;  }
blockquote, q { quotes:none; }
blockquote:before, blockquote:after,
q:before, q:after { content:''; content:none; }
/* remember to define focus styles. Hee Haw */
:focus { outline:0; }

*, *:after, *:before {
  -webkit-box-sizing:border-box;
     -moz-box-sizing:border-box;
          box-sizing:border-box;
  }

.css_button_generic2 {
	font-family: Arial;
	font-size: 80%;
	font-weight: 300;
	display: inline-block;
	cursor: pointer;
	padding: 3px;
	padding-right: 4px;
	line-height: 1.2em;
	color: #2e2e2e;	
	border: none;
	border-radius: 3px;
	/*box-shadow: 1px 2px 2px #888888;*/
	vertical-align: middle;
	opacity: 0.8;
	user-select: none;
	-webkit-user-select: none;
	background-color: #abe13a;
	}
	.css_button_generic2::before {
		content: '';
		background-image: url("../themes/default/glyphicons-halflings.png");
		background-position: -360px -48px;	
		margin-right: 4px;	
		width: 14px;
		height: 14px;

		/* Position/Spacing */
	  	float: left;  	
	}

.icon_bs {
	display: inline-block;
	width: 14px;
	height: 14px;
	line-height: 14px;
	vertical-align: text-top;
	background-image: url("../../themes/default/glyphicons-halflings.png");
	background-position: -48px -24px;
	background-repeat: no-repeat;
	list-style: none;
	position: relative;
	top: -1px;
	cursor: pointer;
	opacity: 0.4;
}
</style>
<?php /*
<script src="https://ajax.googleapis.com/ajax/libs/jquery/1.11.1/jquery.min.js"></script>
<script src="js/bootstrap.min.js"></script>
*/?>
</head>
<body>


<div class="css_button_generic2">Hello button</div>
<button type="button" class="btn btn-warning glyphicon glyphicon-music">Warning</button>
<div class="btn btn-warning glyphicon glyphicon-music">Warning</div> 
<label>123</label>
</body>
</html>

</html>