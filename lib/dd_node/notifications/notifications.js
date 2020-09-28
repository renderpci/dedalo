/*

	notifications

*/
module.exports = function(req, res){	

	this.index = function (myvar) {
		return 'index action on the `Application` controller myvar:' + myvar;
	};

	sendSSE(req, res);
	
	return "Loaded function notifications " ;
};
//console.log(config);




/**
* POSGRES DATA
*/
var pgp = require('pg-promise')(/*options*/);
var cn = {
		host: 'localhost', // server name or IP address;
		port: 5432,
		database: config.database.name,
		user: config.database.user,
		//password: config.database.psw
};
var db = pgp(cn); // database instance;


function send_db_data(res) {
	
	var start = new Date().getTime();

	db.one("SELECT datos from \""+config.database.notifications_table+"\" WHERE id=$1", 1)
			.then(function (row) {

				 var id 	  = (new Date()).toLocaleTimeString(),
				 	str_datos = JSON.stringify(row.datos)

				var end  = new Date().getTime(),
					time = end - start,
					id 	 = id + " - time ms: " + time
				//console.log(str_datos);

				constructSSE(res, id, str_datos);
			})
			.catch(function (error) {
				console.log("DB error !!!!!!: ")
				console.log(error); // print why failed;

				constructSSE(res, 1, '[]');
			});
}


function sendSSE(req, res) {	

	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive',
		'Access-Control-Allow-Origin':'*'
	});  
	
	// First print
	send_db_data(res)

	// Nexts prints
	setInterval(function() {		
		send_db_data(res)    
	}, config.notifications_lapse_ms || 2000 );   
	
}//end sendSSE


function constructSSE(res, id, data) {
	res.write('id: ' + id + '\n');
	res.write("data: " + data + '\n\n');
}

function debugHeaders(req) {
	sys.puts('URL: ' + req.url);
	for (var key in req.headers) {
		sys.puts(key + ': ' + req.headers[key]);
	}
	sys.puts('\n\n');
}

