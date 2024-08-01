// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL, Promise */
/*eslint no-undef: "error"*/

// imports
	import {JSON_parse_safely} from '../../../core/common/js/utils/util.js'

/**
* DATA_MANAGER
*/
export const data_manager = function() {

}//end data_manager



/**
* REQUEST
* Make a fetch request to server API
* Receives a JSON string to be parsed
* @param object options
* @return api_response
*/
data_manager.request = async function(options) {

	// debug
		if(typeof SHOW_DEBUG!=='undefined' && SHOW_DEBUG===true) {
			const action = options.body && options.body.action
				? options.body.action
				: null;
			console.warn('request options:', action, options);
		}

	// options
		this.url			= options.url || (typeof DEDALO_API_URL!=='undefined' ? DEDALO_API_URL : '../api/v1/json/')
		this.method			= options.method || 'POST' // *GET, POST, PUT, DELETE, etc.
		this.mode			= options.mode || 'cors' // no-cors, cors, *same-origin
		this.cache			= options.cache || 'no-cache' // *default, no-cache, reload, force-cache, only-if-cached
		this.credentials	= options.credentials || 'same-origin' // include, *same-origin, omit
		this.headers		= options.headers || {'Content-Type': 'application/json'}// 'Content-Type': 'application/x-www-form-urlencoded'
		this.redirect		= options.redirect || 'follow' // manual, *follow, error
		this.referrer		= options.referrer || 'no-referrer' // no-referrer, *client
		this.body			= options.body // body data type must match "Content-Type" header
		this.use_worker		= options.use_worker ?? false

	// reset page_globals.api_errors
		page_globals.api_errors = []

	// using worker cases.
	// Note that execution is slower, but it is useful for low priority
	// calls like 'update_lock_components_state'
		if (this.use_worker===true) {
			const current_worker = new Worker(DEDALO_CORE_URL + '/common/js/worker_data.js', {
				type : 'module'
			});
			current_worker.postMessage({
				url		: this.url,
				body	: this.body
			});

			current_worker.onerror = (event) => {
				console.error("There is an error with current worker error!");
				console.log('options:', options);
				console.log('event:', event);
			};

			return new Promise(function(resolve, reject){

				current_worker.onmessage = function(e) {
					if (!e.data.api_response) {
						console.error('Error worker_data onmessage. Rejected! e.data:', e.data);
						current_worker.terminate()

						reject({})
					}

					current_worker.terminate()

					resolve(e.data.api_response)
				}
			})
			.catch(error => {
				console.error(error)

				// api_errors. store api_errors. Used to render error page_globals
				page_globals.api_errors.push(
					{
						error	: 'data_manager', // error type
						msg		: error,
						trace	: 'data_manager worker catch error'
					}
				)

				return {
					result	: false,
					msg		: error.message,
					error	: error
				}
			});
		}

	// check url
		if (!this.url || !this.url.length) {
			const msg = 'Error: empty or invalid API URL'
			console.error(msg + '. typeof:', typeof this.url, 'value:', this.url);
			return {
				result	: false,
				msg		: msg,
				error	: 'URL is not valid'
			}
		}

	// handle_errors
		const handle_errors = function(response) {
			if (!response.ok) {
				console.warn("-> HANDLE_ERRORS response:",response);
				throw Error(response.statusText);
			}
			return response;
		}

	const api_response = fetch(
		this.url,
		{
			method		: this.method,
			mode		: this.mode,
			cache		: this.cache,
			credentials	: this.credentials,
			headers		: this.headers,
			redirect	: this.redirect,
			referrer	: this.referrer,
			body		: JSON.stringify(this.body)
		})
		.then(handle_errors)
		.then(response => {
			const json_parsed = response.json()
			.then((api_response)=>{

				if (api_response.error) {

					// debug console message
						console.error("data_manager request api_response:", api_response);

					// update_lock_components_state fails. Do not send alert here
						if (options.body.action && options.body.action==='update_lock_components_state') {
							return
						}

					// alert msg to user
						const msg = api_response.msg || api_response.error
						if (!page_globals.request_message || page_globals.request_message!==msg) {
							alert("An error has occurred in the API connection\n[data_manager.request]\n\n" + msg);
						}

					// save error message. This is captured by page rendering to display the proper error

						// request_message. Store request message temporally
							page_globals.request_message = msg
							setTimeout(function(){
								page_globals.request_message = null
							}, 3000)

						// api_errors. store api_errors. Used to render error page_globals
							page_globals.api_errors.push(
								{
									error	: api_response.error || 'data_manager', // error type
									msg		: msg,
									trace	: 'data_manager json_parsed'
								}
							)
				}

				return api_response
			})

			return json_parsed
		})
		.catch(error => {
			console.warn('request url:', typeof this.url, this.url);
			console.warn("request options:", options);
			console.error("!!!!! [data_manager.request] SERVER ERROR. Received data is not JSON valid. See your server log for details. catch ERROR:\n")
			console.error('error:', error);

			// api_errors. store api_errors. Used to render error page_globals
				page_globals.api_errors.push(
					{
						error	: api_response?.error || 'data_manager', // error type
						msg		: (api_response?.msg || api_response?.error || error),
						trace	: 'data_manager catch error'
					}
				)

			return {
				result	: false,
				msg		: error.message || null,
				error	: error
			}
		});


	return api_response
}//end request



