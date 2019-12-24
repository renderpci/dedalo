# VexABC

ABC notation parser and renderer for VexFlow

Copyright (c) 2012 Mikael Nousiainen

## See VexABC in action and try it

* [VexABC interactive editor](http://test.incompleteopus.net/vexabc/test/editor.html)
* [VexABC tests](http://test.incompleteopus.net/vexabc/test/test.html)

## VexABC features

* VexABC is a work in progress, which means that many features of the ABC music standard are incomplete or completely missing
* Many of the basic constructs and features of the ABC music standard are already working
    * See the [VexABC tests](http://test.incompleteopus.net/vexabc/test/test.html) to find out features implemented and working
* Currently, only one voice and a single stave can be used
    * Multi-voice and multi-stave (system) support will be implemented eventually
* The current VexFlow API imposes some restrictions on how notation can be rendered
    * Clefs, key signatures and time signatures can be rendered only at the beginning of a measure
    * Voltas (e.g. variant endings) can only begin and end on measure boundaries
    * Slurs are not supported
    * Grace notes are not supported
    * Some ABC decorations can not be rendered yet
* VexABC aims to implement [ABC music standard 2.1](http://abcnotation.com/wiki/abc:standard:v2.1)

## VexABC dependencies

Main dependencies:
* [VexFlow](http://github.com/0xfe/vexflow/) (latest GIT master branch) to render the notation
* [PEG.js](http://github.com/dmajda/pegjs/) (latest GIT master branch) for parsing ABC notation text
* jQuery 1.8

Test dependencies:
* QUnit 1.10.0 for running unit tests
* Twitter Bootstrap 2.2 is used in the web pages for tests

## What is ABC notation?

ABC notation is a text-based music notation system.

* [ABC notation home](http://abcnotation.com/)
* [ABC notation examples](http://abcnotation.com/examples)
* [ABC music standard 2.1](http://abcnotation.com/wiki/abc:standard:v2.1)

## What is VexFlow?

VexFlow is an open-source web-based music notation rendering API.

* [VexFlow Home](http://vexflow.com/)
* [VexFlow GitHub repository](http://github.com/0xfe/vexflow/)
* [VexFlow Google Group](https://groups.google.com/forum/?fromgroups#!forum/vexflow)

## What is PEG.js?

PEG.js is a simple parser generator for JavaScript.

* [PEG.js Home](http://pegjs.majda.cz/)
* [PEG.js GitHub repository](http://github.com/dmajda/pegjs/)

## VexABC license

Mozilla Public License, version 2.0 - http://www.mozilla.org/MPL/2.0/

* [License FAQ](http://www.mozilla.org/MPL/2.0/FAQ.html)

