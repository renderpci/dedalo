# Development

## Introduction

Dédalo ecosystem has two different systems, work system and diffusion system, work system si connected to diffusion system to share public data into websites; virtual exhibitions, online catalogs, interactive games or any other diffusion data.

This guide is to add new functionalities or begin to develop in work system. If you want to develop a public website getting information from Dédalo API you will need know how do call to [diffusion API](../diffusion/diffusion_data_flow.md), Dédalo public REST API.

## Ecosystem

Dédalo work system is a client-server application based in web technology. Server is develop with PHP, client is develop with JavaScript and the client render the data in HTML and style it with CSS, CSS is write in LESS. For store data Dédalo use a PostgreSQL database with a NoSQL model, data is stored into JSONB (JSON Binary) fields. Apache is used as HTTP server.

The server architecture is based in programming objects with different approach, sections has a factory model, components has inheritance of classes. Client code in JavaScript use import modules for inheritance and native prototype is used instead classes.

## Code Style

Dédalo use snake case for the name of methods, classes, variables, or any other definition.

### Javascript

1. Variables

    1. Local variable declarations

        In general use `const` for variables, it's inmutable and his scope is clear a well defined, when you need a mutable variable you can use `let`.
        `var` do not has a clear scope and his use is avoid, do not use it.

    2. One variable per declaration

        Every local variable declaration must declares only one variable. Declarations such as `const a = 1, b = 2;` are not used.

    3. Function parameters, options

        Dédalo uses an object named `options` to pass parameters to functions. Any variables within the object must be declared at the beginning of the function.

        ``` js
        component_text_area.prototype.updated_layer_data = function(options) {

            const self = this

            const caller    = options.caller
            const type      = options.layer.type
            const layer_id  = options.layer.layer_id
            ...
        }
        ```

    4. Do not use the variadic `Array` constructor

        The constructor is error-prone if arguments are added or removed. Use a literal instead.

        ``` js title="wrong"
        const a1 = new Array(1, 8, 'cookies');
        const a2 = new Array(22, 5);
        const a3 = new Array(17);
        const a4 = new Array();
        ```

        This works as expected except for the third case, a3 will be an array with 17 empty values, instead an array with the number 17 as the value.

        Instead, use `[]`:

        ``` js
        const a1 = [1, 8, 'cookies'];
        const a2 = [22, 5];
        const a3 = [17];
        const a4 = [];
        ```

        Explicitly allocating an array of a given length using new Array(length) is allowed when appropriate.

    5. Do not use the `Object` constructor

        Use an object literal `{}` or `{a: 0, b: 1, c: 2}` instead.

        ``` js
        const a1 = { a : 1, b : 2, c : 3];
        const a2 = { a : 1, b2 : 'my second value'];
        const a3 = { my_other_property : 'other value'];
        const a4 = {};
        ```

    6. Use trailing commas

        Include a trailing comma whenever there is a line break between the final element and the closing bracket.

        Example:

        ``` js
        const values = [
            'first value',
            'second value',
        ];
        ```

2. Functions and inheritance

    Dédalo use a native javascript inheritance based in prototypes. ES6 introduce a `Class` word to generate inheritance, but this is not a new inheritance model, it is only a specific prototype model.

    !!! note "About inheritance of JavaScript"

        [In NDN you can read](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_classes): JavaScript is a prototype-based language — an object's behaviors are specified by its own properties and its prototype's properties. [...] In JavaScript, classes are mainly an abstraction over the existing prototypical inheritance mechanism — all patterns are convertible to prototype-based inheritance. Classes themselves are normal JavaScript values as well, and have their own prototype chains.

        See [Mozilla documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Inheritance_and_the_prototype_chain) for more information

    1. Use `self` instead `this`

    To avoid conflicts and confusion, functions always declare `self` to get reference to main object.

    ```js
    component_text_area.prototype.init = async function(options) {

        const self = this
    }
    ```

    `self` will use in other code parts to get, set, expand, etc, the main object. And it is used instead the this to avoid confusion.

    ```js
    const get_content_data = function(options) {

        const self = options.self

        const data  = self.data || {}
        const value = data.value || []

        const save_promise = await component_common.prototype.save.call(this, data);
    }
    ```

3. ES modules imports

   Dédalo use a native ES modules imports only. RequireJS, commonJS modules, or other import models are not supported.

    1. Import paths

        ES module files must use the import statement to import other ES module files.

        ``` js
        import './section.js';

        import {data_manager} from '../../common/js/data_manager.js'
        import {upload} from '../../services/service_upload/js/service_upload.js'

        import * from '../../common/js/common.js'
        ```

    2. File extensions in import paths

        The `.js` file extension is not optional in import paths and must always be included.

        ``` js title="wrong"
        import '../directory/file';
        ```

        ``` js title="right"
        import '../directory/file.js';
        ```

    3. Importing the same file multiple times

        Do not import the same file multiple times. This can make it hard to determine the aggregate imports of a file.

        ``` js
        // Imports have the same path, but since it doesn't align it can be hard to see.
        import {common} from '../../common/js/common.js';
        import {push_browser_history} from '../../common/js/common.js';
        ```