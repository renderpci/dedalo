# rdfHelpers

A set of helper classes for implementing the [rdfInterface](https://github.com/sweetrdf/rdfInterface).

## Installation

* Obtain the [Composer](https://getcomposer.org)
* Run `composer require sweetrdf/rdf-helpers`

## Content

* `rdfHelpers\DefaultGraph` an implementation of `rdfInterface\DefaultGraph`.
* `rdfHelpers\GenericQuadIterator` and implementation of `rdfInterface\QuadIterator` 
  for arrays, `rdfInterface\Quad` objects and all objects implementing the `Iterator` interface.
* `rdfHelpers\NtriplesUtil` set of helpers for n-triples serialization.
* `rdfHelpers\RdfNamespace` an implementation of `rdfInterface\RdfNamespace`.
