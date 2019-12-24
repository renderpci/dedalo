module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON("package.json"),
    clean: {
      dist: {
        src: ["dist"]
      }
    },
    bower: {
      install: {
        options: {
          targetDir: "./lib/managed",
          layout: "byComponent",
          install: true,
          verbose: false,
          cleanTargetDir: false,
          cleanBowerDir: false,
          bowerOptions: {}
        }
      }
    },
    peg: {
      options: {
        // Options for PEG.js parser generator
      },
      vexabc : {
        src: "src/vexabc.pegjs",
        dest: "dist/vexabc-pegjs-parser-raw.js",
        options: {
          // Export parser definition
          exportVar: "module.exports",
          cache: true
        }
      }
    },
    browserify: {
      underscore: {
        src: [],
        dest: "dist/underscore.js",
        options: {
          shim: {
            underscore: {
              path: "lib/managed/underscore/underscore-min.js",
              exports: "_"
            }
          }
        }
      },
      vexflow: {
        src: [],
        dest: "dist/vexflow.js",
        options: {
          shim: {
            vexflow: {
              path: "lib/unmanaged/vexflow/vexflow-min.js",
              exports: "Vex"
            }
          }
        }
      },
      vexabc_pegjs_parser: {
        src: ["dist/vexabc-pegjs-parser-raw.js"],
        dest: "dist/vexabc-pegjs-parser.js",
        options: {
          external: ["underscore"],
          alias: ["dist/vexabc-pegjs-parser-raw.js:vexabc-pegjs-parser"]
        }
      },
      vexabc: {
        src: ["src/vexabc.js"],
        dest: "dist/<%= pkg.name %>.js",
        options: {
          external: ["underscore", "vexflow", "vexabc-pegjs-parser"],
          alias: ["src/vexabc.js:vexabc"]
        }
      }
    },
    concat: {
      options: {
        separator: ";",
      },
      dist: {
        src: ["dist/underscore.js", "dist/vexflow.js", "dist/vexabc-pegjs-parser.js", "dist/vexabc.js"],
        dest: "dist/<%= pkg.name %>-full.js",
      },
    },
    uglify: {
      options: {
        banner: "/*! <%= pkg.name %> <%= grunt.template.today('dd-mm-yyyy') %> */\n"
      },
      dist: {
        files: {
          "dist/<%= pkg.name %>-full-min.js": ["dist/<%= pkg.name %>-full.js"]
        }
      }
    },
    qunit: {
      test: ["test/test.html"]
    },
    jshint: {
      src: ["Gruntfile.js", "src/**/*.js"],
      test: {
        files: {
          test: ["test/**/*.js"]
        },
        options: {
          quotmark: false,
          jquery: true,
          globals: {
            VexAbc: true,
            // QUnit
            test: true,
            ok: true,
            deepEqual: true
          }
        }
      },
      options: {
        // options here to override JSHint defaults
        curly: true,
        eqeqeq: true,
        eqnull: true,
        expr: true,
        immed: true,
        indent: 2,
        multistr: true,
        newcap: true,
        noarg: true,
        quotmark: "double",
        smarttabs: true,
        trailing: true,
        undef: true,
        unused: true,

        node: true,
      }
    },
    watch: {
      src: ["<%= jshint.src %>"],
      tasks: ["jshint", "peg", "browserify"]
    }
  });

  grunt.loadNpmTasks("grunt-contrib-clean");
  grunt.loadNpmTasks("grunt-contrib-jshint");
  grunt.loadNpmTasks("grunt-contrib-qunit");
  grunt.loadNpmTasks("grunt-contrib-uglify");
  grunt.loadNpmTasks("grunt-contrib-watch");
  grunt.loadNpmTasks("grunt-contrib-concat");
  grunt.loadNpmTasks("grunt-browserify");
  grunt.loadNpmTasks("grunt-bower-task");
  grunt.loadNpmTasks("grunt-peg");

  grunt.registerTask("test", ["jshint", "peg", "browserify", "bower", "qunit"]);

  grunt.registerTask("default", ["jshint", "peg", "browserify", "bower", "qunit", "concat", "uglify"]);

};
