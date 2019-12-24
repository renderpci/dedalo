/*
 * VexABC - ABC notation parser and renderer for VexFlow
 *
 * Copyright (c) 2012-2013 Mikael Nousiainen
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

var VexAbcDef = function() {
};

VexAbcDef.DURATION_RESOLUTION = 262144;
VexAbcDef.DEFAULT_VOICE_ID = "default";

// Aim for stave center :)
VexAbcDef.restNoteKeyForClef = {
  "treble": "b/4",
  "alto": "c/4",
  "tenor": "a/3",
  "bass": "d/3",
  "perc": "b/4"
};

VexAbcDef.abcDecorationToVexFlowArticulation = {
  "staccato": "a.", // staccato
  "staccatissimo": "av", // staccatissimo (non-standard)
  "accent": "a>", // accent
  "emphasis": "a>", // accent
  ">": "a>", // accent
  "tenuto": "a-", // tenuto
  "marcato": "a^", // marcato (marcatissimo?) (non-standard)
  "+": "a+", // left hand pizzicato
  "plus": "a+", // left hand pizzicato
  "snap": "ao", // snap pizzicato
  "thumb:": "ao", // snap pizzicato
  "fermata": "a@a", // fermata above staff
  "invertedfermata": "a@u", // fermata below staff
  "upbow": "a|", // up-bown - up stroke
  "downbow": "am" // down-bow - down stroke
};

VexAbcDef.vexFlowAnnotationStyle = {
  "text": {
    fontName: "Times",
    fontSize: 12,
    fontWeight: "",
    verticalPosition: "above",
    justification: "center"
  },
  "dynamics": {
    fontName: "Times",
    fontSize: 14,
    fontWeight: "italic",
    verticalPosition: "below",
    justification: "center"
  },
  "other": {
    fontName: "Times",
    fontSize: 14,
    fontWeight: "italic",
    verticalPosition: "above",
    justification: "center"
  },
  "chordSymbol": {
    fontName: "Times",
    fontSize: 14,
    fontWeight: "bold",
    verticalPosition: "above",
    justification: "center"
  },
  "fingering": {
    fontName: "Times",
    fontSize: 10,
    fontWeight: "",
    verticalPosition: "above",
    justification: "center"
  }
};

VexAbcDef.abcDecorationToVexFlowAnnotation = {
  "0": {
    type: "annotation",
    style: "fingering",
    value: "0"
  },
  "1": {
    type: "annotation",
    style: "fingering",
    value: "1"
  },
  "2": {
    type: "annotation",
    style: "fingering",
    value: "2"
  },
  "3": {
    type: "annotation",
    style: "fingering",
    value: "3"
  },
  "4": {
    type: "annotation",
    style: "fingering",
    value: "4"
  },
  "5": {
    type: "annotation",
    style: "fingering",
    value: "5"
  },
  "pppp": {
    type: "annotation",
    style: "dynamics",
    value: "pppp"
  },
  "ppp": {
    type: "annotation",
    style: "dynamics",
    value: "ppp"
  },
  "pp": {
    type: "annotation",
    style: "dynamics",
    value: "pp"
  },
  "p": {
    type: "annotation",
    style: "dynamics",
    value: "p"
  },
  "mp": {
    type: "annotation",
    style: "dynamics",
    value: "mp"
  },
  "mf": {
    type: "annotation",
    style: "dynamics",
    value: "mf"
  },
  "f": {
    type: "annotation",
    style: "dynamics",
    value: "f"
  },
  "ff": {
    type: "annotation",
    style: "dynamics",
    value: "ff"
  },
  "fff": {
    type: "annotation",
    style: "dynamics",
    value: "fff"
  },
  "ffff": {
    type: "annotation",
    style: "dynamics",
    value: "ffff"
  },
  "sfz": {
    type: "annotation",
    style: "dynamics",
    value: "sfz"
  },
  "trill": {
    type: "annotation",
    style: "other",
    value: "tr"
  }
};

module.exports = VexAbcDef;
