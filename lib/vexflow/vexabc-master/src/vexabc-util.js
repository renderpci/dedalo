/*
 * VexABC - ABC notation parser and renderer for VexFlow
 *
 * Copyright (c) 2012-2013 Mikael Nousiainen
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

var VexAbcDef = require("./vexabc-def");

var VexAbcUtil = function() {
};

VexAbcUtil.isDataNotePitchEqual = function(dataNote1, dataNote2) {
  return ((dataNote1.pitch === dataNote2.pitch) && (dataNote1.octave === dataNote2.octave));
};

VexAbcUtil.findEqualDataNotePitchIndices = function(dataNotes1, dataNotes2, fromIndices) {
  var result = {
    firstIndices: [],
    secondIndices: []
  };

  var length;
  if (fromIndices) {
    length = fromIndices.length;
  } else {
    length = dataNotes2.length;
  }

  for (var i = 0; i < length; i++) {
    var index;
    if (fromIndices) {
      index = fromIndices[i];
    } else {
      index = i;
    }

    var dataNote1 = dataNotes1[index];

    for (var j = 0; j < dataNotes2.length; j++) {
      var dataNote2 = dataNotes2[j];

      if (VexAbcUtil.isDataNotePitchEqual(dataNote1, dataNote2)) {
        result.firstIndices.push(index);
        result.secondIndices.push(j);
      }
    }
  }

  return result;
};

VexAbcUtil.fractionDurationToVexFlowDuration = function(noteValue) {
  var factor = Math.log(VexAbcDef.DURATION_RESOLUTION) / Math.LN2;

  var pow = Math.floor(Math.log(noteValue) / Math.LN2);

  var value = Math.pow(2,factor - pow);
  var remainder = noteValue - Math.pow(2,pow);
  var dots = 0;

  while (remainder > 0) {
    remainder = remainder - Math.pow(2, pow - 1 - dots);
    dots = dots + 1;
  }

  // Durations longer than one measure are not supported
  if (value < 1) {
    return null;
  }

  return {value: value.toString(), dots: dots};
};

VexAbcUtil.convertFractionDurationToVexFlowDuration = function(multiplier, noteValue) {
  var factor = VexAbcDef.DURATION_RESOLUTION / noteValue;
  var durationTicks = multiplier * factor;

  var result = VexAbcUtil.fractionDurationToVexFlowDuration(durationTicks);
  if (!result) {
    return null;
  }

  result.beamable = (durationTicks < (VexAbcDef.DURATION_RESOLUTION / 4));

  return result;
};

VexAbcUtil.isBeamedDuration = function(multiplier, noteValue) {
  var factor = VexAbcDef.DURATION_RESOLUTION / noteValue;
  var durationTicks = multiplier * factor;
  return (durationTicks < (VexAbcDef.DURATION_RESOLUTION / 4));
};

VexAbcUtil.getRestNoteKeyForClef = function(clef) {
  var key = VexAbcDef.restNoteKeyForClef[clef];
  if (!key) {
    return "b/4";
  }

  return key;
};

VexAbcUtil.convertAbcDecorationToVexFlowArticulation = function (decoration) {
  return VexAbcDef.abcDecorationToVexFlowArticulation[decoration];
};


VexAbcUtil.getVexFlowAnnotationStyle = function(id) {
  return VexAbcDef.vexFlowAnnotationStyle[id];
};

VexAbcUtil.convertAbcDecorationToVexFlowAnnotation = function (decoration) {
  return VexAbcDef.abcDecorationToVexFlowAnnotation[decoration];
};

/*
TODO: decorations using text annotations:

!D.S.!                 the letters D.S. (=Da Segno)
!D.C.!                 the letters D.C. (=either Da Coda or Da Capo)
!dacoda!               the word "Da" followed by a Coda sign
!dacapo!               the words "Da Capo"
!fine!                 the word "fine"

TODO: VexFlow probably supports these too:
!segno!                2 ornate s-like symbols separated by a diagonal line
!coda!                 a ring with a cross in it

*/

module.exports = VexAbcUtil;
