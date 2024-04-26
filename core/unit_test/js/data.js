// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

// import {component_date} from '../../component_date/js/component_date.js'


// data
	export const random_string = function(length=128) {

		let result = '';

		const names = ['El raspa','Isis','Monstruo','Osi','Mini','Pitu','Ojitos','Turbina','Susto']
		const randomElement = names[Math.floor(Math.random() * names.length)];
		result += randomElement + ' - '

		const characters		= 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789àü\'ñç';
		const charactersLength	= characters.length;
		for ( let i = 0; i < length; i++ ) {
		   result += characters.charAt(Math.floor(Math.random() * charactersLength));
		   if (i>2) { break }
		}
		return result;
	}

	export const random_number = function(length=10000000) {

		return Math.floor(Math.random() * Math.floor(length));
	}

	export const random_json = function() {
		const value = {
			text	: random_string(64),
			number	: random_number()
		}
		return value
	}

	export const random_locator = function() {
		const section_tipo			= arguments[0][0]
		const from_component_tipo	= arguments[0][1]
		// const paginated_key		= typeof arguments[0][2]!=="undefined" ? arguments[0][2] : false
		const section_id			= (random_number(50) || 1).toString()

		const value = {
			type				: "dd151",
			section_id			: section_id,
			section_tipo		: section_tipo,
			from_component_tipo	: from_component_tipo
		}
		// if (paginated_key!==false) {
			// value.paginated_key 	= paginated_key
		// }

		return value
	}

	export const ar_random_locator = function() {
		const result = random_locator(...arguments)
		return [result]
	}

	export const custom_locator = function() {
		const section_tipo			= arguments[0][0]
		const section_id			= arguments[0][1]
		const from_component_tipo	= arguments[0][2]
		// const paginated_key		= typeof arguments[0][2]!=="undefined" ? arguments[0][2] : false

		const value = {
			type				: "dd151",
			section_id			: (section_id).toString(),
			section_tipo		: section_tipo, // "dd501"
			from_component_tipo	: from_component_tipo // "test144"
		}

		return value
	}

	export const random_date = function() {
		let second	= random_number(59) || 0
		let minute	= random_number(59) || 0
		let hour	= random_number(23) || 0
		let day		= random_number(30) || 1
		let month	= random_number(12) || 1
		let year	= random_number(2022) || 1
		const time	= convert_date_to_seconds({
			year	: year,
			month	: month,
			day		: day,
			hour	: hour,
			minute	: minute,
			second	: second
		}, 'date')

		const value =  {
			start : {
				year	: year,
				month	: month,
				day		: day,
				hour	: hour,
				minute	: minute,
				second	: second,
				time	: time
			}
		}
		return value
	}

	function convert_date_to_seconds(dd_date, mode) {

		let time = 0;

		let year 	= parseInt(dd_date.year);
		let month 	= parseInt(dd_date.month)
		let day 	= parseInt(dd_date.day)
		let hour 	= parseInt(dd_date.hour)
		let minute	= parseInt(dd_date.minute)
		let second 	= parseInt(dd_date.second)

			if (mode==='period') {
				// Nothing to do here
			}else{
				// Normal cases
				if(month && month>0) {
					month = month-1
				}
				if(day && day>0) {
					day = day-1
				}
			}

			// Set to zero on no value (preserve negatives always)
			if (isNaN(year)) {
				year = 0;
			}
			if (isNaN(month)) {
				month = 0;
			}
			if (isNaN(day)) {
				day = 0;
			}
			if (isNaN(hour)) {
				hour = 0;
			}
			if (isNaN(minute)) {
				minute = 0;
			}
			if (isNaN(second)) {
				second = 0;
			}


			// Add years (using virtual years of 372 days (31*12)
			time += year*372*24*60*60

			// Add months (using virtual months of 31 days)
			time += month*31*24*60*60

			// Add days
			time += day*24*60*60

			// Add hours
			time += hour*60*60

			// Add minutes
			time += minute*60

			// Add seconds
			time += second


			time = parseInt(time);

			if (isNaN(time)) {
				time = false;
			}

		return time
	}//end convert_date_to_seconds

	export const random_email = function() {
		let result				= ''
		const length			= 40
		const characters		= 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const charactersLength	= characters.length;
		for ( var i = 0; i < length; i++ ) {
		   result += characters.charAt(Math.floor(Math.random() * charactersLength));
		}
		result += '@mydomain.net'
		return result;
	}

	export const random_filter_records = function() {

		// randomly generated N = 40 length array 0 <= A[N] <= 39
		const value = Array.from({length: 40}, () => Math.floor(Math.random() * 40));

		const item = {
			tipo : 'rsc167',
			value : value
		}

		const result = [item]

		return result;
	}

	export const random_geolocation = function() {
		const alt = random_number(100) // expected int from 1 to 100
		const lat = Math.random() // expected output: a float number from 0 to <1
		const lon = Math.random()
		const zoom = random_number(15) // expected int from 1 to 15

		const result = {
			alt		: alt,
			lat		: lat,
			lon		: lon,
			zoom	: zoom
		}

		return result;
	}

	export const random_iri_data = function() {
		const result = {
			iri		: "https://www." + random_string(64) + '-' + random_string(50) +  '.' + random_string(3),
			title	: random_string(128)
		}
		return result;
	}

	export const random_security_access = function() {
		const result = {
			tipo			: "oh25",
			value			: random_number(10000) || 1,
			section_tipo	: "oh1"
		}

		return result
	}



	export const random_3d_data = function() {

		const value =
		{
			"files_info": [
			  {
				"quality": "original",
				"extension": "glb",
				"file_name": "test26_test3_1.glb",
				"file_path": "/3d/original/0/test26_test3_1.glb",
				"file_size": 19066216,
				"file_time": {
				  "day": 26,
				  "hour": 9,
				  "time": 65063207280,
				  "year": 2024,
				  "month": 4,
				  "minute": 8,
				  "second": 0,
				  "timestamp": "2024-04-26 09:08:00"
				},
				"file_exist": true
			  },
			  {
				"quality": "web",
				"extension": "glb",
				"file_name": "test26_test3_1.glb",
				"file_path": "/3d/web/0/test26_test3_1.glb",
				"file_size": 19066216,
				"file_time": {
				  "day": 26,
				  "hour": 9,
				  "time": 65063207280,
				  "year": 2024,
				  "month": 4,
				  "minute": 8,
				  "second": 0,
				  "timestamp": "2024-04-26 09:08:00"
				},
				"file_exist": true
			  },
			  {
				"quality": "thumb",
				"extension": "jpg",
				"file_name": "test26_test3_1.jpg",
				"file_path": "/3d/thumb/0/test26_test3_1.jpg",
				"file_size": 5520,
				"file_time": {
				  "day": 26,
				  "hour": 9,
				  "time": 65063207282,
				  "year": 2024,
				  "month": 4,
				  "minute": 8,
				  "second": 2,
				  "timestamp": "2024-04-26 09:08:02"
				},
				"file_exist": true
			  }
			],
			"original_file_name": "calat_mac_girona.glb",
			"original_upload_date": {
			  "day": 26,
			  "hour": 9,
			  "time": 65063207280,
			  "year": 2024,
			  "month": 4,
			  "minute": 8,
			  "second": 0
			},
			"original_normalized_name": "test26_test3_1.glb"
		}

		return [value]
	}//end random_3d_data



	export const random_av_data = function() {

		// const file_name = random_string(64) + '_' + random_number(99) + ''

		const value =
		{
			"files_info": [
			  {
				"quality": "original",
				"extension": "mp4",
				"file_name": "test94_test3_1.mp4",
				"file_path": "/av/original/0/test94_test3_1.mp4",
				"file_size": 14906377,
				"file_time": {
				  "day": 26,
				  "hour": 9,
				  "time": 65063207294,
				  "year": 2024,
				  "month": 4,
				  "minute": 8,
				  "second": 14,
				  "timestamp": "2024-04-26 09:08:14"
				},
				"file_exist": true
			  },
			  {
				"quality": "404",
				"extension": "mp4",
				"file_name": "test94_test3_1.mp4",
				"file_path": "/av/404/0/test94_test3_1.mp4",
				"file_size": 14908012,
				"file_time": {
				  "day": 26,
				  "hour": 9,
				  "time": 65063207304,
				  "year": 2024,
				  "month": 4,
				  "minute": 8,
				  "second": 24,
				  "timestamp": "2024-04-26 09:08:24"
				},
				"file_exist": true
			  },
			  {
				"quality": "thumb",
				"extension": "jpg",
				"file_name": "test94_test3_1.jpg",
				"file_path": "/av/thumb/0/test94_test3_1.jpg",
				"file_size": 14027,
				"file_time": {
				  "day": 26,
				  "hour": 9,
				  "time": 65063207305,
				  "year": 2024,
				  "month": 4,
				  "minute": 8,
				  "second": 25,
				  "timestamp": "2024-04-26 09:08:25"
				},
				"file_exist": true
			  }
			],
			"original_file_name": "rsc35_rsc167_1_deleted_2023-10-22_1924.mp4",
			"original_upload_date": {
			  "day": 26,
			  "hour": 9,
			  "time": 65063207305,
			  "year": 2024,
			  "month": 4,
			  "minute": 8,
			  "second": 25
			},
			"original_normalized_name": "test94_test3_1.mp4"
		}

		return [value]
	}//end random_av_data



	export const random_image_data = function() {

		// const file_name = random_string(64) + '_' + random_number(99) + ''

		const value =
		{
			"files_info": [
			  {
				"quality": "original",
				"extension": "jpg",
				"file_name": "test99_test3_1.jpg",
				"file_path": "/image/original/0/test99_test3_1.jpg",
				"file_size": 448466,
				"file_time": {
				  "day": 26,
				  "hour": 9,
				  "time": 65063207350,
				  "year": 2024,
				  "month": 4,
				  "minute": 9,
				  "second": 10,
				  "timestamp": "2024-04-26 09:09:10"
				},
				"file_exist": true
			  },
			  {
				"quality": "6MB",
				"extension": "jpg",
				"file_name": "test99_test3_1.jpg",
				"file_path": "/image/6MB/0/test99_test3_1.jpg",
				"file_size": 848043,
				"file_time": {
				  "day": 26,
				  "hour": 8,
				  "time": 65063205913,
				  "year": 2024,
				  "month": 4,
				  "minute": 45,
				  "second": 13,
				  "timestamp": "2024-04-26 08:45:13"
				},
				"file_exist": true
			  },
			  {
				"quality": "6MB",
				"extension": "avif",
				"file_name": "test99_test3_1.avif",
				"file_path": "/image/6MB/0/test99_test3_1.avif",
				"file_size": 788315,
				"file_time": {
				  "day": 26,
				  "hour": 8,
				  "time": 65063205914,
				  "year": 2024,
				  "month": 4,
				  "minute": 45,
				  "second": 14,
				  "timestamp": "2024-04-26 08:45:14"
				},
				"file_exist": true
			  },
			  {
				"quality": "1.5MB",
				"extension": "jpg",
				"file_name": "test99_test3_1.jpg",
				"file_path": "/image/1.5MB/0/test99_test3_1.jpg",
				"file_size": 240920,
				"file_time": {
				  "day": 26,
				  "hour": 8,
				  "time": 65063205916,
				  "year": 2024,
				  "month": 4,
				  "minute": 45,
				  "second": 16,
				  "timestamp": "2024-04-26 08:45:16"
				},
				"file_exist": true
			  },
			  {
				"quality": "1.5MB",
				"extension": "avif",
				"file_name": "test99_test3_1.avif",
				"file_path": "/image/1.5MB/0/test99_test3_1.avif",
				"file_size": 226212,
				"file_time": {
				  "day": 26,
				  "hour": 8,
				  "time": 65063205917,
				  "year": 2024,
				  "month": 4,
				  "minute": 45,
				  "second": 17,
				  "timestamp": "2024-04-26 08:45:17"
				},
				"file_exist": true
			  },
			  {
				"quality": "thumb",
				"extension": "jpg",
				"file_name": "test99_test3_1.jpg",
				"file_path": "/image/thumb/0/test99_test3_1.jpg",
				"file_size": 12846,
				"file_time": {
				  "day": 26,
				  "hour": 9,
				  "time": 65063208385,
				  "year": 2024,
				  "month": 4,
				  "minute": 26,
				  "second": 25,
				  "timestamp": "2024-04-26 09:26:25"
				},
				"file_exist": true
			  }
			],
			"original_file_name": "test94_test3_1.jpg",
			"original_upload_date": {
			  "day": 8,
			  "hour": 20,
			  "time": 65045620920,
			  "year": 2023,
			  "month": 10,
			  "minute": 2,
			  "second": 0
			},
			"original_normalized_name": "test99_test3_1.jpg"
		}

		return [value]
	}//end random_image_data



	export const random_pdf_data = function() {

		const value =
		{
			"files_info": [
			  {
				"quality": "original",
				"extension": "pdf",
				"file_name": "test85_test3_1.pdf",
				"file_path": "/pdf/original/0/test85_test3_1.pdf",
				"file_size": 14063496,
				"file_time": {
				  "day": 26,
				  "hour": 9,
				  "time": 65063207257,
				  "year": 2024,
				  "month": 4,
				  "minute": 7,
				  "second": 37,
				  "timestamp": "2024-04-26 09:07:37"
				},
				"file_exist": true
			  },
			  {
				"quality": "original",
				"extension": "jpg",
				"file_name": "test85_test3_1.jpg",
				"file_path": "/pdf/original/0/test85_test3_1.jpg",
				"file_size": 829427,
				"file_time": {
				  "day": 26,
				  "hour": 9,
				  "time": 65063207269,
				  "year": 2024,
				  "month": 4,
				  "minute": 7,
				  "second": 49,
				  "timestamp": "2024-04-26 09:07:49"
				},
				"file_exist": true
			  },
			  {
				"quality": "web",
				"extension": "pdf",
				"file_name": "test85_test3_1.pdf",
				"file_path": "/pdf/web/0/test85_test3_1.pdf",
				"file_size": 14063496,
				"file_time": {
				  "day": 26,
				  "hour": 9,
				  "time": 65063207258,
				  "year": 2024,
				  "month": 4,
				  "minute": 7,
				  "second": 38,
				  "timestamp": "2024-04-26 09:07:38"
				},
				"file_exist": true
			  },
			  {
				"quality": "web",
				"extension": "jpg",
				"file_name": "test85_test3_1.jpg",
				"file_path": "/pdf/web/0/test85_test3_1.jpg",
				"file_size": 829427,
				"file_time": {
				  "day": 26,
				  "hour": 9,
				  "time": 65063207263,
				  "year": 2024,
				  "month": 4,
				  "minute": 7,
				  "second": 43,
				  "timestamp": "2024-04-26 09:07:43"
				},
				"file_exist": true
			  },
			  {
				"quality": "thumb",
				"extension": "jpg",
				"file_name": "test85_test3_1.jpg",
				"file_path": "/pdf/thumb/0/test85_test3_1.jpg",
				"file_size": 6189,
				"file_time": {
				  "day": 26,
				  "hour": 9,
				  "time": 65063207270,
				  "year": 2024,
				  "month": 4,
				  "minute": 7,
				  "second": 50,
				  "timestamp": "2024-04-26 09:07:50"
				},
				"file_exist": true
			  }
			],
			"original_file_name": "web2.pdf",
			"original_upload_date": {
			  "day": 26,
			  "hour": 9,
			  "time": 65063207258,
			  "year": 2024,
			  "month": 4,
			  "minute": 7,
			  "second": 38
			},
			"original_normalized_name": "test85_test3_1.pdf"
		}

		return [value]
	}//end random_pdf_data



	export const random_svg_data = function() {

		const value =
		{
			"files_info": [
			  {
				"quality": "original",
				"extension": "svg",
				"file_name": "test177_test3_1.svg",
				"file_path": "/svg/original/0/test177_test3_1.svg",
				"file_size": 859,
				"file_time": {
				  "day": 26,
				  "hour": 9,
				  "time": 65063207142,
				  "year": 2024,
				  "month": 4,
				  "minute": 5,
				  "second": 42,
				  "timestamp": "2024-04-26 09:05:42"
				},
				"file_exist": true
			  },
			  {
				"quality": "web",
				"extension": "svg",
				"file_name": "test177_test3_1.svg",
				"file_path": "/svg/web/0/test177_test3_1.svg",
				"file_size": 859,
				"file_time": {
				  "day": 26,
				  "hour": 9,
				  "time": 65063207142,
				  "year": 2024,
				  "month": 4,
				  "minute": 5,
				  "second": 42,
				  "timestamp": "2024-04-26 09:05:42"
				},
				"file_exist": true
			  },
			  {
				"quality": "thumb",
				"extension": "jpg",
				"file_name": "test177_test3_1.jpg",
				"file_path": "/svg/thumb/0/test177_test3_1.jpg",
				"file_size": 4384,
				"file_time": {
				  "day": 26,
				  "hour": 9,
				  "time": 65063207148,
				  "year": 2024,
				  "month": 4,
				  "minute": 5,
				  "second": 48,
				  "timestamp": "2024-04-26 09:05:48"
				},
				"file_exist": true
			  }
			],
			"original_file_name": "circle-radiation.svg",
			"original_upload_date": {
			  "day": 26,
			  "hour": 9,
			  "time": 65063207142,
			  "year": 2024,
			  "month": 4,
			  "minute": 5,
			  "second": 42
			},
			"original_normalized_name": "test177_test3_1.svg"
		}

		return [value]
	}//end random_svg_data



// @license-end
