var loader, Loader, things, thing

Loader  = require('../').Loader
loader  = new Loader(__dirname + '/things');
things  = loader.load().things;
thing   = new things.Thing("db thing");
