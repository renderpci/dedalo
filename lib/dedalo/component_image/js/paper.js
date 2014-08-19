// CANVAS

// http://en.wikipedia.org/wiki/Lenna
// Load from Server:
var raster = new Raster('img_'+canvas_id);
raster.position = view.center;
// Load from DOM image:
// var raster = new Raster('lenna');
raster.onLoad = function() {
	console.log('Successfully loaded image!');
	
};

//MSG
document.getElementById('header_info').innerHTML ="canvas with custom paper.js";


var lastScale = 1;
var center = view.center;
/*

function onFrame(event) {
	var scale = (Math.sin(event.time * 2) + 1) / 2;
	raster.scale(scale / lastScale);
	lastScale = scale;
	raster.position = center + [Math.sin(event.time * 3) * 256, Math.sin(event.time * 2.5) * 256];
	raster.rotate(event.delta * 120);
}
:*/ 
//Botones de tools
createButton(document.body, "puntero", function(){ 
        puntero.activate(); 
});

createButton(document.body, "vectores", function(){ 
        vectores.activate(); 
});

function createButton(context, estado, func){
    var button = document.createElement("input");
    button.type = "button";
    button.value = estado;
    button.onclick = func;
    context.appendChild(button);
}

//Variables generales de los tools
		var segment, path;
		var movePath = false;
		var types = ['point', 'handleIn', 'handleOut'];
		var hitOptions = {
			segments: true,
			stroke: true,
			fill: true,
			tolerance: 5
		};
		
	//alert('esta por point');
	
var puntero = new Tool();
		function onMouseDown(event) {
			alert('esta por point');
			segment = path = null;
			var hitResult = project.hitTest(event.point, hitOptions);

			if (event.modifiers.shift) {
				if (hitResult.type == 'segment') {
					hitResult.segment.remove();
				};
				return;
			}

			if (hitResult) {
				path = hitResult.item;
				if (hitResult.type == 'segment') {
					segment = hitResult.segment;
				} else if (hitResult.type == 'stroke') {
					var location = hitResult.location;
					segment = path.insert(location.index + 1, event.point);
					path.smooth();
				}
			}
			movePath = hitResult.type == 'fill';
			if (movePath)
				project.activeLayer.addChild(hitResult.item);
		}

		function onMouseMove(event) {
			var hitResult = project.hitTest(event.point, hitOptions);
			project.activeLayer.selected = false;
			if (hitResult && hitResult.item)
				hitResult.item.selected = true;
		}

		function onMouseDrag(event) {
			if (segment) {
				segment.point = event.point;
				path.smooth();
			}

			if (movePath)
				path.position += event.delta;
		}
///paint

	//alert('esta por draw');
var vectores =new Tool();

		function findHandle(point) {
			for (var i = 0, l = path.segments.length; i < l; i++) {
				for (var j = 0; j < 3; j++) {
					var type = types[j];
					var segment = path.segments[i];
					var segmentPoint = type == 'point'
							? segment.point
							: segment.point + segment[type];
					var distance = (point - segmentPoint).length;
					if (distance < 3) {
						return {
							type: type,
							segment: segment
						};
					}
				}
			}
			return null;
		}

		var currentSegment, mode, type;
		function onMouseDown(event) {
			if (currentSegment)
				currentSegment.selected = false;
			mode = type = currentSegment = null;

			if (!path) {
				path = new Path();
				path.fillColor = {
					hue: 360 * Math.random(),
					saturation: 1,
					brightness: 1,
					alpha: 0.5
				};
			}

			var result = findHandle(event.point);
			if (result) {
				currentSegment = result.segment;
				type = result.type;
				if (path.segments.length > 1 && result.type == 'point'
						&& result.segment.index == 0) {
					mode = 'close';
					path.closed = true;
					path.selected = false;
					path = null;
				}
			}

			if (mode != 'close') {
				mode = currentSegment ? 'move' : 'add';
				if (!currentSegment)
					currentSegment = path.add(event.point);
				currentSegment.selected = true;
			}
		}

		function onMouseDrag(event) {
			if (mode == 'move' && type == 'point') {
				currentSegment.point = event.point;
			} else if (mode != 'close') {
				var delta = event.delta.clone();
				if (type == 'handleOut' || mode == 'add')
					delta = -delta;
				currentSegment.handleIn += delta;
				currentSegment.handleOut -= delta;	//console.log(delta);
			}
		}
	
/**/