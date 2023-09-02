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
 * Class containing static utility functions
 *
 * @copyright  Copyright (c) 2009-2014 Nicholas J Humfrey
 * @license    https://www.opensource.org/licenses/bsd-license.php
 */
class Utils
{
    /**
     * Convert a string into CamelCase
     *
     * A capital letter is inserted for any non-letter (including userscore).
     * For example:
     * 'hello world' becomes HelloWorld
     * 'rss-tag-soup' becomes RssTagSoup
     * 'FOO//BAR' becomes FooBar
     *
     * @param string $str The input string
     *
     * @return string The input string converted to CamelCase
     */
    public static function camelise($str)
    {
        $cc = '';
        foreach (preg_split('/[\W_]+/', $str) as $part) {
            $cc .= ucfirst(strtolower($part));
        }

        return $cc;
    }

    /**
     * Check if something is an associative array
     *
     * Note: this method only checks the key of the first value in the array.
     *
     * @param mixed $param The variable to check
     *
     * @return bool true if the variable is an associative array
     */
    public static function isAssociativeArray($param)
    {
        if (\is_array($param)) {
            $keys = array_keys($param);
            if (0 === $keys[0]) {
                return false;
            } else {
                return true;
            }
        } else {
            return false;
        }
    }

    /**
     * Remove the fragment from a URI (if it has one)
     *
     * @param mixed $uri A URI
     *
     * @return string The same URI with the fragment removed
     */
    public static function removeFragmentFromUri($uri)
    {
        $pos = strpos($uri, '#');
        if (false === $pos) {
            return $uri;
        } else {
            return substr($uri, 0, $pos);
        }
    }

    /** Return pretty-print view of a resource URI
     *
     * This method is mainly intended for internal use and is used by
     * EasyRdf\Graph and EasyRdf\Sparql\Result to format a resource
     * for display.
     *
     * @param mixed  $resource An EasyRdf\Resource object or an associative array
     * @param string $format   Either 'html' or 'text'
     * @param string $color    The colour of the text
     *
     * @return string
     *
     * @throws \InvalidArgumentException
     */
    public static function dumpResourceValue($resource, $format = 'html', $color = 'blue')
    {
        if (!preg_match('/^#?[-\w]+$/', $color)) {
            throw new \InvalidArgumentException('$color must be a legal color code or name');
        }

        if (\is_object($resource)) {
            $resource = (string) $resource;
        } elseif (\is_array($resource)) {
            $resource = $resource['value'];
        }

        $short = RdfNamespace::shorten($resource);
        if ('html' == $format) {
            $escaped = htmlentities($resource, \ENT_QUOTES);
            if ('_:' == substr($resource, 0, 2)) {
                $href = '#'.$escaped;
            } else {
                $href = $escaped;
            }
            if ($short) {
                return "<a href='$href' style='text-decoration:none;color:$color'>$short</a>";
            } else {
                return "<a href='$href' style='text-decoration:none;color:$color'>$escaped</a>";
            }
        } else {
            if ($short) {
                return $short;
            } else {
                return $resource;
            }
        }
    }

    /** Return pretty-print view of a literal
     *
     * This method is mainly intended for internal use and is used by
     * EasyRdf\Graph and EasyRdf\Sparql\Result to format a literal
     * for display.
     *
     * @param mixed  $literal An EasyRdf\Literal object or an associative array
     * @param string $format  Either 'html' or 'text'
     * @param string $color   The colour of the text
     *
     * @return string
     *
     * @throws \InvalidArgumentException
     */
    public static function dumpLiteralValue($literal, $format = 'html', $color = 'black')
    {
        if (!preg_match('/^#?[-\w]+$/', $color)) {
            throw new \InvalidArgumentException('$color must be a legal color code or name');
        }

        if (\is_object($literal)) {
            $literal = $literal->toRdfPhp();
        } elseif (!\is_array($literal)) {
            $literal = ['value' => $literal];
        }

        $text = '"'.$literal['value'].'"';
        if (isset($literal['lang'])) {
            $text .= '@'.$literal['lang'];
        }
        if (isset($literal['datatype'])) {
            $short = RdfNamespace::shorten($literal['datatype']);
            if ($short) {
                $text .= "^^$short";
            } else {
                $text .= '^^<'.$literal['datatype'].'>';
            }
        }

        if ('html' == $format) {
            return "<span style='color:$color'>".
                   htmlentities($text, \ENT_COMPAT, 'UTF-8').
                   '</span>';
        } else {
            return $text;
        }
    }

    /** Clean up and split a mime-type up into its parts
     *
     * @param string|null $mimeType A MIME Type, optionally with parameters
     *
     * @return array $type, $parameters
     */
    public static function parseMimeType($mimeType)
    {
        $mimeType = $mimeType ?? '';
        $parts = explode(';', strtolower($mimeType));
        $type = trim(array_shift($parts));
        $params = [];
        foreach ($parts as $part) {
            if (preg_match('/^\s*(\w+)\s*=\s*(.+?)\s*$/', $part, $matches)) {
                $params[$matches[1]] = $matches[2];
            }
        }

        return [$type, $params];
    }

    /** Execute a command as a pipe
     *
     * The proc_open() function is used to open a pipe to a
     * a command line process, writing $input to STDIN, returning STDOUT
     * and throwing an exception if anything is written to STDERR or the
     * process returns non-zero.
     *
     * @param string            $command The command to execute
     * @param array|string|null $args    Optional list of arguments to pass to the command
     * @param string            $input   Optional buffer to send to the command
     * @param string            $dir     Path to directory to run command in (defaults to /tmp)
     *
     * @return string The result of the command, printed to STDOUT
     *
     * @throws Exception
     */
    public static function execCommandPipe($command, $args = null, $input = null, $dir = null)
    {
        $command = (string) $command;

        $descriptorspec = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        // Use the system tmp directory by default
        if (!$dir) {
            $dir = sys_get_temp_dir();
        }

        if (\is_array($args)) {
            /*
             * PHP 8.1 change
             * avoids error
             *      Deprecated: escapeshellcmd(): Passing null to parameter #1 ($command) of type string
             *                  is deprecated in /var/www/html/lib/Utils.php on line 263
             */
            $entries = [];
            foreach (array_merge([$command], $args) as $entry) {
                if (\is_string($entry)) {
                    $entries[] = $entry;
                }
            }

            $fullCommand = implode(
                ' ',
                array_map('escapeshellcmd', $entries)
            );
        } else {
            $fullCommand = escapeshellcmd($command);
            if (\is_string($args)) {
                $fullCommand .= ' '.escapeshellcmd($args);
            }
        }

        $process = proc_open($fullCommand, $descriptorspec, $pipes, $dir);
        if (\is_resource($process)) {
            // $pipes now looks like this:
            // 0 => writeable handle connected to child stdin
            // 1 => readable handle connected to child stdout
            // 2 => readable handle connected to child stderr

            if ($input) {
                fwrite($pipes[0], $input);
            }
            fclose($pipes[0]);

            $output = stream_get_contents($pipes[1]);
            fclose($pipes[1]);
            $error = stream_get_contents($pipes[2]);
            fclose($pipes[2]);

            // It is important that you close any pipes before calling
            // proc_close in order to avoid a deadlock
            $returnValue = proc_close($process);
            if ($returnValue) {
                throw new Exception("Error while executing command $command: ".$error);
            }
        } else {
            throw new Exception("Failed to execute command $command");
        }

        return $output;
    }
}
