<?php

/*
 * The MIT License
 *
 * Copyright 2023 zozlak.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

namespace rdfInterface;

use Traversable;

/**
 * Node-oriented graph API interface.
 * 
 * @author zozlak
 */
interface DatasetNodeInterface extends TermInterface, DatasetInterface {
    
    // TermInterface
    
    /**
     * Returns dataset node node's value
     * 
     * @return mixed
     */
    public function getValue(): mixed;

    // QuadIteratorAggregateInterface
    
    /**
     * Returns an iterator over datase node's quads having subject matching
     * dataset node's node and optionally matching a given filter.
     * 
     * The $filter can be specified as:
     * 
     * - `null` matches all quads.
     * - An object implementing the \rdfInterface\QuadCompareInterface
     *   (e.g. a single quad)
     * - An object implementing the \rdfInterface\QuadIteratorInterface
     *   or the \rdfInterface\QuadIteratorAggregateInterface (e.g. another dataset or dataset node)
     * - A callable with signature `fn(\rdfInterface\QuadInterface, \rdfInterface\DatasetInterface): bool`
     *   All quads for which the callable returns true are copied.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return QuadIteratorInterface
     */
    public function getIterator(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): QuadIteratorInterface;
    
    // Methods added by the DatasetNodeInterface

    /**
     * The actual dataset should be returned.
     * This means if quads are in-place added/removed to/from the returned object,
     * these changes are shared with the DatasetNodeInterface object.
     * 
     * @return DatasetInterface
     */
    public function getDataset(): DatasetInterface;

    /**
     * Returns the node associated with a given DatasetNodeInterface object
     */
    public function getNode(): TermInterface;

    /**
     * Returns a new dataset node sharing the node with the current one but
     * using a given dataset.
     * 
     * The reference to the $dataset is kept so that changes made to it outside
     * of the DatasetNodeInterface object are reflected in the new dataset node
     * object.
     * 
     * @param DatasetInterface $dataset 
     * @return DatasetNodeInterface
     */
    public function withDataset(DatasetInterface $dataset): DatasetNodeInterface;

    /**
     * Returns a new dataset node which shares the underlaying dataset with
     * the current one but has another node.
     * 
     * @param TermInterface $node
     * @return DatasetNodeInterface
     */
    public function withNode(TermInterface $node): DatasetNodeInterface;

    // factory() and equals()

    /**
     * Creates a DatasetNodeInterface object.
     * 
     * @param TermInterface|null $node term to become DatasetNodeInterface object's
     *   node. If null is passed, the \BadMethodCallException must be thrown 
     *   (the `null` value is accepted in the signature only to match 
     *   the rdfInterface\Dataset::factory() signature).
     *   The $node does not have to be a subject in any of $quads.
     * @param QuadInterface|QuadNoSubjectInterface|Traversable<QuadInterface|QuadNoSubjectInterface>|array<QuadInterface|QuadNoSubjectInterface>|null $quads
     *   Quads to be stored in the dataset. Quads are added no matter if their 
     *   subject matches the $node. Note that:
     *   - DatasetInterface can be passed as $quads because it implements 
     *     the QuadIteratorAggregateInterface.
     *   - Further changes made to the object passed as $quads are not reflected 
     *     in the DatasetNodeInterface object's dataset. If you want this behaviour,
     *     use the `(new DatasetNodeInterface($node))->withDataset($dataset).
     * @return DatasetNodeInterface
     * @throws \BadMethodCallException
     * @see DatasetNodeInterface::withDataset()
     */
    static public function factory(TermInterface | null $node = null,
                                   QuadInterface | QuadNoSubjectInterface | Traversable | array | null $quads = null): DatasetNodeInterface;

    /**
     * Depending on the type of the $termOrDataset:
     * 
     * - If $termOrDataset is a TermCompareInterface, compares against the
     *   DatasetNodeInterface's node.
     * - If $termOrDataset is a DatasetInterface or DatasetNodeInterface,
     *   compares between the DatasetNodeInterface node's quads (quads having
     *   the node as their subject) between the DatasetNodeInterface object
     *   and the $termOrDataset object.
     * 
     * @param DatasetInterface|TermCompareInterface|DatasetNodeInterface $termOrDataset
     * @return bool
     */
    public function equals(DatasetInterface | TermCompareInterface | DatasetNodeInterface $termOrDataset): bool;

    // Immutable set operations

