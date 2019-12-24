/*
 * VexABC - ABC notation parser and renderer for VexFlow
 *
 * Copyright (c) 2012-2013 Mikael Nousiainen
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

{
  var state = {
    meter: null,
    clef: null,
    clefLine: null,
    clefMiddle: null,
    transpose: 0,
    octave: 0,
    staffLines: 5,
    unitNoteDuration: {
      multiplier: 1,
      noteValue: 8,
      explicitlySet: false
    },
    shortcuts: {
      ".": {
        type: "decoration",
        value: "staccato"
      },
      "~": {
        type: "decoration",
        value: "roll"
      },
      "H": {
        type: "decoration",
        value: "fermata"
      },
      "L": {
        type: "decoration",
        value: "accent"
      },
      "M": {
        type: "decoration",
        value: "lowermordent"
      },
      "O": {
        type: "decoration",
        value: "coda"
      },
      "P": {
        type: "decoration",
        value: "uppermordent"
      },
      "S": {
        type: "decoration",
        value: "segno"
      },
      "T": {
        type: "decoration",
        value: "trill"
      },
      "u": {
        type: "decoration",
        value: "upbow"
      },
      "v": {
        type: "decoration",
        value: "downbow"
      }
    }
  };
}

start
    = (whitespace / comment / newline)* header:tuneHeaderInformationField* body:elements* {
  // Post-process elements to apply broken rhythm duration changes
  if (body) {
    var previousGroupEntry = null;
    var brokenRhythm = null;

    for (var i = 0; i < body.length; i++) {
      var dataElement = body[i];

      if (dataElement.type == "group") {
        var group = dataElement.value;

        for (var j = 0; j < group.length; j++) {
          var groupEntry = group[j];

          if (groupEntry.type == "note" || groupEntry.type == "chord" ||
              groupEntry.type == "rest") {
            if (brokenRhythm != null) {
              groupEntry.duration.multiplier *= brokenRhythm.durationAfter.multiplier;
              groupEntry.duration.noteValue *= brokenRhythm.durationAfter.noteValue;
              brokenRhythm = null;
            }
            previousGroupEntry = groupEntry;
          } else if (groupEntry.type == "brokenRhythm") {
            if (brokenRhythm != null) {
              // TODO: how to handle this error
              console.log("Consecutive broken rhythm markers detected");
              continue;
            }

            brokenRhythm = groupEntry;

            if (previousGroupEntry != null) {
              previousGroupEntry.duration.multiplier *= brokenRhythm.durationBefore.multiplier;
              previousGroupEntry.duration.noteValue *= brokenRhythm.durationBefore.noteValue;
              previousGroupEntry = null;
            }
          }
        }        
      }
    }
  }

  return {
    header: header,
    body: body
  };
}

_ "whitespace"
    = whitespace*

whitespace "whitespace"
    = [ \t]

newline "newline"
    = continuation:"\\"? _ comment:comment? [\r] [\n]? {
  return {
    type: "lineBreak",
    continuation: continuation.length > 0,
    comment: comment
  };
} / continuation:"\\"? _ comment:comment? [\n] {
  return {
    type: "lineBreak",
    continuation: continuation.length > 0,
    comment: comment
  };
}

ignoredWhitespace "ignored whitespace"
    = [`]

comment "comment"
    = "%" value:[^\r\n]* {
  return {
    type: "comment",
    value: value.join("")
  };
}

tuneHeaderInformationField "tune header information field"
    = _ informationField:tuneHeaderInformationFieldChoice (newline / !.) {
  informationField.type = "informationField";
  return informationField;
}

tuneHeaderInformationFieldChoice "tune header information field choice"
    = instructionInformationField / tuneHeaderFreeTextInformationField /
      unknownInformationField

tuneHeaderFreeTextInformationField "tune header free text information field"
    = name:[ABCDFGHNORSTZr] ":" value:[^\r\n]* {
  return {
    name: name,
    value: value.join("")
  };
}

tuneBodyInformationField "tune body information field"
    = newline informationField:tuneBodyInformationFieldChoice {
  informationField.type = "informationField";
  return informationField;
}

tuneBodyInformationFieldChoice "tune body information field choice"
    = instructionInformationField / tuneHeaderFreeTextInformationField /
      unknownInformationField

tuneBodyFreeTextInformationField "tune body free text information field"
    = name:[NRTr] ":" value:[^\r\n]* {
  return {
    name: name,
    value: value.join("")
  };
}

unknownInformationField "unknown information field"
    = name:[A-Za-z] ":" value:[^\r\n]* {
  return {
    name: name,
    value: value.join("")
  };
}

inlineInformationField "inline information field"
    = "[" informationField:inlineInformationFieldChoice "]" {
  informationField.type = "informationField";
  return informationField;
}

inlineInformationFieldChoice "inline information field choice"
    = instructionInformationField / inlineFreeTextInformationField /
      inlineUnknownInformationField

inlineFreeTextInformationField "inline free text information field"
    = name:[NRr] ":" value:[^\r\n\]]* {
  return {
    name: name,
    value: value.join("")
  };
}

inlineUnknownInformationField "unknown inline information field"
    = name:[A-Za-z] ":" value:[^\r\n\]]* {
  return {
    name: name,
    value: value.join("")
  };
}

instructionInformationField "instruction information field"
    = "K:" _ value:keyInformationFieldValue _ {
  return {
    name: "K",
    value: value
  };
} / "L:" value:unitNoteDurationInformationFieldValue {
  state.unitNoteDuration.multiplier = value.multiplier;
  state.unitNoteDuration.noteValue = value.noteValue;
  state.unitNoteDuration.explicitlySet = true;

  return {
    name: "L",
    value: value
  };
} / "M:" _ value:meterInformationFieldValue _ {
  if (!state.unitNoteDuration.explicitlySet) {
    var meterDecimal = value.multiplier / value.noteValue;

    if (meterDecimal < 0.75) {
      state.unitNoteDuration.multiplier = 1;
      state.unitNoteDuration.noteValue = 16;
    } else {
      state.unitNoteDuration.multiplier = 1;
      state.unitNoteDuration.noteValue = 8;
    }
  }

  return {
    name: "M",
    value: value
  };
} / "U:" _ shortcutIdentifier:[H-Wh-w~] _ "=" _
      value:(decoration / annotation / chordSymbol) _ {
  state.shortcuts[shortcutIdentifier] = value;

  return {
    name: "U",
    identifier: shortcutIdentifier,
    value: value
  };
}

unitNoteDurationInformationFieldValue "unit note duration information field"
    =  multiplier:[0-9]+ "/" noteValue:[0-9]+ {
  return {
    multiplier: multiplier.join(""),
    noteValue: noteValue.join("")
  };
} / multiplier:[0-9]+ {
  return {
    multiplier: multiplier.join(""),
    noteValue: 1
  };
}

meterInformationFieldValue "meter information field"
    =  "none" {
  return null;
} / "C|" {
  return {
    multiplier: 2,
    noteValue: 2,
    symbol: "C|"
  };
} / "C" {
  return {
    multiplier: 4,
    noteValue: 4,
    symbol: "C"
  };
} / multiplier:[0-9]+ "/" noteValue:[0-9]+ {
  return {
    multiplier: multiplier.join(""),
    noteValue: noteValue.join("")
  };
}

keyInformationFieldValue "key information field value"
    = firstPart:keyInformationFieldValuePart otherParts:(whitespace+
        part:keyInformationFieldValuePart { return part; })* {
  var field = firstPart;
  for (var i = 0; i < otherParts.length; i++) {
    _.extend(field, otherParts[i]);
  }
  return field;
}

keyInformationFieldValuePart "key information field value part"
    =  keyInformationFieldKey / keyInformationFieldClef /
       keyInformationFieldClefMiddle / keyInformationFieldTranspose /
       keyInformationFieldOctave / keyInformationFieldStaffLines

keyIdentifier "key identifier"
    = "none" /
      "C" ![b#m] / "Am" /
      "F" ![b#m] / "Dm" / 
      "Bb" ![m] / "Gm" /
      "Eb" ![m] / "Cm" /
      "Ab" ![m] / "Fm" /
      "Db" ![m] / "Bbm" /
      "Gb" ![m] / "Ebm" /
      "Cb" ![m] / "Abm" /
      "C#" ![m] / "A#m" /
      "F#" ![m] / "D#m" /
      "B" ![b#m] / "G#m" /
      "E" ![b#m] / "C#m" /
      "A" ![b#m] / "F#m" /
      "D" ![b#m] / "Bm" /
      "G" ![b#m] / "Em"

keyInformationFieldKey "key"
    = key:keyIdentifier {
  if (key instanceof Array) {
    key = key.join("");
  }
  return {
    key: key
  };
}

clefName "clef name"
    = "treble" / "alto" / "tenor" / "bass" / "perc" / "none"

keyInformationFieldClef "clef"
    = "clef="? clef:clefName clefLine:[0-9]? octaveTranspose:("+8"/"-8")? {
  if (!clef) {
    clef = "treble";
  }

  return {
    clef: clef,
    clefLine: clefLine,
    octaveTranspose: octaveTranspose
  };
}

keyInformationFieldClefMiddle "clef middle"
    = "middle=" clefMiddle:[A-Ga-g] {
  return {
    clefMiddle: clefMiddle.toUpperCase()
  };
}

keyInformationFieldTranspose "transpose semitones"
    = "transpose=" transpose:[0-9]+ {
  return {
    transpose: transpose.join("")
  };
}

keyInformationFieldOctave "octave shift"
    = "octave=" octave:[0-9]+ {
  return {
    octave: octave.join("")
  };
}

keyInformationFieldStaffLines "staff line count"
    = "stafflines=" staffLines:[0-9]+ {
  return {
    staffLines: staffLines.join("")
  };
}

elements
    = group / bar / repeat / variantEnding / comment /
      tuneBodyInformationField / inlineInformationField / newline

bar "bar line"
    = _ modifiers:modifiers? barLineType:barLineType variantEndingList:variantEndingList? _ {
  return {
    type: "bar",
    repeat: false,
    lineType: barLineType,
    variantEndings: variantEndingList,
    modifiers: modifiers
  };
}

barLineType "bar line type"
    = "[|]" { return "invisible"; } /
      "[|" { return "begin"; } /
      "|]" { return "end"; } /
      !"[" "||" ![\:\]] { return "double"; } /
      !"[" "|" ![\:\]] { return "single"; } /
      ".|" { return "dotted"; }

repeat "repeat"
    = _ repeatType:repeatType _ {
  var value = {
    type: "bar",
    repeat: true
  };
  _.extend(value, repeatType);
  return value;
}

repeatType "repeat type"
    = "|" count:":"+ {
  return {
    repeatType: "begin",
    repeatCount: count.length
  };
} / count:":"+ "|" variantEndingList:variantEndingList? ![\:\|] {
  return {
    repeatType: "end",
    repeatCount: count.length,
    variantEndings: variantEndingList
  };
} / (":|:" / ":||:" / "::") {
  return {
    repeatType: "end+begin",
    repeatCount: 1
  };
}

variantEnding "variant ending"
    = "[" variantEndingList:variantEndingList {
  return {
    type: "variantEnding",
    value: variantEndingList
  };
}

variantEndingList "variant ending list"
    = firstRange:variantEndingRange otherRanges:("," otherRange:variantEndingRange { return otherRange; } )* {
  var list = [];

  list.push(firstRange);

  for (var i = 0; i < otherRanges.length; i++) {
    list.push(otherRanges[i]);
  }

  return list;
}

variantEndingRange "variant ending range"
    = firstNumber:[0-9]+ lastNumber: ("-" number:[0-9]+ { return number; })? {
  var last = null;

  if (lastNumber) {
    last = parseInt(lastNumber.join(""));
  }

  return {
    first: parseInt(firstNumber.join("")),
    last: last
  };
}

group "group"
    = _ group:(note / rest / chord / tuplet / brokenRhythm / slur)+ _ {
  return {
    type: "group",
    value: group
  };
}

coreNote "core note"
    = accidental:accidental? note:(pitchLower / pitchUpper) octave:octave? duration:duration? {
  duration.multiplier *= state.unitNoteDuration.multiplier;
  duration.noteValue *= state.unitNoteDuration.noteValue;

  note.type = "note";
  note.accidental = accidental;
  note.octave = note.octave + octave;
  note.duration = duration;
  return note;
}

coreNoteWithTie "core note with tie"
    = note:coreNote tie:tie? {
  note.tie = tie;
  return note;
}

coreNoteWithTieAndModifiers "core note with tie and modifiers"
    = modifiers:modifiers? note:coreNoteWithTie {
  note.modifiers = modifiers;
  return note;
}

chord "chord"
    = ignoredWhitespace* graceNoteGroup:graceNoteGroupModifier? modifiers:modifiers? "[" notes:coreNoteWithTieAndModifiers+ "]" octave:octave? duration:duration? tie:tie? ignoredWhitespace* {
  return {
    type: "chord",
    graceNotes: graceNoteGroup,
    modifiers: modifiers,
    octave: octave,
    duration: duration,
    tie: tie,
    value: notes
  };
}

note "note"
    = ignoredWhitespace* graceNoteGroup:graceNoteGroupModifier? modifiers:modifiers? note:coreNoteWithTie ignoredWhitespace* {
  note.graceNotes = graceNoteGroup;
  note.modifiers = modifiers;
  return note;
}

pitchLower "pitch (lower octave)"
    = pitch:[CDEFGAB] {
  return {
    pitch: pitch.toUpperCase(),
    octave: 4
  };
}

pitchUpper "pitch (upper octave)"
    = pitch:[cdefgab] {
  return {
    pitch: pitch.toUpperCase(),
    octave: 5
  };
}

octave "octave"
    = octaveList:octaveList {
  return octaveList.reduce(function(a, b) { return a + b; }, 0);
}

octaveList "octave modifier list"
    = octaveList:("'" { return 1; } / "," { return -1; })+

rest "rest"
    = ignoredWhitespace* modifiers:modifiers? rest: [xXyzZ] duration:duration? ignoredWhitespace* {
  var visible = false;
  var spacer = false;
  if (rest == "z" || rest == "Z") {
    visible = true;
  }
  if (rest == "Z" || rest == "X") {
    duration.multiplier = duration.multiplier * state.unitNoteDuration.noteValue;
  }
  if (rest == "y") {
    spacer = true;
  }

  duration.multiplier *= state.unitNoteDuration.multiplier;
  duration.noteValue *= state.unitNoteDuration.noteValue;

  return {
    type: "rest",
    visible: visible,
    spacer: spacer,
    duration: duration,
    modifiers: modifiers
  };
}

accidental "accidental"
    = ("^^" { return "##"; } / "^" { return "#"; } / "=" { return "n"; } / "__" { return "bb"; } / "_" { return "b"; })

duration "duration"
    = durationSimpleDivisor / durationFull / durationMultiplier / "" {
  return {
    multiplier: 1,
    noteValue: 1
  };
}

durationMultiplier "duration (M)"
    = multiplier:[0-9]+ {
  multiplier = parseInt(multiplier.join(""));
  return {
    multiplier: multiplier,
    noteValue: 1
  };
}

durationFull "duration (M/N)"
    = multiplier:[0-9]* "/" divisor:[0-9]+ {
  multiplier = multiplier.join("");
  divisor = parseInt(divisor.join(""));

  if (!multiplier) {
    multiplier = 1;
  } else {
    multiplier = parseInt(multiplier);
  }

  return {
    multiplier: multiplier,
    noteValue: divisor
  };
}

durationSimpleDivisor "duration with divisor only (/)"
    = simpleDivisor:"/"+ ![0-9] {
  return {
    multiplier: 1,
    noteValue: Math.pow(2, simpleDivisor.length)
  };
}

brokenRhythm "broken rhythm"
    = brokenRhythm:brokenRhythmMarker {
  var multiplier = Math.pow(2, brokenRhythm.times + 1) - 1;
  var noteValue = Math.pow(2, brokenRhythm.times);

  var longerDuration = {
    multiplier: multiplier,
    noteValue: noteValue
  };
  var shorterDuration = {
    multiplier: 1,
    noteValue: noteValue
  };

  brokenRhythm.type = "brokenRhythm";
  if (brokenRhythm.dottedBefore) {
    brokenRhythm.durationBefore = longerDuration;
    brokenRhythm.durationAfter = shorterDuration;
  } else {
    brokenRhythm.durationBefore = shorterDuration;
    brokenRhythm.durationAfter = longerDuration;
  }

  return brokenRhythm;
}

brokenRhythmMarker "broken rhythm marker"
    = value:[>]+ {
  return {
    dottedBefore: true,
    times: value.length
  };
} / value:[<]+ {
  return {
    dottedBefore: false,
    times: value.length
  };
}

modifiers "modifiers"
    = (modifier:(chordSymbol / decoration / annotation / shortcut) _ {
         return modifier; })+

shortcut "shortcut"
    = shortcutIdentifier:[H-Wh-w~.] {
  var resolvedValue = state.shortcuts[shortcutIdentifier];
  if (!resolvedValue) {
    return null;
  }

  return resolvedValue;
}

decoration "decoration"
    = "!" decorationIdentifier:([A-Za-z0-9+<>().]+) "!" {
  return {
    type: "decoration",
    value: decorationIdentifier.join("")
  };
}

chordSymbol "chord symbol"
    = "\"" !annotationPlacementSymbol value:[^\"\r\n]* "\"" {
  return {
    type: "chordSymbol",
    value: value.join("")
  };
}

annotationPlacementSymbol "annotation placement symbol"
    = "^" { return "above"; } /
      "_" { return "below"; } /
      "<" { return "left"; } /
      ">" { return "right"; } /
      "@" { return "unspecified"; }

annotation "annotation"
    = "\"" placement:annotationPlacementSymbol value:[^\"\r\n]* "\"" {
  return {
    type: "annotation",
    placement: placement,
    value: value.join("")
  };
}

tuplet "tuplet"
    = "(" tupletNoteCount:[2-9] ":"? timeOf:[0-9]* ":"? actualNoteCount:[0-9]* {
  if (timeOf.length > 0) {
    timeOf = parseInt(timeOf.join(""));
  } else {
    timeOf = null;
  }

  if (actualNoteCount.length > 0) {
    actualNoteCount = parseInt(actualNoteCount.join(""));
  } else {
    actualNoteCount = null;
  }

  return {
    type: "tuplet",
    tupletNoteCount: parseInt(tupletNoteCount),
    timeOf: timeOf,
    actualNoteCount: actualNoteCount
  };
}

tie "tie"
    = "-" {
  return true;
} / !"-" {
  return false;
} / !. {
  return false;
}

slur "slur"
    = "(" (![0-9] / !.) {
  return {
    type: "slur",
    slurBegin: true
  };
} / ")" {
  return {
    type: "slur",
    slurBegin: false
  };
}

graceNote "grace note"
    = note:coreNote {
  note.type = "graceNote";
  return note;
}

graceNoteGroup "grace note group"
    = "{" acciaccaturaSymbol:"/"? notes:graceNote+ "}" {
  var acciaccatura = (acciaccaturaSymbol === "/");
  return {
    type: "graceNoteGroup",
    acciaccatura: acciaccatura,
    value: notes
  };
}

graceNoteGroupModifier "grace note group modifier"
    = graceNoteGroup:graceNoteGroup _ {
  return graceNoteGroup;
}

