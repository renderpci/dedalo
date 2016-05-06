
var calendar

/**
* TOOL_CALENDAR CLASS
*/ 
var tool_calendar = new function() {

	this.trigger_url = DEDALO_LIB_BASE_URL + '/tools/tool_calendar/trigger.tool_calendar.php?top_tipo='+page_globals.top_tipo ;


	// READY
	jQuery(document).ready(function($) {
		
		//tool_calendar.load_event_record()

		calendar = $('#full_calendar').fullCalendar({
			header: {
				left: 'prev,next today',
				center: 'title',
				right: 'month,agendaWeek,agendaDay'
			},
			defaultView:'agendaWeek',
			droppable: true, // this allows things to be dropped onto the calendar
			firstDay: tool_options.firstDay,
			businessHours: tool_options.businessHours,
			weekends: tool_options.weekends,
			hiddenDays:tool_options.hiddenDays,
			allDaySlot: tool_options.allDaySlot,
			minTime: tool_options.minTime,
			maxTime: tool_options.maxTime,
			slotEventOverlap: tool_options.slotEventOverlap,
			lang: tool_options.lang,
			slotDuration:tool_options.slotDuration,
			selectable: tool_options.selectable,
			selectHelper: tool_options.selectHelper,
			editable: tool_options.editable,
			eventColor: tool_options.eventColor,
			events: {
				url: tool_calendar.trigger_url,
				type: 'POST',
				data: {
					mode: 'get_events',
					//options: JSON.stringify(tool_options.get_events_options),
					options : JSON.stringify({
										tipo 		 : page_globals.tipo,
										section_tipo : page_globals.section_tipo
										})
				},
			},
			select: function(start, end, jsEvent) {
				tool_calendar.select( start, end, jsEvent );
			},			
			eventClick: function(calEvent, jsEvent, view) {
				// EDIT event record
				tool_calendar.eventClick( calEvent );
		    },
		    eventDrop: function(calEvent, delta, revertFunc) {
		    	// Drop	event record  
		    	//console.log(delta);
		    	tool_calendar.eventDrop( calEvent, delta, revertFunc )
		    },
		    eventResize: function(calEvent,  delta, revertFunc) {
		    	// REsize	event record   	
		    	tool_calendar.eventResize( calEvent, delta, revertFunc )
		    },
		    eventRender: function(event, element) {
		    	/*
	            element.append( "<span class='closeon'>X</span>" );
	            element.find(".closeon").click(function() {
	               $('#calendar').fullCalendar('removeEvents',event._id);
	            });
				*/
	        }
		});

		//console.log( tool_options.get_events_options )
		

	});//end ready

	/**
	* SAVE_EVENT
	* @param object options
	*/
	this.save_event = function( calEvent, options ) {
		//console.log(options);
		if (typeof options === "undefined"){
				var options = {
		    		'section_id': calEvent.section_id,
		    		'start'		: calEvent.start.format(),
		    		'end'		: calEvent.end.format(),
		    		'title'		: calEvent.title,
	    	}
	    }
	    options.tipo 		 = page_globals.tipo
	    options.section_tipo = page_globals.section_tipo

		$.ajax({
			url: tool_calendar.trigger_url,
			type: 'POST',
			data: {
				mode: 'save_event',
				options : JSON.stringify(options)
			},
		})
		.done(function(response) {
			
			$('#tool_response').html(response).delay(6000).fadeOut('650',function(){
					$(this).html('').show();
				});			
			//console.log("success saved "+response);
			if(!options.section_id){
				options.section_id = response;
				calendar.fullCalendar('renderEvent', options, true);
			}
			
		})
		.fail(function() {
			console.log("error");
		})
		.always(function() {
			//console.log("complete");
		});
	}//end save_event

	/**
	* SAVE_ARRAYS_EVENTS
	* @param object options
	*/
	this.save_array_events = function( arr_events ) {
		//console.log( JSON.stringify(arr_events) );
		$.ajax({
			url: tool_calendar.trigger_url,
			type: 'POST',
			data: {
				mode: 'save_array_events',
				arr_events : JSON.stringify(arr_events),
				//options : { section_tipo : page_globals.section_tipo }
			},
		})
		.done(function(response) {
			
			$('#tool_response').html(response).delay(6000).fadeOut('650',function(){
					$(this).html('').show();
				});
			location.reload();
		})
		.fail(function() {
			console.log("error");
		})
		.always(function() {
			//console.log("complete");
		});


	}//end save_array_events

	/**
	* EDIT_EVENT_RECORD
	* Ajax load selected event at bottom of calendar to edit like normal record with all section fields
	* @param object options
	*/
	this.edit_event_record = function( calEvent ) {
			//console.log(calEvent)
		var	cancel_label = get_label.cancelar
		var	delete_label = get_label.borrar

		//var title = prompt(tool_options.select_title,calEvent.title);
		$( "#dialog_input" ).val(calEvent.title);
		$( "#dialog" ).find("span").html(tool_options.select_title);

		$( "#dialog" ).dialog({

				resizable: false,
				closeOnEscape: true,
				width:300,
				//height:150,
				modal: true,
				title: tool_options.select_title,
				buttons: [
					 		{
								text: get_label.cancelar,
								click: function() {
									$(this).dialog("close");
									}
					 		},
					 		{
					 			text: get_label.borrar,
					 			click: function() {
					 				$(this).dialog("close");
						 			tool_calendar.delete_event_record(calEvent);
				            		}
					 		},
					 		{
					 			text: "Ok",
					 			click: function() {
					 				calEvent.title = $( "#dialog_input" ).val();
					 				tool_calendar.save_event(calEvent);
					 				$(this).dialog("close");
					 				calendar.fullCalendar( 'updateEvent',calEvent)
					 				}
					 		}
					 	 ]
		});
	}//end edit_event_record



	/**
	* DELETE_EVENT_RECORD
	* Ajax load selected event at bottom of calendar to edit like normal record with all section fields
	* @param object options
	*/
	this.delete_event_record = function( calEvent ) {

		var options = {
    		'section_id' : calEvent.section_id
    	}
    	options.tipo 		 = page_globals.tipo
    	options.section_tipo = page_globals.section_tipo
    	//return 	console.log(options);

		if (!confirm(get_label.esta_seguro_de_borrar_este_registro)){
			return false
		}
		
		calendar.fullCalendar( 'removeEvents', [calEvent._id] );
		calendar.fullCalendar( 'unselect')

		$.ajax({
			url: tool_calendar.trigger_url,
			type: 'POST',
			data: {
				mode: 'delete_event_record',
				options: JSON.stringify(options),
			},
		})
		.done(function(response) {
			$('#tool_response').html(response)
			console.log("success");
		})
		.fail(function() {
			console.log("error");
		})
		.always(function() {
			console.log("complete");
		});
		
	}//end delete_event_record



	/**
	* SELECT
	*/
	this.select = function( start, end, jsEvent ) {
				//console.log(start);
				var title = prompt(tool_options.select_title);
				var eventData;
				if (title) {
					eventData = {
						title: title,
						start: start,
						end: end,
						section_id : null
					};					
					// SAVE NEW event to database (with id null)
					tool_calendar.save_event( eventData );
					//$('#full_calendar').fullCalendar('renderEvent', eventData, true); // stick? = true
				}
				$('#full_calendar').fullCalendar('unselect');
	
	}

	this.eventDrop = function( calEvent, delta, revertFunc ) {

		tool_calendar.save_event( calEvent )
	
	}
	
	this.eventResize = function( calEvent ) {

		tool_calendar.save_event( calEvent )
	
	}
	this.eventClick = function( calEvent ) {

		tool_calendar.edit_event_record( calEvent )

	
	}



	/**
	* GET_EVENTS
	* Ajax load events array
	* @param object options
	*//*
	this.get_events_DEPRECATED = function( options ) {
		$.ajax({
			url: tool_calendar.trigger_url,
			type: 'POST',
			data: {
				mode: 'get_events',
				options: JSON.stringify(options),
			},
		})
		.done(function(response) {
			$('#tool_response').html(response)
			console.log("success");
		})
		.fail(function() {
			console.log("error");
		})
		.always(function() {
			console.log("complete");
		});
	}//end get_events
	*/


	
}//end class