    /**
     * Creates a copy of the dataset node.
     * 
     * If $filter is provided, quads with subject matching DatasetNodeInterface's node
     * and not matching the $filter are skipped.
     * 
     * The $filter can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompareInterface
     *   (e.g. a single quad)
     * - An object implementing the \rdfInterface\QuadIteratorInterface
     *   or the \rdfInterface\QuadIteratorAggregateInterface (e.g. another dataset or dataset node)
     * - A callable with signature `fn(\rdfInterface\QuadInterface, \rdfInterface\DatasetInterface): bool`
     *   All quads for which the callable returns true are copied.
     * 
     * Quads with subject other than dataset node's node are copied based on the
     * $includeOther parameter value;
     * 
     * An in-place equivalent of a call using the $filter is the deleteExcept() method.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @param bool $includeOther should quads with subject other than dataset node's node be copied
     * @return DatasetNodeInterface
     * @see deleteExcept()
     */
    public function copy(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null,
                         bool $includeOther = true): DatasetNodeInterface;

    /**
     * Creates a copy of the dataset node.
     * 
     * If $filter is provided, the copy contains only quads with subject matching
     * dateset node's node and not matching the $filter.
     * 
     * The $filter can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompareInterface
     *   (e.g. a single quad)
     * - An object implementing the \rdfInterface\QuadIteratorInterface
     *   or the \rdfInterface\QuadIteratorAggregateInterface (e.g. another dataset or dataset node)
     * - A callable with signature `fn(\rdfInterface\QuadInterface, \rdfInterface\DatasetInterface): bool`
     *   All quads for which the callable returns true are copied.
     * 
     * Quads with subject other than dataset node's node are copied based on the
     * $includeOther parameter value;
     * 
     * An in-place equivalent of a call using the $filter is the delete() method.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable $filter
     * @param bool $includeOther should quads with subject other than dataset node's node be copied
     * @return DatasetNodeInterface
     * @see delete()
     */
    public function copyExcept(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable $filter,
                               bool $includeOther = true): DatasetNodeInterface;

    /**
     * Returns a new dataset node being a union of the current one (including
     * both quads matching and not matching dataset node's node) and quads
     * from the $other mathing the dataset node's node.
     * 
     * For an in-place union use add().
     * 
     * @param QuadInterface|QuadIteratorInterface|QuadIteratorAggregateInterface $other
     * @return DatasetNodeInterface
     * $see add()
     */
    public function union(QuadInterface | QuadIteratorInterface | QuadIteratorAggregateInterface $other): DatasetNodeInterface;

    /**
     * Returns a new dataset node containing:
     * 
     * - all quads of the dataset node with subject other than the node
     * - xor between triples of the dataset node quads with subject matching its
     *   node and quads of the $other
     * 
     * @param QuadInterface|QuadIteratorInterface|QuadIteratorAggregateInterface $other
     * @return DatasetNodeInterface
     */
    public function xor(QuadInterface | QuadIteratorInterface | QuadIteratorAggregateInterface $other): DatasetNodeInterface;

    /**
     * Returns a new dataset node from quads processed with a given
     * callback function.
     * 
     * @param callable $fn function applied to every quad with signature 
     *   `fn(\rdfInterface\QuadInterfca, \rdfInterface\DatasetNodeInterface)`
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @param bool $includeOther should quads with subject other than dataset node's node be copied
     * @return DatasetNodeInterface
     */
    public function map(callable $fn,
                        QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null,
                        bool $includeOther = true): DatasetNodeInterface;

    /**
     * Performs a reduce operation on the dataset node quads
     * with subject matching the dataset node's node.
     * 
     * The reduce operation consist of calling a given callback function on all
     * matching quads. The first call is made with the $initialValue passed as
     * the callback's $prevValue. Following calls pass previous callback's call
     * return value as the next callback's call $prevValue. The return value of
     * the last callback function call is the return value of the reduce() method.
     * 
     * @param callable $fn aggregate function with signature 
     *   `fn(mixed $prevValue, \rdfInterface\QuadInterface, \rdfInterface\DatasetInterface)`
     * @param mixed $initialValue
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return mixed
     */
    public function reduce(callable $fn, $initialValue = null,
                           QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): mixed;

    // In-place set operations

    /**
     * Adds quad(s) to the dataset.
     * 
     * Does not check if the quad subject matches the DatasetNodeInterface's object node.
     * 
     * Allows passing QuadNoSubjectInterface. They must be converted to quads using
     * the DatasetNodeInterface's node as a subject.
     *
     * @param QuadInterface|QuadNoSubjectInterface|Traversable<QuadInterface|QuadNoSubjectInterface>|array<QuadInterface|QuadNoSubjectInterface> $quads
     * @return void
     */
    public function add(QuadInterface | QuadNoSubjectInterface | Traversable | array $quads): void;

    /**
     * In-place removes quads from the dataset node.
     * 
     * All quads matching the $filter parameter and having a subject matching
     * dataset node's node are removed.
     * 
     * The $filter can be specified as:
     * 
     * - `null` meaning "remove all".
     * - An object implementing the \rdfInterface\QuadCompareInterface
     *   (e.g. a single quad)
     * - An object implementing the \rdfInterface\QuadIteratorInterface
     *   or the \rdfInterface\QuadIteratorAggregateInterface (e.g. another dataset or dataset node)
     * - A callable with signature `fn(\rdfInterface\QuadInterface, \rdfInterface\DatasetInterface): bool`
     *   All quads for which the callable returns true are copied.
     * 
     * An immputable equivalent is the copyExcept($filter) method.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return DatasetInterface a dataset containing removed quads.
     * @see copyExcept()
     */
    public function delete(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): DatasetInterface;

