<?php

/*
 * The MIT License
 *
 * Copyright 2022 zozlak.
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
 * Description of QuadIteratorAggregateInterface
 *
 * @author zozlak
 * @extends \IteratorAggregate<QuadIteratorInterface>
 */
interface QuadIteratorAggregateInterface extends \IteratorAggregate {

    /**
     * Returns QuadIteratorInterface iterating over dataset's quads.
     * 
     * If $filter is provided, the iterator includes only quads matching the
     * filter.
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
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return QuadIteratorInterface
     */
    public function getIterator(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): QuadIteratorInterface;
}
