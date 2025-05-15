<?php

/*
 * The MIT License
 *
 * Copyright 2021 zozlak.
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

/**
 * Main, edge(quad) and Dataset-oriented Dataset API
 *
 * @author zozlak
 * @extends \ArrayAccess<QuadInterface|QuadIteratorInterface|callable|int<0, 0>, QuadInterface>
 */
interface DatasetInterface extends QuadIteratorAggregateInterface, \ArrayAccess, \Countable, \Stringable {

    static public function factory(): DatasetInterface;

    public function equals(DatasetInterface $other): bool;

    // Immutable set operations

    /**
     * Creates a copy of the dataset.
     * 
     * If $filter is provided, the copy contains only quads matching the $filter.
     * 
     * The $filter can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompareInterface
     *   (e.g. a single Quad)
     * - An object implementing the \rdfInterface\QuadIteratorInterface
     *   or the \rdfInterface\QuadIteratorAggregateInterface (e.g. another Dataset)
     * - A callable with signature `fn(\rdfInterface\QuadInterface, \rdfInterface\DatasetInterface): bool`
     *   All quads for which the callable returns true are copied.
     * 
     * An in-place equivalent of a call using the $filter is the deleteExcept() method.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return DatasetInterface
     * @see deleteExcept
     */
    public function copy(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): DatasetInterface;

    /**
     * Creates a copy of the dataset.
     * 
     * If $filter is provided, the copy contains only quads not matching the 
     * The $filter.
     * 
     * The $filter can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompareInterface
     *   (e.g. a single quad)
     * - An object implementing the \rdfInterface\QuadIteratorInterface
     *   or the \rdfInterface\QuadIteratorAggregateInterface (e.g. another dataset)
     * - A callable with signature `fn(\rdfInterface\QuadInterface, \rdfInterface\DatasetInterface): bool`
     *   All quads for which the callable returns true are copied.
     * 
     * An in-place equivalent of a call using the $filter is the delete() method.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable $filter
     * @return DatasetInterface
     * @see delete()
     */
    public function copyExcept(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable $filter): DatasetInterface;

    /**
     * Returns a new dataset being a union of the current one and the $other one.
     * 
     * For a in-place union use add().
     * 
     * @param QuadInterface|QuadIteratorInterface|QuadIteratorAggregateInterface $other
     * @return DatasetInterface
     * @see add()
     */
    public function union(QuadInterface | QuadIteratorInterface | QuadIteratorAggregateInterface $other): DatasetInterface;

    /**
     * Returns a new dataset being a symmetric difference of the current dataset and
     * the $other one.
     * 
     * There is no in-place equivalent.
     * 
     * @param QuadInterface|QuadIteratorInterface|QuadIteratorAggregateInterface $other
     * @return DatasetInterface
     */
    public function xor(QuadInterface | QuadIteratorInterface | QuadIteratorAggregateInterface $other): DatasetInterface;

    /**
     * Returns a new dataset from quads processed with a given
     * callback function.
     * 
     * @param callable $fn function applied to every quad with signature `fn(QuadInterface, DatasetInterface)`
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return DatasetInterface
     */
    public function map(callable $fn,
                        QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): DatasetInterface;

    /**
     * Performs a reduce operation on the dataset quads.
     * 
     * The reduce operation consist of calling a given callback function on all
     * matching quads. The first call is made with the $initialValue passed as
     * the callback's $prevValue. Following calls pass previous callback's call
     * return value as the next callback's call $prevValue. The return value of
     * the last callback function call is the return value of the reduce() method.
     * 
     * @param callable $fn aggregate function with signature 
     *   `fn(mixed $prevValue, QuadInterface, DatasetInterface)`
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
     * @param QuadInterface|\Traversable<\rdfInterface\QuadInterface>|array<\rdfInterface\QuadInterface> $quads
     * @return void
     */
    public function add(QuadInterface | \Traversable | array $quads): void;

    /**
     * In-place removes quads from the dataset.
     * 
     * All quads matching the $filter parameter are removed.
     * 
     * The $filter can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompareInterface
     *   (e.g. a single quad)
     * - An object implementing the \rdfInterface\QuadIteratorInterface
     *   or the \rdfInterface\QuadIteratorAggregateInterface (e.g. another dataset)
     * - A callable with signature `fn(\rdfInterface\QuadInterface, \rdfInterface\DatasetInterface): bool`
     *   All quads for which the callable returns true are copied.
     * 
     * An immputable equivalent is the copyExcept($filter) method.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return DatasetInterface a dataset containing removed quads.
     * @see copyExcept()
     */
    public function delete(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): DatasetInterface; // callable(Quad, DatasetInterface)

