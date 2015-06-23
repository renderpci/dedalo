<!DOCTYPE HTML>
<html lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html;charset=UTF-8">
  <title></title>
  <link rel="stylesheet" href="/dedalo4/lib/jquery/jquery-ui-1.11.2/jquery-ui.min.css?15012504" type="text/css" media="screen" />
  <style type="text/css">
  #draggable
{
    background-color:#8eee26;
    width:200px;
    height:200px;
}
.container {
	margin-left: 100px;
	background-color: #eedc16;
}
  </style>

<script src="/dedalo4/lib/jquery/jquery-2.1.3.min.js?150125042210" type="text/javascript" charset="utf-8"></script>
<script src="/dedalo4/lib/jquery/jquery-ui-1.11.2/jquery-ui.min.js?150125042210" type="text/javascript" charset="utf-8"></script>
<script>
$(document).ready(function(e){
    $('#draggable').draggable();
    $('#draggable').on('drag' , function(event){
        $('#myInput').val("x:"+event.pageX + ',' + " y:"+event.pageY);
    })
})
</script>
</head>
<body>
<div class="container">
	<div id='draggable'> DRAGGABLE</div>
	<input type='text' value='test' id='myInput'/>
</div> 
</body>
</html>
<script>
  
  //var $container = $('.container');
  var $container = $('<div class="container"><span>456</span><strong>7987 78978 789</strong></div>');
    console.log($container)

</script>