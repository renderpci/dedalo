var older_eventDrop = tool_calendar.eventDrop;

tool_calendar.eventDrop = function (calEvent, delta, revertFunc) {


	//	origStartDay	= delta._data.days;
	//	origStartMs		= delta._milliseconds;

		dateStart 	= calEvent.start;
		dateEnd 	= calEvent.end;
		//Duplicate the event start and end
		var origStart 	= dateStart.clone();
		var origEnd		= dateEnd.clone();

		// substrat the delta date/time (duration of the moviment) of the clone
		origStart.subtract(delta);
		origEnd.subtract(delta);

		//new vars
		var orig_event 	='';
		var new_event 	='';

		calendar.fullCalendar('clientEvents', function(event) {
				//Event background Origen
				if(event.start <= origStart && event.end >= origEnd) {
                	if(event.rendering === 'background'){
                		orig_id_matrix_parent = event.id_matrix;
                		orig_event = event;
                		//console.log("orig_id_matrix_parent"+orig_id_matrix_parent);

                	}
                }//end Origen

                //Event background Destination
                if(event.start <= dateStart && event.end >= dateEnd) {
                	if(event.rendering === 'background'){
                		new_id_matrix_parent = event.id_matrix;
                		new_event = event;
                		//console.log("new_id_matrix_parent"+new_id_matrix_parent);
              

                			
                	}
                }//end destination

               // console.log("false");
            });
		//console.log(calEvent.start.format());
		// if the orig don't are defined the moviment are in the same background and don't change the "vacant" visites BUT is necessary save the event.
		if (typeof orig_event.title === "undefined"){
			older_eventDrop(calEvent);
			return;
		}

		//if the orig event and the destination event is the same the event only save the event
		if(parseInt(orig_event.id_matrix) === parseInt(new_event.id_matrix)){
			older_eventDrop(calEvent);
		//else compute the change
		}else{
			calEvent_persons 	= parseInt(calEvent.title);
			orig_event_persons 	= parseInt(orig_event.title);
			new_event_persons 	= parseInt(new_event.title);

			// if the event have too many persons; no is possible put into the background
			if(new_event_persons - calEvent_persons < 0){
				revertFunc();
				//console.log("return");
				return;
			}

			// Base ratio round the persons into the event to the 30 persons per group
			ratio 		= 30 * (Math.ceil(calEvent_persons / 30));
			//console.log("ratio:"+ratio);

			//change the background
			orig_event.title = orig_event_persons + ratio;
			new_event.title = new_event_persons - ratio;

			//console.log("origen:"+orig_event.title);
			//console.log("new:"+new_event.title);

			if(parseInt(orig_event.title) > 10){
				orig_event.overlap = true
				orig_event.backgroundColor = '#f1ac28'
			}else{
				orig_event.overlap = false
				orig_event.backgroundColor = '#c1c1c1'

			}

			if(parseInt(new_event.title) <= 0){
				new_event.overlap = false
				new_event.backgroundColor = '#c1c1c1'
			}


			//calendar.fullCalendar('updateEvent', orig_event);
			//calendar.fullCalendar('updateEvent', new_event);

			//calendar.fullCalendar( 'updateEvent',new_event)

			var options = {
		    		'id_matrix'		: calEvent.id_matrix,
		    		'start'			: calEvent.start.format(),
		    		'end'			: calEvent.end.format(),
		    		'title'			: calEvent.title,
		    		'id_matrix_parent'	: new_id_matrix_parent,
	    	}
			//console.log(options);
			tool_calendar.save_event(calEvent, options);
			older_eventDrop(orig_event);
			older_eventDrop(new_event);

		}
		
	}