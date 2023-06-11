<?php

namespace EasyRdf;

/**
 * EasyRdf
 *
 * LICENSE
 *
 * Copyright (c) 2009-2014 Nicholas J Humfrey.  All rights reserved.
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
 * @copyright  Copyright (c) 2009-2014 Nicholas J Humfrey
 * @license    https://www.opensource.org/licenses/bsd-license.php
 */

/**
 * Static class to set the HTTP client used by EasyRdf
 *
 * @copyright  Copyright (c) 2009-2014 Nicholas J Humfrey
 * @license    https://www.opensource.org/licenses/bsd-license.php
 */
class Http
{
    /**
     * The default HTTP Client object
     *
     * @var Http\Client|\Zend\Http\Client|\Laminas\Http\Client|null
     */
    private static $defaultHttpClient = null;

    /** Set the HTTP Client object used to fetch RDF data
     *
     * @param mixed $httpClient The new HTTP client object
     *
     * @return \EasyRdf\Http\Client|\Zend\Http\Client|\Laminas\Http\Client The new HTTP client object
     *
     * @throws \InvalidArgumentException
     *
     * @todo adapt datatype of parameter $httpClient (\EasyRdf\Http\Client|\Zend\Http\Client)
     */
    public static function setDefaultHttpClient($httpClient)
    {
        if (
            $httpClient instanceof \Zend\Http\Client
            || $httpClient instanceof Http\Client
            /*
             * PHPStan always complains:
             *      Instanceof between mixed and Laminas\Http\Client will always evaluate to false.
             *
             * Thats why it is ignored, to get full coverage.
             * The complaint makes no sense, because it only complains about this class and not others.
             */
            /* @phpstan-ignore-next-line */
            || $httpClient instanceof \Laminas\Http\Client
        ) {
            return self::$defaultHttpClient = $httpClient;
        }

        throw new \InvalidArgumentException('$httpClient should be an object of class Zend\Http\Client or EasyRdf\Http\Client');
    }

    /** Get the HTTP Client object used to fetch RDF data
     *
     * If no HTTP Client has previously been set, then a new
     * default (EasyRdf\Http\Client) client will be created.
     *
     * @return Http\Client|\Zend\Http\Client|\Laminas\Http\Client The HTTP client object
     */
    public static function getDefaultHttpClient()
    {
        if (!isset(self::$defaultHttpClient)) {
            self::$defaultHttpClient = new Http\Client();
        }

        return self::$defaultHttpClient;
    }
}