    /**
     * In-place removes quads from the dataset.
     * 
     * All quads but ones matching the $filter parameter are removed.
     * 
     * The $filter can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompareInterface
     *   (e.g. a single quad)
     * - An object implementing the \rdfInterface\QuadIteratorInterface
     *   or the \rdfInterface\QuadIteratorAggregateInterface (e.g. another dataset)
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

    // In-place modification

    /**
     * In-place modifies all dataset quads using a given callback.
     * 
     * All quads matching the $filter parameter are modified.
     * 
     * The $filter can be specified as:
     * 
     * - `null` which matches all quads.
     * - An object implementing the \rdfInterface\QuadCompareInterface
     *   (e.g. a single quad)
     * - An object implementing the \rdfInterface\QuadIteratorInterface
     *   or the \rdfInterface\QuadIteratorAggregateInterface (e.g. another dataset)
     * - A callable with signature `fn(\rdfInterface\QuadInterface, \rdfInterface\DatasetInterface): bool`
     *   All quads for which the callable returns true are copied.
     * 
     * If the callback returns null, the quad should be removed from the dataset.
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
     * Checks if a given offset exists.
     * 
     * The offset can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompare interface.
     * - A callable with the `fn(\rdfInterface\Quad, \rdfInterface\Dataset): bool`
     *   signature. Matching quads are the ones for which the callable returns
     *   `true`.
     *   If more than one quad is matched \UnexpectedValueException must be thrown.
     * - `0`. This is a shorthand syntax for checking if the dataset is empty.
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
     * Returns a quad matching the $offset.
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
     * If the $offset is `0` and the dataset is not empty, any quad is returned.
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
     * Assigns a new value to the quad matching the $offset.
     * 
     * Offset can be specified as:
     * 
     * - `null` which is just a shorthand to `add($value)`
     * - An object implementing the \rdfInterface\QuadCompare interface.
     *   If more than one quad is matched \UnexpectedValueException must be thrown.
     * - A callable with the `fn(\rdfInterface\Quad, \rdfInterface\Dataset): bool`
     *   signature. Matching quads are the ones for which the callable returns
     *   `true`. If more than one quad is matched \UnexpectedValueException must be 
     *   thrown.
     * 
     * If the $offset is specified differently, \UnexpectedValueException is thrown.
     * 
     * If the $offset is `null`, a new quad is added to the dataset.
     * 
     * If exactly one quad is matched by the $offset, it is updated.
     * 
     * If the $offset matches more than one quad, 
     * \rdfInterface\MultipleQuadsMatchedException is thrown.
     * 
     * If the $offset matches no quad, \UnexpectedValueException is thrown.
     * 
     * @param QuadCompareInterface|callable|null $offset
     * @param QuadInterface $value
     * @return void
     * @throws \UnexpectedValueException
     * @throws MultipleQuadsMatchedException
     */
    public function offsetSet($offset, $value): void;

    /**
     * Removes a quad matching the $offset.
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
     * Checks if all quads in the dataset match a given filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable $filter
     * @return bool
     */
    public function every(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable $filter): bool;

    /**
     * Checks if no quad in the dataset matches a given filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable $filter
     * @return bool
     */
    public function none(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable $filter): bool;

    /**
     * Checks if any quad in the dataset matches a given filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable $filter
     * @return bool
     */
    public function any(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable $filter): bool;

    // various getters

    /**
     * Fetches an iterator over unique set of dataset quad subjects optionally 
     * matching a given filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermIteratorInterface
     */
    public function listSubjects(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermIteratorInterface;

    /**
     * Fetches an iterator over unique set of dataset quad predicates optionally 
     * matching a given filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermIteratorInterface
     */
    public function listPredicates(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermIteratorInterface;

    /**
     * Fetches an iterator over unique set of dataset quad objects optionally 
     * matching a given filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermIteratorInterface
     */
    public function listObjects(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermIteratorInterface;

    /**
     * Fetches an iterator over unique set of dataset quad graphs optionally 
     * matching a given filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermIteratorInterface
     */
    public function listGraphs(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermIteratorInterface;

    /**
     * Fetches subject of a first quad matching a given filter or null if no quad matches the filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermInterface | null
     */
    public function getSubject(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermInterface | null;

    /**
     * Fetches subject of a first quad matching a given filter or null if no quad matches the filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return NamedNodeInterface | null
     */
    public function getPredicate(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): NamedNodeInterface | null;

    /**
     * Fetches object of a first quad matching a given filter or null if no quad matches the filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermInterface | null
     */
    public function getObject(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermInterface | null;

    /**
     * Fetches graph of a first quad matching a given filter or null if no quad matches the filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermInterface | null
     */
    public function getGraph(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermInterface | null;

    /**
     * Returns result of calling the getValue() method on a subject of a first quad matching a given filter or null if no quad matches the filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return mixed
     */
    public function getSubjectValue(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): mixed;

    /**
     * Returns result of calling the getValue() method on a subject of a first quad matching a given filter or null if no quad matches the filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return mixed
     */
    public function getPredicateValue(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): mixed;

    /**
     * Returns result of calling the getValue() method on a subject of a first quad matching a given filter or null if no quad matches the filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return mixed
     */
    public function getObjectValue(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): mixed;

    /**
     * Returns result of calling the getValue() method on a subject of a first quad matching a given filter or null if no quad matches the filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return mixed
     */
    public function getGraphValue(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): mixed;
}
