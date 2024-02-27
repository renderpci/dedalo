# RDF interfaces for PHP

## Why do we need common interfaces?

The PHP RDF ecosystem suffers from big monolythic libraries trying to provide a full RDF stack 
from parsers to triplestores, serializers and sometimes even SPARQL engines in one library.

It makes them quite difficult to maintain and extend.
It also makes it impossible to couple parts of different libraries with each other, 
e.g. combine a faster parser from one library with a nicer triplestore from another.

The solution for these troubles is to agree on

* A set of separate RDF stack layers: parser, serializer, dataset, SPARQL client, etc.
* Common interfaces each layer should use to communicate with the other (think of it as a PSR-7 for RDF).

## Implementations

* The reference implementation of `Term` and the `Dataset` classes are provided by the [quickRdf](https://github.com/sweetrdf/quickRdf) library and the [simpleRdf](https://github.com/sweetrdf/simpleRdf) library.
* Turtle, NTriples, NQuads and NTriplesStar parsers and serialisers are provided by the [quickRdfIo](https://github.com/sweetrdf/quickRdfIo) library.
* A collection of `QuadTemplate` and `LiteralTemplate` classes providing a convenient way for quads/triples filtering can be found in the [termTemplates](https://github.com/sweetrdf/termTemplates) library.
* The [sparqlClient](https://github.com/sweetrdf/sparqlClient) library provides a SPARQL client (still in early development).
* Generic helpers which can be reuesed when developing your own implementations or plugging foreign code can be found in the [rdfHelpers](https://github.com/sweetrdf/rdfHelpers) library.

## Compliance tests

The [rdfInterfaceTests](https://github.com/sweetrdf/rdfInterfaceTests) provides a set of tests for validating if your library is compliant with the rdfInterface.

## For EasyRdf users

If you are using EasyRdf, you are likely to find the rdfInterface API quite strange and difficult to understand.\
[This document](EasyRdfReadme.md) should help.

There's also an [rdfInterface2easyRdf](https://github.com/sweetrdf/rdfInterface2easyRdf) library which provides conversion routines between rdfInterface and EasyRdf (in both directions).

## Design decisions

### Inspirations

The rdfInterface is strongly influenced by [RDF/JS](http://rdf.js.org/) and [RDFLib](https://rdflib.readthedocs.io/en/stable/).

### Strong typing

The rdfInterface is strongly typed.

Strong typing provides many benefits. It assures the syntax is unambiguous and extensible, allows to leverage static code analysis and makes errors easier to understand.

The downside of strong typing is much more verbose syntax but we decided benefits outweight it easily.

### Immutability

RdfInterface terms are immutable. It's impossible to change their properties. You can only get a new object instance with a given property set to a new value.

Immutability provides three benefits:

1. It makes it clear for the programmer that there is no back-propagation of changes.
2. It's easy to implement it without flaws (in contrary to deep cloning).
3. It allows to implement useful performance optimizations (e.g. a global term cache).

And modern PHP should be already familiar with it as e.g. PSR-7 request/response objects follow the same approach.

### Use streams for data import and export

RdfInterface uses streams as RDF parsing input and serialization output.

Streams are far more flexible than strings.
They allow asynchronous operation, have lower memory footprint, fit the PSR-7 interface nicely and much more.

Last but not least a string can be easilly packed into a in-memory stream.

### Reuse native PHP interfaces

RdfInterface, especially the `Dataset` interface extends native PHP interfaces, e.g.:

* [iterable](https://www.php.net/manual/en/language.types.iterable.php) over edges/nodes of a dataset.
* [ArrayAccess](https://www.php.net/manual/en/class.arrayaccess.php) for adding/removing/accessing edges of a dataset.
* [Countable](https://www.php.net/manual/en/class.countable.php) for e.g. counting quads in a dataset.

Using native interfaces makes the library easier to learn and it feels better integrated with the PHP ecosystem.

### Extensibility

RdfInterface is meant to be extensible.

RDF is changing with new ideas being introduced (like RDF-star) and the API should be able to accomodate such developments.

For that reason the `Quad` specification is rather relaxed and allows any term as a subject and object.

It doesn't mean all implementations must support any possible term.
Implementations may support any subset they want, just checking if they can deal with a term they recive from user is their responsibility.

