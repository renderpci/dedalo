
/*
 * VexABC - ABC notation parser and renderer for VexFlow
 *
 * Copyright (c) 2012-2013 Mikael Nousiainen
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

var VexAbcPegJsParser = require("vexabc-pegjs-parser");

var VexAbcParser = function() {
  // empty
};

VexAbcParser.prototype.parse = function(abcTextInput) {
  try {
    return VexAbcPegJsParser.parse(abcTextInput);
  } catch (e) {
    throw {
      name: "VexAbcParserException",
      message: "At line " + e.line + ", column " + e.column +
        " (offset " + e.offset + "): Expected \"" + e.expected +
        "\", but found: " + e.found,
      line: e.line,
      column: e.column,
      offset: e.offset,
      expected: e.expected,
      found: e.found
    };
  }
};

module.exports = VexAbcParser;

/*
        var pegParser;
        try {
          pegParser = PEG.buildParser(parserDefinitionText);
        } catch (e) {
          $("#error").html("<code>Error in parser definition: " + e.message + "</code>");
          return false;
        }
*/
