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

		// const file_name = random_string(64) + '_' + random_number(99) + ''

		const value =
		  {
		    "files_info": [
		      {
		        "quality": "original",
		        "file_url": DEDALO_ROOT_WEB + "/media/media_development/3d/original/test26_test3_1.glb",
		        "file_name": "test26_test3_1.glb",
		        "file_path": page_globals.dedalo_root_path + "/media/media_development/3d/original/test26_test3_1.glb",
		        "file_size": 34165976,
		        "file_time": {
		          "day": 8,
		          "hour": 19,
		          "time": 65045618879,
		          "year": 2023,
		          "month": 10,
		          "minute": 27,
		          "second": 59,
		          "timestamp": "2023-10-08 19:27:59"
		        },
		        "file_exist": true
		      },
		      {
		        "quality": "web",
		        "file_url": DEDALO_ROOT_WEB + "/media/media_development/3d/web/test26_test3_1.glb",
		        "file_name": "test26_test3_1.glb",
		        "file_path": page_globals.dedalo_root_path + "/media/media_development/3d/web/test26_test3_1.glb",
		        "file_size": 34165976,
		        "file_time": {
		          "day": 8,
		          "hour": 19,
		          "time": 65045618879,
		          "year": 2023,
		          "month": 10,
		          "minute": 27,
		          "second": 59,
		          "timestamp": "2023-10-08 19:27:59"
		        },
		        "file_exist": true
		      }
		    ]
		  }

		return [value]
	}

	export const random_av_data = function() {

		// const file_name = random_string(64) + '_' + random_number(99) + ''

		const value =
		  {
            "files_info": [
              {
                "quality": "original",
                "file_url": DEDALO_ROOT_WEB + "/media/media_development/av/original/test94_test3_1.mp4",
                "file_name": "test94_test3_1.mp4",
                "file_path": page_globals.dedalo_root_path + "/media/media_development/av/original/test94_test3_1.mp4",
                "file_size": 9159390,
                "file_time": {
                  "day": 8,
                  "hour": 19,
                  "time": 65045620565,
                  "year": 2023,
                  "month": 10,
                  "minute": 56,
                  "second": 5,
                  "timestamp": "2023-10-08 19:56:05"
                },
                "file_exist": true
              },
              {
                "quality": "1080",
                "file_url": null,
                "file_name": null,
                "file_path": null,
                "file_size": null,
                "file_time": null,
                "file_exist": false
              },
              {
                "quality": "720",
                "file_url": null,
                "file_name": null,
                "file_path": null,
                "file_size": null,
                "file_time": null,
                "file_exist": false
              },
              {
                "quality": "576",
                "file_url": null,
                "file_name": null,
                "file_path": null,
                "file_size": null,
                "file_time": null,
                "file_exist": false
              },
              {
                "quality": "404",
                "file_url": DEDALO_ROOT_WEB + "/media/media_development/av/404/test94_test3_1.mp4",
                "file_name": "test94_test3_1.mp4",
                "file_path": page_globals.dedalo_root_path + "/media/media_development/av/404/test94_test3_1.mp4",
                "file_size": 9144810,
                "file_time": {
                  "day": 8,
                  "hour": 19,
                  "time": 65045620568,
                  "year": 2023,
                  "month": 10,
                  "minute": 56,
                  "second": 8,
                  "timestamp": "2023-10-08 19:56:08"
                },
                "file_exist": true
              },
              {
                "quality": "240",
                "file_url": DEDALO_ROOT_WEB + "/media/media_development/av/240/test94_test3_1.mp4",
                "file_name": "test94_test3_1.mp4",
                "file_path": page_globals.dedalo_root_path + "/media/media_development/av/240/test94_test3_1.mp4",
                "file_size": 3753529,
                "file_time": {
                  "day": 3,
                  "hour": 11,
                  "time": 65034444190,
                  "year": 2023,
                  "month": 6,
                  "minute": 23,
                  "second": 10,
                  "timestamp": "2023-06-03 11:23:10"
                },
                "file_exist": true
              },
              {
                "quality": "audio",
                "file_url": null,
                "file_name": null,
                "file_path": null,
                "file_size": null,
                "file_time": null,
                "file_exist": false
              }
            ]
          }

		return [value]
	}

	export const random_image_data = function() {

		// const file_name = random_string(64) + '_' + random_number(99) + ''

		const value =
		  {
		    "files_info": [
		      {
		        "quality": "original",
		        "file_url": DEDALO_ROOT_WEB + "/media/media_development/image/original/0/test99_test3_1.jpg",
		        "file_name": "test99_test3_1.jpg",
		        "file_path": page_globals.dedalo_root_path + "/media/media_development/image/original/0/test99_test3_1.jpg",
		        "file_size": 2031,
		        "file_time": {
		          "day": 8,
		          "hour": 20,
		          "time": 65045620919,
		          "year": 2023,
		          "month": 10,
		          "minute": 1,
		          "second": 59,
		          "timestamp": "2023-10-08 20:01:59"
		        },
		        "file_exist": true
		      },
		      {
		        "quality": "modified",
		        "file_url": null,
		        "file_name": null,
		        "file_path": null,
		        "file_size": null,
		        "file_time": null,
		        "file_exist": false
		      },
		      {
		        "quality": "100MB",
		        "file_url": null,
		        "file_name": null,
		        "file_path": null,
		        "file_size": null,
		        "file_time": null,
		        "file_exist": false
		      },
		      {
		        "quality": "50MB",
		        "file_url": null,
		        "file_name": null,
		        "file_path": null,
		        "file_size": null,
		        "file_time": null,
		        "file_exist": false
		      },
		      {
		        "quality": "25MB",
		        "file_url": null,
		        "file_name": null,
		        "file_path": null,
		        "file_size": null,
		        "file_time": null,
		        "file_exist": false
		      },
		      {
		        "quality": "6MB",
		        "file_url": DEDALO_ROOT_WEB + "/media/media_development/image/6MB/0/test99_test3_1.jpg",
		        "file_name": "test99_test3_1.jpg",
		        "file_path": page_globals.dedalo_root_path + "/media/media_development/image/6MB/0/test99_test3_1.jpg",
		        "file_size": 276116,
		        "file_time": {
		          "day": 8,
		          "hour": 12,
		          "time": 65045593073,
		          "year": 2023,
		          "month": 10,
		          "minute": 17,
		          "second": 53,
		          "timestamp": "2023-10-08 12:17:53"
		        },
		        "file_exist": true
		      },
		      {
		        "quality": "3MB",
		        "file_url": null,
		        "file_name": null,
		        "file_path": null,
		        "file_size": null,
		        "file_time": null,
		        "file_exist": false
		      },
		      {
		        "quality": "2MB",
		        "file_url": null,
		        "file_name": null,
		        "file_path": null,
		        "file_size": null,
		        "file_time": null,
		        "file_exist": false
		      },
		      {
		        "quality": "1.5MB",
		        "file_url": DEDALO_ROOT_WEB + "/media/media_development/image/1.5MB/0/test99_test3_1.jpg",
		        "file_name": "test99_test3_1.jpg",
		        "file_path": page_globals.dedalo_root_path + "/media/media_development/image/1.5MB/0/test99_test3_1.jpg",
		        "file_size": 2320,
		        "file_time": {
		          "day": 8,
		          "hour": 20,
		          "time": 65045620919,
		          "year": 2023,
		          "month": 10,
		          "minute": 1,
		          "second": 59,
		          "timestamp": "2023-10-08 20:01:59"
		        },
		        "file_exist": true
		      },
		      {
		        "quality": "<1MB",
		        "file_url": null,
		        "file_name": null,
		        "file_path": null,
		        "file_size": null,
		        "file_time": null,
		        "file_exist": false
		      },
		      {
		        "quality": "thumb",
		        "file_url": DEDALO_ROOT_WEB + "/media/media_development/image/thumb/0/test99_test3_1.jpg",
		        "file_name": "test99_test3_1.jpg",
		        "file_path": page_globals.dedalo_root_path + "/media/media_development/image/thumb/0/test99_test3_1.jpg",
		        "file_size": 740,
		        "file_time": {
		          "day": 8,
		          "hour": 20,
		          "time": 65045620920,
		          "year": 2023,
		          "month": 10,
		          "minute": 2,
		          "second": 0,
		          "timestamp": "2023-10-08 20:02:00"
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
	}

	export const random_pdf_data = function() {

		// const file_name = 'test177_test3_1.pdf' // random_string(64) + '_' + random_number(99) + ''

		const value =
		  {
		    "files_info": [
		      {
		        "quality": "original",
		        "file_url": DEDALO_ROOT_WEB + "/media/media_development/pdf/original/test85_test3_1.pdf",
		        "file_name": "test85_test3_1.pdf",
		        "file_path": page_globals.dedalo_root_path + "/media/media_development/pdf/original/test85_test3_1.pdf",
		        "file_size": 4288553,
		        "file_time": {
		          "day": 8,
		          "hour": 20,
		          "time": 65045621209,
		          "year": 2023,
		          "month": 10,
		          "minute": 6,
		          "second": 49,
		          "timestamp": "2023-10-08 20:06:49"
		        },
		        "file_exist": true
		      },
		      {
		        "quality": "web",
		        "file_url": DEDALO_ROOT_WEB + "/media/media_development/pdf/web/test85_test3_1.pdf",
		        "file_name": "test85_test3_1.pdf",
		        "file_path": page_globals.dedalo_root_path + "/media/media_development/pdf/web/test85_test3_1.pdf",
		        "file_size": 4288553,
		        "file_time": {
		          "day": 8,
		          "hour": 20,
		          "time": 65045621209,
		          "year": 2023,
		          "month": 10,
		          "minute": 6,
		          "second": 49,
		          "timestamp": "2023-10-08 20:06:49"
		        },
		        "file_exist": true
		      }
		    ]
		  }

		return [value]
	}

	export const random_svg_data = function() {

		const file_name = 'test177_test3_1' //  random_string(64) + '_' + random_number(99) + ''

		// des
			// const file_size = random_number(3000) || 1

			// const date		= random_date().start
			// const month		= String(date.month).padStart(2, '0');
			// const day		= String(date.day).padStart(2, '0');
			// date.timestamp	= `${date.year}-${month}-${day} 01:01:01`

			// const date = {
	        //     "year": 2023,
	        //     "month": 6,
	        //     "day": 2,
	        //     "hour": 17,
	        //     "minute": 27,
	        //     "second": 54,
	        //     "time": 65034379674,
	        //     "timestamp": "2023-06-02 17:27:54"
	        // }

			// const value =
			// {
			//   "lib_data": null,
			//   "files_info": [
			//     {
			//       "quality": "original",
			//       "file_exist": true,
			//       "file_name": `${file_name}.svg`,
			//       "file_path": page_globals.dedalo_root_path + `/media/media_development/svg/original/${file_name}.svg`,
			//       "file_url": DEDALO_ROOT_WEB + `/media/media_development/svg/original/${file_name}.svg`,
			//       "file_size": file_size,
			//       "file_time": date
			//     },
			//     {
			//       "quality": "web",
			//       "file_exist": true,
			//       "file_name": `${file_name}.svg`,
			//       "file_path": page_globals.dedalo_root_path + `/media/media_development/svg/web/${file_name}.svg`,
			//       "file_url": DEDALO_ROOT_WEB + `/media/media_development/svg/web/${file_name}.svg`,
			//       "file_size": file_size,
			//       "file_time": date
			//     }
			//   ]
			// }

		const value = {
		  "lib_data": null,
		  "files_info": [
		    {
		      "quality": "original",
		      "file_exist": true,
		      "file_name": "test177_test3_1.svg",
		      "file_path": page_globals.dedalo_root_path + `/media/media_development/svg/original/${file_name}.svg`,
		      "file_url": DEDALO_ROOT_WEB + `/media/media_development/svg/original/${file_name}.svg`,
		      "file_size": 1275,
		      "file_time": {
		        "year": 2023,
		        "month": 6,
		        "day": 2,
		        "hour": 17,
		        "minute": 27,
		        "second": 54,
		        "time": 65034379674,
		        "timestamp": "2023-06-02 17:27:54"
		      }
		    },
		    {
		      "quality": "web",
		      "file_exist": true,
		      "file_name": "test177_test3_1.svg",
		      "file_path": page_globals.dedalo_root_path + `/media/media_development/svg/web/${file_name}.svg`,
		      "file_url": DEDALO_ROOT_WEB + `/media/media_development/svg/web/${file_name}.svg`,
		      "file_size": 1275,
		      "file_time": {
		        "year": 2023,
		        "month": 6,
		        "day": 2,
		        "hour": 17,
		        "minute": 27,
		        "second": 54,
		        "time": 65034379674,
		        "timestamp": "2023-06-02 17:27:54"
		      }
		    }
		  ]
		}

		return [value]
	}



// @license-end
