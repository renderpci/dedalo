/*
 * VexABC - ABC notation parser and renderer for VexFlow
 *
 * Copyright (c) 2012-2013 Mikael Nousiainen
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

var _ = require("underscore");

var Vex = require("vexflow");

var VexAbcDef = require("./vexabc-def");
var VexAbcUtil = require("./vexabc-util");

var VexAbcRenderer = function(settings) {
  this.init(settings);
};

VexAbcRenderer.prototype.init = function(settings) {
  this.initSettings(settings);
  this.reset();
};

VexAbcRenderer.prototype.initSettings = function(settings) {
  this.settings = {
    width: 1000,
    height: undefined,
    scale: 1.0,
    horizontalPadding: 50,
    verticalPaddingTop: 0,
    verticalPaddingBottom: 50,
    verticalPaddingForStave: 50,
    stavesPerLine: 1
  };

  if (settings) {
    _.extend(this.settings, settings);
  }

  this.settings.contentWidth =
      this.settings.width - this.settings.horizontalPadding;
  this.settings.staveWidth =
      this.settings.contentWidth / this.settings.stavesPerLine;
};

VexAbcRenderer.prototype.reset = function() {
  this.elements = {
    staves: [],
    beams: [],
    ties: [],
    tuplets: []
  };

  this.state = {
    key: null,
    meter: null,
    stave: null,
    staveKeySignatureAdded: false,
    staveTimeSignatureAdded: false,
    staveCount: 0,
    staveCountOnLine: 0,
    voices: {},
    tuplet: null,
    tupletNoteGroup: null,
    volta: false,
    voltaBeginMeasure: -1,
    contentHeight: 0
  };
};

VexAbcRenderer.prototype.getElements = function() {
  return this.elements;
};

// TODO: create conversion+process function for decorations

VexAbcRenderer.prototype.getInformationFieldValue = function(data, name) {
  var header = data.header;
  var i;

  for (i = 0; i < header.length; i++) {
    var field = header[i];
    if (field.name === name) {
      return field.value;
    }
  }
  return null;
};

VexAbcRenderer.prototype.applyKeySignature = function(stave, key) {
  if (key) {
    // TODO: use mapping for keys and clefs, include support for different modes
    if (key.clef) {
      stave.addClef(key.clef);
    } else {
      stave.addClef("treble");
    }

    if (key.key) {
      stave.addKeySignature(key.key);
    } else {
      stave.addKeySignature("C");
    }
  } else {
    stave.addClef("treble");
    stave.addKeySignature("C");
  }

  this.state.staveKeySignatureAdded = true;
};

VexAbcRenderer.prototype.applyTimeSignature = function(stave, meter) {
  if (meter) {
    // TODO: use mapping for C / C| ? handling complex 2+3+2 ?
    if (meter.symbol) {
      stave.addTimeSignature(meter.symbol);
    } else {
      stave.addTimeSignature(meter.multiplier + "/" + meter.noteValue);
    }
    this.state.staveTimeSignatureAdded = true;
  }
};

VexAbcRenderer.prototype.applyStaveDefaults = function() {
  var stave = this.state.stave;

  if ((this.state.staveCount - 1) % this.settings.stavesPerLine === 0) {
    // Add default key and time signatures at beginning of each row if needed
    if (!this.state.staveKeySignatureAdded) {
      this.applyKeySignature(stave, this.state.key);
    }
    if (!this.state.staveTimeSignatureAdded) {
      this.applyTimeSignature(stave, this.state.meter);
    }
  }
};

VexAbcRenderer.prototype.newStave = function() {
  var x, y;
  var previousStave = this.state.stave;

  if (previousStave) {
    this.applyStaveDefaults();

    if (this.state.staveCountOnLine === 0) {
      x = 10;
      y = previousStave.y + previousStave.height + this.settings.verticalPaddingForStave;
    } else {
      x = previousStave.x + previousStave.width;
      y = previousStave.y;
    }
  } else {
    x = 10;
    y = this.settings.verticalPaddingTop + this.settings.verticalPaddingForStave;
  }

  var stave = new Vex.Flow.Stave(x, y, this.settings.staveWidth);

  if (this.state.staveCountOnLine === 0) {
    this.state.contentHeight += stave.height + this.settings.verticalPaddingForStave;
  }

  stave.setMeasure(this.state.staveCount + 1);

  this.state.stave = stave;
  this.state.staveKeySignatureAdded = false;
  this.state.staveTimeSignatureAdded = false;

  this.state.staveCount++;
  this.state.staveCountOnLine =
      (this.state.staveCount % this.settings.stavesPerLine);
};

VexAbcRenderer.prototype.newVoice = function(id) {
  var beats = 4;
  var beatValue = 4;

  if (this.state.meter) {
    beats = this.state.meter.multiplier;
    beatValue = this.state.meter.noteValue;
  }

  var voice = new Vex.Flow.Voice({
    num_beats: beats,
    beat_value: beatValue,
    resolution: Vex.Flow.RESOLUTION
  });

  voice.setStrict(false);

  this.state.voices[id] = voice;
};

VexAbcRenderer.prototype.processInformationField = function(informationField) {
  var n = informationField.name;

  if (n === "K") {
    var key = informationField.value;
    this.applyKeySignature(this.state.stave, key);
    this.state.key = key;
  } else if (n === "M") {
    var meter = informationField.value;
    this.applyTimeSignature(this.state.stave, meter);
    this.state.meter = meter;
  }
};

// TODO: format regular annotations, so that first one is above, second below (check the ABC spec)
VexAbcRenderer.prototype.createAnnotation = function(text, style, verticalPosition, justification) {
  var annotation = new Vex.Flow.Annotation(text);

  if (!style) {
    style = VexAbcUtil.getVexFlowAnnotationStyle("text");
  }

  annotation.setFont(style.fontName, style.fontSize, style.fontWeight);

  if (!verticalPosition) {
    verticalPosition = style.verticalPosition;
  }

  console.log(verticalPosition);

  if (verticalPosition === "above") {
    annotation.setVerticalJustification(Vex.Flow.Annotation.VerticalJustify.TOP);
  } else if (verticalPosition === "center") {
    annotation.setVerticalJustification(Vex.Flow.Annotation.VerticalJustify.CENTER);
  } else if (verticalPosition === "center-stem") {
    annotation.setVerticalJustification(Vex.Flow.Annotation.VerticalJustify.CENTER_STEM);
  } else if (verticalPosition === "below") {
    annotation.setVerticalJustification(Vex.Flow.Annotation.VerticalJustify.BOTTOM);
  } else {
    annotation.setVerticalJustification(Vex.Flow.Annotation.VerticalJustify.TOP);
  }

  // TODO: left/right placement?
  // TODO: annotation.setTextLine(n); ?

  if (!justification) {
    justification = style.justification;
  }

  if (justification === "left") {
    annotation.setJustification(Vex.Flow.Annotation.Justify.LEFT);
  } else if (justification === "center") {
    annotation.setJustification(Vex.Flow.Annotation.Justify.CENTER);
  } else if (justification === "right") {
    annotation.setJustification(Vex.Flow.Annotation.Justify.RIGHT);
  } else {
    annotation.setJustification(Vex.Flow.Annotation.Justify.CENTER);
  }

  return annotation;
};

VexAbcRenderer.prototype.processBar = function(dataBar) {
  if (dataBar.repeat) {
    if (dataBar.repeatType === "end" ||
        dataBar.repeatType === "end+begin") {
      this.state.stave.setEndBarType(Vex.Flow.Barline.type.REPEAT_END);
    }
    this.endVolta(dataBar);
  } else {
    if (dataBar.lineType === "end") {
      this.state.stave.setEndBarType(Vex.Flow.Barline.type.END);
      this.endVolta(dataBar);
    } else if (dataBar.lineType === "double") {
      this.state.stave.setEndBarType(Vex.Flow.Barline.type.DOUBLE);
      this.endVolta(dataBar);
    }
  }

  this.continueVolta();

  // TODO: throw an error if tuplet is incomplete?
  this.endTuplet();

  this.state.voices = {};
  
  this.newStave();
  this.newVoice(VexAbcDef.DEFAULT_VOICE_ID);

  if (dataBar.repeat) {
    if (dataBar.repeatType === "begin" ||
        dataBar.repeatType === "end+begin") {
      this.state.stave.setBegBarType(Vex.Flow.Barline.type.REPEAT_BEGIN);
    }
  } else {
    if (dataBar.lineType === "begin") {
      this.state.stave.setBegBarType(Vex.Flow.Barline.type.END);
    }
  }

  this.beginVoltaIfNeeded(dataBar);

  this.elements.staves.push({
    stave: this.state.stave,
    voices: this.state.voices
  });
};

VexAbcRenderer.prototype.beginVoltaIfNeeded = function(dataElement) {
  var variantEndings;

  if (dataElement.type === "bar") {
    if (!dataElement.variantEndings) {
      return;
    }
    variantEndings = dataElement.variantEndings;
  } else if (dataElement.type === "variantEnding") {
    if (!dataElement.value) {
      return;
    }
    variantEndings = dataElement.value;
  } else {
    console.log("Cannot begin volta on element: " + JSON.stringify(dataElement));
    return;
  }

  var text = "";

  var i;
  for (i = 0; i < variantEndings.length; i++) {
    var v = variantEndings[i];
    text += v.first;
    if (v.last) {
      text += "-" + v.last;
    }
    if (i < variantEndings.length - 1) {
      text += ",";
    }
  }

  this.state.volta = true;
  this.state.voltaBeginMeasure = this.state.staveCount;
  this.state.voltaText = text;
};

VexAbcRenderer.prototype.continueVolta = function() {
  if (!this.state.volta) {
    return;
  }

  var type, text;
  if (this.state.voltaBeginMeasure === this.state.staveCount) {
    type = Vex.Flow.Volta.type.BEGIN;
    text = this.state.voltaText;
  } else {
    type = Vex.Flow.Volta.type.MID;
    text = "";
  }

  var stave = this.state.stave;
  stave.setVoltaType(type, text, 0);
};

VexAbcRenderer.prototype.endVolta = function() {
  if (!this.state.volta) {
    return;
  }

  var type, text;
  if (this.state.voltaBeginMeasure === this.state.staveCount) {
    type = Vex.Flow.Volta.type.BEGIN_END;
    text = this.state.voltaText;
  } else {
    type = Vex.Flow.Volta.type.END;
    text = "";
  }

  var stave = this.state.stave;
  stave.setVoltaType(type, text, 0);

  this.state.volta = false;
  this.state.voltaBeginMeasure = -1;
  this.state.voltaText = null;
};

VexAbcRenderer.prototype.processGroup = function(dataGroup) {
  var dataGroupEntries = dataGroup.value;
  var beamedNoteGroups = [ [] ];

  var validBeamedNoteGroup = false;

  var i;

  for (i = 0; i < dataGroupEntries.length; i++) {
    var dataGroupEntry = dataGroupEntries[i];

    var noteData;
    var note;
    var beamable;

    if (dataGroupEntry.type === "note") {
      noteData = this.createStaveNoteForChord([dataGroupEntry]);
      if (!noteData) {
        continue;
      }

      note = noteData.note;
      beamable = noteData.duration.beamable;

      validBeamedNoteGroup = true;
    } else if (dataGroupEntry.type === "chord") {
      noteData = this.createStaveNoteForChord(dataGroupEntry.value, dataGroupEntry);
      if (!noteData) {
        continue;
      }

      note = noteData.note;
      beamable = noteData.duration.beamable;

      // Handle modifiers for chord
      this.processModifiers(dataGroupEntry, note, 0);
      this.processGraceNotes(dataGroupEntry, note);

      validBeamedNoteGroup = true;
    } else if (dataGroupEntry.type === "rest") {
      this.breakTie();
      this.useBracketedTuplet();

      noteData = this.createStaveNoteForRest(dataGroupEntry);
      if (!noteData) {
        continue;
      }

      note = noteData.note;
      beamable = noteData.duration.beamable;
    } else if (dataGroupEntry.type === "tuplet") {
      this.beginTuplet(dataGroupEntry);
      continue;
    } else if (dataGroupEntry.type === "brokenRhythm") {
      // ignore
      continue;
    } else {
      console.log("Unknown group entry: " + JSON.stringify(dataGroupEntry));
      continue;
    }

    var voice = this.state.voices[VexAbcDef.DEFAULT_VOICE_ID];
    if (!this.state.tuplet) {
      // Tickables inside a tuplet have to be added after creating the tuplet
      voice.addTickable(note);
    }

    var tieEnd = false;
    var tieBegin = false;
    if (dataGroupEntry.type === "note") {
      tieEnd = this.endTie(dataGroupEntry, note);
      tieBegin = this.beginTieIfNeeded(dataGroupEntry, note);
    }

    var actuallyBeamed = beamable;

    if (actuallyBeamed) {
      beamedNoteGroups[beamedNoteGroups.length - 1].push(note);
    } else {
      // Beams can be applied to groups that have at least one note
      if (validBeamedNoteGroup) {
        if (beamedNoteGroups[beamedNoteGroups.length - 1].length > 0) {
          beamedNoteGroups.push([]);
        }
      } else {
        beamedNoteGroups.pop();
        beamedNoteGroups.push([]);
      }

      this.useBracketedTuplet();

      validBeamedNoteGroup = false;
    }

    this.addNoteToTupletIfNeeded(note);
  }

  if (!validBeamedNoteGroup) {
    beamedNoteGroups.pop();
  }

  this.useBracketedTuplet();

  for (var j = 0; j < beamedNoteGroups.length; j++) {
    var beamedNoteGroup = beamedNoteGroups[j];
    if (beamedNoteGroup.length < 2) {
      continue;
    }

    this.elements.beams.push(new Vex.Flow.Beam(beamedNoteGroup));
  }
};

VexAbcRenderer.prototype.getVexFlowDuration = function(dataElement, secondaryDataElement) {
  var duration = dataElement.duration;
  if (!duration) {
    console.log("Duration not available in element: " +
        JSON.stringify(dataElement));
    return null;
  }

  var multiplier = duration.multiplier;
  var noteValue = duration.noteValue;

  if (secondaryDataElement !== undefined &&
      secondaryDataElement.duration !== undefined) {
    multiplier *= secondaryDataElement.duration.multiplier;
    noteValue *= secondaryDataElement.duration.noteValue;
  }

  var vexFlowDuration = VexAbcUtil.convertFractionDurationToVexFlowDuration(
      multiplier, noteValue);
  if (!vexFlowDuration) {
    console.log("Invalid duration: " + multiplier + "/" + noteValue);
    return null;
  }

  return vexFlowDuration;
};

VexAbcRenderer.prototype.createStaveNoteForChord = function(dataNotes, dataChord) {
  var chordOctaveShift = 0;
  var chordDuration = null;
  var chordTie = false;

  if (dataChord !== undefined) {
    if (dataChord.octave) {
      chordOctaveShift = dataChord.octave;
    }
    if (dataChord.duration) {
      chordDuration = dataChord.duration;
    }
    if (dataChord.tie) {
      chordTie = dataChord.tie;
    }
  }

  /* ABC 2.1: All the notes within a chord should normally have the same
     length, but if not, the chord duration is that of the first note. */

  var vexFlowDuration = this.getVexFlowDuration(dataNotes[0], dataChord);
  if (!vexFlowDuration) {
    console.log("Unsupported note length: " + JSON.stringify(dataChord));
    return null;
  }

  var keys = [];

  var i;
  var dataNote;

  for (i = 0; i < dataNotes.length; i++) {
    dataNote = dataNotes[i];
    if (chordTie) {
      dataNote.tie = true;
    }

    var octave = parseInt(dataNote.octave) + parseInt(chordOctaveShift);
    keys.push(dataNote.pitch + "/" + octave);
  }

  var note = new Vex.Flow.StaveNote({
    keys: keys,
    duration: vexFlowDuration.value,
    dots: vexFlowDuration.dots,
    type: "n",
    clef: this.state.key.clef
  });

  // TODO: set beam direction for notes (up/down)
  // TODO: beam direction should have two modes:
  //   automatic (for single voice on stave) and manual (for multiple voices on the same stave)

  for (i = 0; i < dataNotes.length; i++) {
    dataNote = dataNotes[i];

    for (var j = 0; j < vexFlowDuration.dots; j++) {
      note.addDot(i);
    }
    if (dataNote.accidental) {
      note.addAccidental(i, new Vex.Flow.Accidental(dataNote.accidental));
    }

    this.processModifiers(dataNote, note, i);
    this.processGraceNotes(dataNote, note);
  }

  return {
    note: note,
    duration: vexFlowDuration
  };
};

