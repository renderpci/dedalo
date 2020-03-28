
(function() {
var VERSIONS = [
	'prebuilt',
	'0.12.4',
	'0.12.3',
	'0.12.2',
	'0.12.1',
	'0.12.0',
	'0.11.8',
	'0.11.5',
	'0.11.4',
	'0.11.3',
	'0.11.2',
	'0.11.1',
	'0.11.0',
	'0.10.4',
	'0.10.3',
	'0.10.2',
	'0.9.25',
	'0.9.24',
	'0.9.23',
	'0.9.22',
	'0.9.21'
];

var SOURCES = {
	prebuilt: 'https://rawgit.com/paperjs/paper.js/prebuilt/module/dist/paper-full.js'
}

if (document.location.hostname === 'localhost') {
	VERSIONS.unshift('local');
	SOURCES.local = '../paper.js/dist/paper-full.js';
}

/*
// URL Encoding
function decode(string) {
	var t = Date.now();
	var res = JSZip.utils.uint8Array2String(
		JSZip.compressions.DEFLATE.uncompress(JSZip.base64.decode(string)));
	alert(Date.now() - t);
	return res;
}

function encode(string) {
	var t = Date.now();
	var res = JSZip.base64.encode(JSZip.utils.uint8Array2String(
		JSZip.compressions.DEFLATE.compress(string)));
	alert(Date.now() - t);
	return res;
}
*/

function decode(string) {
	return RawDeflate.inflate(window.atob(string));
}

function encode(string) {
	return window.btoa(RawDeflate.deflate(string));
}

var script = {
	name: 'Sketch',
	code: '',
	breakpoints: []
};

function getScriptId(script) {
	return script.name + '.sketch.paperjs.org';
}

function getBlobURL(content, type) {
	return URL.createObjectURL(new Blob([content], {
		type: type
	}));
}

function getTimeStamp() {
	var parts = new Date().toJSON().toString().replace(/[-:]/g, '').match(
			/^20(.*)T(.*)\.\d*Z$/);
	return parts[1] + '_' + parts[2];
}

function updateHash() {
	window.location.hash = (
		'#V/' + $('.script-version').val() +
		'/S/' + encode(JSON.stringify(script))
	);
}

var paperVersion = VERSIONS[1]; // the default.
var hash = window.location.hash;
if (hash) {
	var match = hash.match(
		/^#(?:V\/(prebuilt|local|[\d\.]+)\/S\/(.*)|[SZ]\/(.*)|T\/(.*))$/
	);
	var error = false;
	try {
		if (!match) {
			error = true;
		} else if (match[1]) { // /V($1)/S($2)
			paperVersion = match[1];
			script = JSON.parse(decode(match[2]));
		} else if (match[3]) { // /[SZ]($3)
			script = JSON.parse(decode(match[3]));
		} else if (match[4]) { // /T($4)
			script.code = decode(string) || '';
		}
	} catch (e) {
		error = true;
		console.error(e);
	}
	if (error) {
		alert('That shared link format is not supported.');
	}
}

if (!script.code) {
	// Support only one script for now, named 'Untitled'. Later on we'll have
	// a document switcher.
	// Try legacy storage
	script.code = localStorage[getScriptId(script)]
			// Legacy naming
			// TODO: Remove in 2016:
			|| localStorage['paperjs_'
				+ window.location.pathname.match(/\/([^\/]*)$/)[1]]
			|| '';
}

if (!script.breakpoints)
	script.breakpoints = [];

if (!script.name || script.name == 'First Script')
	script.name = 'Sketch';

var scripts = [];
scripts.push(script);

var src = SOURCES[paperVersion] ||
	'https://unpkg.com/paper@' + paperVersion + '/dist/paper-full.js';

document.write('<script type="text/javascript" src="' + src + '"></script>');

$(function() {
	var versionOptions = VERSIONS.map(function(version) {
		return '<option value="' + version + '">' + version + '</option>'
	})

	$('.script-version')
		.html(versionOptions.join(''))
		.val(paperVersion)
		.on('change', function() {
			updateHash();
			window.location.reload();
		})
		// Firefox select fix:
		.on('focus', function() {
			$('body').addClass('select-focus')
		})
		.on('blur', function() {
			$('body').removeClass('select-focus')
		})

	// Settings

	var hitTolerance = 4;

	// Install some useful jQuery extensions that we use a lot

	$.extend($.fn, {
		orNull: function() {
			return this.length > 0 ? this : null;
		},

		findAndSelf: function(selector) {
			return this.find(selector).add(this.filter(selector));
		}
	});

	// Import...

	var Base = paper.Base,
		PaperScope = paper.PaperScope,
		PaperScript = paper.PaperScript,
		Item = paper.Item,
		Path = paper.Path,
		Group = paper.Group,
		Layer = paper.Layer,
		Segment = paper.Segment,
		Raster = paper.Raster,
		Tool = paper.Tool,
		Color = paper.Color;

	// Override the color component to use spectrum.js to give it an advanced color
	// chooser behavior.
	Palette.components.color = {
		// Use <input type="text"> for spectrum.js
		type: 'text',

		create: function() {
			var that = this;
			this.input = $(this.element);
			var canvas = $('.canvas');
			this.input.spectrum({
				appendTo: canvas,
				flat: false,
				allowEmpty: false,
				showButtons: true,
				showInitial: true,
				showPalette: true,
				showSelectionPalette: true,
				showAlpha: true,
				clickoutFiresChange: true,
				change: function(value) {
					that.value = value + '';
				}
			});
			// Hide on mousedown already, not just on click
			canvas.on('mousedown', function(event) {
				that.input.spectrum('hide', event);
			});
		},

			getValue: function(value) {
					// Always convert internal string representation back to a paper.js
					// color object.
					return new Color(value);
			},

			setValue: function(value) {
					return new Color(value).toCSS();
			},

			setEnabled: function(enabled) {
				this.input.spectrum(enabled ? 'enable' : 'disable');
			},

			setVisible: function(visible) {
				this.input.spectrum(visible ? 'show' : 'hide');
			}
	}

	function createPaperScript(element) {
		var runButton = $('.button.script-run', element),
			canvas = $('canvas', element),
			consoleContainer = $('.console', element).orNull(),
			editor,
			session,
			toolsContainer = $('.tools', element),
			inspectorInfo = $('.toolbar .info', element),
			source = $('.source', element),
			scope,
			customAnnotations = [],
			ignoreAnnotation = false;

		editor = ace.edit(source.find('.editor')[0]);
		editor.$blockScrolling = Infinity;
		ace.config.set('themePath', 'assets/js/ace');
		editor.setTheme('ace/theme/bootstrap');
		editor.setShowInvisibles(false);
		editor.setDisplayIndentGuides(true);
		session = editor.getSession();
		session.setValue(script.code);
		session.setMode('ace/mode/javascript');
		session.setUseSoftTabs(true);
		session.setTabSize(4);
		session.setBreakpoints(script.breakpoints);

		// Blur the editor when clicking inside the canvas, to avoid accidentally
		// erasing code when working with the keyboard.
		canvas.on('mousedown', function() {
			editor.blur();
		});

		// Pinch-to-zoom
		if (paper.DomEvent) {
			canvas.on('wheel', function(event) {
				var e = event.originalEvent,
					view = scope.view,
					offset = canvas.offset(),
					point = view.viewToProject(
						paper.DomEvent.getPoint(e).subtract(offset.left, offset.top)
					), 
					delta = e.deltaY || 0,
					scale = 1 - delta / 100;
				view.scale(scale, point);
				return false;
			});
		}

		editor.commands.addCommands([{
			name: 'execute',
			bindKey: {
				mac: 'Command-E',
				win: 'Ctrl-E'
			},
			exec: function(editor) {
				$('.button.script-run').trigger('click');
			}
		}, {
			// Disable settings menu
			name: 'showSettingsMenu',
			bindKey: {
				mac: 'Command-,',
				win: 'Ctrl-,'
			},
			exec: function() {},
			readOnly: true
		}/*, {
			name: "download",
			bindKey: {
				mac: 'Command-S',
				win: 'Ctrl-S'
			},
			exec: function(editor) {
				var link = $('.button.script-download');
				link.trigger('click');
				window.open(link.attr('href'));
			}
		}*/]);

		editor.setKeyboardHandler({
			handleKeyboard: function(data, hashId, keyString, keyCode, event) {
				if (event)
					event.stopPropagation();
			}
		});

		editor.on('guttermousedown', function(event) {
				var target = $(event.domEvent.target);
				if (!target.hasClass('ace_gutter-cell'))
						return;
				session.setBreakpoint(event.getDocumentPosition().row,
						target.hasClass('ace_breakpoint') ? '' : 'ace_breakpoint');
				// Keep script.breakpoints up to date:
			script.breakpoints = [];
			for (var i in session.getBreakpoints())
				script.breakpoints.push(i);
			updateHash();
				event.stop();
		});

		session.on('change', function() {
			// Clear custom annotations whenever the code changes, until next
			// execution.
			if (customAnnotations.length > 0) {
				removeAnnotations(customAnnotations);
				customAnnotations = [];
			}
			script.code = editor.getValue();
			localStorage[getScriptId(script)] = script.code;
		});

		session.on('changeMode', function() {
			// Use the same relaxed linting settings as the Paper.js project.
			session.$worker.send('setOptions', {
				evil: true,
				regexdash: true,
				browser: true,
				wsh: true,
				trailing: false,
				smarttabs: true,
				sub: true,
				supernew: true,
				laxbreak: true,
				eqeqeq: false,
				eqnull: true,
				loopfunc: true,
				boss: true,
				shadow: true
			});
		});

		// We need to listen to changes in annotations, since the javascript
		// worker changes annotations asynchronously, and would get rid of
		// annotations that we added ourselves (customAnnotations)
		session.on('changeAnnotation', function() {
			if (ignoreAnnotation)
				return;
			var annotations = getAnnotations();
			filterAnnotations(annotations);
			if (customAnnotations.length > 0)
				annotations = annotations.concat(customAnnotations);
			setAnnotations(annotations);
			updateHash();
		});

		function getAnnotations() {
			return session.getAnnotations();
		}

		function setAnnotations(annotations) {
			ignoreAnnotation = true;
			session.setAnnotations(annotations);
			ignoreAnnotation = false;
		}

		function filterAnnotations(annotations) {
			for (var i = annotations.length - 1; i >= 0; i--) {
				var text = annotations[i].text;
				if (/^Use '[=!]=='/.test(text)
						|| /is already defined/.test(text)
						|| /Redefinition of/.test(text)
						|| /Missing semicolon/.test(text)
						|| /Unnecessary semicolon/.test(text)
						|| /'debugger' statement/.test(text)) {
					annotations.splice(i, 1);
				}
			}
		}

		function removeAnnotations(list) {
			var annotations = getAnnotations();
			for (var i = annotations.length - 1; i >= 0; i--) {
				if (list.indexOf(annotations[i]) !== -1)
					annotations.splice(i, 1);
			}
			setAnnotations(annotations);
		}

		function preprocessCode(code, breakpoints) {
			breakpoints = breakpoints.slice(); // Clone since it'll be modified.
			var insertions = [];

			function getOffset(offset) {
				for (var i = 0, l = insertions.length; i < l; i++) {
					var insertion = insertions[i];
					if (insertion[0] >= offset)
						break;
					offset += insertion[1];
				}
				return offset;
			}

			function getCode(node) {
				return code.substring(getOffset(node.range[0]),
						getOffset(node.range[1]));
			}

			function replaceCode(node, str) {
				var start = getOffset(node.range[0]),
					end = getOffset(node.range[1]),
					insert = 0;
				for (var i = insertions.length - 1; i >= 0; i--) {
					if (start > insertions[i][0]) {
						insert = i + 1;
						break;
					}
				}
				insertions.splice(insert, 0, [start, str.length - end + start]);
				code = code.substring(0, start) + str + code.substring(end);
			}

			// Recursively walks the AST and replaces the code of certain nodes
			function walkAST(node, parent) {
				if (!node)
					return;
				var type = node.type,
					loc = node.loc;
				// if (node.range) {
				// 	var part = getCode(node);
				// 	if (part && part.length > 20)
				// 		part = part.substr(0, 10) + '...' + part.substr(-10);
				// 	console.log(type, part);
				// }

				// The easiest way to walk through the whole AST is to simply loop
				// over each property of the node and filter out fields we don't
				// need to consider...
				for (var key in node) {
					if (key === 'range' || key === 'loc')
						continue;
					var value = node[key];
					if (Array.isArray(value)) {
						for (var i = 0, l = value.length; i < l; i++)
							walkAST(value[i], node);
					} else if (value && typeof value === 'object') {
						// We cannot use Base.isPlainObject() for these since
						// Acorn.js uses its own internal prototypes now.
						walkAST(value, node);
					}
				}
				// See if a breakpoint is to be placed in the range of this
				// node, and if the node type supports it.
				if (breakpoints.length > 0 && loc
						// Filter the type of nodes that support setting breakpoints.
						&& /^(ForStatement|VariableDeclaration|ExpressionStatement|ReturnStatement)$/.test(type)
						// Filter out variable definitions inside ForStatement.
						&& parent.type !== 'ForStatement') {
					var start = loc.start.line - 1,
						end = loc.end.line - 1;
					for (var i = 0, l = breakpoints.length; i < l; i++) {
						var line = breakpoints[i];
						if (line >= start && line <= end) {
							replaceCode(node, 'debugger; ' + getCode(node));
							breakpoints.splice(i, 1);
							break;
						}
					}
				}
			}

			walkAST(PaperScript.parse(code, {
				ranges: true,
				locations: true,
				sourceType: 'module'
			}));

			if (breakpoints.length > 0) {
				var lines = code.split(/\r\n|\n|\r/mg);
				for (var i = 0; i < breakpoints.length; i++) {
					var line = breakpoints[i],
						str = lines[line];
					if (!/\bdebugger;\b/.test(str))
						lines[line] = 'debugger; ' + str;
				}
				code = lines.join('\n');
			}

			return code;
		}

		function evaluateCode() {
			Base.each(Palette.instances, function(palette) {
				palette.remove();
			});
			scope.setup(canvas[0]);
			// Create an array of indices for breakpoints and pass it on.
			var loc = document.location,
				baseUrl = loc.protocol + '//' + loc.host + loc.pathname;
				url = /*baseUrl +*/ script.name + '_' + getTimeStamp() + '.js';
			var code = preprocessCode(script.code, script.breakpoints);
			scope.execute(code, {
				url: url,
				source: script.code,
				sourceMaps: 'inline'
			});
			createInspector();
			setupTools();
		}

		function runCode() {
			// Update the hash each time the code is run also.
			updateHash();
			removeAnnotations(customAnnotations);
			customAnnotations = [];
			// Create a new paperscope each time.
			if (scope)
				scope.remove();
			scope = new PaperScope();
			setupConsole();
			extendScope();
			// parseInclude() triggers evaluateCode() in the right moment for us.
			parseInclude();
		}

		if (consoleContainer) {
			// Append to a container inside the console, so css can use :first-child
			consoleContainer = $('<div class="content"/>')
					.appendTo(consoleContainer);
		}

		var realConsole = window.console;

		function setupConsole() {
			if (!consoleContainer)
				return;
			// Override the console object with one that logs to our new console.

			// Use ower own toString function that's smart about how to log things:
			function toString(obj, indent, asValue) {
				var type = typeof obj;
				if (obj == null) {
					return type === 'object' ? 'null' : 'undefined';
				} else if (type === 'string') {
					return asValue ? "'" + obj.replace(/'/g, "\\'") + "'" : obj;
				} else if (type === 'object') {
					// If the object provides it's own toString, use it, except for
					// objects and arrays, since we override those.
					if (obj.toString !== Object.prototype.toString
						&& obj.toString !== Array.prototype.toString) {
						return obj.toString();
					} else if (Base.isPlainObject(obj)) {
						if (indent != null)
							indent += '  ';
						return (indent ? '{\n' : '{')
								+ Base.each(obj, function(value, key) {
									this.push(indent + key + ': '
											+ toString(value, indent, true));
								}, []).join(indent != null ? ',\n' : ', ')
								+ (indent
									? '\n' + indent.substring(0, indent.length - 2)
										+ '}'
									: ' }');
					} else if (typeof obj.length === 'number') {
						return '[ ' + Base.each(obj, function(value, index) {
							this[index] = toString(value, indent, true);
						}, []).join(', ') + ' ]';
					}
				}
				return obj.toString();
			}

			function print(action, args) {
				// Log to the real console as well.
				var func = realConsole[action];
				if (func)
					func.apply(realConsole, args);
				$('<div/>')
					.addClass('line ' + action)
					.text(Base.each(args, function(arg) {
							this.push(toString(arg, ''));
						}, []).join(' '))
					.appendTo(consoleContainer);
				consoleContainer.scrollTop(consoleContainer.prop('scrollHeight'));
			}

			scope.console = {
				log: function() {
					print('log', arguments);
				},

				error: function() {
					print('error', arguments);
				},

				warn: function() {
					print('warn', arguments);
				},

				clear: function() {
					consoleContainer.children().remove();
				}
			};
		}

		function clearConsole() {
			if (scope.console)
				scope.console.clear();
		}

		// Install an error handler to log the errors in our log too:
		window.onerror = function(error, url, lineNumber) {
			var columNumber = 0,
				match;
			if (match = error.match(/(.*)\s*\((\d*):(\d*)\)/)) { // Acorn
				error = match[1];
				lineNumber = match[2];
				columNumber = match[3];
			} else if (match = error.match(/(.*)Line (\d*):\s*(.*)/i)) { // Esprima
				error = match[1] + match[3];
				lineNumber = match[2];
			}
			if (lineNumber) {
				var annotation = {
					row: lineNumber - 1,
					column: columNumber,
					text: error,
					type: 'error'
				};
				var annotations = getAnnotations();
				annotations.push(annotation);
				setAnnotations(annotations);
				customAnnotations.push(annotation);
				editor.gotoLine(lineNumber, columNumber);
							editor.focus();
			}
			scope.console.error('Line ' + lineNumber + ': ' + error);
		};

		function extendScope() {
			scope.Http = {
				request: function(options) {
					var url = options.url,
						nop = function() {};
					return $.ajax($.extend({
						dataType: (url.match(/\.(json|xml|html)$/) || [])[1],
						success: function(data) {
							(options.onSuccess || nop)(data);
						},
						error: function(xhr, error) {
							(options.onError || nop)(error);
						},
						complete: function() {
							(options.onComplete || nop)();
						}
					}, options));
				}
			};
		}

		function parseInclude() {
			var includes = [];
			// Parse code for includes, and load them synchronously, if present
			script.code.replace(
				/(?:^|[\n\r])include\(['"]([^)]*)['"]\)/g,
				function(all, url) {
					includes.push(url);
				}
			);

			// Install empty include() function, so code can execute include()
			// statements, which we process separately above.
			scope.include = function(url) {
			};

			// Load all includes sequentially, and finally evaluate code, since
			// the code will probably be interdependent.
			function load() {
				var path = includes.shift();
				if (path) {
					var url = /^\/lib\//.test(path) ? path.substring(1) : path;
					// Switch to the editor console globally so loaded libraries use
					// our own console too:
					window.console = scope.console;
					$.getScript(url, load).fail(function(xhr, error) {
						scope.console.error('Cannot load ' + path + ': ' + error);
					});
				} else {
					evaluateCode();
					window.console = realConsole;
				}
			}
			load();
		}

		var inspectorTool,
			prevSelection;

		function createInspector() {
			prevSelection = null;

			function deselect() {
				if (prevSelection) {
					// prevSelection can be an Item or a Segment
					var item = prevSelection.path || prevSelection;
					item.bounds.selected = false;
					item.selected = false;
					prevSelection.selected = false;
					prevSelection = null;
				}
			}

			inspectorTool = new Tool({
				buttonClass: 'icon-arrow-black'
			}).on({
				mousedown: function(event) {
					deselect();
					var result = scope.project.hitTest(event.point, {
						tolerance: hitTolerance,
						fill: true,
						stroke: true,
						segments: true
					});
					var selection = result && result.item;
					if (selection) {
						var handle = result.type === 'segment';
						selection.bounds.selected = !handle;
						if (handle)
							selection = result.segment;
						selection.selected = true;
					}
					inspectorInfo.toggleClass('hidden', !selection);
					inspectorInfo.html('');
					if (selection) {
						var text;
						if (selection instanceof Segment) {
							text = 'Segment';
							text += '<br>point: ' + selection.point;
							if (!selection.handleIn.isZero())
								text += '<br>handleIn: ' + selection.handleIn;
							if (!selection.handleOut.isZero())
								text += '<br>handleOut: ' + selection.handleOut;
						} else {
							text = selection.constructor.name;
							text += '<br>position: ' + selection.position;
							text += '<br>bounds: ' + selection.bounds;
						}
						inspectorInfo.html(text);
					}
					prevSelection = selection;
				},

				deactivate: function() {
					deselect();
					inspectorInfo.addClass('hidden');
					inspectorInfo.html('');
				}
			});

			var lastPoint;
			var body = $('body');
			zoomTool = new Tool({
				buttonClass: 'icon-zoom'
			}).on({
				mousedown: function(event) {
					var view = scope.view;
					if (event.modifiers.space) {
						lastPoint = view.projectToView(event.point);
						return;
					}
					var factor = 1.25;
					if (event.modifiers.alt)
						factor = 1 / factor;
					view.zoom *= factor;
					view.center = event.point;
				},
				keydown: function(event) {
					if (event.key === 'alt') {
						body.addClass('zoom-out');
					} else if (event.key === 'space') {
						body.addClass('zoom-move');
					}
				},
				keyup: function(event) {
					if (event.key === 'alt') {
						body.removeClass('zoom-out');
					} else if (event.key === 'space') {
						body.removeClass('zoom-move');
					}
				},
				mousedrag: function(event) {
					if (event.modifiers.space) {
						body.addClass('zoom-grab');
						// In order to have coordinate changes not mess up the
						// dragging, we need to convert coordinates to view space,
						// and then back to project space after the view space has
						// changed.
						var view = scope.view,
							point = view.projectToView(event.point),
							last = view.viewToProject(lastPoint);
						view.scrollBy(last.subtract(event.point));
						lastPoint = point;
					}
				},
				mouseup: function(event) {
					body.removeClass('zoom-grab');
				},
				activate: function() {
					body.addClass('zoom');
				},
				deactivate: function() {
					body.removeClass('zoom');
				}
			});
		}

		function setupTools() {
			var activeClass = ($('.tool.active', toolsContainer).attr('class') || '')
					.replace(/\b(button|tool|active)\b/g, '').trim(),
				tools = scope.tools,
				// Activate first tool by default, so it gets highlighted too
				activeTool = tools[0];
			$('.tool', toolsContainer).remove();
			for (var i = tools.length - 1; i >= 0; i--) {
				// Use an iteration closure so we have private variables.
				(function(tool) {
					var title = tool.buttonTitle || '',
						button = $('<a class="button tool">' + title + '</a>')
							.prependTo(toolsContainer),
						buttonClass = tool.buttonClass || 'icon-pencil';
					button.addClass(buttonClass);
					button.click(function() {
						tool.activate();
					}).mousedown(function() {
						return false;
					});
					tool.on({
						activate: function() {
							button.addClass('active');
						},
						deactivate: function() {
							button.removeClass('active');
						}
					});
					if (activeClass && buttonClass === activeClass) {
						activeTool = tool;
						activeClass = null;
					}
				})(tools[i]);
			}
			if (activeTool)
				activeTool.activate();
		}

		var panes = element.findAndSelf('.split-pane');
		panes.each(function() {
			var pane = $(this);
			pane.split({
				orientation: pane.attr('data-orientation') == 'hor'
					? 'vertical'
					: 'horizontal',
				position: pane.attr('data-percentage'),
				limit: 100
			});
		});

		// Refresh editor if parent gets resized
		$('.editor', element).parents('.split-pane').on('splitter.resize', function() {
			editor.resize();
		});

		canvas.parents('.split-pane').on('splitter.resize', function() {
			var pane = $('.canvas', element),
				view = scope && scope.view;
			if (view) {
				view.setViewSize(pane.width(), pane.height());
			}
		});

		$(window).resize(function() {
			// Do not have .paperscript automatically resize to 100%, instead
			// resize it in the resize handler, for much smoother redrawing,
			// since the splitter panes are aligning using right: 0 / bottom: 0.
			element.width($(window).width()).height($(window).height());
			if (editor)
				panes.trigger('splitter.resize');
		}).trigger('resize');

		// Run the script once the window is loaded
		if (window.location.search != '?fix')
			$(window).load(runCode);

		$('.button', element).mousedown(function() {
			return false;
		});

		runButton.click(function() {
			runCode();
			return false;
		});

		$('.button.canvas-export-svg', element).click(function() {
			var svg = scope.project.exportSVG({ asString: true });
			this.href = getBlobURL(svg, 'image/svg+xml');
			this.download = 'Export_' + getTimeStamp() + '.svg';
		});

		$('.button.canvas-export-json', element).click(function() {
			var svg = scope.project.exportJSON();
			this.href = getBlobURL(svg, 'text/json');
			this.download = 'Export_' + getTimeStamp() + '.json';
		});

		$('.button.script-download', element).click(function() {
			this.href = getBlobURL(script.code, 'text/javascript');
			this.download = script.name + '_' + getTimeStamp() + '.js';
		});

		$('.button.canvas-clear', element).click(function() {
			if (!scope.project.isEmpty() && confirm(
					'This clears the whole canvas.\nAre you sure to proceed?')) {
				scope.project.clear();
				new Layer();
			}
		});

		$('.button.console-clear', element).click(function() {
			clearConsole();
		});
	}

	$(function() {
		if (window.location.search === '?large')
			$('body').addClass('large');
		createPaperScript($('.paperscript'));
	});
})
})();

