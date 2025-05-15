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

namespace rdfHelpers;

use rdfInterface\QuadCompareInterface;
use rdfInterface\QuadIteratorInterface;
use rdfInterface\QuadIteratorAggregateInterface;
use rdfInterface\TermIteratorInterface;
use rdfInterface\TermInterface;
use rdfInterface\NamedNodeInterface;

/**
 *
 * @author zozlak
 */
trait DatasetGettersTrait {

    /**
     * Fetches an iterator over unique set of dataset quad subjects.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermIteratorInterface
     */
    abstract public function listSubjects(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermIteratorInterface;

    /**
     * Fetches an iterator over unique set of dataset quad predicates.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermIteratorInterface
     */
    abstract public function listPredicates(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermIteratorInterface;

    /**
     * Fetches an iterator over unique set of dataset quad objects.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermIteratorInterface
     */
    abstract public function listObjects(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermIteratorInterface;

    /**
     * Fetches an iterator over unique set of dataset quad graphs.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermIteratorInterface
     */
    abstract public function listGraphs(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermIteratorInterface;

    /**
     * Fetches subject of a first quad matching a given filter or null if no quad matches the filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermInterface | null
     */
    public function getSubject(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermInterface | null {
        return $this->listSubjects($filter)->current();
    }

    /**
     * Fetches subject of a first quad matching a given filter or null if no quad matches the filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return NameNodeInterface | null
     */
    public function getPredicate(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): NamedNodeInterface | null {
        return $this->listPredicates($filter)->current();
    }

    /**
     * Fetches object of a first quad matching a given filter or null if no quad matches the filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermInterface | null
     */
    public function getObject(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermInterface | null {
        return $this->listObjects($filter)->current();
    }

    /**
     * Fetches graph of a first quad matching a given filter or null if no quad matches the filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return TermInterface | null
     */
    public function getGraph(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): TermInterface | null {
        return $this->listGraphs($filter)->current();
    }

    /**
     * Returns result of calling the getValue() method on a subject of a first quad matching a given filter or null if no quad matches the filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return mixed
     */
    public function getSubjectValue(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): mixed {
        return $this->getSubject($filter)?->getValue();
    }

    /**
     * Returns result of calling the getValue() method on a subject of a first quad matching a given filter or null if no quad matches the filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return mixed
     */
    public function getPredicateValue(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): mixed {
        return $this->getPredicate($filter)?->getValue();
    }

    /**
     * Returns result of calling the getValue() method on a subject of a first quad matching a given filter or null if no quad matches the filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return mixed
     */
    public function getObjectValue(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): mixed {
        return $this->getObject($filter)?->getValue();
    }

    /**
     * Returns result of calling the getValue() method on a subject of a first quad matching a given filter or null if no quad matches the filter.
     * 
     * @param QuadCompareInterface|QuadIteratorInterface|QuadIteratorAggregateInterface|callable|null $filter
     * @return mixed
     */
    public function getGraphValue(QuadCompareInterface | QuadIteratorInterface | QuadIteratorAggregateInterface | callable | null $filter = null): mixed {
        return $this->getGraph($filter)?->getValue();
    }
}
