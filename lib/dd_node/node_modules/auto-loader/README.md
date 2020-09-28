node-auto-loader
=========

A simple auto loader for nodejs

[![Build Status](https://travis-ci.org/jwerle/node-auto-loader.png?branch=master)](https://travis-ci.org/jwerle/node-auto-loader)

## Install
```
$ sudo npm install auto-loader
```

## Usage

suppose you had a directory structure like this

```sh
app/
└── controllers
    ├── Application.js
    └── User.js
```

you could build a tree with `auto-loader` like this

```js
var app = require('auto-loader').load(__dirname +'/app')
```

if you were to `console.log` the contents of that object you would see this

```js
{ _path: '/Users/jwerle/repos/node-auto-loader/test/app',
  controllers:
   { _path: '/Users/jwerle/repos/node-auto-loader/test/app/controllers',
     Application: [Getter/Setter],
     User: [Getter/Setter] } }
```

all modules are wrapped in a `getter` and make a call to `require` to fetch their definitions and are cached after the first require

```js
app.controllers.Application; // [Function: Application]
```

## api

### .load(dir)

* `dir` directory to load recursively

***example***

```js
var loader = require('auto-loader')
var modules = loader.load(__dirname);
console.log(modules);
/**
 { _path: '/Users/jwerle/repos/node-auto-loader/test/module',
  module1: [Getter/Setter],
  module2: [Getter/Setter],
  module3: [Getter/Setter] }
**/
```

### Loader(dir)

creates a new `Loader` instance

* `dir` - root director for loader

***example***

```js
var loader = new Loader(__dirname)
// load the currenty directory
loader.load();
```

## license

MIT