VexAbcRenderer.prototype.createStaveNoteForRest = function(dataRest) {
  var vexFlowDuration = this.getVexFlowDuration(dataRest);

  if (!vexFlowDuration) {
    console.log("Unsupported rest length: " + JSON.stringify(dataRest));
    return null;
  }

  var note;
  var i;
  
  if (dataRest.spacer) {
    // TODO: FIXME: it should be possible to attach modifiers to spacers
    note = new Vex.Flow.GhostNote({
      duration: vexFlowDuration.value,
      dots: vexFlowDuration.dots,
      type: "r"
    });
  } else {
    if (dataRest.invisible) {
      // TODO: FIXME: do not render invisible rests!
      console.log("Invisible rests not supported yet");
    }

    note = new Vex.Flow.StaveNote({
      keys: [ VexAbcUtil.getRestNoteKeyForClef(this.state.key.clef) ],
      duration: vexFlowDuration.value,
      dots: vexFlowDuration.dots,
      type: "r",
      clef: this.state.key.clef
    });

    for (i = 0; i < vexFlowDuration.dots; i++) {
      note.addDot(0);
    }

    this.processModifiers(dataRest, note, 0);
  }

  return {
    note: note,
    duration: vexFlowDuration
  };
};

VexAbcRenderer.prototype.processGraceNotes = function(dataElement, note) {
  if (dataElement.graceNotes) {
    var notes = dataElement.graceNotes.value;
    var keys = [];
    var i;

    for (i = 0; i < notes.length; i++) {
      var dataNote = notes[i];
      keys.push(dataNote.pitch + "/" + dataNote.octave);
    }
    if (keys.length === 0) {
      return;
    }

    // TODO: handle acciaccatura

    note.addGraceNoteGroup(keys);
  }
};

