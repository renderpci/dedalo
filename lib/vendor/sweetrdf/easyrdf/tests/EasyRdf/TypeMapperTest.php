<?php

namespace Tests\EasyRdf;

use EasyRdf\Graph;
use EasyRdf\Resource;
use EasyRdf\TypeMapper;
use Test\TestCase;

/**
 * EasyRdf
 *
 * LICENSE
 *
 * Copyright (c) 2009-2015 Nicholas J Humfrey.  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 3. The name of the author 'Nicholas J Humfrey" may be used to endorse or
 *    promote products derived from this software without specific prior
 *    written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 * @copyright  Copyright (c) 2021 Konrad Abicht <hi@inspirito.de>
 * @copyright  Copyright (c) 2009-2015 Nicholas J Humfrey
 * @license    https://www.opensource.org/licenses/bsd-license.php
 */
class TypeMapperTest extends TestCase
{
    protected function setUp(): void
    {
        TypeMapper::set('rdf:mytype', TypeClassStub::class);
    }

    protected function tearDown(): void
    {
        TypeMapper::delete('rdf:mytype');
        TypeMapper::delete('foaf:Person');
    }

    public function testGet()
    {
        $this->assertSame(
            TypeClassStub::class,
            TypeMapper::get('rdf:mytype')
        );
    }

    public function testGetUri()
    {
        $this->assertSame(
            TypeClassStub::class,
            TypeMapper::get(
                'http://www.w3.org/1999/02/22-rdf-syntax-ns#mytype'
            )
        );
    }

    public function testGetNull()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('$type should be a string and cannot be null or empty');

        TypeMapper::get(null);
    }

    public function testGetEmpty()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('$type should be a string and cannot be null or empty');

        TypeMapper::get('');
    }

    public function testGetNonString()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('$type should be a string and cannot be null or empty');

        TypeMapper::get([]);
    }

    public function testGetUnknown()
    {
        $this->assertNull(TypeMapper::get('unknown:type'));
    }

    public function testSetUri()
    {
        TypeMapper::set(
            'http://xmlns.com/foaf/0.1/Person',
            TypeClassStub::class
        );

        $this->assertSame(
            TypeClassStub::class,
            TypeMapper::get('foaf:Person')
        );
    }

    public function testSetTypeNull()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('$type should be a string and cannot be null or empty');
        TypeMapper::set(null, TypeClassStub::class);
    }

    public function testSetTypeEmpty()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('$type should be a string and cannot be null or empty');
        TypeMapper::set('', TypeClassStub::class);
    }

    public function testSetTypeNonString()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('$type should be a string and cannot be null or empty');
        TypeMapper::set([], TypeClassStub::class);
    }

    public function testSetClassNull()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('$class should be a string and cannot be null or empty');
        TypeMapper::set('rdf:mytype', null);
    }

    public function testSetClassEmpty()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('$class should be a string and cannot be null or empty');
        TypeMapper::set('rdf:mytype', '');
    }

    public function testSetClassNonString()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('$class should be a string and cannot be null or empty');
        TypeMapper::set('rdf:mytype', []);
    }

    public function testDelete()
    {
        $this->assertSame(TypeClassStub::class, TypeMapper::get('rdf:mytype'));
        TypeMapper::delete('rdf:mytype');
        $this->assertNull(TypeMapper::get('rdf:mytype'));
    }

    public function testDeleteTypeNull()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('$type should be a string and cannot be null or empty');
        TypeMapper::delete(null);
    }

    public function testDeleteTypeEmpty()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('$type should be a string and cannot be null or empty');
        TypeMapper::delete('');
    }

    public function testDeleteTypeNonString()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('$type should be a string and cannot be null or empty');
        TypeMapper::delete([]);
    }

    public function testSetNonExtendingDefaultResourceClass()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Given class should have EasyRdf\Resource as an ancestor');

        TypeMapper::setDefaultResourceClass(Graph::class);
    }

    public function testSetBaseDefaultResourceClass()
    {
        TypeMapper::setDefaultResourceClass(Resource::class);
        $this->assertEquals(Resource::class, TypeMapper::getDefaultResourceClass());
    }

    public function testSetDefaultResourceClass()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Given class should be an existing class');

        TypeMapper::setDefaultResourceClass('FooBar\Resource');
    }

    public function testSetDefaultResourceClassEmptyString()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('$class should be a string and cannot be null or empty');

        TypeMapper::setDefaultResourceClass('');
    }

    public function testSetDefaultResourceClassNull()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('$class should be a string and cannot be null or empty');

        TypeMapper::setDefaultResourceClass(null);
    }

    public function testSetDefaultResourceClassNonString()
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('$class should be a string and cannot be null or empty');

        TypeMapper::setDefaultResourceClass([]);
    }

    public function testInstantiate()
    {
        TypeMapper::set('foaf:Person', TypeClassStub::class);
        $data = readFixture('foaf.json');
        $graph = new Graph(
            'http://www.example.com/joe/foaf.rdf',
            $data,
            'json'
        );

        /** @var \Test\EasyRdf\TypeClassStub */
        $joe = $graph->resource('http://www.example.com/joe#me');
        $this->assertClass(TypeClassStub::class, $joe);
        $this->assertTrue($joe->myMethod());

        $joeFoaf = $graph->resource('http://www.example.com/joe/foaf.rdf');

        $this->assertClass(Resource::class, $joeFoaf);

        TypeMapper::setDefaultResourceClass(TypeClassStub::class);
        $graph = new Graph(
            'http://www.example.com/joe/foaf.rdf',
            $data,
            'json'
        );

        /** @var \Test\EasyRdf\TypeClassStub */
        $joesFoaf = $graph->resource('http://www.example.com/joe/foaf.rdf');
        $this->assertClass(TypeClassStub::class, $joesFoaf);
        $this->assertTrue($joesFoaf->myMethod());
    }
}
