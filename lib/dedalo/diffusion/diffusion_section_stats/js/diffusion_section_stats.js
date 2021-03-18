/**
* DIFFUSION_SECTION_STATS CLASS
*
*
*
*/
var diffusion_section_stats = new function() {

	this.titulo_chart_text ;


	/**
	* BUILD_CHARTS
	* Build every stats charts from json object received
	* Example schema (JSON)
	[ 
	  {
	    key: 'Series1',
	    values: [
	      { 
	        "label" : "Group A" ,
	        "value" : -1.8746444827653
	      } , 
	      { 
	        "label" : "Group B" ,
	        "value" : -8.0961543492239
	      }
	    ]
	  }
	]
	*/
	this.build_charts = function (ar_value_stats_json, key) {
		//console.log(ar_value_stats_json);//return;		
		if(ar_value_stats_json==null || typeof ar_value_stats_json != 'object') {
			if(SHOW_DEBUG===true) { console.warn("build_charts: Empty 'ar_value_stats_json' received"); };
			return false;
		}

		const chart_id			= 'char_'+ key
		const title_chart_text	= ar_value_stats_json.title
		const graph_type		= ar_value_stats_json.graph_type
		const current_data		= ar_value_stats_json.data
			//console.log(current_data); console.log(current_data2); return false;
			//console.log(current_data); return false;
			
		const new_div		= $("<div class='wrap_stats_graphic' id='wrap_stats_"+key+"'/>")
		const title_div		= '<div class="titulo_chart">'+title_chart_text+'</div>'
		const svg_element	= '<svg class="chart '+graph_type+'" id="'+ chart_id +'"></svg>'
		const info_button	= '<div class="icon_bs info_button" onclick="diffusion_section_stats.toggle_info(this)"></div>'
			 
			//$( "#stats_container" ).append( new_div );
			$( "#current_stats_item_"+key ).prepend( new_div );
			$( new_div ).append( title_div, svg_element, info_button );

		// Build specific chart
			const node_new_div = document.getElementById('wrap_stats_'+key)

			const observer = new IntersectionObserver(function(entries) {
				// if(entries[0].isIntersecting === true) {}
				const entry = entries[0]
				if (entry.isIntersecting===true || entry.intersectionRatio > 0) {
					
					$(function() {
						if (typeof diffusion_section_stats[graph_type] != 'function') {
							console.log("build_charts graph_type is invalid:" + graph_type);
							if(SHOW_DEBUG===true) {
								alert("build_charts graph_type is invalid:" + graph_type)
							}
							return;
						};
						diffusion_section_stats[graph_type]( current_data, chart_id );
					});

					// observer.unobserve(entry.target);
					observer.disconnect();
				}
			}, { threshold: [0] });

			observer.observe(node_new_div);


		return true;
	}//end build_charts



	/**
	* STATS_PIE
	* Schema sample : 
	[
	    {
	      key: "One",
	      y: 5
	    },
	    {
	      key: "Two",
	      y: 2
	    }
	]
	*/
	this.stats_pie = function(current_dato, chart_id) {

		if (!current_dato) return;
		
	    var dato = current_dato[0].values;
		var chartOptions = {
			delay: 150
		}

		// Adjust height to current number of items/values
		var n = dato.length,
			h = $('#'+chart_id).height()
			//console.log(h);
		$('#'+chart_id).height(n*6)

		// NV GRAPH
		let chart;
	    nv.addGraph(function() {
		    var width  = "100%",
		        height = "100%";

		    chart = nv.models.pieChart()
				.x(function(d) { return d.x })
				.y(function(d) { return d.y })
				.valueFormat(d3.format(",.2"))
				.color(d3.scale.category20().range())
				//.width(width)
				//.height(height)
				.showLegend(true)
				.donut(false)
				.pieLabelsOutside(true)
				.labelThreshold(.025)
				.tooltips(true)
				.options(chartOptions);
				//.tooltipContent(function(a){ 
				//	//console.log(d);
				//	return a 
				// });

		      d3.select("#"+ chart_id )
		          .datum(dato)
		          .transition().duration(1200)
		          .attr('width', width)
		          .attr('height', height)
		          .call(chart);

		    nv.utils.windowResize(chart.update);
			//chart.dispatch.on('stateChange', function(e) { nv.log('New State:', JSON.stringify(e)); });

			return chart;
		});
	}//end stats_pie



	/**
	* STATS_BAR
	* Schema example:
	[ 
	  {
	    key: "Cumulative Return",
	    values: [
	      { 
	        "label" : "A" ,
	        "value" : 29.765957771107
	      } , 
	      { 
	        "label" : "B" , 
	        "value" : 0
	      }
	    ]
	  }
	]
	*/
	this.stats_bar = function(current_dato, chart_id) {

		if (!current_dato) return;
		
	    var dato = current_dato;
		var chartOptions = {
			delay: 150
		}
		
	    // NV GRAPH
	    var chart;
		nv.addGraph(function() {  
		  chart = nv.models.discreteBarChart()
		      .x(function(d) { return d.x })
		      .y(function(d) { return d.y })
		      .valueFormat(d3.format(".0f"))
		      .staggerLabels(true)
		      .tooltips(false)
		      .showValues(true)
		      .margin({left: 100})
		      //.transitionDuration(250)
		      .options(chartOptions);

		  chart.yAxis     //Chart y-axis settings
			.axisLabel('Totals')
			.tickFormat(d3.format('.0f'));

		  d3.select('#' + chart_id )
		      .datum(dato)
		      .transition().duration(500)
		      .call(chart);

		  nv.utils.windowResize(chart.update);
		  //chart.dispatch.on('stateChange', function(e) { nv.log('New State:', JSON.stringify(e)); });

		  return chart;
		});

	}//end stats_bar



	/**
	* STATS_BAR_HORIZONTAL
	* Schema example:
	[ 
	  {
	    key: 'Series1',
	    color: '#d62728',
	    values: [
	      { 
	        "label" : "Group A" ,
	        "value" : -1.8746444827653
	      } , 
	      { 
	        "label" : "Group B" ,
	        "value" : -8.0961543492239
	      }	     
	    ]
	  }
	]
	*/
	this.stats_bar_horizontal = function(current_dato, chart_id) {

		if (!current_dato) return;		

		// Adjust height to current number of items/values
		var n = current_dato[0].values.length,
			h = $('#'+chart_id).height()
			//console.log(h);
		$('#'+chart_id).height(n*25)

		var dato = current_dato;
		var chartOptions = {
			delay: 150
		}
		
		// NV GRAPH
		var chart;
		nv.addGraph(function() {
		  chart = nv.models.multiBarHorizontalChart()
		      .x(function(d) { return d.x })
		      .y(function(d) { return d.y })
		      .margin({top: 0, right: 0, bottom: 0, left: 90})
		      .valueFormat(d3.format(",.2"))
		      // .stacked(false)
		      .barColor(d3.scale.category20().range())
		      .margin({left: 220})
		      .showValues(true)
		      .showLegend(false)
		      .tooltips(true)
		      .showControls(false)
		      //.duration(250)
		      //.options(chartOptions);

		  chart.yAxis
		  	.tickFormat(d3.format(',.0f'));		  

		  d3.select('#' + chart_id )
		      .datum(dato)
		      //.transition().duration(500)
		      .call(chart)

		  nv.utils.windowResize(chart.update);
		  //chart.dispatch.on('stateChange', function(e) { nv.log('New State:', JSON.stringify(e)); });

		  return chart;
		});	
	}//end stats_bar_horizontal




	// HIDE_STATS_CONTENT
		/*
		this.hide_stats_content = function( button_obj ) {
			$('#stats_info').hide();
			//$(button_obj).hide(0);
			$('DIV.div_main_list').fadeIn(150, function() {
				$('.tm_list_wrap').show();
				$('#stats_info').remove();	
			});		
		}
		*/



	/**
	* TOGGLE_INFO
	*/
	this.toggle_info = function(button) {

		const current_stats_item = button.parentNode.parentNode
		const current_stats_item_info = current_stats_item.querySelector('.current_stats_item_info')
		
		current_stats_item_info.classList.toggle("hide")
			
		return
	}



};//end class