VexAbcRenderer.prototype.processModifiers = function(dataElement, note, index) {
  if (!dataElement.modifiers) {
    return;
  }

  for (var i = 0; i < dataElement.modifiers.length; i++) {
    var dataModifier = dataElement.modifiers[i];
    if (dataModifier.type === "decoration") {
      this.processDecoration(dataModifier, note, index);
    } else if (dataModifier.type === "annotation") {
      this.processAnnotation(dataModifier, note, index);
    } else if (dataModifier.type === "chordSymbol") {
      this.processChordSymbol(dataModifier, note, index);
    } else {
      console.log("Unknown modifier: " + JSON.stringify(dataModifier));
    }
  }
};

VexAbcRenderer.prototype.processDecoration = function(dataDecoration, note, index) {
  var value = dataDecoration.value;

  if (value === "none" || value === "nil") {
    return;
  }

  var vexFlowArticulation =
      VexAbcUtil.convertAbcDecorationToVexFlowArticulation(value);

  if (vexFlowArticulation) {
    var articulation = new Vex.Flow.Articulation(vexFlowArticulation);
    // TODO: supply information: ABOVE/BELOW
    articulation.setPosition(Vex.Flow.Modifier.Position.ABOVE);
    note.addArticulation(index, articulation);
    return;
  }

  var vexFlowAnnotation =
      VexAbcUtil.convertAbcDecorationToVexFlowAnnotation(value);
  if (vexFlowAnnotation) {
    var style = VexAbcUtil.getVexFlowAnnotationStyle(vexFlowAnnotation.style);
    var annotation = this.createAnnotation(vexFlowAnnotation.value, style);
    note.addAnnotation(index, annotation);
    return;
  }

  // TODO: handle decorations rendered as stave modifiers (e.g. segno, coda, ...)

  console.log("Unknown decoration: " + dataDecoration.value);
};