/**
* REQUEST_STREAM
* Make a fetch request_stream to server API
* Note that, unlike 'request', this method receives a stream that must be read by a reader 'getReader'.
* The 'is_stream' body property indicates that server must parse the result as readable stream
* with header("Content-Type: text/event-stream")
* @see ReadableStream: https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/ReadableStream
* @param object options
* @return api_response
*/
data_manager.request_stream = async function(options) {

	// short vars
	const url			= options.url || (typeof DEDALO_API_URL!=='undefined' ? DEDALO_API_URL : '../api/v1/json/')
	const method		= options.method || 'POST' // *GET, POST, PUT, DELETE, etc.
	const mode			= options.mode || 'cors' // no-cors, cors, *same-origin
	const cache			= options.cache || 'no-cache' // *default, no-cache, reload, force-cache, only-if-cached
	const credentials	= options.credentials || 'same-origin' // include, *same-origin, omit
	const headers		= options.headers || {
		'Content-Type'		: 'application/json',
		'Accept'			: 'text/event-stream',
		'Content-Encoding'	: 'none',
	}
	const redirect		= options.redirect || 'follow' // manual, *follow, error
	const referrer		= options.referrer || 'no-referrer' // no-referrer, *client
	const body			= options.body // body data type must match "Content-Type" header
	// always force the request as a stream
	body.is_stream = true

	return new Promise(function(resolve){

		fetch(
			url,
			{
				method		: method,
				mode		: mode,
				cache		: cache,
				credentials	: credentials,
				headers		: headers,
				redirect	: redirect,
				referrer	: referrer,
				body		: JSON.stringify(body)
			}
		)
		.then(response => {

			// Get the readable stream from the response body
			const stream = response.body;

			resolve(stream)
		})
		.catch(error => {
			// Log the error
			console.error(error);
		});
	})
}//end request_stream



/**
* READ_STREAM
* Read a SSE ReadableStream from server API response
* @see ReadableStream: https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/getReader
* @param ReadableStream stream
* 	from fetch response.body
* @param function on_read
* 	callback function fired for each reader chunk
* @param function on_done
* 	callback function fired on reader done (close read)
* @return void
*/
data_manager.read_stream = function(stream, on_read, on_done) {

	// Get the reader from the stream
	const reader = stream.getReader();

	// register reader (allow stop on page navigation)
	page_globals.stream_readers.push(reader)

	// exec previous callback
	on_read({
		data : {
			msg : 'Preparing data...'
		},
		is_running	: true
	}, reader)

	const ar_chunks = []
	// Define a function to read each chunk
	const readChunk = () => {
		// Read a chunk from the reader

		reader.read()
			.then(({
				value,
				done
			}) => {

				// Check if the stream is done
				if (done) {
					// Log a message
					console.log('Stream finished', done, value);
					// exec callback function on_done
					on_done(true)
					// Return from the function
					return;
				}

				// CHEKING THE STRING TO DETERMINATE THE MSG SENT
				// The event message always begins with "data:\n" and end with "\n\n"
				// PHP create the message correctly, but HTTP server can split it or merge it into a chunk
				// Why is not coherent ???? (only gods knows!)
				// So, every value received needs to be analyzed to determinate:
				//	1 - It's a full message, perfect! the message is OK.
				// 	2 - It's a part (message divided in parts, then need to be joined to get the message)
				//	3 - It has more than 1 message (merged, then need to be split to get the message)

				// Get the last two character of the value
				// it will be check to determinate if the value is the final message
				const last		= value[value.length-1]
				const previous	= value[value.length-2]

				// Convert the chunk value to a string
				// every chuck is decoded and analyzed to determinate if the message is a part or it's a full
					const chunk_string		= new TextDecoder().decode(value);

					// split the string by the initial string: data:\n
					const chunk_split_in	= chunk_string.split('data:\n');
					// split again the string with the end string and initial
					// this case has two message in one chunk, so delete the previous message because is complicate to rebuild it
					// and it's not the final message (the message has new one that begins with "data:\n")
					const chunk_split_in2	= chunk_string.split('\n\ndata:\n');
					// in the case that the string has two o more message deletes previous stored message and begins again.
					if(chunk_split_in2.length > 1){
						// reset the array
						ar_chunks.length = 0
					}
					// check if the split has information (some messages can be empty)
					// and get the last one or previous (empty message will be discarded)
					const valid_chunk = chunk_split_in.length >1 && !chunk_split_in[chunk_split_in.length-1].length
						?  chunk_split_in[chunk_split_in.length-2]
						:  chunk_split_in[chunk_split_in.length-1]
					//add the valid chuck into the array, is used to add divided messages into 1 valid.
					ar_chunks.push(valid_chunk)

				// if the value indicate the is the final part of the message, decode it and get the JSON
				// if not, the message is incomplete and can't be processed and showed.
				if(last === 10 && previous === 10){

					// join the messages parts into one string
					// and parse message response as JSON
					// JSON_parse_safely is needed to check and don't stop the event loop
					// BUT only a valid JSON is expected here.
					const data_string	= ar_chunks.join('')
					const sse_response	= JSON_parse_safely(data_string) || {
						data : {
							msg : 'JSON invalid SSE message'
						},
						is_running	: true,
						errors		: ['Invalid JSON message'],
						total_time	: '0 sec',
						data_string	: data_string
					}

					// reset the array
					ar_chunks.length = 0

					if(sse_response){
						// exec callback function on_read
						on_read(sse_response, reader)
					}
				}

				// Read the next chunk
				readChunk();
			})
			.catch(error => {
				// Log the error
				console.error(error);
			});
	};
	// Start reading the first chunk
	readChunk();
}//end read_stream



