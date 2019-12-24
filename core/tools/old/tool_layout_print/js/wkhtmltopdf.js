function subst() {

	var vars={};
	var x=window.location.search.substring(1).split('&');
		//console.log(x);
	for (var i in x) {var z=x[i].split('=',2);vars[z[0]] = unescape(z[1]);}
	var x=['frompage','topage','page','webpage','section','subsection','subsubsection'];
	for (var i in x) {
		var current_name = 'var_pdf_'+x[i];
	  	var y = document.getElementsByClassName(current_name);
	  	//console.log('var_pdf_'+x[i]);
	  	//console.log(y);
	  for (var j=0; j<y.length; ++j) {
	  		//console.log(vars[x[i]]);
	  		y[j].textContent = vars[x[i]];
	  }
	}
}
subst() 