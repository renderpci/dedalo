import {component_date} from '../../component_date/js/component_date.js'



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
			"text" 	 : random_string(64),
			"number" : random_number()
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

	// export const custom_locator() {
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
		let day		= random_number(30) || 1
		let month	= random_number(12) || 1
		let year	= random_number(2022) || 1
		const time	= convert_date_to_seconds({
			day		: day,
			month	: month,
			year	: year
		}, 'date')

		const value =  {
			start : {
				year	: year,
				month	: month,
				day		: day,
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

		const result = [{
			alt		: alt,
			lat		: lat,
			lon		: lon,
			zoom	: zoom
		}]

		return result;
	}

	export const random_image_data = function() {
		const result = [
		 {
		  "original_file_name": "rsc29_rsc170_179_deleted_2022-02-11_1347.jpg",
		  "original_upload_date": {
		   "day": random_number(30) || 1,
		   "hour": random_number(23) || 12,
		   "time": random_number(64997809699),
		   "year": random_number(2022) || 1,
		   "month": random_number(12) || 1,
		   "minute": random_number(59) || 1,
		   "second": random_number(59) || 1
		  }
		 }
		]

		return result
	}

	export const random_iri_data = function() {
		const result = {
			iri		: "https://www." + random_string(64) + '-' + random_string(50) +  '.' + random_string(3),
			title	: random_string(128)
		}
		return result;
	}

	export const random_pdf_data = function() {
		const result = {
			section_id : (random_number(50) || 1).toString(),
			section_tipo : "rsc170",
			component_tipo : "rsc74",
			original_file_name : "rsc209_rsc205_" + (random_number(500) || 36).toString() + "_lg-spa.pdf",
			original_upload_date : {
				day : random_number(30) || 1,
				hour : random_number(23) || 1,
				time : random_number(64983057555) || 1,
				year : random_number(2022) || 1,
				month : random_number(12) || 1,
				minute : 19,
				second : 15
			}
		}

		return result
	}

	export const random_security_access = function() {
		const result = [{
			tipo			: "mupi23",
			value			: random_number(10000) || 1,
			section_tipo	: "mupi2"
		},
		{
			tipo			: "oh15",
			value			: random_number(10000) || 1,
			section_tipo	: "oh1"
		}]
		return result
	}
