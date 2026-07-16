// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

/**
* EXPRESSOS
* Client-side calculation singleton for the mdcat widget.
*
* Mirrors the server-side formulas defined in mdcat.php (same directory) so
* that the browser can render intermediate results without an extra round-trip.
* The three exported methods cover:
*   - Human-readable period formatting from a raw day count (calculate_period)
*   - Major-injury insurance premium calculation (calculate_import_major)
*   - Minor-injury insurance premium calculation (calculate_import_minor)
*
* The object is exposed as `var expressos` (a constructor called with `new`) so
* that `this` inside the constructor body works as a property-assignment
* namespace. Callers reference e.g. `expressos.calculate_period(options)`.
*
* Monetary thresholds (150 000, 1 000 000, 900, 6 010 pesetas/cents) and the
* rate steps (28 000 / month major, 170 / month minor) are domain-specific
* Social Security contribution rules encoded as literal constants; no external
* configuration is read.
*
* (!) `get_label` is consumed via bracket notation (e.g. `get_label['year']`)
* but is neither imported nor declared in a `/*global*\/` directive at the top
* of this file. It is a page-level browser global initialised by
* core/page/js/index.js (`window.get_label = {}`). This creates an implicit
* dependency; see FLAGS section below.
*/
var expressos = new function() {

	/**
	* CALCULATE_PERIOD
	* Convert a raw day count into a localised human-readable period string such
	* as "2 years, 3 months, 15 days".
	*
	* The algorithm decomposes `total_days` using a fixed month length of 30.42
	* days (the same constant used by the PHP twin). The caller controls which
	* unit groups appear in the output and whether labels and/or totals
	* (cumulative) values are used.
	*
	* Breakdown logic:
	*   years       = floor(total_days / 365)
	*   years_days  = total_days - years * 365  (remainder after full years)
	*   months      = floor(years_days / 30.42) (months within the remainder)
	*   days        = floor(years_days - months * 30.42)
	*   total_months = floor(total_days / 30.42) (cumulative; used when options.total is true)
	*
	* Each non-zero unit is pushed into `period[]` only when its corresponding
	* flag (options.years / options.months / options.days) is true.
	*
	* When `options.label` is true the entry is a localised string such as
	* "2 years"; otherwise it is the bare number. Singular/plural label keys
	* used: "anyo"/"anyos", "mes"/"meses", "dia"/"dias".
	*
	* When `options.total` is true for months, `total_months` (cumulative
	* across the full period) replaces the within-year `months` value.
	* Similarly for days, `total_days` replaces the within-month `days` value.
	*
	* @param {Object} options - configuration object
	* @param {Object} options.data - data container
	* @param {number} options.data.total_days - total duration expressed in days
	* @param {boolean} [options.years=false] - include the years component
	* @param {boolean} [options.months=false] - include the months component
	* @param {boolean} [options.days=false] - include the days component
	* @param {boolean} [options.label=false] - when true append the localised unit label
	* @param {boolean} [options.total=false] - when true use cumulative totals instead of per-unit remainders
	* @returns {string} comma-joined period string, e.g. "1 year, 4 months, 3 days"
	*/
	this.calculate_period = function(options){

		const data = options.data
		const total_days = data.total_days

		const years 		= Math.floor(total_days / 365)
		const years_days 	= total_days - (years * 365)
		let total_months 	= Math.floor(total_days / 30.42)

		let months 	= 0;
		let days 	= 0;

		months 		= Math.floor(years_days / 30.42)
		days 		= Math.floor(years_days - (months * 30.42))

		let period = []


		if(years > 0 && options.years === true){
			const year_label = years == 1 ? get_label['year'] : get_label['years']
			const year_value = (options.label===true) ? years + ' ' + year_label : years
			period.push(year_value)
		}

		if(months > 0 && options.months === true){
			const months_label = months == 1 ? get_label['month'] : get_label['months']
			let months_value = ""
			if(options.total === true){
				// Use cumulative total months across the whole period (ignores year boundary).
				months_value = (options.label===true) ? total_months + ' ' + months_label : total_months
			}else{
				// Use months within the current year remainder only.
				months_value = (options.label===true) ? months + ' ' + months_label : months
			}
			period.push(months_value)
		}

		if(days > 0 && options.days === true){
			const days_label = days == 1 ? get_label['day'] : get_label['days']
			let days_value = ""
			if(options.total === true){
				// Use the raw total_days rather than the within-month remainder.
				days_value = (options.label===true) ? total_days + ' ' + days_label : total_days
			}else{
				days_value = (options.label===true) ? days + ' ' + days_label : days

			}
			period.push(days_value)
		}

		const result = period.join(', ')


		return result

	}

	/**
	* CALCULATE_IMPORT_MAJOR
	* Compute the major-injury insurance premium (in pesetas/cents) for a given
	* employment duration.
	*
	* Rate table (matches the PHP twin):
	*   Duration ≤ 6 months  → flat fee of 150 000
	*   Duration > 6 months  → 150 000 + (total_months - 6) × 28 000 per additional month
	*   Maximum cap          → 1 000 000
	*
	* Fractional months are rounded up: if the day remainder after full months is
	* > 0, total_months is incremented by 1 before applying the rate table.
	*
	* A `total_days` of 0 (no employment) immediately returns 0 — no calculation
	* is performed.
	*
	* Note: `years` and `years_days` are derived but not used in the final
	* computation; they are intermediate values kept for structural parity with
	* the PHP original.
	*
	* @param {Object} options - configuration object
	* @param {Object} options.data - data container
	* @param {number} options.data.total_days - total employment duration in days
	* @returns {number} calculated premium amount (pesetas/cents), 0 when total_days is 0
	*/
	this.calculate_import_major = function(options){

		const data = options.data
		const total_days = data.total_days
		if(total_days === 0){
			return 0
		}

		const years 		= Math.floor(total_days / 365)
		const years_days 	= total_days - (years * 365)
		let total_months 	= Math.floor(total_days / 30.42)

		// Days remaining after rounding down to whole months (note: slightly different
		// divisor 30.4 vs 30.42 used here vs the month count above — matches PHP verbatim).
		const days 			= Math.floor(total_days - (total_months * 30.4))

		let cal_import = 0


		// Round up to the next full month when a day remainder exists.
		if(days > 0){
			total_months = total_months + 1
		}
		if(total_months <= 6){
			cal_import = 150000
		}else{
			cal_import = ((total_months - 6) * 28000) +150000
		}
		// Apply upper cap.
		if (cal_import > 1000000) {
			cal_import = 1000000
		}

		const result = cal_import

		return result
	}

	/**
	* CALCULATE_IMPORT_MINOR
	* Compute the minor-injury insurance premium (in pesetas/cents) for a given
	* employment duration.
	*
	* Rate table (matches the PHP twin):
	*   Duration ≤ 6 months  → flat fee of 900
	*   Duration > 6 months  → 900 + (total_months - 6) × 170 per additional month
	*   Maximum cap          → 6 010
	*
	* Fractional months are rounded up identically to calculate_import_major:
	* if the day remainder is > 0, total_months is incremented by 1.
	*
	* A `total_days` of 0 immediately returns 0.
	*
	* Note: `years` and `years_days` are derived but not used in the final
	* computation; they are intermediate values kept for structural parity with
	* the PHP original.
	*
	* @param {Object} options - configuration object
	* @param {Object} options.data - data container
	* @param {number} options.data.total_days - total employment duration in days
	* @returns {number} calculated premium amount (pesetas/cents), 0 when total_days is 0
	*/
	this.calculate_import_minor = function(options){

		const data = options.data
		const total_days = data.total_days
		if(total_days === 0){
			return 0
		}

		const years 		= Math.floor(total_days / 365)
		const years_days 	= total_days - (years * 365)
		let total_months 	= Math.floor(total_days / 30.42)

		// Days remaining after rounding down to whole months (note: slightly different
		// divisor 30.4 vs 30.42 used here vs the month count above — matches PHP verbatim).
		const days 			= Math.floor(total_days - (total_months * 30.4))


		let cal_import = 0

		// Round up to the next full month when a day remainder exists.
		if(days > 0){
			total_months = total_months + 1
		}
		if(total_months <= 6){
			cal_import = 900
		}else{
			cal_import = ((total_months - 6) * 170) +900
		}
		// Apply upper cap.
		if (cal_import > 6010) {
			cal_import = 6010
		}

		const result = cal_import

		return result
	}


}



// @license-end
