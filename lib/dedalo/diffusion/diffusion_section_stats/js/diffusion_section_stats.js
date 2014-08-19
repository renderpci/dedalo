/*
includeScript( DEDALO_ROOT_WEB + '/lib/nvd3/lib/d3.v3.js');
includeScript( DEDALO_ROOT_WEB + '/lib/nvd3/nv.d3.js');

//includeScript( DEDALO_ROOT_WEB + '/lib/nvd3/src/models/pieChart.js');
includeScript( DEDALO_ROOT_WEB + '/lib/nvd3/src/models/discreteBarChart.js');
includeScript( DEDALO_ROOT_WEB + '/lib/nvd3/src/models/multiBarHorizontalChart.js');

includeScript( DEDALO_ROOT_WEB + '/lib/nvd3/src/utils.js');
includeScript( DEDALO_ROOT_WEB + '/lib/nvd3/src/models/axis.js');
includeScript( DEDALO_ROOT_WEB + '/lib/nvd3/src/tooltip.js');
includeScript( DEDALO_ROOT_WEB + '/lib/nvd3/src/models/legend.js');
*/

/**
* DIFFUSION_SECTION_STATS CLASS
*/
var diffusion_section_stats = new function() {

	this.titulo_chart_text ;


	/**
	* BUILD_CHARTS
	*/
	this.build_charts = function (matrix_stats_json) {

		if(matrix_stats_json==null) return;

		//window.onload = function() {
			var i=0;

			// Iterate final array
			$.each(matrix_stats_json, function(titulo_chart, ar_value) {
			    
			    //console.log(ar_value);

			    var char_name 			= 'char_'+ i++;	    
			    var titulo_chart_text 	= titulo_chart.split(':')[0];
			    var graphic_type 		= titulo_chart.split(':')[1];	//alert(graphic_type)

			    diffusion_section_stats.titulo_chart_text = titulo_chart_text;

			    //$( "#stats_container" )
			    //.append( '<div class="titulo_chart">'+titulo_chart_text+'</div>' ); 
			    //.append( '<svg id="'+ char_name +'" class="mypiechart"></svg>' );

			    var $new_div 		= $( "<div class='wrap_stats_graphic' id='wrap_stats_"+i+"'/>" ),
				  	title_div 		= '<div class="titulo_chart">'+titulo_chart_text+'</div>',
				  	svg_element 	= '<svg class="chart '+graphic_type+'" id="'+ char_name +'"></svg>';
				 
				$( "#stats_container" ).append( $new_div );
				$( $new_div ).append( title_div, svg_element );
			   
			    // Map array as x:key, y:value
			    var current_dato = $.map(ar_value, function(current_valor, current_key) {
			    	return { x:current_key, y:current_valor }
			    })
			    //console.log(current_dato)
			    
			    // Build specific chart
			    $(document).ready(function() {
			    diffusion_section_stats[graphic_type]( current_dato, char_name );
				});
			});
		//}//end window.onload = function()

	}//end build_charts



	/**
	* STATS_PIE
	*/
	this.stats_pie = function(current_dato, chart_id) {

		var dato = [
	    	{
	    		key: "stats_pie",
	    		values: current_dato
	    	}
	    ];

		var chartOptions = {
			delay: 100
		}

		// NV GRAPH
	    nv.addGraph(function() {
		    var width  = 700,
		        height = 600;

		    var chart = nv.models.pieChart()
		        .x(function(d) { return d.x })
		        .y(function(d) { return d.y })	      
		        .color(d3.scale.category20().range())
		        //.width(width)
		        //.height(height)
		        .showLegend(true)
		        .donut(false)
		        .pieLabelsOutside(true)
		        .labelThreshold(.01)
		        .tooltips(true)
		        .options(chartOptions);		        
		        //.tooltipContent(function(a){ 
		        //			//console.log(d);
		        //			return a 
		        //		});		    	

		      d3.select("#"+ chart_id )
		          .datum(current_dato)
		          .transition().duration(1200)
		          .attr('width', width)
		          .attr('height', height)
		          .call(chart);

		    chart.dispatch.on('stateChange', function(e) { nv.log('New State:', JSON.stringify(e)); });

			return chart;
		});
	}//end stats_pie

	

	/**
	* STATS_BAR
	*/
	this.stats_bar = function(current_dato, chart_id) {
	
	    var dato = [
	    	{
	    		key: "stats_bar",
	    		values: current_dato
	    	}
	    ];
		//console.log(dato)

		var chartOptions = {
			delay: 100
		}
		
	    // NV GRAPH
		nv.addGraph(function() {  
		  var chart = nv.models.discreteBarChart()
		      .x(function(d) { return d.x })
		      .y(function(d) { return d.y })
		      .staggerLabels(true)
		      .tooltips(false)
		      .showValues(true)
		      //.transitionDuration(250)
		      .options(chartOptions);

		  d3.select('#' + chart_id )
		      .datum(dato)
		      .transition().duration(500)
		      .call(chart);

		  nv.utils.windowResize(chart.update);

		  return chart;
		});

	}//end stats_bar



	/**
	* STATS_BAR_HORIZONTAL
	*/
	this.stats_bar_horizontal = function(current_dato, chart_id) {
	
	    var dato = [
	    	{
	    		key: current_dato[0].x,
	    		values: current_dato
	    	}
	    ];
		console.log(current_dato)

		// NV GRAPH
		nv.addGraph(function() {
		  var chart = nv.models.multiBarHorizontalChart()
		      .x(function(d) { return d.x })
		      .y(function(d) { return d.y })
		      //.margin({top: 30, right: 20, bottom: 50, left: 175})
		      .showValues(true)
		      .tooltips(false)
		      .showControls(false);

		  chart.yAxis
		      .tickFormat(d3.format(',.2f'));

		  d3.select('#' + chart_id )
		      .datum(dato)
			  .transition().duration(500)
		      .call(chart);

		  nv.utils.windowResize(chart.update);

		  return chart;
		});
	}//end stats_bar_horizontal



	this.hide_stats_content = function( button_obj ) {
		$('#stats_info').hide();
		//$(button_obj).hide(0);
		$('DIV.main_list').fadeIn(150, function() {
			$('.tm_list_wrap').show();
			$('#stats_info').remove();	
		});					
		
	}

};//end class