VexAbcRenderer.prototype.processAnnotation = function(dataAnnotation, note, index) {
  var placement = dataAnnotation.placement;

  var justification;
  var verticalPosition;
  if (placement === "left" || placement === "right") {
    justification = placement;
    verticalPosition = "center-stem";
  } else if (placement === "above" || placement === "below") {
    justification = "center";
    verticalPosition = placement;
  }

  var annotation = this.createAnnotation(dataAnnotation.value,
    null, verticalPosition, justification);
  note.addAnnotation(index, annotation);
};

VexAbcRenderer.prototype.processChordSymbol = function(dataChordSymbol, note, index) {
  var style = VexAbcUtil.getVexFlowAnnotationStyle("chordSymbol");
  var annotation = this.createAnnotation(dataChordSymbol.value, style);
  // TODO: placement!
  note.addAnnotation(index, annotation);
};

VexAbcRenderer.prototype.beginTuplet = function(dataTuplet) {
  this.endTuplet();

  var ratioed = (dataTuplet.timeOf != null);

  if (!dataTuplet.timeOf) {
    switch (dataTuplet.tupletNoteCount) {
      case 2:
      case 4:
      case 8:
        dataTuplet.timeOf = 3;
        break;
      case 3:
      case 6:
        dataTuplet.timeOf = 2;
        break;
      default:
        // TODO: detect complex time in utility method
        if (this.state.meter.multiplier > 3 &&
            (this.state.meter.multiplier % 3 === 0)) {
          dataTuplet.timeOf = 3;
        } else {
          dataTuplet.timeOf = 2;
        }
    }
  }

  if (!dataTuplet.actualNoteCount) {
    dataTuplet.actualNoteCount = dataTuplet.tupletNoteCount;
  }

  this.state.tuplet = dataTuplet;
  this.state.tupletNoteGroup = [];
  this.state.tupletBracketNeeded = false;
  this.state.tupletRatioNeeded = ratioed;
};

