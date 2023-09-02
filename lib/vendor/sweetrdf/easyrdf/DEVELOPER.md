# Developers

Please also read [CONTRIBUTING.md](CONTRIBUTING.md).

## .editorconfig

Please make sure your editor uses our `.editorconfig` file. It contains rules about our coding styles.

## Docker

To improve local development we have a Docker container on board. You can find it in `/docker`.

If you are on `Linux`, go to your terminal, switch to the `docker` folder and run:

> make

This will build and start the docker container.
After it started, you will be logged in automatically.

Afterwards you can run further commands on the CLI, like `composer update` or PHPUnit test suite.

## Tests

Our test related files are located in `test` folder. Tests are written using PHPUnit.

Make sure you ran `composer update`, if you want to execute the test suite.

To run all tests, open your terminal and run:

> vendor/bin/phpunit

[Here](https://github.com/sweetrdf/easyrdf/actions/workflows/Tests.yml) you can find our latest test results online.

### Linux and Windows tests

Our tests run in Linux and Windows environment.
Please check our [workflow file](.github/workflows/Tests.yml) for more information.

In some cases tests fail because they are dependent on Linux-related functionality, like line endings.
For now `@group linux` is used to mark those tests and not run them in Windows.
But in the future all tests have to be independend from underlying operating system.

## Important notes

* Don't rely on our test API, like functions or classes! They are only for internal use. If you want certain functionality be part of the public API, please create an issue.
