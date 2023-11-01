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

        ``` js title="wrong!"
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

    1. Prototypes instead classes

        Dédalo use a native javascript inheritance based in prototypes. ES6 introduce a `Class` word to generate inheritance, but this is not a new inheritance model, it is only a specific prototype model.

        !!! note "About inheritance of JavaScript"

            [In NDN you can read](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_classes): JavaScript is a prototype-based language — an object's behaviors are specified by its own properties and its prototype's properties. [...] In JavaScript, classes are mainly an abstraction over the existing prototypical inheritance mechanism — all patterns are convertible to prototype-based inheritance. Classes themselves are normal JavaScript values as well, and have their own prototype chains.

            See [Mozilla documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Inheritance_and_the_prototype_chain) for more information

    2. Use `self` instead `this`

        To avoid conflicts and confusion, functions always declare `self` to get reference to main object.

        ``` js
        component_text_area.prototype.init = async function(options) {

            const self = this
        }
        ```

        `self` will use in other code parts to get, set, expand, etc, the main object. And it is used instead the this to avoid confusion.

        ``` js
        const get_content_data = function(options) {

            const self = options.self

            const data  = self.data || {}
            const value = data.value || []

            const save_promise = await component_common.prototype.save.call(this, data);
        }
        ```

    3. Anonymous functions in events

        Anonymous functions are avoided inside events. The function could be overlap by other anonymous functions creating an unclear situation.

3. ES modules

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

        ``` js title="wrong!"
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

## GIT commit style

Since v6 Dédalo follows the conventional method [Commits v1.0](https://www.conventionalcommits.org/en/v1.0.0/) for commits.

Use the imperative verb form to ensure that possible verbs used in commits, such as "fixed" or "updated", are written in the correct verb tense.  
Apply the formula: “If applied, my commit will…”
example: “If applied, my commit will (INSERT COMMIT MESSAGE TEXT)”

The prefixes to be used in the commits are as follows:

### build

The commit alters the build system or external dependencies of the product (adding, removing, or upgrading dependencies).

### change

The commit changes the implementation of an existing feature.

### chore

The commit includes a technical or preventative maintenance task that is necessary for managing the product or the repository, but it is not tied to any specific feature or user story. For example, releasing the product can be considered a chore. Regenerating generated code that must be included in the repository could be a chore.

`chore:` This prefix is used for commits related to maintenance tasks, build processes, or other non-user-facing changes. It typically includes tasks that don't directly impact the functionality but are necessary for the project's development and maintenance.

For example:
> chore: Update dependencies

### ci

The commit makes changes to continuous integration or continuous delivery scripts or configuration files.

### deprecate

The commit deprecates existing functionality, but does not remove it from the product. For example, sometimes older public APIs may get deprecated because newer, more efficient APIs are available. Removing the APIs could break existing integrations so the APIs may be marked as deprecated in order to encourage the integration developers to migrate to the newer APIs while also giving them time before removing older functionality.

### docs

The commit adds, updates, or revises documentation that is stored in the repository.

`docs:` Used when making changes to documentation, including comments in the code, README files, or any other documentation associated with the project.

For example:
>docs: Update API documentation

### feat

The commit implements a new feature for the application.

`feat:` used as short for "feature," this prefix is used when introducing a new feature or functionality to the codebase.

For example:
> feat: Add user authentication feature

### fix

The commit fixes a defect in the application.

`fix:` Used when addressing a bug or issue in the codebase. This prefix indicates that the commit contains a fix for a problem.

For example:
>fix: Correct calculation in revenue calculation

### perf

The commit improves the performance of algorithms or general execution time of the product, but does not fundamentally change an existing feature.

`perf:` Short for "performance," this prefix is used when making changes aimed at improving the performance of the codebase.

For example:
>perf: Optimize database queries for faster response times

### refactor

The commit refactors existing code in the product, but does not alter or change existing behavior in the product.

`refactor:` Used when making changes to the codebase that do not introduce new features or fix issues but involve restructuring or optimizing existing code.

For example:
>refactor: Reorganize folder structure

### remove

The commit removes a feature from the product. Typically features are deprecated first for a period of time before being removed. Removing a feature from the product may be considered a breaking change that will require a major version number increment.

### revert

The commit reverts one or more commits that were previously included in the product, but were accidentally merged or serious issues were discovered that required their removal from the main branch.

### security

The commit improves the security of the product or resolves a security issue that has been reported.

### style

The commit updates or reformats the style of the source code, but does not otherwise change the product implementation.

`style:` This prefix is used for code style changes, such as formatting, indentation, and whitespace adjustments. It's important to separate style changes from functional changes for better clarity.

For example:
>style: Format code according to style guide

### test

The commit enhances, adds to, revised, or otherwise changes the suite of automated tests for the product.

`test:` Used when adding or modifying tests for the codebase, including unit tests, integration tests, and other forms of testing.

For example:
>test: Add unit tests for user authentication
