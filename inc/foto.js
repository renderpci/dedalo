// JavaScript Document

function loadImgResize(source,divTarget,w,h)
{
	var url = '../inc/img.php?fx=resize&s='+source ; 
	
	// crop vars optional
	if(w && w!='undefined') url += '&w='+w ;	
	if(h && h!='undefined') url += '&h='+h ;	//alert(url);
	
	
	// when the DOM is ready
	$(function () {
	  var img = new Image();
	  
	  // wrap our new image in jQuery, then:
	  $(img)
		// once the image has loaded, execute this code
		.on('load', function () {
		  // set the image hidden by default    
		  $(this).hide();
		
		  // with the holding div #loader, apply:
		  $('#'+divTarget)
			// remove the loading class (so no background spinner), 
			//.removeClass('loading')
			//.addClass('loaded')
			.toggleClass("loaded")

			// then insert our image
			.append(this);
		
		  // fade our image in to create a nice effect
		  $(this).fadeIn();
		})
		
		// if there was an error loading the image, react accordingly
		.error(function () {
		  // notify the user that the image could not be loaded
		  //alert("error on load! "+source)		  
		  loadImgResize('../images/0.jpg',divTarget,w,h)
		  //$(this).attr('src', '../img/0.jpg')
		})
		
		// *finally*, set the src attribute of the new image to our image
		//.attr('src', '../img/top.jpg');		
		.attr('src', url);
	});	
}

function loadImgCrop(source,divTarget,cw,ch,cp)
{
	var url = '../inc/img.php?fx=crop&s='+source ;	
	
	// crop vars optional
	if(cw && cw!='undefined') url += '&w='+cw ;	
	if(ch && ch!='undefined') url += '&h='+ch ;
	if(cp && cp!='undefined') url += '&p='+cp ; //alert(url)
	
	
	// when the DOM is ready
	$(function () {
	  var img = new Image();
	  
	  // wrap our new image in jQuery, then:
	  $(img)
		// once the image has loaded, execute this code
		.on('load', function () {
		  // set the image hidden by default    
		  $(this).hide();
		
		  // with the holding div #loader, apply:
		  $('#'+divTarget)
			// remove the loading class (so no background spinner), 
			//.removeClass('loading')
			//.addClass('loaded')
			.toggleClass("loaded")

			// then insert our image
			.append(this);
		
		  // fade our image in to create a nice effect
		  //$(this).fadeIn(100);
		  $(this).show(0);
		})
		
		// if there was an error loading the image, react accordingly
		.error(function () {
		  // notify the user that the image could not be loaded
		  //alert("error on load! "+source)
		  loadImgCrop('../images/0.jpg',divTarget,cw,ch,cp)
		  //$(this).attr('src', '../img/0.jpg')
		})
		
		// *finally*, set the src attribute of the new image to our image
		//.attr('src', '../img/top.jpg');		
		.attr('src', url);
	});	
}