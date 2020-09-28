/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2018 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NetworkPdfManager = exports.LocalPdfManager = undefined;

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _util = require('../shared/util');

var _chunked_stream = require('./chunked_stream');

var _document = require('./document');

var _stream = require('./stream');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var BasePdfManager = function () {
  function BasePdfManager() {
    _classCallCheck(this, BasePdfManager);

    if (this.constructor === BasePdfManager) {
      (0, _util.unreachable)('Cannot initialize BasePdfManager.');
    }
  }

  _createClass(BasePdfManager, [{
    key: 'onLoadedStream',
    value: function onLoadedStream() {
      (0, _util.unreachable)('Abstract method `onLoadedStream` called');
    }
  }, {
    key: 'ensureDoc',
    value: function ensureDoc(prop, args) {
      return this.ensure(this.pdfDocument, prop, args);
    }
  }, {
    key: 'ensureXRef',
    value: function ensureXRef(prop, args) {
      return this.ensure(this.pdfDocument.xref, prop, args);
    }
  }, {
    key: 'ensureCatalog',
    value: function ensureCatalog(prop, args) {
      return this.ensure(this.pdfDocument.catalog, prop, args);
    }
  }, {
    key: 'getPage',
    value: function getPage(pageIndex) {
      return this.pdfDocument.getPage(pageIndex);
    }
  }, {
    key: 'cleanup',
    value: function cleanup() {
      return this.pdfDocument.cleanup();
    }
  }, {
    key: 'ensure',
    value: function () {
      var _ref = _asyncToGenerator( /*#__PURE__*/_regenerator2.default.mark(function _callee(obj, prop, args) {
        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                (0, _util.unreachable)('Abstract method `ensure` called');

              case 1:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function ensure(_x, _x2, _x3) {
        return _ref.apply(this, arguments);
      }

      return ensure;
    }()
  }, {
    key: 'requestRange',
    value: function requestRange(begin, end) {
      (0, _util.unreachable)('Abstract method `requestRange` called');
    }
  }, {
    key: 'requestLoadedStream',
    value: function requestLoadedStream() {
      (0, _util.unreachable)('Abstract method `requestLoadedStream` called');
    }
  }, {
    key: 'sendProgressiveData',
    value: function sendProgressiveData(chunk) {
      (0, _util.unreachable)('Abstract method `sendProgressiveData` called');
    }
  }, {
    key: 'updatePassword',
    value: function updatePassword(password) {
      this._password = password;
    }
  }, {
    key: 'terminate',
    value: function terminate() {
      (0, _util.unreachable)('Abstract method `terminate` called');
    }
  }, {
    key: 'docId',
    get: function get() {
      return this._docId;
    }
  }, {
    key: 'password',
    get: function get() {
      return this._password;
    }
  }, {
    key: 'docBaseUrl',
    get: function get() {
      var docBaseUrl = null;
      if (this._docBaseUrl) {
        var absoluteUrl = (0, _util.createValidAbsoluteUrl)(this._docBaseUrl);
        if (absoluteUrl) {
          docBaseUrl = absoluteUrl.href;
        } else {
          (0, _util.warn)('Invalid absolute docBaseUrl: "' + this._docBaseUrl + '".');
        }
      }
      return (0, _util.shadow)(this, 'docBaseUrl', docBaseUrl);
    }
  }]);

  return BasePdfManager;
}();

var LocalPdfManager = function (_BasePdfManager) {
  _inherits(LocalPdfManager, _BasePdfManager);

  function LocalPdfManager(docId, data, password, evaluatorOptions, docBaseUrl) {
    _classCallCheck(this, LocalPdfManager);

    var _this = _possibleConstructorReturn(this, (LocalPdfManager.__proto__ || Object.getPrototypeOf(LocalPdfManager)).call(this));

    _this._docId = docId;
    _this._password = password;
    _this._docBaseUrl = docBaseUrl;
    _this.evaluatorOptions = evaluatorOptions;
    var stream = new _stream.Stream(data);
    _this.pdfDocument = new _document.PDFDocument(_this, stream);
    _this._loadedStreamPromise = Promise.resolve(stream);
    return _this;
  }

  _createClass(LocalPdfManager, [{
    key: 'ensure',
    value: function () {
      var _ref2 = _asyncToGenerator( /*#__PURE__*/_regenerator2.default.mark(function _callee2(obj, prop, args) {
        var value;
        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                value = obj[prop];

                if (!(typeof value === 'function')) {
                  _context2.next = 3;
                  break;
                }

                return _context2.abrupt('return', value.apply(obj, args));

              case 3:
                return _context2.abrupt('return', value);

              case 4:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function ensure(_x4, _x5, _x6) {
        return _ref2.apply(this, arguments);
      }

      return ensure;
    }()
  }, {
    key: 'requestRange',
    value: function requestRange(begin, end) {
      return Promise.resolve();
    }
  }, {
    key: 'requestLoadedStream',
    value: function requestLoadedStream() {}
  }, {
    key: 'onLoadedStream',
    value: function onLoadedStream() {
      return this._loadedStreamPromise;
    }
  }, {
    key: 'terminate',
    value: function terminate() {}
  }]);

  return LocalPdfManager;
}(BasePdfManager);

var NetworkPdfManager = function (_BasePdfManager2) {
  _inherits(NetworkPdfManager, _BasePdfManager2);

  function NetworkPdfManager(docId, pdfNetworkStream, args, evaluatorOptions, docBaseUrl) {
    _classCallCheck(this, NetworkPdfManager);

    var _this2 = _possibleConstructorReturn(this, (NetworkPdfManager.__proto__ || Object.getPrototypeOf(NetworkPdfManager)).call(this));

    _this2._docId = docId;
    _this2._password = args.password;
    _this2._docBaseUrl = docBaseUrl;
    _this2.msgHandler = args.msgHandler;
    _this2.evaluatorOptions = evaluatorOptions;
    _this2.streamManager = new _chunked_stream.ChunkedStreamManager(pdfNetworkStream, {
      msgHandler: args.msgHandler,
      url: args.url,
      length: args.length,
      disableAutoFetch: args.disableAutoFetch,
      rangeChunkSize: args.rangeChunkSize
    });
    _this2.pdfDocument = new _document.PDFDocument(_this2, _this2.streamManager.getStream());
    return _this2;
  }

  _createClass(NetworkPdfManager, [{
    key: 'ensure',
    value: function () {
      var _ref3 = _asyncToGenerator( /*#__PURE__*/_regenerator2.default.mark(function _callee3(obj, prop, args) {
        var value;
        return _regenerator2.default.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                _context3.prev = 0;
                value = obj[prop];

                if (!(typeof value === 'function')) {
                  _context3.next = 4;
                  break;
                }

                return _context3.abrupt('return', value.apply(obj, args));

              case 4:
                return _context3.abrupt('return', value);

              case 7:
                _context3.prev = 7;
                _context3.t0 = _context3['catch'](0);

                if (_context3.t0 instanceof _util.MissingDataException) {
                  _context3.next = 11;
                  break;
                }

                throw _context3.t0;

              case 11:
                _context3.next = 13;
                return this.requestRange(_context3.t0.begin, _context3.t0.end);

              case 13:
                return _context3.abrupt('return', this.ensure(obj, prop, args));

              case 14:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this, [[0, 7]]);
      }));

      function ensure(_x7, _x8, _x9) {
        return _ref3.apply(this, arguments);
      }

      return ensure;
    }()
  }, {
    key: 'requestRange',
    value: function requestRange(begin, end) {
      return this.streamManager.requestRange(begin, end);
    }
  }, {
    key: 'requestLoadedStream',
    value: function requestLoadedStream() {
      this.streamManager.requestAllChunks();
    }
  }, {
    key: 'sendProgressiveData',
    value: function sendProgressiveData(chunk) {
      this.streamManager.onReceiveData({ chunk: chunk });
    }
  }, {
    key: 'onLoadedStream',
    value: function onLoadedStream() {
      return this.streamManager.onLoadedStream();
    }
  }, {
    key: 'terminate',
    value: function terminate() {
      this.streamManager.abort();
    }
  }]);

  return NetworkPdfManager;
}(BasePdfManager);

exports.LocalPdfManager = LocalPdfManager;
exports.NetworkPdfManager = NetworkPdfManager;