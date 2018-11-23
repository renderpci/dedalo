var expressos = new function() {

	this.calculate_period = function(options){

		const data = options.data
		const total_days = data.total_days

		const years 		= Math.floor(total_days / 365)
		const years_days 	= total_days - (years * 365)
		const total_months 	= Math.floor(total_days / 30.42)

		let months 	= Math.floor(total_days / 30.42)
		let days 	= Math.floor(years_days - (months * 30.42))

		let period = []


		if(years > 0 && options.years === true){
			const year_label = years == 1 ? get_label["anyo"] : get_label["anyos"]
			const year_value = (options.label===true) ? years + ' ' + year_label : years
			period.push(year_value)	
		}

		if(months > 0 && options.months === true){
			const months_label = months == 1 ? get_label["mes"] : get_label["meses"]
			let months_value = ""
			if(options.total === true){
				months_value = (options.label===true) ? total_months + ' ' + months_label : total_months
			}else{
				months_value = (options.label===true) ? months + ' ' + months_label : months
			}
			period.push(months_value)	
		}

		if(days > 0 && options.days === true){
			const days_label = days == 1 ? get_label["dia"] : get_label["dias"]
			let days_value = ""
			if(options.total === true){
				days_value = (options.label===true) ? total_days + ' ' + days_label : total_days
			}else{
				days_value = (options.label===true) ? days + ' ' + days_label : days
				
			}
			period.push(days_value)	
		}

		const result = period.join(', ')


		return result

	}

	this.calculate_import_major = function(options){

		const data = options.data
		const total_days = data.total_days

		const years 		= Math.floor(total_days / 365)
		const years_days 	= total_days - (years * 365)
		let total_months 	= Math.floor(total_days / 30.42)

		let months 	= Math.floor(total_days / 30.42)
		let days 	= Math.floor(years_days - (months * 30.42))

		let cal_import = 0
		
		if(days > 0){
			total_months = total_months + 1
		}
		if(total_months <= 6){
			cal_import = 150000
		}else{
			cal_import = ((total_months - 6) * 28000) +150000
		}
		if (cal_import > 1000000) {
			cal_import = 1000000
		}
		
		const result = cal_import

		return result
	}

	this.calculate_import_minor = function(options){

		const data = options.data
		const total_days = data.total_days

		const years 		= Math.floor(total_days / 365)
		const years_days 	= total_days - (years * 365)
		let total_months 	= Math.floor(total_days / 30.42)

		let months 	= Math.floor(total_days / 30.42)
		let days 	= Math.floor(years_days - (months * 30.42))

		let cal_import = 0
		
		if(days > 0){
			total_months = total_months + 1
		}
		if(total_months <= 6){
			cal_import = 900
		}else{
			cal_import = ((total_months - 6) * 170) +900
		}
		if (cal_import > 6010) {
			cal_import = 6010
		}
		
		const result = cal_import

		return result
	}


}