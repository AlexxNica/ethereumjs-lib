# How to use

* After cloning, run "git submodule update --init" to get test data.
* Run `npm run-script compile` to compile to a browser-friendly minified file. Once in the browser, the global Ethereum object can be used to call any functions.
* To use in NodeJS, install this package and in your main file put `var Ethereum = include('ethereumjs-lib')`

### Contributing

* Please include corresponding tests for code you're adding and ensure "npm test" passes (you may need to update submodule).
* Writing tests for existing code, is also welcome.  Thanks