VexAbcRenderer.prototype.addNoteToTupletIfNeeded = function(note) {
  if (this.state.tuplet) {
    var dataTuplet = this.state.tuplet;
    var tupletNoteGroup = this.state.tupletNoteGroup;

    tupletNoteGroup.push(note);

    if (tupletNoteGroup.length >= dataTuplet.actualNoteCount) {
      this.endTuplet();
    }
  }
};

VexAbcRenderer.prototype.useBracketedTuplet = function() {
  if (this.state.tuplet) {
    this.state.tupletBracketNeeded = true;
  }
};

VexAbcRenderer.prototype.endTuplet = function() {
  if (this.state.tuplet) {
    var dataTuplet = this.state.tuplet;
    var tupletNoteGroup = this.state.tupletNoteGroup;

    if (tupletNoteGroup.length >= 0) {
      var tuplet = new Vex.Flow.Tuplet(tupletNoteGroup);
      tuplet.setBeatsOccupied(dataTuplet.timeOf);
      tuplet.setRatioed(this.state.tupletRatioNeeded);
      tuplet.setBracketed(this.state.tupletBracketNeeded);
      this.elements.tuplets.push(tuplet);

      // Tickables inside a tuplet have to be added after creating the tuplet
      var voice = this.state.voices[VexAbcDef.DEFAULT_VOICE_ID];
      voice.addTickables(tupletNoteGroup);
    }

    this.state.tuplet = null;
    this.state.tupletNoteGroup = null;
    this.state.tupletBracketNeeded = false;
    this.state.tupletRatioNeeded = false;
  }
};