    /**
     * In-place removes quads from the dataset node.
     * 
     * All quads with subject matching dataset node's node but ones matching 
     * the $filter parameter are removed.
     * 
     * The $filter can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompareInterface
     *   (e.g. a single quad)
     * - An object implementing the \rdfInterface\QuadIteratorInterface
     *   or the \rdfInterface\QuadIteratorAggregateInterface (e.g. another dataset or dataset node)
     * - A callable with signature `fn(\rdfInterface\QuadInterface, \rdfInterface\DatasetInterface): bool`
     *   All quads for which the callable returns true are copied.
     * 
     * An immputable equivalent is the copy($filter) method.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable $filter
     * @return DatasetInterface a dataset containing removed quads.
     * @see copy()
     */
    public function deleteExcept(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable $filter): DatasetInterface;

    /**
     * In-place modifies all dataset node quads using a given callback.
     * 
     * All quads with subject matching dataset node's node and the $filter parameter are modified.
     * 
     * The $filter can be specified as:
     * 
     * - `null` which matches all quads.
     * - An object implementing the \rdfInterface\QuadCompareInterface
     *   (e.g. a single quad)
     * - An object implementing the \rdfInterface\QuadIteratorInterface
     *   or the \rdfInterface\QuadIteratorAggregateInterface (e.g. another dataset or dataset node)
     * - A callable with signature `fn(\rdfInterface\QuadInterface, \rdfInterface\DatasetInterface): bool`
     *   All quads for which the callable returns true are copied.
     * 
     * If the callback returns null, the quad should be removed from the dataset node.
     * 
     * @param callable $fn a callback with signature `fn(\rdfInterface\Quad, \rdfInterface\Dataset): \rdfInterface\Quad|null`
     *    modyfying a single quad
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return void
     */
    public function forEach(callable $fn,
                            QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): void;

    // ArrayAccess (with narrower types)

    /**
     * Checks if a given offset exists. The check is performed only among quads
     * which subject matching dataset node's node.
     * 
     * The offset can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompare interface.
     * - A callable with the `fn(\rdfInterface\Quad, \rdfInterface\Dataset): bool`
     *   signature. Matching quads are the ones for which the callable returns
     *   `true`.
     *   If more than one quad is matched \UnexpectedValueException must be thrown.
     * - `0`. This is a shorthand syntax for checking if the dataset node contains
     *   any quad with subject matching dataset node's node.
     * 
     * If the $offset is specified differently, \UnexpectedValueException is thrown.
     * 
     * If exactly one quad is matched, `true` is returned.
     * 
     * If no quad is matched, `false` is returned.
     * 
     * If the $offset matches more than one quad, 
     * \rdfInterface\MultipleQuadsMatchedException is thrown.
     * 
     * @param QuadCompareInterface|callable|int<0, 0> $offset
     * @return bool
     * @throws \UnexpectedValueException
     * @throws MultipleQuadsMatchedException
     */
    public function offsetExists(mixed $offset): bool;

    /**
     * Returns a quad matching the $offset and having a subject matching dataset 
     * node's node.
     * 
     * The $offset can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompare interface.
     * - A callable with the `fn(\rdfInterface\Quad, \rdfInterface\Dataset): bool`
     *   signature. Matching quads are the ones for which the callable returns
     *   `true`.
     * - `0` Returns any single quad.
     *   The main use case is enabling the `$dataset[0] ?? $defaultQuad` syntax
     *   for "unpacking" a dataset containing one or zero quads.
     *   As quads within a dataset don't have order, it makes no sense to access 
     *   them using other integer offsets and an attempt of doing so must
     *   throw an \UnexpectedValueException.
     * 
     * If the $offset is specified differently, \UnexpectedValueException is thrown.
     * 
     * If the $offset is `0` and the dataset contains any quad with subject
     * maching dataset node's node, any of those quads is returned.
     * 
     * If exactly one quad is matched, it is returned.
     * 
     * If the $offset matches more than one quad, 
     * \rdfInterface\MultipleQuadsMatchedException is thrown.
     * 
     * If the $offset matches no quads, \UnexpectedValueException is thrown.
     * 
     * @param QuadCompareInterface|callable|int<0, 0> $offset
     * @return QuadInterface
     * @throws \UnexpectedValueException
     * @throws MultipleQuadsMatchedException
     */
    public function offsetGet(mixed $offset): QuadInterface;

