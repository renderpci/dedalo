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
interface DatasetInterface extends QuadIteratorAggregateInterface, \ArrayAccess, \Countable {

    public function __construct();

    public function __toString(): string;

    public function equals(DatasetInterface $other): bool;

    // Immutable set operations

    /**
     * Creates a copy of the dataset.
     * 
     * If $filter is provided, the copy contains only quads matching the $filter.
     * 
     * $filter can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompareInterface
     *   (e.g. a single Quad)
     * - An object implementing the \rdfInterface\QuadIteratorInterface
     *   (e.g. another Dataset)
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
     * $filter.
     * 
     * $filter can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompareInterface
     *   (e.g. a single Quad)
     * - An object implementing the \rdfInterface\QuadIteratorInterface
     *   (e.g. another Dataset)
     * - A callable with signature `fn(\rdfInterface\QuadInterface, \rdfInterface\DatasetInterface): bool`
     *   All quads for which the callable returns true are copied.
     * 
     * An in-place equivalent of a call using the $filter is the delete() method.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return DatasetInterface
     * @see delete()
     */
    public function copyExcept(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter): DatasetInterface;

    /**
     * Returns a new dataset being a union of the current one and the $other one.
     * 
     * For in-place union use add().
     * 
     * @param QuadInterface|QuadIteratorInterface|QuadIteratorAggregateInterface $other
     * @return DatasetInterface
     * @see add()
     */
    public function union(QuadInterface | QuadIteratorInterface | QuadIteratorAggregateInterface $other): DatasetInterface;

    /**
     * Returns a dataset being a symmetric difference of the current dataset and
     * the $other one.
     * 
     * There is no in-place equivalent.
     * 
     * @param QuadInterface|QuadIteratorInterface|QuadIteratorAggregateInterface $other
     * @return DatasetInterface
     */
    public function xor(QuadInterface | QuadIteratorInterface | QuadIteratorAggregateInterface $other): DatasetInterface;

    // In-place set operations

    /**
     * Adds quad(s) to the dataset.
     *
     * @param QuadInterface|QuadIteratorInterface|QuadIteratorAggregateInterface $quads
     * @return void
     */
    public function add(QuadInterface | QuadIteratorInterface | QuadIteratorAggregateInterface $quads): void;

    /**
     * In-place removes quads from the dataset.
     * 
     * All quads matching the $filter parameter are removed.
     * 
     * $filter can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompareInterface
     *   (e.g. a single Quad)
     * - An object implementing the \rdfInterface\QuadIteratorInterface
     *   (e.g. another Dataset)
     * - A callable with signature `fn(\rdfInterface\QuadInterface, \rdfInterface\DatasetInterface): bool`
     *   All quads for which the callable returns true are copied.
     * 
     * An immputable equivalent is the copyExcept($filter) method.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable $filter
     * @return DatasetInterface a dataset containing removed quads.
     * @see copyExcept()
     */
    public function delete(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable $filter): DatasetInterface; // callable(Quad, DatasetInterface)

    /**
     * In-place removes quads from the dataset.
     * 
     * All quads but ones matching the $filter parameter are removed.
     * 
     * $filter can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompareInterface
     *   (e.g. a single Quad)
     * - An object implementing the \rdfInterface\QuadIteratorInterface
     *   (e.g. another Dataset)
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
     * Iterates trough all quads replacing them with a callback result.
     * 
     * If the callback returns null, the quad should be removed from the dataset.
     * 
     * @param callable $fn with signature `fn(Quad, Dataset): ?Quad` to be run 
     *   an all quads
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable $filter
     * @return void
     */
    public function forEach(callable $fn,
                            QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable $filter = null): void;

    // ArrayAccess (with narrower types)

    /**
     * Checks if a given offset exists.
     * 
     * Offset can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompare interface.
     *   If more than one quad is matched \OutOfBoundsException must be thrown.
     * - A callable with the `fn(\rdfInterface\Quad, \rdfInterface\Dataset): bool`
     *   signature. Matching quads are the ones for which the callable returns
     *   `true`.
     *   If more than one quad is matched \OutOfBoundsException must be thrown.
     * - 0. This is a shorthand syntax for checking if the dataset is empty.
     *   The main use case is enabling the `$dataset[0] ?? $defaultQuad` syntax
     *   for "unpacking" a dataset containing one or zero quads.
     *   Passing any other integer value must throw an \OutOfBoundsException
     * 
     * @param QuadCompareInterface|callable|int<0, 0> $offset
     * @return bool
     * @throws \OutOfBoundsException
     */
    public function offsetExists(mixed $offset): bool;

    /**
     * Returns a quad matching the $offset.
     * 
     * The $offset can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompare interface.
     *   If more than one quad is matched \OutOfBoundsException must be thrown.
     * - A callable with the `fn(\rdfInterface\Quad, \rdfInterface\Dataset): bool`
     *   signature. Matching quads are the ones for which the callable returns
     *   `true`. If more than one quad is matched \OutOfBoundsException must be 
     *   thrown.
     * - 0. Returns any quad (or throws \OutOfBoundsException it a dataset is
     *   empty).
     *   The main use case is enabling the `$dataset[0] ?? $defaultQuad` syntax
     *   for "unpacking" a dataset containing one or zero quads.
     *   As quads within a dataset don't have order, it makes no sense to access 
     *   them using other integer offsets and an attempt of doing so must
     *   throw an \OutOfBoundsException.
     * 
     * @param QuadCompareInterface|callable|int<0, 0> $offset
     * @return QuadInterface
     * @throws \OutOfBoundsException
     */
    public function offsetGet(mixed $offset): QuadInterface;

    /**
     * Assigns a new value to the quad matching the $offset.
     * 
     * Offset can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompare interface.
     *   If more than one quad is matched \OutOfBoundsException must be thrown.
     * - A callable with the `fn(\rdfInterface\Quad, \rdfInterface\Dataset): bool`
     *   signature. Matching quads are the ones for which the callable returns
     *   `true`. If more than one quad is matched \OutOfBoundsException must be 
     *   thrown.
     * 
     * @param QuadCompareInterface|callable $offset
     * @param QuadInterface $value
     * @return void
     */
    public function offsetSet($offset, $value): void;

    /**
     * Removes a quad matching the $offset.
     * 
     * Offset can be specified as:
     * 
     * - An object implementing the \rdfInterface\QuadCompare interface.
     *   If more than one quad is matched \OutOfBoundsException must be thrown.
     * - A callable with the `fn(\rdfInterface\Quad, \rdfInterface\Dataset): bool`
     *   signature. Matching quads are the ones for which the callable returns
     *   `true`.If more than one quad is matched \OutOfBoundsException must be 
     *   thrown.
     * 
     * @param QuadCompareInterface|callable $offset
     * @return void
     * @throws \OutOfBoundsException
     */
    public function offsetUnset($offset): void;

}
