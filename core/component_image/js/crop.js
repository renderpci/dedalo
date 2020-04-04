
CROP

// Create a raster item using the URL
var raster = new Raster("http://paperjs.org/tutorials/images/working-with-rasters/mona.jpg");

// Move the raster to the center of the view
raster.position = view.center;

var imageWidth = 320;
var imageHeight = 491;
imageWidth = raster.size.width;
imageHeight = raster.size.height;
var startDrag, endDrag;

// this is the value needed to adjust the coordinates
// not the image size.
var lt = raster.bounds.topLeft;

console.log('lt', lt, 'rs', raster.size);

function onMouseDown(e) {
    // don't worry about ctrl-alt for now
    startDrag = new Point(e.point);
}

function onMouseDrag(e) {
    var show = new Path.Rectangle({
        from: startDrag,
        to: e.point,
        strokeColor: 'red',
        strokeWidth: 1
    })
    // stop showing the selected area on drag (new one
    // is created) and up because we're done
    show.removeOn({
        drag: true,
        up: true
    })
}

function onMouseUp(e) {
    endDrag = new Point(e.point);
    var bounds = new Rectangle({
        from: startDrag - lt,
        to: endDrag - lt
    })
    console.log(bounds);
    var subRaster = raster.getSubRaster(bounds);
    subRaster.position = paper.view.center;
}

raster.on('mouseup', function(event) { // TODO should be layer 0 in long run? // Capture end of drag selection
   if(event.event.ctrlKey && event.event.altKey) {
       console.log("startDragPoint " + startDragPoint)
        var endDragPoint = new Point(event.point - lt);
        //event.point.x + imageWidth/2,
        //event.point.y + imageHeight/2);
        console.log("endDragPoint", endDragPoint);
        
       var bounds = new Rectangle({
           from: startDragPoint,
            to: endDragPoint
        });
       /*
       var leftmostX;
        if(startDragPoint.x < endDragPoint.x) {
          leftmostX = startDragPoint.x;
      } else {
           leftmostX = endDragPoint.x;
      }
    var width = Math.abs(startDragPoint.x - endDragPoint.x);
    console.log("leftmostX "  + leftmostX);
    
    var topmostY;
    if(startDragPoint.y < endDragPoint.y) {
        topmostY = startDragPoint.y;
    } else {
        topmostY = endDragPoint.y;
    }
    var height = Math.abs(startDragPoint.y - endDragPoint.y);
    console.log("topmostY "  + topmostY);

    var boundingRectangle = new Rectangle(leftmostX, topmostY, width, height);
    console.log(bounds, boundingRectangle);
    // */
    var selectedArea = raster.getSubRaster(bounds);

    var selectedAreaAsDataUrl = selectedArea.toDataURL();
    var subRaster = new Raster(selectedAreaAsDataUrl);
    subRaster.position = view.center;
}
});