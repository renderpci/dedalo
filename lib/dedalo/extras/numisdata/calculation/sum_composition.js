var coins = new function() {

	this.sum_composition = function(options){

		const data = options.data

		const ar_sum = []
		for (let key in data) {
			if(data[key]){
				ar_sum.push(parseFloat(data[key]))
			}
		}
		
		const result = ar_sum.reduce((a,b)=>a+b)

		return result
	}

}