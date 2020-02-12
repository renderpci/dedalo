


	self.addEventListener("message", function(event) {
	  let label = event.data.label;
	  let type = event.data.type;
	  	console.log(label);

	  render_tag_img(label,type)

	  // do whatever you need with the arguments
	}, false);





	/**
	* RENDER_TAG_IMg
	* @return 
	*/
	function render_tag_img(label, type){
	//this.render_tag_img = function(label, type) {
	//let label = '00:00:00.000';
	    // Create an empty canvas element
	    //let canvas = document.createElement("canvas");
	    let canvas = new OffscreenCanvas(164, 30);
		switch(type){
			case "tc":
				//canvas.width = 164;
				//canvas.height = 30;

			    // Copy the image contents to the canvas
				let ctx = canvas.getContext("2d");
				ctx.fillStyle = 'rgba(0, 0, 0, 1)';
				//ctx.fillRect(0, 0, 300, 300);
				// Set rectangle and corner values
				let rectX = 0;
				let rectY = 0;
				let rectWidth = 164;
				let rectHeight = 30;
				let cornerRadius = 30;
			    //ctx.drawImage(img, 0, 0);

				// Reference rectangle without rounding, for size comparison
				//ctx.fillRect(200, 50, rectWidth, rectHeight);

			    // Set faux rounded corners
				ctx.lineJoin = "round";
				ctx.lineWidth = cornerRadius;

				// Change origin and dimensions to match true size (a stroke makes the shape a bit larger)
				ctx.strokeRect(rectX+(cornerRadius/2), rectY+(cornerRadius/2), rectWidth-cornerRadius, rectHeight-cornerRadius);
				ctx.fillRect(rectX+(cornerRadius/2), rectY+(cornerRadius/2), rectWidth-cornerRadius, rectHeight-cornerRadius);
			    
				//add label to rect

				//ctx.font="100px System_San_Francisco_Display_Regular";
				//ctx.font="24px san_francisco";
				ctx.font="24px san_francisco";
				ctx.textAlign="center"; 
				ctx.textBaseline = "middle";
				ctx.fillStyle = "#21DC0B";

				ctx.fillText(label,rectX+(rectWidth/2),rectY+(rectHeight/2)-1);

				break
		}//end switch (type)


	    // Get the data-URL formatted image
	    // Firefox supports PNG and JPEG. You could check img.src to
	    // guess the original format, but be aware the using "image/jpg"
	    // will re-encode the image.
	    let dataURL = canvas.toDataURL("image/png");

	    let response = {
	    	"image": dataURL
	    }

	    postMessage(response);
	    //return dataURL//.replace(/^data:image\/(png|jpg);base64,/, "");		
	};//end render_tag_img
