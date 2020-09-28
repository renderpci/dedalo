/*

 node main http server and access point

Start using:
 pm2 start server.js --name "dd_node_"DEDALO_ENTITY --watch

*/
	

var fs   	= require('fs');
var http 	= require('http');
var loader 	= require('auto-loader');


//console.log("123"); return;

// CONFIG VARS FROM JSON FILE : config.json
global.config = JSON.parse(fs.readFileSync( __dirname + '/config.json'));

		

// HTTP SERVER
http.createServer(function(req, res) {
	//debugHeaders(req);

	switch(true) {

		// ssevents handler
		case (req.headers.accept && req.headers.accept == 'text/event-stream' && req.url == '//notifications'): //  && req.headers.accept && req.headers.accept == 'text/event-stream'			
			load_class('notifications')(req, res)			
			break;

		case (req.url == '/hello'):
			res.writeHead(200, {
						'Content-Type': 'text/html',
						//'Access-Control-Allow-Origin':'*',
						});
			res.write("Hola " + req.url);
			res.end();

		default:
			res.writeHead(404);
			res.write("Sorry. Bad headers received or page not found " + req.url);
			res.end();
	}


	/*
		if (req.headers.accept && req.headers.accept == 'text/event-stream') {
			if (req.url == '/dd_events') {
				sendSSE(req, res);
			} else {
				res.writeHead(404);
				res.end();
			}
		} else {
			res.writeHead(200, {'Content-Type': 'text/html'});
			res.write(fs.readFileSync(__dirname + '/sse-node.html'));
			res.end();
		}
		*/
}).listen(config.http_port);


function load_class( name ) {
	//var modules = loader.load(__dirname);
	var modules = loader.load(__dirname+'/'+name);
		//console.log( modules );
	var class_loaded = modules[name];
		//console.log( class_loaded )
	return class_loaded;
}


console.log("dd_node http server is running and listen at port "+config.http_port);
console.log("config: ");
console.log(config);

return;