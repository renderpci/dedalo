/*
*  Enables scrolling and zooming 
*  for a paper.js view
*/
 
var paperViewControl = function () {
 
    var currentZoom;
    var currentX = 0;
    var currentY = 0;
    var scrolling = false;
    var zooming = false;
    var minX = 0;
    var minY = 0;
    var zoomFinishedCallback;
    var scrollFinishedCallback;
    var lastPoint = 0;
 
    // state for animated zooming
    var zoom =
        {
            timer: {},
            end: 0,
            start: 0,
            steps: 0,
            currentStep: 0
        }
 
    // state for animated scrolling
    var scroll =
        {
            timer: null,
            delta: 0,
            start: 0,
            steps: 0,
            currentStep: 0
        }
 
 
    function stopZoom() {
        clearInterval(zoom.timer);
        zoom.timer = null;
        zooming = false;
        if (zoomFinishedCallback)
            zoomFinishedCallback();
    }
 
    //incrementally zoom until a 
    //final zoom amount is reached
 
    function zoomStep() {
 
        if (zoom.currentStep < zoom.steps) {
 
 
            var delta = ((zoom.end - zoom.start) / zoom.steps);
 
            
 
            if (view.zoom + delta > 0) {
                view.zoom += delta;
            }
 
            zoom.currentStep += 1;
        } else {
            stopZoom();
        }
 
 
        currentZoom = view.zoom;
 
 
    }
 
    // incrementally scroll in one direction 
    // until a final distance is reached
 
    function scrollStep(direction) {
 
        if (scroll.currentStep < scroll.steps) {
            scrolling = true;
 
 
            var p = scroll.delta * (1 / (scroll.currentStep + 1))
            
 
            if (direction == 'x')
                currentX += p;
            else
                currentY += p;
 
 
            var pt = direction == 'x'
                    ? new Point(p, 0)
                    : new Point(0, p);
 
            view.scrollBy(pt);
            scroll.currentStep += 1;
        }
        else {
            scrolling = false;
            clearInterval(scroll.timer);
            if (scrollFinishedCallback)
                scrollFinishedCallback();
        }
    }
 
    return {
 
        /******************************************
        Start up
        ******************************************/
        init: function (canvasId) {
            paper.setup(canvasId);
        },
 
        /******************************************
        Begin Zooming up or down by a percentage
        ******************************************/
        startZoom: function (deltaPercent, animate, callback) {
 
            if (animate) {
 
                if (zooming) return;
 
                zoomFinishedCallback = callback;
 
 
                zoom.start = view.zoom;
                zoom.end = view.zoom + (deltaPercent / 100);
                //check min and max zoom
                zoom.end = zoom.end > 10 ? 10 : zoom.end < 0.1 ? 0.1 : zoom.end;
                zoom.steps = 15;
                zoom.currentStep = 0;
                zoom.timer = setInterval('paperViewControl.zoomStep()', 1);
            }
            else {
                if ((view.zoom + (deltaPercent / 100)) < 0.1) {
                    view.zoom = 0.1
                } else {
                    view.zoom = view.zoom + (deltaPercent / 100);
                }
 
                if (callback)
                    callback();
            }
 
 
 
 
        },
 
        /******************************************
        Begin scrolling in a direction ('x' or 'y') 
        by a certain # of pixels
        ******************************************/
        startScroll: function (direction, delta, animate, callback) {
 
            if (animate) {
 
                if (scrolling) return;
 
                scrollFinishedCallback = callback;
 
                if (direction == 'x')
                    scroll.start = currentX;
                else
                    scroll.start = currentY;
 
                
 
                scroll.delta = delta;
                scroll.steps = 25;
                scroll.currentStep = 0;
                lastPoint = 0;
                scroll.timer = setInterval("paperViewControl.scrollStep('" + direction + "')", 2);
 
 
            } else {
 
                if (direction == 'x') {
                    if (currentX + delta < 0) {
                        currentX = 0;
                        view.bounds.x = 0;
                    } else {
                        view.scrollBy(new Point(delta, 0));
                        currentX += delta;
                    }
 
                }
                else {
                    if (currentY + delta < 0) {
                        currentY = 0;
                        view.bounds.y = 0;
                    }
                    else {
                        view.scrollBy(new Point(0, delta));
                        currentY += delta;
                    }
 
                }
 
                if (callback)
                    callback();
 
            }
 
 
        },
 
        /******************************************
        Zoom and center to a specific item
        ******************************************/
        zoomTo: function (item) {
            var bounds = item.bounds;
            //find how much we need to zoom in or out based on the item dimensions
            var scale = ((bounds.width * bounds.height) /
                            (view.viewSize.width * view.viewSize.height));
 
            //zoom in or out based on scale
            view.zoom = scale > 0 ? (1 / s) : (s / 1);
 
            //loop through the centering algorithm a few times to account for floating errors
            for (var i = 0; i < 10; i++) {
                var ctr = new Point((bounds.center.x - view.center.x) / 2, (bounds.center.y - view.center.y) / 2)
                view.scrollBy(ctr);
            }
        },
        resetScroll: function () {
            view.zoom = 1;
            view.scrollBy(new Point(-view.bounds.x, -view.bounds.y));
            currentX = 0; currentY = 0;
 
        },
 
        removeAll: function () {
            for (var i = 0; i < project.layers.length; i++) {
                project.layers[i].removeChildren();
            }
        },
        zoomStep: zoomStep,
        scrollStep: scrollStep
 
    }
} ();