/**
* GET_ELEMENT_CONTEXT
* Resolves full element context based on minimal source vars
* Like:
*	source = {
*		model: "component_input_text"
*		tipo: "test159"
*		section_tipo: "test65"
*		section_id: null
*		mode: "search"
*	}
* @param object source
* @return promise api_response
*/
data_manager.get_element_context = async function(source) {

	// api request
		// const api_response = await this.request({
		const api_response = this.request({
			body : {
				action	: 'get_element_context',
				source	: source
			}
		})


	return api_response
}//end get_element_context



/**
* GET_PAGE_ELEMENT
* Get full page element
* Expected options:
*
*	$tipo 			= $options->tipo ?? null;
*	$model 			= $options->model ?? (isset($tipo) ? RecordObj_dd::get_modelo_name_by_tipo($tipo,true) : null);
*	$lang 			= $options->lang ?? DEDALO_DATA_LANG;
*	$mode 			= $options->mode ?? 'list';
*	$section_id 	= $options->section_id ?? null;
*	$component_tipo = $options->component_tipo ?? null;
*
* @param object options
* @return promise api_response
*/
data_manager.prototype.get_page_element = async function(options) {

	// api request
		// const api_response = await this.request({
		const api_response = this.request({
			body : {
				action	: 'get_page_element',
				options	: options
			}
		})


	return api_response
}//end get_page_element



