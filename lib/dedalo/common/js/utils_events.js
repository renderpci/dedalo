export const event_manager = function(){

    this.events = {};

    this.subscribe = function(event, callback) {

        if (!this.events.hasOwnProperty(event)) {
            this.events[event] = [];
        }

    console.log("event:",event);
        return this.events[event].push(callback);
    }

     this.unsubscribe = function(event, callback) {

        if (!this.events.hasOwnProperty(event)) {
            this.events[event] = [];
        }

       return this.events[event].splice( this.events[event].indexOf(callback), 1 );
    }

    this.publish = function(event, data = {}) {

        if (!this.events.hasOwnProperty(event)) {
            return [];
        }

            console.log("this.events:",this.events);
            console.log("data:",data);

        return this.events[event].map(callback => callback(data));
    }
}
