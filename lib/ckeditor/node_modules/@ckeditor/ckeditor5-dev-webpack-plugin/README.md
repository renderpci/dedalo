CKEditor 5 webpack plugin
=========================

[![npm version](https://badge.fury.io/js/%40ckeditor%2Fckeditor5-dev-webpack-plugin.svg)](https://www.npmjs.com/package/@ckeditor/ckeditor5-dev-webpack-plugin)
[![Build Status](https://travis-ci.com/ckeditor/ckeditor5-dev.svg?branch=master)](https://app.travis-ci.com/github/ckeditor/ckeditor5-dev)
![Dependency Status](https://img.shields.io/librariesio/release/npm/@ckeditor/ckeditor5-dev-webpack-plugin)

Intergrate [CKEditor 5](https://ckeditor.com)'s build process with your [webpack](https://webpack.js.org) setup.

Requires webpack `^4.0.0` or `^5.0.0`.

More information about development tools packages can be found at the following URL: <https://github.com/ckeditor/ckeditor5-dev>.

## Usage

The current functionality of this plugin is limited to localizing the editor builds. Add this plugin to your webpack configuration to change the language of the editor's interface or build the editor with support for multiple languages (by extracting multiple language files):

```js
const CKEditorWebpackPlugin = require( '@ckeditor/ckeditor5-dev-webpack-plugin' );

// Define webpack plugins ...
	plugins: [
		new CKEditorWebpackPlugin( options ),

		// Other webpack plugins...
	]
// ...
```

### Options:

#### `language`

The main language that will be built into the main bundle, e.g. `en`.

#### `additionalLanguages`

Additional languages that will be emitted to the `outputDirectory`. This option can be set to an array of language codes or `'all'` to build all found languages. The bundle is optimized for one language when this option is omitted.

### `outputDirectory`

An optional directory for emitted translations. Relative to the webpack's output. Defaults to `'translations'`.

### `strict`

When set to `true`, it stops the webpack compilation when an error occurs. Defaults to `false`.

### `verbose`

When set to `true`, it logs all warnings found during the compilation. Defaults to `false`.

### `addMainLanguageTranslationsToAllAssets`

When set to `true`, all generated assets (bundles) will include translations for the main language.

### `buildAllTranslationsToSeparateFiles`

When set to `true`, all translations will be output to the `translations` directory (or the directory specified by the [`outputDirectory` option](#outputDirectory)).

### `packageNamesPattern`

A pattern which is used for determining if a package may contain translations (PO files) in the `<package_name>/lang/translations` directory. Defaults to `/[/\\]ckeditor5-[^/\\]+[/\\]/`.

### `sourceFilesPattern`

A pattern which is used for determining if a file may contain messages to translate. Defaults to `/[/\\]ckeditor5-[^/\\]+[/\\]src[/\\].+\.js$/`.

### `translationsOutputFile`

An option that allows specifying the target file to which all translations will be outputted. This option supports a string, regular expression and a function. If no asset exists with the name, it will be created automatically and filled with translations.

### `includeCorePackageTranslations`

When set to `true`, all translations from the `ckeditor5-core` package will be added into the bundle files. Defaults to `false`.

### `skipPluralFormFunction`

When set to `true`, the `getPluralForm()` function (if exists for the specified language) will not be added into the bundle file. Defaults to `false`.

### `corePackagePattern`

(internal)
A pattern which is used to get a path to the core translation package from `corePackageSampleResourcePath`, which contains the main translations. Defaults to /[/\\]ckeditor5-core/.

### `corePackageSampleResourcePath`

(internal)
A sample path to the `ckeditor5-core` package. A test import to this file shows if the `ckeditor5-core` package is available and allows to load the core package translations first.

### `corePackageContextsResourcePath`

(internal)
A path the `context.json` file in the `ckeditor5-core` package. It is used if the `includeCorePackageTranslations` option is set to `true`.

You can read more about localizing the editor in the [Setting the UI language](https://docs.ckeditor.com/ckeditor5/latest/features/ui-language.html) guide.

## Changelog

See the [`CHANGELOG.md`](https://github.com/ckeditor/ckeditor5-dev/blob/master/packages/ckeditor5-dev-webpack-plugin/CHANGELOG.md) file.

## License

Licensed under the terms of [GNU General Public License Version 2 or later](http://www.gnu.org/licenses/gpl.html). For full details about the license, please check the `LICENSE.md` file.
