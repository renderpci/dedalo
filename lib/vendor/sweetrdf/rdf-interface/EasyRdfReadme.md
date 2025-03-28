# Introduction to rdfInterface for EasyRdf users

There are a few fundamental differences between the EasyRdf and the rdfInterface ecosystems:

* EasyRdf is a single library doing it all. It provides parsers, serializers, implementation of RDF terms (`EasyRdf\Literal` and `EasyRdf\Resource`), RDF dataset (`EasyRdf\Graph`), SPARQL client, etc.
  What's convenient about it is that you install one package and you are ready to go. But it also makes it less flexible and difficult to modernize, especially in the long term.  
  RdfInterface took a different approach. It's an ecosystem of (rather small) libraries which can work with each other because they implement a common interfaces defined in this repository.
  In the rdfInterface ecosystem you have a separate library for parsing/serializaing RDF ([quickRdfIo](https://github.com/sweetrdf/quickRdfIo)), 
  separate libraries implementing RDF terms and dataset
  (you can choose between [simpleRdf](https://github.com/sweetrdf/simpleRdf) and [quickRdf](https://github.com/sweetrdf/quickRdf)), 
  separate one providing so-called term templates ([termTemplates](https://github.com/sweetrdf/termTemplates)), etc.
  That way it is easier to extend the ecosystem with new libraries implementing new features or implementing already available features in a better way.  
    *  All in all it means with rdfInterface you will need to type `composer require` a few times instead of only once.
* EasyRdf's dataset API is graph-node-centric.
  First you fetch the node (`EasyRdf\Resource`) you are interested in from the graph
  and then deal with node's predicate values (being `EasyRdf\Resource` or `EasyRdf\Literal`).
  EasyRdf has no data structure representing graph's edge.  
  In the contrary RdfInterface's dataset API is edge-centric. You always add/delete/filter/iterate trough graph edges.  
    * It means the same graph operations are expressesed in slightly different way in EasyRdf and rdfInterface.
      The [Basic task](#basic-tasks) section below provides a comparison of some sample task.
    * It's hard to tell that one approach is better than the other.
      All in all it's quite subjective and comes down to personal taste and habits.
      Anyway I hope you'll see some advantages brought by the approach introduced by the rdfInterface.
* EasyRdf is weak-typed.
  It allows to refer to predicates and named nodes using strings containing their (shortened or fully-qualified) URIs and literals can be represented by just strings.
  When it comes to predicates it even supports a rudimentaty SPARQL path-like syntax.  
  RdfInterface doesn't allow that.
  RdfInterface enforces strict typing - named node/predicate has to be an `rdfInterface\NamedNode` object, literal has to be an `rdfInterface\Literal` object, etc.
    * I'm pretty sure you will find rdfInterface behavior annoying.
      It may feel like introducing a lot of unnecessary boilerplate code.
      While I agree it makes the syntax longer, it's for a reason.
      There are many corner cases where the syntax used by the EasyRdf is intrinsically ambiguous.
      Strict typing assures there are no such ambiguities in the rdfInterface API.
      It also makes it easy to add new extensions.
* If you are used to using shortened URIs in EasyRdf you might be surprised it's not possible in RdfInterface.\
  It's a well thought design decision. Rationale is provided [here](ShortenedUris.md).

## Basic tasks

### Parsing data

EasyRdf

```php
$graph = new \EasyRdf\Graph();
$graph->parse('RDF DATA GO HERE');
```

rdfInterface

```php
$iterator = quickRdfIo\Util::parse('RDF DATA GO HERE', new \quickRdf\DataFactory());
$dataset = new \quickRdf\Dataset();
$dataset->add($iterator);
```

RdfInterface syntax is a little longer and more verbose but it decouples the parser and the dataset.
It means we can freely mix a parser, a terms factory and a dataset implementations (of course until all of them are rdfInterface-compliant).

EasyRdf provides us with a shorter syntax at the cost of limiting us to parsers embedded into the EasyRdf.

### Iterating over all triples matching a given criteria

EasyRdf provides no universal search API so the actual code depends a lot on what we do.
Let's go trough most common tasks.

* Iterating the whole graph.\
  EasyRdf
  ```php
  foreach ($graph->resources() as $subject) {
      foreach ($subject->properties() as $predicate) {
          foreach ($subject->all($predicate) as $object) {
              echo "$subject $predicate $object\n";
          }
      }
  }
  ```
  rdfInterface
  ```
  foreach ($dataset as $edge) {
      echo "$edge\n";
  }
  ```
* Iterating the whole graph in a resource->predicate->object order.\
  EasyRdf
  ```php
  foreach ($graph->resources() as $subject) {
      foreach ($subject->properties() as $predicate) {
          foreach ($subject->all($predicate) as $object) {
              echo "$subject $predicate $object\n";
          }
      }
  }
  ```
  rdfInterface
  ```php
  use termTemplates\QuadTemplate as QT;
  foreach ($dataset->listSubjects() as $subject) {
      foreach ($dataset->listPredicates(new QT($subject)) as $predicate) {
          foreach ($dataset->listObjects(new QT($subject, $predicate)) as $object) {
              echo "$subject $predicate $object\n";
          }
      }
  }
  ```
* Fetching all literals in a given `$language` of a given `$predicate` for a given `$subject`.\
  EasyRdf
  ```php
  $graph->resource($subject)->allLiterals($predicate, $language);
  ```
  rdfInterface
  ```php
  use termTemplates\QuadTemplate as QT;
  use termTemplates\LiteralTemplate as LT;
  $template = new QT($subject, $predicate, new LT(lang: $language));
  $dataset->listObjects($template);
  ```
* Fetching a given `$predicate` value in a given `$language` for a given `$subject` with a fallback `$default` value.\
  EasyRdf
  ```php
  // if $predicate is fully-qualified, it must be quoted with <>
  $value = $graph->resource($subject)->getLiteral($predicate, $language) ?? $default;
  ```
  rdfInterface
  ```php
  use termTemplates\QuadTemplate as QT;
  use termTemplates\LiteralTemplate as LT;
  $template = new QT($subject, $predicate, new LT(lang: $language));
  $value = $dataset->getObjectValue($template) ?? $default;
  ```
* Checking if there is any triple of a given `$subject` having given `$predicate` literal value tagged with a language (any).\
  EasyRdf
  ```php
  $result = false;
  // if $predicate is fully-qualified, it must be quoted with <>
  foreach ($graph->resource($subject)->allLiterals($predicate) as $literal) {
      if (!empty($literal->getLang())) {
          $result = true;
          break;
      }
  }
  ```
  rdfInterface
  ```php
  use termTemplates\QuadTemplate as QT;
  use termTemplates\LiteralTemplate as LT;
  $results = $dataset->any(new QT($subject, $predicate, new LT(lang: '')));
  ```
* Searching for all subjects having a given `$value` of a given `$predicate`.\
  EasyRdf
  ```php
  $subjects = $graph->resourcesMatching($predicate, $value);
  ```
  rdfInterface
  ```php
  use termTemplates\QuadTemplate as QT;
  $subjects = $dataset->listSubjects(new QT(null, $predicate, $value));
  ```
* Searching for all subjects pointing to a given `$object` with any predicate.\
  EasyRdf
  ```php
  $subjects = [];
  foreach ($graph->reversePropertyUris($object) as $predicate) {
      $subjects = array_merge($subjects, $graph->resourcesMatching($predicate, $graph->resource($object)));
  }
  ```
  rdfInterface
  ```php
  use termTemplates\QuadTemplate as QT;
  $subjects = $dataset->listSubjects(new QT(object: $object));
  ```
* Searching for all subjects with a given `$predicate` literal value greater than `$value` (comparing as numbers).\
  EasyRdf
  ```php
  $subjects = [];
  // if $predicate is fully-qualified, it MUST NOT be quoted with <> in the line below
  foreach ($graph->resourcesMatching($predicate) as $subject) {
      // if $predicate is fully-qualified, it MUST be quoted with <> in the line below
      foreach ($subject->allLiterals($predicate) as $literal) {
          if (((float) $literal->getValue()) > $value) {
              $subjects[] = $subject;
              break;
          }
      }
  }
  ```
  rdfInterface
  ```php
  use termTemplates\QuadTemplate as QT;
  use termTemplates\NumericTemplate as NT;
  $subjects = $dataset->listSubjects(new QT(null, $predicate, new NT($value, NT::GREATER)));
  ```

EasyRdf syntax is longer or shorter depending on the task.
When it comes to more complex searches, it requires you to write your own filtering loops.

There is also an annoying inconsistency in fully qualified URI predicates treatment in EasyRdf.
Some methods expect them to be quoted with `<>` (e.g. `\EeayRdf\Resource::get()` and related methods) 
while some expect them not to be quoted with `<>` (e.g. `\EeayRdf\Graph::resourcesMatching()`).

In rdfInterface you search always in the same way by passing a filter describing your search criteria
to the method performing the action you want.
There are many helper classes allowing to apply various filters including more fancy ones like regular expression matching or numeric comparisons 
(see the [termTemplates](https://github.com/sweetrdf/termTemplates) library).

### Adding new triples

Let's say we want to add a `$subject $predicate $object` and `$subject $predicate $value@$lang.

EasyRdf
```php
$graph->resource($subject)->addResource($predicate, $object);
$graph->resource($subject)->addLiteral($predicate, $value, $lang);
```

rdfInterface
```php
use quickRdf\DataFactory as DF;
$subject = DF::namedNode($subject);
$predicate = DF::namedNode($predicate);
$dataset->add(DF::quad($subject, $predicate, DF::namedNode($object)));
$dataset->add(DF::quad($subject, $predicate, DF::literal($value, $lang)));
```

EasyRdf syntax is definitely more compact.
RdfInterface is more verbose due to strong typing and there is no way around it.

### Modyfying given triple values

* Replacing a single `$subject $predicate $object` triple with `$subject $predicate $newObject`.\
  EasyRdf
  ```php
  $graph->resource($subject)->delete($predicate, $object);
  $graph->resource($subject)->add($predicate, $newObject);
  ```
  rdfInterface
  ```php
  use quickRdf\DataFactory as DF;
  use termTemplates\QuadTemplate as QT;

  $dataset[DF::Quad($subject, $predicate, $object)] = DF::Quad($subject, $predicate, $newObject);
  // or
  $dataset->delete(DF::Quad($subject, $predicate, $object));
  $dataset->add(DF::Quad($subject, $predicate, $newObject));
  // or
  $dataset->forEach(
    fn($x) => $x->withObject($newObject),
    new QT($subject, $predicate, $object)
  )
  ```
* Multiplying all literal values of a given `$predicate` by 2:\
  EasyRdf
  ```php
  foreach ($graph->resourcesMatching($predicate) as $subject) {
      foreach ($subject->allLiterals($predicate) as $literal) {
          $subject->delete($predicate, $literal);
          $subject->addLiteral($predicate, $literal->getValue() * 2);
      }
  }
  ```
  rdfInterface
  ```php
  use termTemplates\QuadTemplate as QT;

  $dataset->forEach(
      function ($edge) {
          $literal = $edge->getObject();
          return $edge->withObject($literal->withValue($literal->getValue() * 2));
      },
      new QT(predicate: $predicate)
  );
  // or
  foreach ($dataset->copy(new QT(null, $predicate)) as $edge) {
      $literal = $edge->getObject();
      $dataset[$edge] = $edge->withObject($literal->withValue($literal->getValue() * 2));
  }
  ```
* Appending `$suffix` to all `$predicate` values beginning with `foo`.\
  EasyRdf
  ```php
  // if $predicate is fully-qualified, it MUST NOT be quoted with <> in the line below
  foreach ($graph->resourcesMatching($predicate) as $subject) {
      // if $predicate is fully-qualified, it MUST be quoted with <> in the line below
      foreach ($subject->allLiterals($predicate) as $literal) {
          if (substr($literal->getValue(), 0, 3) === 'foo') {
              $subject->delete($predicate, $literal);
              $subject->addLiteral($predicate, $literal->getValue() . $suffix);
          }
      }
  }
  ```
  rdfInterface
  ```php
  use termTemplates\QuadTemplate as QT;
  use termTemplates\LiteralTemplate as LT;

  $dataset->forEach(
      function ($edge) use ($suffix) {
          $literal = $edge->getObject();
          return $edge->withObject($literal->withValue($literal->getValue() . $suffix));
      },
      new QT(null, $predicate, new LT('foo', LT::STARTS))
  );
  // or
  foreach ($dataset->copy(new QT(null, $predicate, new LT('foo', LT::STARTS))) as $edge) {
      $literal = $edge->getObject();
      $dataset[$edge] = $edge->withObject($literal->withValue($literal->getValue() . $suffix));
  }
  ```

### A mutable graph node

The `EasyRdf\Resource` is a central class in the EasyRdf.
In most cases you first get the `EasyRdf\Resource` object and then modify triples on it.

```
$resource = $graph->resource('http://foo');
$resource->getUri();
$resource->getLiteral('<http://bar');
$resource->addResource('http://baz', 'http://foo/bar');
```

In the rdfInterface the `rdfInterface\DatasetNodeInterface` interface provides a similar
functionality.

```
use quickRdf\DataFactory as DF;
use quickRdf\DatasetNode;
use termTemplates\PredicateTemplate as PT;
$resource = DatasetNode::factory(DF::namedNode('http://foo')->withDataset($dataset);
$resource->getNode();
$resource->getObject(new PT(DF::namedNode('http://bar')));
$resource->add(DF::quadNoSubject(DF::namedNode('http://baz'), DF::namedNode('http://foo/bar')));
```

### Computing aggregates

Computing sum of all literal values of a given `$predicate`.

EasyRdf
```php
$sum = 0;
// if $predicate is fully-qualified, it MUST NOT be quoted with <> in the line below
foreach ($graph->resourcesMatching($predicate) as $subject) {
    // if $predicate is fully-qualified, it MUST be quoted with <> in the line below
    foreach ($subject->allLiterals($predicate) as $literal) {
        $sum += $literal->getValue();
    }
}
```

rdfInterface
```php
use termTemplates\QuadTemplate as QT;

$sum = $dataset->reduce(
    function ($acc, $edge) {
        return $acc + $edge->getObject()->getValue();
    },
    0,
    new QT(null, $predicate)
);
// or
$sum = 0;
foreach ($dataset->copy(new QT(null, $predicate)) as $edge) {
    $sum += $edge->getObject()->getValue();
}
```

### Executing a SPARQL query and dealing with its results

EasyRdf

```php
$client = new EasyRdf\Sparql\Client('https://query.wikidata.org/sparql');
foreach ($client->query('select ?a ?b ?c where {?a ?b ?c} limit 10') as $i) {
    echo "$i->a $i->b $i->c\n";
}
```

rdfInterface
```php
$client = new \sparqlClient\StandardConnection('https://query.wikidata.org/sparql', new \quickRdf\DataFactory());
foreach ($client->query('select * where {?a ?b ?c} limit 10') as $i) {
    echo "$i->a $i->b $i->c\n";
}
```

Not much difference really.

## Simple operations which you can't do with EasyRdf...

... but can with rdfInterface.

* Make a copy of a dataset.\
  Suprisingly there is no method for doing that.
  You must either serialize and deserialize the `EasyRdf\Graph` object or use a three-level loop over resources, their predicates and each predicate values.\
  In rdfInterface it's just `$newCopy = $dataset->copy()`.
* Perform any set operation on two datasets.\
  EasyRdf provides no methods to perform graph union, difference or intersection.
  And implementing these operations using EasyRdf's API is quite troublesome (to be honest I'm to lazy to prepare a snippet).  
  RdfInterface provides `Dataset::add()`, `Dataset::delete()` and `Dataset::deleteExcept()` for in-place set operations 
  and `Dataset::union()`, `Dataset::copyExcept()`, `Dataset::copy()` and `Dataset::xor()` for immutable set operations.

## Fundamental EasyRdf limitations addressed by the rdfInterface

* EasyRdf data model is limited to triples.\
  EasyRdf can only handle triples and its internal architecture makes it really difficult to change it.
  It Leaves no hope for quads support and therefore no hope for the [RDF-star](https://w3c.github.io/rdf-star/).\
  RdfInterface supports both quads and the RDF-star
  ([simpleRdf](https://github.com/sweetrdf/simpleRdf/) and [quickRdf](https://github.com/sweetrdf/quickRdf) already handle quads having quads as subjects and/or objects,
  [quickRdfIO](https://github.com/sweetrdf/quickRdfIo) can parse and serialize n-triples-star
  and [sparqlClient](https://github.com/sweetrdf/sparqlClient) can parse sparql-star responses).

## Things you can easily do with EasyRdf but you can't with rdfInterface

* High-level classes for most common RDF structures like collections and containers.
* Automatic mapping of RDF date/time literals to PHP date/time objects.\
  Maybe someone at some point will provide a `rdfInterface\Literal` implementation capable of doing that
  (it's not a rocket science) but here and now there is no such implementation available.
* Use shortened URIs all around.\
  It's not a bug, it's a feature.
  Using shortened URIs is broken by design.
  Read more [here](ShortenedUris.md).
