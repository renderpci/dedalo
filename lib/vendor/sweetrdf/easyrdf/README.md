# EasyRdf (Fork)

![CI](https://github.com/sweetrdf/easyrdf/workflows/Tests/badge.svg)

## About this fork 🚀

This is a fork of EasyRdf which I maintain in my spare time. My objective is to keep EasyRdf alive and usable on latest PHP versions. Code is more or less maintained but not developed any further. If you wanna participate, feel free to open a pull request! For more information about this fork, scroll at the end of this document.

## About EasyRdf

EasyRdf is a PHP library designed to make it easy to consume and produce [RDF](https://en.wikipedia.org/wiki/Resource_Description_Framework).
It was designed for use in mixed teams of experienced and inexperienced RDF
developers. It is written in Object Oriented PHP and has been tested
extensively using PHPUnit.

After parsing EasyRdf builds up a graph of PHP objects that can then be walked
around to get the data to be placed on the page. Dump methods are available to
inspect what data is available during development.

Data is typically loaded into an `EasyRdf\Graph` object from source RDF
documents, loaded from the web via HTTP. The `EasyRdf\GraphStore` class
simplifies loading and saving data to a SPARQL 1.1 Graph Store.

SPARQL queries can be made over HTTP to a Triplestore using the
`EasyRdf\Sparql\Client` class. `SELECT` and `ASK` queries will return an
`EasyRdf\Sparql\Result` object and `CONSTRUCT` and `DESCRIBE` queries will return
an `EasyRdf\Graph` object.

## Example

```php
$foaf = new \EasyRdf\Graph("https://www.aelius.com/njh/foaf.rdf");
$foaf->load();
$me = $foaf->primaryTopic();
echo "My name is: ".$me->get('foaf:name')."\n";
```

## Requirements

* PHP 8.0 or higher
* PHP Extensions: dom, mbstring, pcre, xmlreader
* PHP Libs: libxml

## Features

* No required external dependencies upon other libraries (PEAR, etc...)
* Library runs in Linux and Windows environments
* Extensive unit tests written using PHPUnit
* Built-in parsers and serialisers: RDF/JSON, N-Triples, RDF/XML, Turtle
* Optional parsing support for: [ARC2](https://github.com/semsol/arc2/), [rapper](http://librdf.org/raptor/rapper.html)
* Optional support for `Laminas\Http\Client`
* Type mapper - resources of type `foaf:Person` can be mapped into PHP object of class `Foaf_Person`
* Support for visualisation of graphs using [GraphViz](https://www.graphviz.org/)
* Comes with a number of examples

## List of Examples

* [`basic.php`](/examples/basic.php#slider) - Basic "Hello World" type example
* [`basic_sparql.php`](/examples/basic_sparql.php#slider) - Example of making a SPARQL `SELECT` query
* [`converter.php`](/examples/converter.php#slider) - Convert RDF from one format to another
* [`dump.php`](/examples/dump.php#slider) - Display the contents of a graph
* [`foafinfo.php`](/examples/foafinfo.php#slider) - Display the basic information in a FOAF document
* [`foafmaker.php`](/examples/foafmaker.php#slider) - Construct a FOAF document with a choice of serialisations
* [`graph_direct.php`](/examples/graph_direct.php#slider) - Example of using `EasyRdf\Graph` directly without `EasyRdf\Resource`
* [`graphstore.php`](/examples/graphstore.php#slider) - Store and retrieve data from a SPARQL 1.1 Graph Store
* [`graphviz.php`](/examples/graphviz.php#slider) - GraphViz rendering example
* [`html_tag_helpers.php`](/examples/html_tag_helpers.php#slider) - Rails Style html tag helpers to make the EasyRdf examples simpler
* [`httpget.php`](/examples/httpget.php#slider) - No RDF, just test `EasyRdf\Http\Client`
* [`open_graph_protocol.php`](/examples/open_graph_protocol.php#slider) - Extract Open Graph Protocol metadata from a webpage
* [`serialise.php`](/examples/serialise.php#slider) - Basic serialisation example
* [`sparql_queryform.php`](/examples/sparql_queryform.php#slider) - Form to submit SPARQL queries and display the result
* [`uk_postcode.php`](/examples/uk_postcode.php#slider) - Example of resolving UK postcodes using uk-postcodes.com
* [`wikidata_villages.php`](/examples/wikidata_villages.php#slider) - Fetch and information about villages in Fife from Wikidata


## Contributing

**Contributions are welcome!** Please read [CONTRIBUTING.md](/CONTRIBUTING.md) for further information.

For further information about extending / hack EasyRdf please read [DEVELOPER.md](/DEVELOPER.md).

Further mainainers are possible, please send an email to [@k00ni](https://github.com/k00ni).

## Running Examples

The easiest way of trying out some of the examples is to use the PHP command to
run a local web server on your computer.

```
php -S localhost:8080 -t examples
```

Then open the following URL in your browser: http://localhost:8080/

## Why this fork? (written in late 2020)

EasyRdf was in maintenance mode since 2017 ([link](https://github.com/easyrdf/easyrdf/issues/282)) and not actively maintained since. There were 6+ pull requests pending at that time with fixes and new features. Its sad to see another RDF PHP project die slowly, so I decided to clean house and give the code a new home ([further info](https://github.com/easyrdf/easyrdf/issues/320)). A few months in late 2020 EasyRdf was actively improved (me being a co-maintainer for a while), but that stopped and decay began again. It was a frustating time, lets leave it at that.

In the end I decided to abandon my old fork and start fresh with latest EasyRdf improvements in this repository.

#### What can you expect as a user?

This fork (v1.\*) aims to be a drop-in replacement for the `easyrdf/easyrdf` package, which means, you can use it **without changing your code**. *But you should still read the notes of the latest release, to make sure nothing unexpected happens after an update.*

#### What can you expect as an EasyRdf developer?

This repository is set up in a way to lower the maintenance overhead in comparison to the original version. Test related tools were partly replaced with more lightweight solutions. Furthermore this repository is held by an organization instead of a user, which allows more flexible maintenance.

#### Whats next? Whats my plan?

As stated above, main objective is to keep EasyRdf's legacy code up to date and compatible with latest PHP versions. I welcome pull requests and try to react as fast as possible. If there are useful pull requests in easyrdf/easyrdf (and I have time to spare), I will picked them up and integrate them here (for instance https://github.com/sweetrdf/easyrdf/pull/9, https://github.com/sweetrdf/easyrdf/pull/14).

## Licensing

The EasyRdf library and tests are licensed under the [BSD-3-Clause](https://www.opensource.org/licenses/BSD-3-Clause) license.
The examples are in the public domain, for more information see [UNLICENSE](https://unlicense.org/).