/**
* GET_LOCAL_DB
* Get local indexedDB from browser
* If browser version is lower than current try, onupgradeneeded event is launched and browser indexedDB will be upgraded
* @return promise
*/
data_manager.get_local_db = async function() {

	// db storage
		// In the following line, you should include the prefixes of implementations you want to test.
		const current_indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
		// DON'T use "var indexedDB = ..." if you're not in a function.
		// Moreover, you may need references to some window.IDB* objects:
		// const IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction || {READ_WRITE: "readwrite"}; // This line should only be needed if it is needed to support the object's constants for older browsers
		// const IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
		// (Mozilla has never prefixed these objects, so we don't need window.mozIDB*)

	// invalid local db case
		if (!current_indexedDB) {
			console.error("[get_local_db] Your browser doesn't support a stable version of IndexedDB. Such and such feature will not be available.");
		}


	return new Promise(function(resolve, reject){

		// open db. Let us open our database (name, version)
			const db_request = current_indexedDB.open('dedalo', 11);

		// error case
			db_request.onerror = function(event) {
				if(SHOW_DEBUG){
					console.error("[get_local_db] error:", event.target);
				}else{
					console.error("[get_local_db] It's not possible get_local_db, IndexedDB is blocked, Dédalo will run slowly without cache.");
				}

				reject(false)
			};

		// success case
			db_request.onsuccess = function(event) {

				const db = event.target.result;
				resolve(db)
			};

		// onupgradeneeded event
			db_request.onupgradeneeded = function(event) {

				console.log("[get_local_db] onupgradeneeded:", event.target);

				const db = event.target.result;
				console.log(`[get_local_db] Upgrading indexedDB 'dedalo' to version ${db.version}`);

				// objectStore

				// rqo
					db.objectStoreNames.contains('rqo') || db.createObjectStore('rqo', { keyPath:'id' });
				// context
					db.objectStoreNames.contains('context') || db.createObjectStore('context', { keyPath:'id' });
				// status
				// Used to store elements status like section_group collapse display
					db.objectStoreNames.contains('status') || db.createObjectStore('status', { keyPath:'id' });
				// data
				// Used to store temp data like menu datum resolution
					db.objectStoreNames.contains('data') || db.createObjectStore('data', { keyPath:'id' });
				// ontology
					db.objectStoreNames.contains('ontology') || db.createObjectStore('ontology', { keyPath:'id' });
				// sqo. No longer used (replaced by 'pagination')
					if (db.objectStoreNames.contains('sqo')) {
						db.deleteObjectStore("sqo");
						console.log(`[get_local_db] Deleting ObjectStore (table) sqo`);
					}
				// pagination
					db.objectStoreNames.contains('pagination') || db.createObjectStore('pagination', { keyPath:'id' });
			};
	})
	.catch(err => {
		console.error(err)
	});
}//end local_db



/**
* SET_LOCAL_DB_DATA
* Save data into the browser local database (IndexdDB)
* @param object data
* @param string table
* 	Tables:
* 		status : element stored status like collapsed, etc.
* 		rqo : rqo cache data
* 		ontology ;: ontology cache data
* 		data : generic data like menu resolution
* 		context : context cache data
* Calling sample:
* 	current_data_manager.set_local_db_data(
* 		rqo, // mixed data
* 		'rqo' // string table
* 	)
* @return promise
*/
data_manager.set_local_db_data = async function(data, table) {

	const self = this

	// get local db
		const db = await self.get_local_db()

	// check if is possible create and use IndexDB, if not, the promise will return undefined and we use false
		if(!db){
			return false
		}

	return new Promise(function(resolve, reject){

		// transaction
			const transaction = db.transaction(table, "readwrite");

			// complete. Do something when all the data is added to the database.
				// transaction.oncomplete = function(event) {
				// 	console.log("All done!");
				// };

			// error
				transaction.onerror = function(event) {
					if(SHOW_DEBUG){
						console.error("[set_local_db_data] error:", event.target);
					}else{
						console.error("[set_local_db_data] It's not possible get_local_db, IndexedDB is blocked, Dédalo will run slowly without cache.");
					}
					reject(false)
				};

		// request
			const objectStore = transaction.objectStore(table);

			// Put this updated object back into the database.
			const request = objectStore.put(data);

			request.onsuccess = function(event) {
				resolve(event.target.result)
			};
			request.onerror = function(event) {
				console.error("[set_local_db_data] error:", event.target);
				reject(event.target.error);
			};
	})
}//end set_local_db_data



/**
* GET_LOCAL_DB_DATA
* @param string id
* @param string table
* @param bool cache = false
* Calling sample:
*	current_data_manager.get_local_db_data('tool_export_config', 'data')
* @return promise
*/
const db_table = {}
data_manager.get_local_db_data = async function(id, table, cache=false) {

	const self = this

	// get local db
		const db = cache===true
			? await (async ()=>{
				if (!db_table[table]) {
					db_table[table] = await self.get_local_db()
				}
				return db_table[table]
			  })()
			: await self.get_local_db()

	// check if is possible create and use IndexDB, if not, the promise will return undefined and we use false
		if(!db){
			return false
		}

	return new Promise(function(resolve, reject){

		// transaction
			const transaction = db.transaction(table, 'readwrite');

			// complete. Do something when all the data is added to the database.
				// transaction.oncomplete = function(event) {
				// 	console.log("All done!");
				// };

			// error
				transaction.onerror = function(event) {
					if(SHOW_DEBUG){
						console.error("[get_local_db_data] error:", event.target);
						console.error('[get_local_db_data] table:', table, 'db:',db);
					}else{
						console.error("[get_local_db_data] It's not possible get_local_db, IndexedDB is blocked, Dédalo will run slowly without cache.");
					}
					reject(false)
				};

		// request
			const objectStore	= transaction.objectStore(table);
			const request		= objectStore.get(id);

			request.onsuccess = function(event) {
				resolve(event.target.result)
			};
			request.onerror = function(event) {
				console.error("[get_local_db_data] error:", event.target);
				reject(event.target.error);
			};
	})
}//end get_local_db_data