VexAbcRenderer.prototype.beginTieIfNeeded = function(dataElement, note) {
  this.endTie(note);

  var beginIndices = [];

  if (dataElement.type === "chord") {
    var dataNotes = dataElement.value;
    for (var i = 0; i < dataNotes.length; i++) {
      var dataNote = dataNotes[i];
      if (dataNote.tie) {
        beginIndices.push(i);
      }
    }
  } else if (dataElement.type === "note") {
    if (dataElement.tie) {
      beginIndices.push(0);
    }
  } else {
    console.log("Cannot begin tie on element type: " + dataElement.type);
    return false;
  }

  if (beginIndices.length === 0) {
    return false;
  }

  this.state.tie = {
    beginDataElement: dataElement,
    beginNote: note,
    beginIndices: beginIndices
  };

  return true;
};

VexAbcRenderer.prototype.breakTie = function() {
  if (this.state.tie) {
    this.state.tie = null;
  }
};

VexAbcRenderer.prototype.endTie = function(dataElement, note) {
  if (!this.state.tie) {
    return false;
  }

  var beginDataNotes;
  var endDataNotes;

  var beginDataElement = this.state.tie.beginDataElement;
  if (beginDataElement.type === "chord") {
    beginDataNotes = beginDataElement.value;
  } else if (beginDataElement.type === "note") {
    beginDataNotes = [ beginDataElement ];
  }

  if (dataElement.type === "chord") {
    endDataNotes = dataElement.value;
  } else if (dataElement.type === "note") {
    endDataNotes = [ dataElement ];
  } else {
    console.log("Cannot end tie on element type: " + dataElement.type);
    return false;
  }

  var equalPitchIndices =
      VexAbcUtil.findEqualDataNotePitchIndices(beginDataNotes, endDataNotes,
        this.state.tie.beginIndices);

  var tie = new Vex.Flow.StaveTie({
    first_note: this.state.tie.beginNote,
    last_note: note,
    first_indices: equalPitchIndices.firstIndices,
    last_indices: equalPitchIndices.secondIndices
  });

  this.elements.ties.push(tie);
  this.state.tie = null;

  return true;
};

