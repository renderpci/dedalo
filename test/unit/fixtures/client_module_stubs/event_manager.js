// Stub of client/dedalo/core/common/js/event_manager.js
// Records publications so a gate can assert them; subscribe returns a token shape.
export const event_manager = {
	published: [],
	publish(name, payload) {
		event_manager.published.push({ name, payload });
	},
	subscribe() {
		return {};
	},
	unsubscribe() {},
};
