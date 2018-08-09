var turnos = new function(){

	this.put_standar_events = function(){

		var view = calendar.fullCalendar( 'getView' );
		//console.log(view);
		//console.log(view.type);
		
		//console.log(view.intervalUnit);
		//console.log(view.intervalStart);
		//console.log("start:"+view.start.format());
		//console.log(view.intervalEnd);
		//console.log("end:"+view.end.format());

		var intervalStart 	= view.intervalStart;
		var intervalEnd 	= view.intervalEnd;

		var diff = intervalEnd.diff(intervalStart, 'days');

		var eventData = [];


		for (var i = 0; i < diff; i++) {
			var dateStart 	= intervalStart.clone();
			var date_base 	= dateStart.add(i,'days');
			//Turno 1
			var morning1 	= date_base.clone();
			morning1		= morning1.set({'hour': 10, 'minute': 0, 'second':0});
			var morning2 	= date_base.clone();
			morning2 		= morning2.set({'hour': 11, 'minute': 30, 'second':0});
			//Turno 2
			var morning3 	= date_base.clone();
			morning3 		= morning3.set({'hour': 12, 'minute': 0, 'second':0});
			var morning4 	= date_base.clone();
			morning4 		= morning4.set({'hour': 13, 'minute': 0, 'second':0});
			
			//Turno 3
			var evening1 	= date_base.clone();
			evening1	 	= evening1.set({'hour': 16, 'minute': 0, 'second':0});
			var evening2 	= date_base.clone();
			evening2 		= evening2.set({'hour': 17, 'minute': 0, 'second':0});

			if(morning1.isoWeekday() == 1 ||  morning1.isoWeekday() >= 6){
				continue;
			}

			//console.log("dentro:"+morning1.isoWeekday());
			eventData.push({
						title: "60",
						start: morning1.utc().format(),
						end: morning2.utc().format(),
						section_id : null,
						section_tipo: page_globals.section_tipo, 
						tipo : page_globals.tipo
					});

			eventData.push({
						title: "60",
						start: morning3.utc().format(),
						end: morning4.utc().format(),
						section_id : null,
						section_tipo: page_globals.section_tipo, 
						tipo : page_globals.tipo
						});
			eventData.push({
						title: "60",
						start: evening1.utc().format(),
						end: evening2.utc().format(),
						section_id : null,
						section_tipo: page_globals.section_tipo, 
						tipo : page_globals.tipo
						});

		};
		//console.log(eventData[0]);


		tool_calendar.save_array_events(eventData);
		
		//calendar.fullCalendar( 'addEventSource', eventData );
	}

}