VexAbcRenderer.prototype.transform = function(data) {
  var key = this.getInformationFieldValue(data, "K");
  if (!key) {
    key = {
      key: "C",
      clef: "treble"
    };
  }

  var meter = this.getInformationFieldValue(data, "M");

  // TODO: detect explicit meter and key definitions, so that meter, key and clef are not rendered if not defined

  this.reset();
  this.state.key = key;
  this.state.meter = meter;

  /*
  stave.setSection("A", 0);
  stave.setRepetitionTypeLeft(Vex.Flow.Repetition.type.SEGNO_LEFT, -18);
  stave.setRepetitionTypeRight(Vex.Flow.Repetition.type.CODA_RIGHT, 0);
  */

  this.newStave();
  this.newVoice(VexAbcDef.DEFAULT_VOICE_ID);

  this.elements.staves.push({
    stave: this.state.stave,
    voices: this.state.voices
  });

  var body = data.body;

  for (var i = 0; i < body.length; i++) {
    var dataElement = body[i];

    if (dataElement.type === "informationField") {
      this.processInformationField(dataElement);
    } else if (dataElement.type === "bar") {
      this.processBar(dataElement);
    } else if (dataElement.type === "group") {
      this.processGroup(dataElement);
    } else if (dataElement.type === "variantEnding") {
      this.beginVoltaIfNeeded(dataElement);
    } else if (dataElement.type === "lineBreak") {
      // TODO: implement
    } else {
      console.log("Unknown element: " + JSON.stringify(dataElement));
    }
  }

  // Apply defaults for the last stave
  this.applyStaveDefaults();
};

VexAbcRenderer.prototype.render = function(canvasElement) {
  var renderer = new Vex.Flow.Renderer(
     canvasElement, Vex.Flow.Renderer.Backends.CANVAS);
  var context = renderer.getContext();

  var width = this.settings.width;
  var height = this.settings.height;
  var scale = this.settings.scale;

  if (height === undefined) {
    height = this.state.contentHeight + this.settings.verticalPaddingTop +
        this.settings.verticalPaddingBottom;
  }

  renderer.resize(width * scale, height * scale);
  context.scale(scale, scale);
  context.clear();

  var staves = this.elements.staves;

  var i;
  for (i = 0; i < staves.length; i++) {
    var stave = staves[i].stave;
    var voice = staves[i].voices[VexAbcDef.DEFAULT_VOICE_ID];

    if ((i > 0) && (i >= staves.length - 1)) {
      // Do not render last bar if it is empty
      if (voice.getTicksUsed().value() === 0) {
        // TODO: Get rid of extra vertical space possibly allocated
        continue;
      }
    }

    stave.setContext(context).draw();

    var formatter = new Vex.Flow.Formatter();
    formatter.joinVoices([voice]).formatToStave([voice], stave);

    voice.draw(context, stave);
  }

  var beams = this.elements.beams;
  for (i = 0; i < beams.length; i++) {
    var beam = beams[i];
    beam.setContext(context).draw();
  }

  var tuplets = this.elements.tuplets;
  for (i = 0; i < tuplets.length; i++) {
    var tuplet = tuplets[i];
    tuplet.setContext(context).draw();
  }

  var ties = this.elements.ties;
  for (i = 0; i < ties.length; i++) {
    var tie = ties[i];
    tie.setContext(context).draw();
  }
};

module.exports = VexAbcRenderer;