/**
* DELETE_LOCAL_DB_DATA
* Delete specified element form DB table by id
* @param string id
* @param string table
* @return promise
*/
data_manager.delete_local_db_data = async function(id, table) {

	const self = this

	// get local db
		const db = await self.get_local_db()

	// check if is possible create and use IndexDB, if not, the promise will return undefined and we use false
		if(!db){
			return false
		}

	return new Promise(function(resolve, reject){

		// transaction
			const transaction = db.transaction(table, "readwrite");

			// complete. Do something when all the data is added to the database.
				// transaction.oncomplete = function(event) {
				// 	console.log("All done!");
				// };

			// error
				transaction.onerror = function(event) {
					if(SHOW_DEBUG){
						console.error("[delete_local_db_data] error:", event.target);
					}else{
						console.error("[delete_local_db_data] It's not possible get_local_db, IndexedDB is blocked ");
					}
					reject(false)
				};

		// request
			const objectStore	= transaction.objectStore(table);
			const request		= objectStore.delete(id);

			request.onsuccess = function(event) {
				// success
				resolve(event.target.result)
			};
			request.onerror = function(event) {
				console.error("[delete_local_db_data] delete_local_db_data error:", event.target);
				reject(event.target.error);
			};
	})
}//end delete_local_db_data



/**
* DELETE_WHOLE_LOCAL_DB
* Clean whole local indexed DB.
* Useful when important changes were made because an update
* @return promise
*/
data_manager.delete_whole_local_db = async function() {

	const self = this

	return new Promise(function(resolve, reject) {

		const db = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;

		const request = db.deleteDatabase('dedalo');

		request.onsuccess = function(event) {
			console.log("[delete_whole_local_db] Deleted database successfully");
			resolve(event.target.result)
		};
		request.onerror = function(event) {
			console.log("[delete_whole_local_db] Couldn't delete database");
			reject(event.target.error);
		};
		request.onblocked = function () {
			console.log("[delete_whole_local_db] Couldn't delete database due to the operation being blocked. Reload page to apply changes");
		};
	})
}//end delete_whole_local_db



/**
* CLEAR_LOCAL_DB_TABLE
* Clean selected objectStore (table) from indexedDB.
* Useful when important changes were made because an update
* @param string table
* @return promise
*/
data_manager.clear_local_db_table = async function(table) {

	const self = this

	return new Promise(function(resolve, reject) {

		// Let us open our database
		const DBOpenRequest = window.indexedDB.open("dedalo");
		DBOpenRequest.onsuccess = (event) => {

			console.log("[clear_local_db_table] Database initialized");

			// store the result of opening the database in the db variable.
			const db = DBOpenRequest.result;

			// clear previous data
			const transaction = db.transaction([table], "readwrite");
			transaction.oncomplete = (event) => {
				console.log('[clear_local_db_table] Transaction done successful');
			};
			transaction.onerror = (event) => {
				console.error(`[clear_local_db_table] Transaction not opened due to error: ${transaction.error}`);
				reject(false)
			};
			const objectStore = transaction.objectStore("sqo");
			const objectStoreRequest = objectStore.clear();
			objectStoreRequest.onsuccess = (event) => {
				console.log('[clear_local_db_table] Request clear successful');
				resolve(true)
			};
		};
	})
}//end clear_local_db_table



/**
* DOWNLOAD_URL
* @param string url
* @param string filename
* Download url blob data and create a temporal auto-fired link
*/
export function download_url(url, filename) {
	fetch(url).then(function(t) {
		return t.blob().then((b)=>{
			var a = document.createElement("a");
			a.href = URL.createObjectURL(b);
			a.setAttribute("download", filename);
			a.click();
			a.remove();
		}
		);
	});
}//end download_url



/**
* DOWNLOAD_DATA
* @param mixed data
* @param string filename
* Download data blob data and create a temporal auto-fired link
*/
export function download_data(data, filename) {

	const json	= JSON.stringify(data, null, 2)
	const blob	= new Blob([json], {type: "octet/stream"})
	const url	= window.URL.createObjectURL(blob)

	const a = document.createElement("a")
	a.style = "display: none"
	document.body.appendChild(a)
	a.href = url
	a.download = filename
	a.click()
	window.URL.revokeObjectURL(url)

	return true
}//end download_data



// @license-end