    /**
     * Assigns a new value to the quad matching the $offset and having subject
     * matching dataset node's node.
     * 
     * The new quad may have a different subject.
     * 
     * Offset can be specified as:
     * 
     * - `null` which is just a shorthand to `add($value)`. In this case the
     *   $value subject does not need to match dataset node's node.
     * - An object implementing the \rdfInterface\QuadCompare interface.
     *   If more than one quad is matched \OutOfBoundsException must be thrown.
     * - A callable with the `fn(\rdfInterface\Quad, \rdfInterface\Dataset): bool`
     *   signature. Matching quads are the ones for which the callable returns
     *   `true`. If more than one quad is matched \OutOfBoundsException must be 
     *   thrown.
     * 
     * @see DatasetInterface::offsetSet()
     * @param QuadCompareInterface|callable $offset
     * @param QuadInterface $value
     * @return void
     * @throws \UnexpectedValueException
     * @throws MultipleQuadsMatchedException
     */
    public function offsetSet($offset, $value): void;

    /**
     * Removes a quad matching the $offset and having subject matching dataset
     * node's node.
     * 
     * Offset can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompare interface.
     * - A callable with the `fn(\rdfInterface\Quad, \rdfInterface\Dataset): bool`
     *   signature. Matching quads are the ones for which the callable returns
     *   `true`.
     * 
     * If the $offset is specified differently, \UnexpectedValueException is thrown.
     * 
     * If the $offset matches more than one quad, 
     * \rdfInterface\MultipleQuadsMatchedException is thrown.
     * 
     * If exactly one quad is matched, it is removed.
     * 
     * If no quad is matched, nothing happens.
     * 
     * @param QuadCompareInterface|callable $offset
     * @return void
     * @throws \UnexpectedValueException
     * @throws MultipleQuadsMatchedException
     */
    public function offsetUnset($offset): void;

    // bool checks

    /**
     * Checks if all quads of a dataset node with subject matching dataset node's
     * node match a given filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable $filter
     * @return bool
     */
    public function every(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable $filter): bool;

    /**
     * Checks if none of quads of a dataset node with subject matching dataset node's
     * node match a given filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable $filter
     * @return bool
     */
    public function none(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable $filter): bool;

    /**
     * Checks if any quad of a dataset node with subject matching dataset node's
     * node match a given filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable $filter
     * @return bool
     */
    public function any(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable $filter): bool;

    // various getters

    /**
     * Fetches an iterator over unique set of dataset quad subjects having
     * subject matching dataset node's node and optionally matching a given filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermIteratorInterface
     */
    public function listSubjects(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermIteratorInterface;

    /**
     * Fetches an iterator over unique set of dataset node quad predicates having
     * subject matching dataset node's node and optionally matching a given filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermIteratorInterface
     */
    public function listPredicates(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermIteratorInterface;

    /**
     * Fetches an iterator over unique set of dataset node quad objects having
     * subject matching dataset node's node and optionally matching a given filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermIteratorInterface
     */
    public function listObjects(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermIteratorInterface;

    /**
     * Fetches an iterator over unique set of dataset node quad graphs having
     * subject matching dataset node's node and optionally matching a given filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermIteratorInterface
     */
    public function listGraphs(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermIteratorInterface;

    /**
     * Fetches subject of a first quad matching a given filter and subject
     * matching dataset node's node or null otherwise.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermInterface | null
     */
    public function getSubject(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermInterface | null;

    /**
     * Fetches predicate of a first quad matching a given filter and subject
     * matching dataset node's node or null otherwise.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     */
    public function getPredicate(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): NamedNodeInterface | null;

    /**
     * Fetches object of a first quad mathing a given filter and subject
     * matching dataset node's node or null otherwise.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermInterface | null
     */
    public function getObject(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermInterface | null;

    /**
     * Fetches graph of a first quad matching a given filter and subject
     * matching dataset node's node or null otherwise.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermInterface | null
     */
    public function getGraph(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermInterface | null;

    /**
     * Returns result of calling the getValue() method on a subject of a first quad
     * having subject matching dataset node's node and matching a given filter 
     * or null otherwise.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return mixed
     */
    public function getSubjectValue(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): mixed;

    /**
     * Returns result of calling the getValue() method on a subject of a first quad
     * having subject matching dataset node's node and matching a given filter 
     * or null otherwise.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return mixed
     */
    public function getPredicateValue(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): mixed;

    /**
     * Returns result of calling the getValue() method on a subject of a first quad
     * having subject matching dataset node's node and matching a given filter 
     * or null otherwise.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return mixed
     */
    public function getObjectValue(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): mixed;

    /**
     * Returns result of calling the getValue() method on a subject of a first quad
     * having subject matching dataset node's node and matching a given filter 
     * or null otherwise.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return mixed
     */
    public function getGraphValue(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): mixed;
}
