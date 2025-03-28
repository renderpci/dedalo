# Why there is (almost) no support for shortened URIs in the RdfInterface?

The short answer is:

* As prefixes to aliases mapping is not standardized it has to be chosen arbitrary and hardcoding arbitrary choices does not make much sense for general-purpose libraries.
* Allowing user to define aliases on his own makes the library more complex while there are equally effective (from the user perspective) ways of doing it purely on the user's side.

Now let's discuss it in details.

## Prefixes and aliases are not standardized

By definition an alias to prefix mapping is always local and has to be explicitely defined.

That's why we have all these `@prefix` directives in `text/turtle` and `prefix` ones in SPARQL and, what's worth noting, we can't skip them.

We can write a following `text/turtle`
```
@prefix dc: <http://purl.org/dc/elements/1.1/> .
_:r1 dc:title "Dublin Core title" .
```
but it would be also valid to write
```
@prefix dc: <http://foo/bar> .
_:r1 dc:title "Dublin Core title" .
```
and in both cases we end up with a completely different triple's predicate.

Opposite problem also exists - what is "the right alias" for the `http://purl.org/dc/terms/`?
`dct` or maybe `dcterms` or maybe something else?

And if there's no set of prefix to alias mappings which can be considered standardized or even well-known,
how would we choose the one which should be hardcoded in the library?

## There are better solutions

If you're lucky and within your organization/community you have a well-known (or even standardized) set of aliases to prefixes mappings,
everyone will be better off if you just create a set of constants defining this mapping.

An example can be found [here](https://github.com/zozlak/RdfConstants/blob/master/src/zozlak/RdfConstants.php)
(it's also published as a `zozlak/rdf-constants` composer library).

Writing
```php
const MYNMSP_FOO = 'https://my.nmsp/#foo';
$easyRdfGraph->resource->all(MYNMSP_FOO);
```
isn't really less convenient then writing
```php
EasyRdf\RdfNamespace::set('mynmsp', 'https://my.nmsp/#');
$easyRdfGraph->resource->all('mynmsp:foo');
```
but in the first case the library doesn't even need to recognize the concept of the shortened URIs
(therefore it can be simpler, easier to implement, maintain and kept bug-free).

Moreover, the constants-based solution is always easier to maintain for you.

If for some reason predicate URIs changed, you just update your constants definitions and you are done.

## When it's needed to define aliases for URI prefixes?

The only valid use case for defining aliases for prefixes is to achieve an RDF serialization which is easy to read by humans.

This use case is covered by the RdfInterface with the help of the `RdfNamespace` interface which can be passed
to the `Serializer::serialize()` and `Serializer::serializeStream()` methods.
