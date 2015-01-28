(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * Copyright (c) 2014, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

module.exports.Dispatcher = require('./lib/Dispatcher')

},{"./lib/Dispatcher":2}],2:[function(require,module,exports){
/*
 * Copyright (c) 2014, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule Dispatcher
 * @typechecks
 */

"use strict";

var invariant = require('./invariant');

var _lastID = 1;
var _prefix = 'ID_';

/**
 * Dispatcher is used to broadcast payloads to registered callbacks. This is
 * different from generic pub-sub systems in two ways:
 *
 *   1) Callbacks are not subscribed to particular events. Every payload is
 *      dispatched to every registered callback.
 *   2) Callbacks can be deferred in whole or part until other callbacks have
 *      been executed.
 *
 * For example, consider this hypothetical flight destination form, which
 * selects a default city when a country is selected:
 *
 *   var flightDispatcher = new Dispatcher();
 *
 *   // Keeps track of which country is selected
 *   var CountryStore = {country: null};
 *
 *   // Keeps track of which city is selected
 *   var CityStore = {city: null};
 *
 *   // Keeps track of the base flight price of the selected city
 *   var FlightPriceStore = {price: null}
 *
 * When a user changes the selected city, we dispatch the payload:
 *
 *   flightDispatcher.dispatch({
 *     actionType: 'city-update',
 *     selectedCity: 'paris'
 *   });
 *
 * This payload is digested by `CityStore`:
 *
 *   flightDispatcher.register(function(payload) {
 *     if (payload.actionType === 'city-update') {
 *       CityStore.city = payload.selectedCity;
 *     }
 *   });
 *
 * When the user selects a country, we dispatch the payload:
 *
 *   flightDispatcher.dispatch({
 *     actionType: 'country-update',
 *     selectedCountry: 'australia'
 *   });
 *
 * This payload is digested by both stores:
 *
 *    CountryStore.dispatchToken = flightDispatcher.register(function(payload) {
 *     if (payload.actionType === 'country-update') {
 *       CountryStore.country = payload.selectedCountry;
 *     }
 *   });
 *
 * When the callback to update `CountryStore` is registered, we save a reference
 * to the returned token. Using this token with `waitFor()`, we can guarantee
 * that `CountryStore` is updated before the callback that updates `CityStore`
 * needs to query its data.
 *
 *   CityStore.dispatchToken = flightDispatcher.register(function(payload) {
 *     if (payload.actionType === 'country-update') {
 *       // `CountryStore.country` may not be updated.
 *       flightDispatcher.waitFor([CountryStore.dispatchToken]);
 *       // `CountryStore.country` is now guaranteed to be updated.
 *
 *       // Select the default city for the new country
 *       CityStore.city = getDefaultCityForCountry(CountryStore.country);
 *     }
 *   });
 *
 * The usage of `waitFor()` can be chained, for example:
 *
 *   FlightPriceStore.dispatchToken =
 *     flightDispatcher.register(function(payload) {
 *       switch (payload.actionType) {
 *         case 'country-update':
 *           flightDispatcher.waitFor([CityStore.dispatchToken]);
 *           FlightPriceStore.price =
 *             getFlightPriceStore(CountryStore.country, CityStore.city);
 *           break;
 *
 *         case 'city-update':
 *           FlightPriceStore.price =
 *             FlightPriceStore(CountryStore.country, CityStore.city);
 *           break;
 *     }
 *   });
 *
 * The `country-update` payload will be guaranteed to invoke the stores'
 * registered callbacks in order: `CountryStore`, `CityStore`, then
 * `FlightPriceStore`.
 */

  function Dispatcher() {
    this.$Dispatcher_callbacks = {};
    this.$Dispatcher_isPending = {};
    this.$Dispatcher_isHandled = {};
    this.$Dispatcher_isDispatching = false;
    this.$Dispatcher_pendingPayload = null;
  }

  /**
   * Registers a callback to be invoked with every dispatched payload. Returns
   * a token that can be used with `waitFor()`.
   *
   * @param {function} callback
   * @return {string}
   */
  Dispatcher.prototype.register=function(callback) {
    var id = _prefix + _lastID++;
    this.$Dispatcher_callbacks[id] = callback;
    return id;
  };

  /**
   * Removes a callback based on its token.
   *
   * @param {string} id
   */
  Dispatcher.prototype.unregister=function(id) {
    invariant(
      this.$Dispatcher_callbacks[id],
      'Dispatcher.unregister(...): `%s` does not map to a registered callback.',
      id
    );
    delete this.$Dispatcher_callbacks[id];
  };

  /**
   * Waits for the callbacks specified to be invoked before continuing execution
   * of the current callback. This method should only be used by a callback in
   * response to a dispatched payload.
   *
   * @param {array<string>} ids
   */
  Dispatcher.prototype.waitFor=function(ids) {
    invariant(
      this.$Dispatcher_isDispatching,
      'Dispatcher.waitFor(...): Must be invoked while dispatching.'
    );
    for (var ii = 0; ii < ids.length; ii++) {
      var id = ids[ii];
      if (this.$Dispatcher_isPending[id]) {
        invariant(
          this.$Dispatcher_isHandled[id],
          'Dispatcher.waitFor(...): Circular dependency detected while ' +
          'waiting for `%s`.',
          id
        );
        continue;
      }
      invariant(
        this.$Dispatcher_callbacks[id],
        'Dispatcher.waitFor(...): `%s` does not map to a registered callback.',
        id
      );
      this.$Dispatcher_invokeCallback(id);
    }
  };

  /**
   * Dispatches a payload to all registered callbacks.
   *
   * @param {object} payload
   */
  Dispatcher.prototype.dispatch=function(payload) {
    invariant(
      !this.$Dispatcher_isDispatching,
      'Dispatch.dispatch(...): Cannot dispatch in the middle of a dispatch.'
    );
    this.$Dispatcher_startDispatching(payload);
    try {
      for (var id in this.$Dispatcher_callbacks) {
        if (this.$Dispatcher_isPending[id]) {
          continue;
        }
        this.$Dispatcher_invokeCallback(id);
      }
    } finally {
      this.$Dispatcher_stopDispatching();
    }
  };

  /**
   * Is this Dispatcher currently dispatching.
   *
   * @return {boolean}
   */
  Dispatcher.prototype.isDispatching=function() {
    return this.$Dispatcher_isDispatching;
  };

  /**
   * Call the callback stored with the given id. Also do some internal
   * bookkeeping.
   *
   * @param {string} id
   * @internal
   */
  Dispatcher.prototype.$Dispatcher_invokeCallback=function(id) {
    this.$Dispatcher_isPending[id] = true;
    this.$Dispatcher_callbacks[id](this.$Dispatcher_pendingPayload);
    this.$Dispatcher_isHandled[id] = true;
  };

  /**
   * Set up bookkeeping needed when dispatching.
   *
   * @param {object} payload
   * @internal
   */
  Dispatcher.prototype.$Dispatcher_startDispatching=function(payload) {
    for (var id in this.$Dispatcher_callbacks) {
      this.$Dispatcher_isPending[id] = false;
      this.$Dispatcher_isHandled[id] = false;
    }
    this.$Dispatcher_pendingPayload = payload;
    this.$Dispatcher_isDispatching = true;
  };

  /**
   * Clear bookkeeping used for dispatching.
   *
   * @internal
   */
  Dispatcher.prototype.$Dispatcher_stopDispatching=function() {
    this.$Dispatcher_pendingPayload = null;
    this.$Dispatcher_isDispatching = false;
  };


module.exports = Dispatcher;

},{"./invariant":3}],3:[function(require,module,exports){
/**
 * Copyright (c) 2014, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule invariant
 */

"use strict";

/**
 * Use invariant() to assert state which your program assumes to be true.
 *
 * Provide sprintf-style format (only %s is supported) and arguments
 * to provide information about what broke and what you were
 * expecting.
 *
 * The invariant message will be stripped in production, but the invariant
 * will remain to ensure logic does not differ in production.
 */

var invariant = function(condition, format, a, b, c, d, e, f) {
  if (false) {
    if (format === undefined) {
      throw new Error('invariant requires an error message argument');
    }
  }

  if (!condition) {
    var error;
    if (format === undefined) {
      error = new Error(
        'Minified exception occurred; use the non-minified dev environment ' +
        'for the full error message and additional helpful warnings.'
      );
    } else {
      var args = [a, b, c, d, e, f];
      var argIndex = 0;
      error = new Error(
        'Invariant Violation: ' +
        format.replace(/%s/g, function() { return args[argIndex++]; })
      );
    }

    error.framesToPop = 1; // we don't care about invariant's own frame
    throw error;
  }
};

module.exports = invariant;

},{}],4:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],5:[function(require,module,exports){
var arrayMap = require('../internal/arrayMap'),
    baseCallback = require('../internal/baseCallback'),
    baseMap = require('../internal/baseMap'),
    isArray = require('../lang/isArray');

/**
 * Creates an array of values by running each element in `collection` through
 * `iteratee`. The `iteratee` is bound to `thisArg` and invoked with three
 * arguments; (value, index|key, collection).
 *
 * If a property name is provided for `predicate` the created "_.property"
 * style callback returns the property value of the given element.
 *
 * If an object is provided for `predicate` the created "_.matches" style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * @static
 * @memberOf _
 * @alias collect
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function|Object|string} [iteratee=_.identity] The function invoked
 *  per iteration. If a property name or object is provided it is used to
 *  create a "_.property" or "_.matches" style callback respectively.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {Array} Returns the new mapped array.
 * @example
 *
 * _.map([1, 2, 3], function(n) { return n * 3; });
 * // => [3, 6, 9]
 *
 * _.map({ 'one': 1, 'two': 2, 'three': 3 }, function(n) { return n * 3; });
 * // => [3, 6, 9] (iteration order is not guaranteed)
 *
 * var users = [
 *   { 'user': 'barney' },
 *   { 'user': 'fred' }
 * ];
 *
 * // using the "_.property" callback shorthand
 * _.map(users, 'user');
 * // => ['barney', 'fred']
 */
function map(collection, iteratee, thisArg) {
  var func = isArray(collection) ? arrayMap : baseMap;
  iteratee = baseCallback(iteratee, thisArg, 3);
  return func(collection, iteratee);
}

module.exports = map;

},{"../internal/arrayMap":8,"../internal/baseCallback":9,"../internal/baseMap":18,"../lang/isArray":41}],6:[function(require,module,exports){
/**
 * Copies the values of `source` to `array`.
 *
 * @private
 * @param {Array} source The array to copy values from.
 * @param {Array} [array=[]] The array to copy values to.
 * @returns {Array} Returns `array`.
 */
function arrayCopy(source, array) {
  var index = -1,
      length = source.length;

  array || (array = Array(length));
  while (++index < length) {
    array[index] = source[index];
  }
  return array;
}

module.exports = arrayCopy;

},{}],7:[function(require,module,exports){
/**
 * A specialized version of `_.forEach` for arrays without support for callback
 * shorthands or `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns `array`.
 */
function arrayEach(array, iteratee) {
  var index = -1,
      length = array.length;

  while (++index < length) {
    if (iteratee(array[index], index, array) === false) {
      break;
    }
  }
  return array;
}

module.exports = arrayEach;

},{}],8:[function(require,module,exports){
/**
 * A specialized version of `_.map` for arrays without support for callback
 * shorthands or `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the new mapped array.
 */
function arrayMap(array, iteratee) {
  var index = -1,
      length = array.length,
      result = Array(length);

  while (++index < length) {
    result[index] = iteratee(array[index], index, array);
  }
  return result;
}

module.exports = arrayMap;

},{}],9:[function(require,module,exports){
var baseMatches = require('./baseMatches'),
    baseProperty = require('./baseProperty'),
    baseToString = require('./baseToString'),
    bindCallback = require('./bindCallback'),
    identity = require('../utility/identity'),
    isBindable = require('./isBindable');

/**
 * The base implementation of `_.callback` which supports specifying the
 * number of arguments to provide to `func`.
 *
 * @private
 * @param {*} [func=_.identity] The value to convert to a callback.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {number} [argCount] The number of arguments to provide to `func`.
 * @returns {Function} Returns the callback.
 */
function baseCallback(func, thisArg, argCount) {
  var type = typeof func;
  if (type == 'function') {
    return (typeof thisArg != 'undefined' && isBindable(func))
      ? bindCallback(func, thisArg, argCount)
      : func;
  }
  if (func == null) {
    return identity;
  }
  // Handle "_.property" and "_.matches" style callback shorthands.
  return type == 'object'
    ? baseMatches(func, !argCount)
    : baseProperty(argCount ? baseToString(func) : func);
}

module.exports = baseCallback;

},{"../utility/identity":50,"./baseMatches":19,"./baseProperty":20,"./baseToString":22,"./bindCallback":23,"./isBindable":31}],10:[function(require,module,exports){
var arrayCopy = require('./arrayCopy'),
    arrayEach = require('./arrayEach'),
    baseCopy = require('./baseCopy'),
    baseForOwn = require('./baseForOwn'),
    initCloneArray = require('./initCloneArray'),
    initCloneByTag = require('./initCloneByTag'),
    initCloneObject = require('./initCloneObject'),
    isArray = require('../lang/isArray'),
    isObject = require('../lang/isObject'),
    keys = require('../object/keys');

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    mapTag = '[object Map]',
    numberTag = '[object Number]',
    objectTag = '[object Object]',
    regexpTag = '[object RegExp]',
    setTag = '[object Set]',
    stringTag = '[object String]',
    weakMapTag = '[object WeakMap]';

var arrayBufferTag = '[object ArrayBuffer]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/** Used to identify `toStringTag` values supported by `_.clone`. */
var cloneableTags = {};
cloneableTags[argsTag] = cloneableTags[arrayTag] =
cloneableTags[arrayBufferTag] = cloneableTags[boolTag] =
cloneableTags[dateTag] = cloneableTags[float32Tag] =
cloneableTags[float64Tag] = cloneableTags[int8Tag] =
cloneableTags[int16Tag] = cloneableTags[int32Tag] =
cloneableTags[numberTag] = cloneableTags[objectTag] =
cloneableTags[regexpTag] = cloneableTags[stringTag] =
cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] =
cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
cloneableTags[errorTag] = cloneableTags[funcTag] =
cloneableTags[mapTag] = cloneableTags[setTag] =
cloneableTags[weakMapTag] = false;

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the `toStringTag` of values.
 * See the [ES spec](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * for more details.
 */
var objToString = objectProto.toString;

/**
 * The base implementation of `_.clone` without support for argument juggling
 * and `this` binding `customizer` functions.
 *
 * @private
 * @param {*} value The value to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @param {Function} [customizer] The function to customize cloning values.
 * @param {string} [key] The key of `value`.
 * @param {Object} [object] The object `value` belongs to.
 * @param {Array} [stackA=[]] Tracks traversed source objects.
 * @param {Array} [stackB=[]] Associates clones with source counterparts.
 * @returns {*} Returns the cloned value.
 */
function baseClone(value, isDeep, customizer, key, object, stackA, stackB) {
  var result;
  if (customizer) {
    result = object ? customizer(value, key, object) : customizer(value);
  }
  if (typeof result != 'undefined') {
    return result;
  }
  if (!isObject(value)) {
    return value;
  }
  var isArr = isArray(value);
  if (isArr) {
    result = initCloneArray(value);
    if (!isDeep) {
      return arrayCopy(value, result);
    }
  } else {
    var tag = objToString.call(value),
        isFunc = tag == funcTag;

    if (tag == objectTag || tag == argsTag || (isFunc && !object)) {
      result = initCloneObject(isFunc ? {} : value);
      if (!isDeep) {
        return baseCopy(value, result, keys(value));
      }
    } else {
      return cloneableTags[tag]
        ? initCloneByTag(value, tag, isDeep)
        : (object ? value : {});
    }
  }
  // Check for circular references and return corresponding clone.
  stackA || (stackA = []);
  stackB || (stackB = []);

  var length = stackA.length;
  while (length--) {
    if (stackA[length] == value) {
      return stackB[length];
    }
  }
  // Add the source value to the stack of traversed objects and associate it with its clone.
  stackA.push(value);
  stackB.push(result);

  // Recursively populate clone (susceptible to call stack limits).
  (isArr ? arrayEach : baseForOwn)(value, function(subValue, key) {
    result[key] = baseClone(subValue, isDeep, customizer, key, value, stackA, stackB);
  });
  return result;
}

module.exports = baseClone;

},{"../lang/isArray":41,"../lang/isObject":43,"../object/keys":45,"./arrayCopy":6,"./arrayEach":7,"./baseCopy":11,"./baseForOwn":14,"./initCloneArray":28,"./initCloneByTag":29,"./initCloneObject":30}],11:[function(require,module,exports){
/**
 * Copies the properties of `source` to `object`.
 *
 * @private
 * @param {Object} source The object to copy properties from.
 * @param {Object} [object={}] The object to copy properties to.
 * @param {Array} props The property names to copy.
 * @returns {Object} Returns `object`.
 */
function baseCopy(source, object, props) {
  if (!props) {
    props = object;
    object = {};
  }
  var index = -1,
      length = props.length;

  while (++index < length) {
    var key = props[index];
    object[key] = source[key];
  }
  return object;
}

module.exports = baseCopy;

},{}],12:[function(require,module,exports){
var baseForOwn = require('./baseForOwn'),
    isLength = require('./isLength'),
    toObject = require('./toObject');

/**
 * The base implementation of `_.forEach` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array|Object|string} Returns `collection`.
 */
function baseEach(collection, iteratee) {
  var length = collection ? collection.length : 0;
  if (!isLength(length)) {
    return baseForOwn(collection, iteratee);
  }
  var index = -1,
      iterable = toObject(collection);

  while (++index < length) {
    if (iteratee(iterable[index], index, iterable) === false) {
      break;
    }
  }
  return collection;
}

module.exports = baseEach;

},{"./baseForOwn":14,"./isLength":34,"./toObject":39}],13:[function(require,module,exports){
var toObject = require('./toObject');

/**
 * The base implementation of `baseForIn` and `baseForOwn` which iterates
 * over `object` properties returned by `keysFunc` invoking `iteratee` for
 * each property. Iterator functions may exit iteration early by explicitly
 * returning `false`.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {Function} keysFunc The function to get the keys of `object`.
 * @returns {Object} Returns `object`.
 */
function baseFor(object, iteratee, keysFunc) {
  var index = -1,
      iterable = toObject(object),
      props = keysFunc(object),
      length = props.length;

  while (++index < length) {
    var key = props[index];
    if (iteratee(iterable[key], key, iterable) === false) {
      break;
    }
  }
  return object;
}

module.exports = baseFor;

},{"./toObject":39}],14:[function(require,module,exports){
var baseFor = require('./baseFor'),
    keys = require('../object/keys');

/**
 * The base implementation of `_.forOwn` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Object} Returns `object`.
 */
function baseForOwn(object, iteratee) {
  return baseFor(object, iteratee, keys);
}

module.exports = baseForOwn;

},{"../object/keys":45,"./baseFor":13}],15:[function(require,module,exports){
var baseIsEqualDeep = require('./baseIsEqualDeep');

/**
 * The base implementation of `_.isEqual` without support for `this` binding
 * `customizer` functions.
 *
 * @private
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @param {Function} [customizer] The function to customize comparing values.
 * @param {boolean} [isWhere] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 */
function baseIsEqual(value, other, customizer, isWhere, stackA, stackB) {
  // Exit early for identical values.
  if (value === other) {
    // Treat `+0` vs. `-0` as not equal.
    return value !== 0 || (1 / value == 1 / other);
  }
  var valType = typeof value,
      othType = typeof other;

  // Exit early for unlike primitive values.
  if ((valType != 'function' && valType != 'object' && othType != 'function' && othType != 'object') ||
      value == null || other == null) {
    // Return `false` unless both values are `NaN`.
    return value !== value && other !== other;
  }
  return baseIsEqualDeep(value, other, baseIsEqual, customizer, isWhere, stackA, stackB);
}

module.exports = baseIsEqual;

},{"./baseIsEqualDeep":16}],16:[function(require,module,exports){
var equalArrays = require('./equalArrays'),
    equalByTag = require('./equalByTag'),
    equalObjects = require('./equalObjects'),
    isArray = require('../lang/isArray'),
    isTypedArray = require('../lang/isTypedArray');

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    objectTag = '[object Object]';

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the `toStringTag` of values.
 * See the [ES spec](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * for more details.
 */
var objToString = objectProto.toString;

/**
 * A specialized version of `baseIsEqual` for arrays and objects which performs
 * deep comparisons and tracks traversed objects enabling objects with circular
 * references to be compared.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing objects.
 * @param {boolean} [isWhere] Specify performing partial comparisons.
 * @param {Array} [stackA=[]] Tracks traversed `value` objects.
 * @param {Array} [stackB=[]] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function baseIsEqualDeep(object, other, equalFunc, customizer, isWhere, stackA, stackB) {
  var objIsArr = isArray(object),
      othIsArr = isArray(other),
      objTag = arrayTag,
      othTag = arrayTag;

  if (!objIsArr) {
    objTag = objToString.call(object);
    if (objTag == argsTag) {
      objTag = objectTag;
    } else if (objTag != objectTag) {
      objIsArr = isTypedArray(object);
    }
  }
  if (!othIsArr) {
    othTag = objToString.call(other);
    if (othTag == argsTag) {
      othTag = objectTag;
    } else if (othTag != objectTag) {
      othIsArr = isTypedArray(other);
    }
  }
  var objIsObj = objTag == objectTag,
      othIsObj = othTag == objectTag,
      isSameTag = objTag == othTag;

  if (isSameTag && !(objIsArr || objIsObj)) {
    return equalByTag(object, other, objTag);
  }
  var valWrapped = objIsObj && hasOwnProperty.call(object, '__wrapped__'),
      othWrapped = othIsObj && hasOwnProperty.call(other, '__wrapped__');

  if (valWrapped || othWrapped) {
    return equalFunc(valWrapped ? object.value() : object, othWrapped ? other.value() : other, customizer, isWhere, stackA, stackB);
  }
  if (!isSameTag) {
    return false;
  }
  // Assume cyclic values are equal.
  // For more information on detecting circular references see https://es5.github.io/#JO.
  stackA || (stackA = []);
  stackB || (stackB = []);

  var length = stackA.length;
  while (length--) {
    if (stackA[length] == object) {
      return stackB[length] == other;
    }
  }
  // Add `object` and `other` to the stack of traversed objects.
  stackA.push(object);
  stackB.push(other);

  var result = (objIsArr ? equalArrays : equalObjects)(object, other, equalFunc, customizer, isWhere, stackA, stackB);

  stackA.pop();
  stackB.pop();

  return result;
}

module.exports = baseIsEqualDeep;

},{"../lang/isArray":41,"../lang/isTypedArray":44,"./equalArrays":25,"./equalByTag":26,"./equalObjects":27}],17:[function(require,module,exports){
var baseIsEqual = require('./baseIsEqual');

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * The base implementation of `_.isMatch` without support for callback
 * shorthands or `this` binding.
 *
 * @private
 * @param {Object} source The object to inspect.
 * @param {Array} props The source property names to match.
 * @param {Array} values The source values to match.
 * @param {Array} strictCompareFlags Strict comparison flags for source values.
 * @param {Function} [customizer] The function to customize comparing objects.
 * @returns {boolean} Returns `true` if `object` is a match, else `false`.
 */
function baseIsMatch(object, props, values, strictCompareFlags, customizer) {
  var length = props.length;
  if (object == null) {
    return !length;
  }
  var index = -1,
      noCustomizer = !customizer;

  while (++index < length) {
    if ((noCustomizer && strictCompareFlags[index])
          ? values[index] !== object[props[index]]
          : !hasOwnProperty.call(object, props[index])
        ) {
      return false;
    }
  }
  index = -1;
  while (++index < length) {
    var key = props[index];
    if (noCustomizer && strictCompareFlags[index]) {
      var result = hasOwnProperty.call(object, key);
    } else {
      var objValue = object[key],
          srcValue = values[index];

      result = customizer ? customizer(objValue, srcValue, key) : undefined;
      if (typeof result == 'undefined') {
        result = baseIsEqual(srcValue, objValue, customizer, true);
      }
    }
    if (!result) {
      return false;
    }
  }
  return true;
}

module.exports = baseIsMatch;

},{"./baseIsEqual":15}],18:[function(require,module,exports){
var baseEach = require('./baseEach');

/**
 * The base implementation of `_.map` without support for callback shorthands
 * or `this` binding.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the new mapped array.
 */
function baseMap(collection, iteratee) {
  var result = [];
  baseEach(collection, function(value, key, collection) {
    result.push(iteratee(value, key, collection));
  });
  return result;
}

module.exports = baseMap;

},{"./baseEach":12}],19:[function(require,module,exports){
var baseClone = require('./baseClone'),
    baseIsMatch = require('./baseIsMatch'),
    isStrictComparable = require('./isStrictComparable'),
    keys = require('../object/keys');

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * The base implementation of `_.matches` which supports specifying whether
 * `source` should be cloned.
 *
 * @private
 * @param {Object} source The object of property values to match.
 * @param {boolean} [isCloned] Specify cloning the source object.
 * @returns {Function} Returns the new function.
 */
function baseMatches(source, isCloned) {
  var props = keys(source),
      length = props.length;

  if (length == 1) {
    var key = props[0],
        value = source[key];

    if (isStrictComparable(value)) {
      return function(object) {
        return object != null && value === object[key] && hasOwnProperty.call(object, key);
      };
    }
  }
  if (isCloned) {
    source = baseClone(source, true);
  }
  var values = Array(length),
      strictCompareFlags = Array(length);

  while (length--) {
    value = source[props[length]];
    values[length] = value;
    strictCompareFlags[length] = isStrictComparable(value);
  }
  return function(object) {
    return baseIsMatch(object, props, values, strictCompareFlags);
  };
}

module.exports = baseMatches;

},{"../object/keys":45,"./baseClone":10,"./baseIsMatch":17,"./isStrictComparable":36}],20:[function(require,module,exports){
/**
 * The base implementation of `_.property` which does not coerce `key` to a string.
 *
 * @private
 * @param {string} key The key of the property to get.
 * @returns {Function} Returns the new function.
 */
function baseProperty(key) {
  return function(object) {
    return object == null ? undefined : object[key];
  };
}

module.exports = baseProperty;

},{}],21:[function(require,module,exports){
var identity = require('../utility/identity'),
    metaMap = require('./metaMap');

/**
 * The base implementation of `setData` without support for hot loop detection.
 *
 * @private
 * @param {Function} func The function to associate metadata with.
 * @param {*} data The metadata.
 * @returns {Function} Returns `func`.
 */
var baseSetData = !metaMap ? identity : function(func, data) {
  metaMap.set(func, data);
  return func;
};

module.exports = baseSetData;

},{"../utility/identity":50,"./metaMap":37}],22:[function(require,module,exports){
/**
 * Converts `value` to a string if it is not one. An empty string is returned
 * for `null` or `undefined` values.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 */
function baseToString(value) {
  if (typeof value == 'string') {
    return value;
  }
  return value == null ? '' : (value + '');
}

module.exports = baseToString;

},{}],23:[function(require,module,exports){
var identity = require('../utility/identity');

/**
 * A specialized version of `baseCallback` which only supports `this` binding
 * and specifying the number of arguments to provide to `func`.
 *
 * @private
 * @param {Function} func The function to bind.
 * @param {*} thisArg The `this` binding of `func`.
 * @param {number} [argCount] The number of arguments to provide to `func`.
 * @returns {Function} Returns the callback.
 */
function bindCallback(func, thisArg, argCount) {
  if (typeof func != 'function') {
    return identity;
  }
  if (typeof thisArg == 'undefined') {
    return func;
  }
  switch (argCount) {
    case 1: return function(value) {
      return func.call(thisArg, value);
    };
    case 3: return function(value, index, collection) {
      return func.call(thisArg, value, index, collection);
    };
    case 4: return function(accumulator, value, index, collection) {
      return func.call(thisArg, accumulator, value, index, collection);
    };
    case 5: return function(value, other, key, object, source) {
      return func.call(thisArg, value, other, key, object, source);
    };
  }
  return function() {
    return func.apply(thisArg, arguments);
  };
}

module.exports = bindCallback;

},{"../utility/identity":50}],24:[function(require,module,exports){
(function (global){
var constant = require('../utility/constant'),
    isNative = require('../lang/isNative');

/** Native method references. */
var ArrayBuffer = isNative(ArrayBuffer = global.ArrayBuffer) && ArrayBuffer,
    bufferSlice = isNative(bufferSlice = ArrayBuffer && new ArrayBuffer(0).slice) && bufferSlice,
    floor = Math.floor,
    Uint8Array = isNative(Uint8Array = global.Uint8Array) && Uint8Array;

/** Used to clone array buffers. */
var Float64Array = (function() {
  // Safari 5 errors when using an array buffer to initialize a typed array
  // where the array buffer's `byteLength` is not a multiple of the typed
  // array's `BYTES_PER_ELEMENT`.
  try {
    var func = isNative(func = global.Float64Array) && func,
        result = new func(new ArrayBuffer(10), 0, 1) && func;
  } catch(e) {}
  return result;
}());

/** Used as the size, in bytes, of each `Float64Array` element. */
var FLOAT64_BYTES_PER_ELEMENT = Float64Array ? Float64Array.BYTES_PER_ELEMENT : 0;

/**
 * Creates a clone of the given array buffer.
 *
 * @private
 * @param {ArrayBuffer} buffer The array buffer to clone.
 * @returns {ArrayBuffer} Returns the cloned array buffer.
 */
function bufferClone(buffer) {
  return bufferSlice.call(buffer, 0);
}
if (!bufferSlice) {
  // PhantomJS has `ArrayBuffer` and `Uint8Array` but not `Float64Array`.
  bufferClone = !(ArrayBuffer && Uint8Array) ? constant(null) : function(buffer) {
    var byteLength = buffer.byteLength,
        floatLength = Float64Array ? floor(byteLength / FLOAT64_BYTES_PER_ELEMENT) : 0,
        offset = floatLength * FLOAT64_BYTES_PER_ELEMENT,
        result = new ArrayBuffer(byteLength);

    if (floatLength) {
      var view = new Float64Array(result, 0, floatLength);
      view.set(new Float64Array(buffer, 0, floatLength));
    }
    if (byteLength != offset) {
      view = new Uint8Array(result, offset);
      view.set(new Uint8Array(buffer, offset));
    }
    return result;
  };
}

module.exports = bufferClone;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../lang/isNative":42,"../utility/constant":49}],25:[function(require,module,exports){
/**
 * A specialized version of `baseIsEqualDeep` for arrays with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Array} array The array to compare.
 * @param {Array} other The other array to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing arrays.
 * @param {boolean} [isWhere] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
 */
function equalArrays(array, other, equalFunc, customizer, isWhere, stackA, stackB) {
  var index = -1,
      arrLength = array.length,
      othLength = other.length,
      result = true;

  if (arrLength != othLength && !(isWhere && othLength > arrLength)) {
    return false;
  }
  // Deep compare the contents, ignoring non-numeric properties.
  while (result && ++index < arrLength) {
    var arrValue = array[index],
        othValue = other[index];

    result = undefined;
    if (customizer) {
      result = isWhere
        ? customizer(othValue, arrValue, index)
        : customizer(arrValue, othValue, index);
    }
    if (typeof result == 'undefined') {
      // Recursively compare arrays (susceptible to call stack limits).
      if (isWhere) {
        var othIndex = othLength;
        while (othIndex--) {
          othValue = other[othIndex];
          result = (arrValue && arrValue === othValue) || equalFunc(arrValue, othValue, customizer, isWhere, stackA, stackB);
          if (result) {
            break;
          }
        }
      } else {
        result = (arrValue && arrValue === othValue) || equalFunc(arrValue, othValue, customizer, isWhere, stackA, stackB);
      }
    }
  }
  return !!result;
}

module.exports = equalArrays;

},{}],26:[function(require,module,exports){
var baseToString = require('./baseToString');

/** `Object#toString` result references. */
var boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    numberTag = '[object Number]',
    regexpTag = '[object RegExp]',
    stringTag = '[object String]';

/**
 * A specialized version of `baseIsEqualDeep` for comparing objects of
 * the same `toStringTag`.
 *
 * **Note:** This function only supports comparing values with tags of
 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
 *
 * @private
 * @param {Object} value The object to compare.
 * @param {Object} other The other object to compare.
 * @param {string} tag The `toStringTag` of the objects to compare.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalByTag(object, other, tag) {
  switch (tag) {
    case boolTag:
    case dateTag:
      // Coerce dates and booleans to numbers, dates to milliseconds and booleans
      // to `1` or `0` treating invalid dates coerced to `NaN` as not equal.
      return +object == +other;

    case errorTag:
      return object.name == other.name && object.message == other.message;

    case numberTag:
      // Treat `NaN` vs. `NaN` as equal.
      return (object != +object)
        ? other != +other
        // But, treat `-0` vs. `+0` as not equal.
        : (object == 0 ? ((1 / object) == (1 / other)) : object == +other);

    case regexpTag:
    case stringTag:
      // Coerce regexes to strings and treat strings primitives and string
      // objects as equal. See https://es5.github.io/#x15.10.6.4 for more details.
      return object == baseToString(other);
  }
  return false;
}

module.exports = equalByTag;

},{"./baseToString":22}],27:[function(require,module,exports){
var keys = require('../object/keys');

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * A specialized version of `baseIsEqualDeep` for objects with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing values.
 * @param {boolean} [isWhere] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalObjects(object, other, equalFunc, customizer, isWhere, stackA, stackB) {
  var objProps = keys(object),
      objLength = objProps.length,
      othProps = keys(other),
      othLength = othProps.length;

  if (objLength != othLength && !isWhere) {
    return false;
  }
  var hasCtor,
      index = -1;

  while (++index < objLength) {
    var key = objProps[index],
        result = hasOwnProperty.call(other, key);

    if (result) {
      var objValue = object[key],
          othValue = other[key];

      result = undefined;
      if (customizer) {
        result = isWhere
          ? customizer(othValue, objValue, key)
          : customizer(objValue, othValue, key);
      }
      if (typeof result == 'undefined') {
        // Recursively compare objects (susceptible to call stack limits).
        result = (objValue && objValue === othValue) || equalFunc(objValue, othValue, customizer, isWhere, stackA, stackB);
      }
    }
    if (!result) {
      return false;
    }
    hasCtor || (hasCtor = key == 'constructor');
  }
  if (!hasCtor) {
    var objCtor = object.constructor,
        othCtor = other.constructor;

    // Non `Object` object instances with different constructors are not equal.
    if (objCtor != othCtor && ('constructor' in object && 'constructor' in other) &&
        !(typeof objCtor == 'function' && objCtor instanceof objCtor && typeof othCtor == 'function' && othCtor instanceof othCtor)) {
      return false;
    }
  }
  return true;
}

module.exports = equalObjects;

},{"../object/keys":45}],28:[function(require,module,exports){
/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Initializes an array clone.
 *
 * @private
 * @param {Array} array The array to clone.
 * @returns {Array} Returns the initialized clone.
 */
function initCloneArray(array) {
  var length = array.length,
      result = new array.constructor(length);

  // Add array properties assigned by `RegExp#exec`.
  if (length && typeof array[0] == 'string' && hasOwnProperty.call(array, 'index')) {
    result.index = array.index;
    result.input = array.input;
  }
  return result;
}

module.exports = initCloneArray;

},{}],29:[function(require,module,exports){
var bufferClone = require('./bufferClone');

/** `Object#toString` result references. */
var boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    numberTag = '[object Number]',
    regexpTag = '[object RegExp]',
    stringTag = '[object String]';

var arrayBufferTag = '[object ArrayBuffer]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/** Used to match `RegExp` flags from their coerced string values. */
var reFlags = /\w*$/;

/**
 * Initializes an object clone based on its `toStringTag`.
 *
 * **Note:** This function only supports cloning values with tags of
 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
 *
 *
 * @private
 * @param {Object} object The object to clone.
 * @param {string} tag The `toStringTag` of the object to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Object} Returns the initialized clone.
 */
function initCloneByTag(object, tag, isDeep) {
  var Ctor = object.constructor;
  switch (tag) {
    case arrayBufferTag:
      return bufferClone(object);

    case boolTag:
    case dateTag:
      return new Ctor(+object);

    case float32Tag: case float64Tag:
    case int8Tag: case int16Tag: case int32Tag:
    case uint8Tag: case uint8ClampedTag: case uint16Tag: case uint32Tag:
      var buffer = object.buffer;
      return new Ctor(isDeep ? bufferClone(buffer) : buffer, object.byteOffset, object.length);

    case numberTag:
    case stringTag:
      return new Ctor(object);

    case regexpTag:
      var result = new Ctor(object.source, reFlags.exec(object));
      result.lastIndex = object.lastIndex;
  }
  return result;
}

module.exports = initCloneByTag;

},{"./bufferClone":24}],30:[function(require,module,exports){
/**
 * Initializes an object clone.
 *
 * @private
 * @param {Object} object The object to clone.
 * @returns {Object} Returns the initialized clone.
 */
function initCloneObject(object) {
  var Ctor = object.constructor;
  if (!(typeof Ctor == 'function' && Ctor instanceof Ctor)) {
    Ctor = Object;
  }
  return new Ctor;
}

module.exports = initCloneObject;

},{}],31:[function(require,module,exports){
var baseSetData = require('./baseSetData'),
    isNative = require('../lang/isNative'),
    support = require('../support');

/** Used to detect named functions. */
var reFuncName = /^\s*function[ \n\r\t]+\w/;

/** Used to detect functions containing a `this` reference. */
var reThis = /\bthis\b/;

/** Used to resolve the decompiled source of functions. */
var fnToString = Function.prototype.toString;

/**
 * Checks if `func` is eligible for `this` binding.
 *
 * @private
 * @param {Function} func The function to check.
 * @returns {boolean} Returns `true` if `func` is eligible, else `false`.
 */
function isBindable(func) {
  var result = !(support.funcNames ? func.name : support.funcDecomp);

  if (!result) {
    var source = fnToString.call(func);
    if (!support.funcNames) {
      result = !reFuncName.test(source);
    }
    if (!result) {
      // Check if `func` references the `this` keyword and store the result.
      result = reThis.test(source) || isNative(func);
      baseSetData(func, result);
    }
  }
  return result;
}

module.exports = isBindable;

},{"../lang/isNative":42,"../support":48,"./baseSetData":21}],32:[function(require,module,exports){
/**
 * Used as the maximum length of an array-like value.
 * See the [ES spec](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-tolength)
 * for more details.
 */
var MAX_SAFE_INTEGER = Math.pow(2, 53) - 1;

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  value = +value;
  length = length == null ? MAX_SAFE_INTEGER : length;
  return value > -1 && value % 1 == 0 && value < length;
}

module.exports = isIndex;

},{}],33:[function(require,module,exports){
var isIndex = require('./isIndex'),
    isLength = require('./isLength'),
    isObject = require('../lang/isObject');

/**
 * Checks if the provided arguments are from an iteratee call.
 *
 * @private
 * @param {*} value The potential iteratee value argument.
 * @param {*} index The potential iteratee index or key argument.
 * @param {*} object The potential iteratee object argument.
 * @returns {boolean} Returns `true` if the arguments are from an iteratee call, else `false`.
 */
function isIterateeCall(value, index, object) {
  if (!isObject(object)) {
    return false;
  }
  var type = typeof index;
  if (type == 'number') {
    var length = object.length,
        prereq = isLength(length) && isIndex(index, length);
  } else {
    prereq = type == 'string' && index in value;
  }
  return prereq && object[index] === value;
}

module.exports = isIterateeCall;

},{"../lang/isObject":43,"./isIndex":32,"./isLength":34}],34:[function(require,module,exports){
/**
 * Used as the maximum length of an array-like value.
 * See the [ES spec](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-tolength)
 * for more details.
 */
var MAX_SAFE_INTEGER = Math.pow(2, 53) - 1;

/**
 * Checks if `value` is a valid array-like length.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 */
function isLength(value) {
  return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

module.exports = isLength;

},{}],35:[function(require,module,exports){
/**
 * Checks if `value` is object-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 */
function isObjectLike(value) {
  return (value && typeof value == 'object') || false;
}

module.exports = isObjectLike;

},{}],36:[function(require,module,exports){
var isObject = require('../lang/isObject');

/**
 * Checks if `value` is suitable for strict equality comparisons, i.e. `===`.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` if suitable for strict
 *  equality comparisons, else `false`.
 */
function isStrictComparable(value) {
  return value === value && (value === 0 ? ((1 / value) > 0) : !isObject(value));
}

module.exports = isStrictComparable;

},{"../lang/isObject":43}],37:[function(require,module,exports){
(function (global){
var isNative = require('../lang/isNative');

/** Native method references. */
var WeakMap = isNative(WeakMap = global.WeakMap) && WeakMap;

/** Used to store function metadata. */
var metaMap = WeakMap && new WeakMap;

module.exports = metaMap;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../lang/isNative":42}],38:[function(require,module,exports){
var isArguments = require('../lang/isArguments'),
    isArray = require('../lang/isArray'),
    isIndex = require('./isIndex'),
    isLength = require('./isLength'),
    keysIn = require('../object/keysIn'),
    support = require('../support');

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * A fallback implementation of `Object.keys` which creates an array of the
 * own enumerable property names of `object`.
 *
 * @private
 * @param {Object} object The object to inspect.
 * @returns {Array} Returns the array of property names.
 */
function shimKeys(object) {
  var props = keysIn(object),
      propsLength = props.length,
      length = propsLength && object.length;

  var allowIndexes = length && isLength(length) &&
    (isArray(object) || (support.nonEnumArgs && isArguments(object)));

  var index = -1,
      result = [];

  while (++index < propsLength) {
    var key = props[index];
    if ((allowIndexes && isIndex(key, length)) || hasOwnProperty.call(object, key)) {
      result.push(key);
    }
  }
  return result;
}

module.exports = shimKeys;

},{"../lang/isArguments":40,"../lang/isArray":41,"../object/keysIn":46,"../support":48,"./isIndex":32,"./isLength":34}],39:[function(require,module,exports){
var isObject = require('../lang/isObject');

/**
 * Converts `value` to an object if it is not one.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {Object} Returns the object.
 */
function toObject(value) {
  return isObject(value) ? value : Object(value);
}

module.exports = toObject;

},{"../lang/isObject":43}],40:[function(require,module,exports){
var isLength = require('../internal/isLength'),
    isObjectLike = require('../internal/isObjectLike');

/** `Object#toString` result references. */
var argsTag = '[object Arguments]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the `toStringTag` of values.
 * See the [ES spec](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * for more details.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is classified as an `arguments` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * (function() { return _.isArguments(arguments); })();
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
function isArguments(value) {
  var length = isObjectLike(value) ? value.length : undefined;
  return (isLength(length) && objToString.call(value) == argsTag) || false;
}

module.exports = isArguments;

},{"../internal/isLength":34,"../internal/isObjectLike":35}],41:[function(require,module,exports){
var isLength = require('../internal/isLength'),
    isNative = require('./isNative'),
    isObjectLike = require('../internal/isObjectLike');

/** `Object#toString` result references. */
var arrayTag = '[object Array]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the `toStringTag` of values.
 * See the [ES spec](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * for more details.
 */
var objToString = objectProto.toString;

/* Native method references for those with the same name as other `lodash` methods. */
var nativeIsArray = isNative(nativeIsArray = Array.isArray) && nativeIsArray;

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * (function() { return _.isArray(arguments); })();
 * // => false
 */
var isArray = nativeIsArray || function(value) {
  return (isObjectLike(value) && isLength(value.length) && objToString.call(value) == arrayTag) || false;
};

module.exports = isArray;

},{"../internal/isLength":34,"../internal/isObjectLike":35,"./isNative":42}],42:[function(require,module,exports){
var escapeRegExp = require('../string/escapeRegExp'),
    isObjectLike = require('../internal/isObjectLike');

/** `Object#toString` result references. */
var funcTag = '[object Function]';

/** Used to detect host constructors (Safari > 5). */
var reHostCtor = /^\[object .+?Constructor\]$/;

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var fnToString = Function.prototype.toString;

/**
 * Used to resolve the `toStringTag` of values.
 * See the [ES spec](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * for more details.
 */
var objToString = objectProto.toString;

/** Used to detect if a method is native. */
var reNative = RegExp('^' +
  escapeRegExp(objToString)
  .replace(/toString|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/**
 * Checks if `value` is a native function.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function, else `false`.
 * @example
 *
 * _.isNative(Array.prototype.push);
 * // => true
 *
 * _.isNative(_);
 * // => false
 */
function isNative(value) {
  if (value == null) {
    return false;
  }
  if (objToString.call(value) == funcTag) {
    return reNative.test(fnToString.call(value));
  }
  return (isObjectLike(value) && reHostCtor.test(value)) || false;
}

module.exports = isNative;

},{"../internal/isObjectLike":35,"../string/escapeRegExp":47}],43:[function(require,module,exports){
/**
 * Checks if `value` is the language type of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * **Note:** See the [ES5 spec](https://es5.github.io/#x8) for more details.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return type == 'function' || (value && type == 'object') || false;
}

module.exports = isObject;

},{}],44:[function(require,module,exports){
var isLength = require('../internal/isLength'),
    isObjectLike = require('../internal/isObjectLike');

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    mapTag = '[object Map]',
    numberTag = '[object Number]',
    objectTag = '[object Object]',
    regexpTag = '[object RegExp]',
    setTag = '[object Set]',
    stringTag = '[object String]',
    weakMapTag = '[object WeakMap]';

var arrayBufferTag = '[object ArrayBuffer]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/** Used to identify `toStringTag` values of typed arrays. */
var typedArrayTags = {};
typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
typedArrayTags[uint32Tag] = true;
typedArrayTags[argsTag] = typedArrayTags[arrayTag] =
typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
typedArrayTags[dateTag] = typedArrayTags[errorTag] =
typedArrayTags[funcTag] = typedArrayTags[mapTag] =
typedArrayTags[numberTag] = typedArrayTags[objectTag] =
typedArrayTags[regexpTag] = typedArrayTags[setTag] =
typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the `toStringTag` of values.
 * See the [ES spec](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * for more details.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is classified as a typed array.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isTypedArray(new Uint8Array);
 * // => true
 *
 * _.isTypedArray([]);
 * // => false
 */
function isTypedArray(value) {
  return (isObjectLike(value) && isLength(value.length) && typedArrayTags[objToString.call(value)]) || false;
}

module.exports = isTypedArray;

},{"../internal/isLength":34,"../internal/isObjectLike":35}],45:[function(require,module,exports){
var isLength = require('../internal/isLength'),
    isNative = require('../lang/isNative'),
    isObject = require('../lang/isObject'),
    shimKeys = require('../internal/shimKeys');

/* Native method references for those with the same name as other `lodash` methods. */
var nativeKeys = isNative(nativeKeys = Object.keys) && nativeKeys;

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.keys)
 * for more details.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to inspect.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keys(new Foo);
 * // => ['a', 'b'] (iteration order is not guaranteed)
 *
 * _.keys('hi');
 * // => ['0', '1']
 */
var keys = !nativeKeys ? shimKeys : function(object) {
  if (object) {
    var Ctor = object.constructor,
        length = object.length;
  }
  if ((typeof Ctor == 'function' && Ctor.prototype === object) ||
     (typeof object != 'function' && (length && isLength(length)))) {
    return shimKeys(object);
  }
  return isObject(object) ? nativeKeys(object) : [];
};

module.exports = keys;

},{"../internal/isLength":34,"../internal/shimKeys":38,"../lang/isNative":42,"../lang/isObject":43}],46:[function(require,module,exports){
var isArguments = require('../lang/isArguments'),
    isArray = require('../lang/isArray'),
    isIndex = require('../internal/isIndex'),
    isLength = require('../internal/isLength'),
    isObject = require('../lang/isObject'),
    support = require('../support');

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Creates an array of the own and inherited enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to inspect.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keysIn(new Foo);
 * // => ['a', 'b', 'c'] (iteration order is not guaranteed)
 */
function keysIn(object) {
  if (object == null) {
    return [];
  }
  if (!isObject(object)) {
    object = Object(object);
  }
  var length = object.length;
  length = (length && isLength(length) &&
    (isArray(object) || (support.nonEnumArgs && isArguments(object))) && length) || 0;

  var Ctor = object.constructor,
      index = -1,
      isProto = typeof Ctor == 'function' && Ctor.prototype == object,
      result = Array(length),
      skipIndexes = length > 0;

  while (++index < length) {
    result[index] = (index + '');
  }
  for (var key in object) {
    if (!(skipIndexes && isIndex(key, length)) &&
        !(key == 'constructor' && (isProto || !hasOwnProperty.call(object, key)))) {
      result.push(key);
    }
  }
  return result;
}

module.exports = keysIn;

},{"../internal/isIndex":32,"../internal/isLength":34,"../lang/isArguments":40,"../lang/isArray":41,"../lang/isObject":43,"../support":48}],47:[function(require,module,exports){
var baseToString = require('../internal/baseToString');

/**
 * Used to match `RegExp` special characters.
 * See this [article on `RegExp` characters](http://www.regular-expressions.info/characters.html#special)
 * for more details.
 */
var reRegExpChars = /[.*+?^${}()|[\]\/\\]/g,
    reHasRegExpChars = RegExp(reRegExpChars.source);

/**
 * Escapes the `RegExp` special characters "\", "^", "$", ".", "|", "?", "*",
 * "+", "(", ")", "[", "]", "{" and "}" in `string`.
 *
 * @static
 * @memberOf _
 * @category String
 * @param {string} [string=''] The string to escape.
 * @returns {string} Returns the escaped string.
 * @example
 *
 * _.escapeRegExp('[lodash](https://lodash.com/)');
 * // => '\[lodash\]\(https://lodash\.com/\)'
 */
function escapeRegExp(string) {
  string = baseToString(string);
  return (string && reHasRegExpChars.test(string))
    ? string.replace(reRegExpChars, '\\$&')
    : string;
}

module.exports = escapeRegExp;

},{"../internal/baseToString":22}],48:[function(require,module,exports){
(function (global){
var isNative = require('./lang/isNative');

/** Used to detect functions containing a `this` reference. */
var reThis = /\bthis\b/;

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to detect DOM support. */
var document = (document = global.window) && document.document;

/** Native method references. */
var propertyIsEnumerable = objectProto.propertyIsEnumerable;

/**
 * An object environment feature flags.
 *
 * @static
 * @memberOf _
 * @type Object
 */
var support = {};

(function(x) {

  /**
   * Detect if functions can be decompiled by `Function#toString`
   * (all but Firefox OS certified apps, older Opera mobile browsers, and
   * the PlayStation 3; forced `false` for Windows 8 apps).
   *
   * @memberOf _.support
   * @type boolean
   */
  support.funcDecomp = !isNative(global.WinRTError) && reThis.test(function() { return this; });

  /**
   * Detect if `Function#name` is supported (all but IE).
   *
   * @memberOf _.support
   * @type boolean
   */
  support.funcNames = typeof Function.name == 'string';

  /**
   * Detect if the DOM is supported.
   *
   * @memberOf _.support
   * @type boolean
   */
  try {
    support.dom = document.createDocumentFragment().nodeType === 11;
  } catch(e) {
    support.dom = false;
  }

  /**
   * Detect if `arguments` object indexes are non-enumerable.
   *
   * In Firefox < 4, IE < 9, PhantomJS, and Safari < 5.1 `arguments` object
   * indexes are non-enumerable. Chrome < 25 and Node.js < 0.11.0 treat
   * `arguments` object indexes as non-enumerable and fail `hasOwnProperty`
   * checks for indexes that exceed their function's formal parameters with
   * associated values of `0`.
   *
   * @memberOf _.support
   * @type boolean
   */
  try {
    support.nonEnumArgs = !propertyIsEnumerable.call(arguments, 1);
  } catch(e) {
    support.nonEnumArgs = true;
  }
}(0, 0));

module.exports = support;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./lang/isNative":42}],49:[function(require,module,exports){
/**
 * Creates a function that returns `value`.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @param {*} value The value to return from the new function.
 * @returns {Function} Returns the new function.
 * @example
 *
 * var object = { 'user': 'fred' };
 * var getter = _.constant(object);
 * getter() === object;
 * // => true
 */
function constant(value) {
  return function() {
    return value;
  };
}

module.exports = constant;

},{}],50:[function(require,module,exports){
/**
 * This method returns the first argument provided to it.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @param {*} value Any value.
 * @returns {*} Returns `value`.
 * @example
 *
 * var object = { 'user': 'fred' };
 * _.identity(object) === object;
 * // => true
 */
function identity(value) {
  return value;
}

module.exports = identity;

},{}],51:[function(require,module,exports){
var isIterateeCall = require('../internal/isIterateeCall');

/** Native method references. */
var ceil = Math.ceil;

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Creates an array of numbers (positive and/or negative) progressing from
 * `start` up to, but not including, `end`. If `start` is less than `end` a
 * zero-length range is created unless a negative `step` is specified.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @param {number} [start=0] The start of the range.
 * @param {number} end The end of the range.
 * @param {number} [step=1] The value to increment or decrement by.
 * @returns {Array} Returns the new array of numbers.
 * @example
 *
 * _.range(4);
 * // => [0, 1, 2, 3]
 *
 * _.range(1, 5);
 * // => [1, 2, 3, 4]
 *
 * _.range(0, 20, 5);
 * // => [0, 5, 10, 15]
 *
 * _.range(0, -4, -1);
 * // => [0, -1, -2, -3]
 *
 * _.range(1, 4, 0);
 * // => [1, 1, 1]
 *
 * _.range(0);
 * // => []
 */
function range(start, end, step) {
  if (step && isIterateeCall(start, end, step)) {
    end = step = null;
  }
  start = +start || 0;
  step = step == null ? 1 : (+step || 0);

  if (end == null) {
    end = start;
    start = 0;
  } else {
    end = +end || 0;
  }
  // Use `Array(length)` so engines like Chakra and V8 avoid slower modes.
  // See https://youtu.be/XAqIpGU8ZZk#t=17m25s for more details.
  var index = -1,
      length = nativeMax(ceil((end - start) / (step || 1)), 0),
      result = Array(length);

  while (++index < length) {
    result[index] = start;
    start += step;
  }
  return result;
}

module.exports = range;

},{"../internal/isIterateeCall":33}],52:[function(require,module,exports){
(function (global){
/**
 * React (with addons) v0.12.2
 *
 * Copyright 2013-2014, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 */
!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var t;"undefined"!=typeof window?t=window:"undefined"!=typeof global?t=global:"undefined"!=typeof self&&(t=self),t.React=e()}}(function(){return function e(t,n,r){function o(a,s){if(!n[a]){if(!t[a]){var u="function"==typeof require&&require;if(!s&&u)return u(a,!0);if(i)return i(a,!0);var c=new Error("Cannot find module '"+a+"'");throw c.code="MODULE_NOT_FOUND",c}var l=n[a]={exports:{}};t[a][0].call(l.exports,function(e){var n=t[a][1][e];return o(n?n:e)},l,l.exports,e,t,n,r)}return n[a].exports}for(var i="function"==typeof require&&require,a=0;a<r.length;a++)o(r[a]);return o}({1:[function(e,t){"use strict";var n=e("./LinkedStateMixin"),r=e("./React"),o=e("./ReactComponentWithPureRenderMixin"),i=e("./ReactCSSTransitionGroup"),a=e("./ReactTransitionGroup"),s=e("./ReactUpdates"),u=e("./cx"),c=e("./cloneWithProps"),l=e("./update");r.addons={CSSTransitionGroup:i,LinkedStateMixin:n,PureRenderMixin:o,TransitionGroup:a,batchedUpdates:s.batchedUpdates,classSet:u,cloneWithProps:c,update:l},t.exports=r},{"./LinkedStateMixin":25,"./React":31,"./ReactCSSTransitionGroup":34,"./ReactComponentWithPureRenderMixin":39,"./ReactTransitionGroup":87,"./ReactUpdates":88,"./cloneWithProps":110,"./cx":115,"./update":154}],2:[function(e,t){"use strict";var n=e("./focusNode"),r={componentDidMount:function(){this.props.autoFocus&&n(this.getDOMNode())}};t.exports=r},{"./focusNode":122}],3:[function(e,t){"use strict";function n(){var e=window.opera;return"object"==typeof e&&"function"==typeof e.version&&parseInt(e.version(),10)<=12}function r(e){return(e.ctrlKey||e.altKey||e.metaKey)&&!(e.ctrlKey&&e.altKey)}var o=e("./EventConstants"),i=e("./EventPropagators"),a=e("./ExecutionEnvironment"),s=e("./SyntheticInputEvent"),u=e("./keyOf"),c=a.canUseDOM&&"TextEvent"in window&&!("documentMode"in document||n()),l=32,p=String.fromCharCode(l),d=o.topLevelTypes,f={beforeInput:{phasedRegistrationNames:{bubbled:u({onBeforeInput:null}),captured:u({onBeforeInputCapture:null})},dependencies:[d.topCompositionEnd,d.topKeyPress,d.topTextInput,d.topPaste]}},h=null,m=!1,v={eventTypes:f,extractEvents:function(e,t,n,o){var a;if(c)switch(e){case d.topKeyPress:var u=o.which;if(u!==l)return;m=!0,a=p;break;case d.topTextInput:if(a=o.data,a===p&&m)return;break;default:return}else{switch(e){case d.topPaste:h=null;break;case d.topKeyPress:o.which&&!r(o)&&(h=String.fromCharCode(o.which));break;case d.topCompositionEnd:h=o.data}if(null===h)return;a=h}if(a){var v=s.getPooled(f.beforeInput,n,o);return v.data=a,h=null,i.accumulateTwoPhaseDispatches(v),v}}};t.exports=v},{"./EventConstants":17,"./EventPropagators":22,"./ExecutionEnvironment":23,"./SyntheticInputEvent":98,"./keyOf":144}],4:[function(e,t){var n=e("./invariant"),r={addClass:function(e,t){return n(!/\s/.test(t)),t&&(e.classList?e.classList.add(t):r.hasClass(e,t)||(e.className=e.className+" "+t)),e},removeClass:function(e,t){return n(!/\s/.test(t)),t&&(e.classList?e.classList.remove(t):r.hasClass(e,t)&&(e.className=e.className.replace(new RegExp("(^|\\s)"+t+"(?:\\s|$)","g"),"$1").replace(/\s+/g," ").replace(/^\s*|\s*$/g,""))),e},conditionClass:function(e,t,n){return(n?r.addClass:r.removeClass)(e,t)},hasClass:function(e,t){return n(!/\s/.test(t)),e.classList?!!t&&e.classList.contains(t):(" "+e.className+" ").indexOf(" "+t+" ")>-1}};t.exports=r},{"./invariant":137}],5:[function(e,t){"use strict";function n(e,t){return e+t.charAt(0).toUpperCase()+t.substring(1)}var r={columnCount:!0,flex:!0,flexGrow:!0,flexShrink:!0,fontWeight:!0,lineClamp:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,strokeOpacity:!0},o=["Webkit","ms","Moz","O"];Object.keys(r).forEach(function(e){o.forEach(function(t){r[n(t,e)]=r[e]})});var i={background:{backgroundImage:!0,backgroundPosition:!0,backgroundRepeat:!0,backgroundColor:!0},border:{borderWidth:!0,borderStyle:!0,borderColor:!0},borderBottom:{borderBottomWidth:!0,borderBottomStyle:!0,borderBottomColor:!0},borderLeft:{borderLeftWidth:!0,borderLeftStyle:!0,borderLeftColor:!0},borderRight:{borderRightWidth:!0,borderRightStyle:!0,borderRightColor:!0},borderTop:{borderTopWidth:!0,borderTopStyle:!0,borderTopColor:!0},font:{fontStyle:!0,fontVariant:!0,fontWeight:!0,fontSize:!0,lineHeight:!0,fontFamily:!0}},a={isUnitlessNumber:r,shorthandPropertyExpansions:i};t.exports=a},{}],6:[function(e,t){"use strict";var n=e("./CSSProperty"),r=e("./ExecutionEnvironment"),o=(e("./camelizeStyleName"),e("./dangerousStyleValue")),i=e("./hyphenateStyleName"),a=e("./memoizeStringOnly"),s=(e("./warning"),a(function(e){return i(e)})),u="cssFloat";r.canUseDOM&&void 0===document.documentElement.style.cssFloat&&(u="styleFloat");var c={createMarkupForStyles:function(e){var t="";for(var n in e)if(e.hasOwnProperty(n)){var r=e[n];null!=r&&(t+=s(n)+":",t+=o(n,r)+";")}return t||null},setValueForStyles:function(e,t){var r=e.style;for(var i in t)if(t.hasOwnProperty(i)){var a=o(i,t[i]);if("float"===i&&(i=u),a)r[i]=a;else{var s=n.shorthandPropertyExpansions[i];if(s)for(var c in s)r[c]="";else r[i]=""}}}};t.exports=c},{"./CSSProperty":5,"./ExecutionEnvironment":23,"./camelizeStyleName":109,"./dangerousStyleValue":116,"./hyphenateStyleName":135,"./memoizeStringOnly":146,"./warning":155}],7:[function(e,t){"use strict";function n(){this._callbacks=null,this._contexts=null}var r=e("./PooledClass"),o=e("./Object.assign"),i=e("./invariant");o(n.prototype,{enqueue:function(e,t){this._callbacks=this._callbacks||[],this._contexts=this._contexts||[],this._callbacks.push(e),this._contexts.push(t)},notifyAll:function(){var e=this._callbacks,t=this._contexts;if(e){i(e.length===t.length),this._callbacks=null,this._contexts=null;for(var n=0,r=e.length;r>n;n++)e[n].call(t[n]);e.length=0,t.length=0}},reset:function(){this._callbacks=null,this._contexts=null},destructor:function(){this.reset()}}),r.addPoolingTo(n),t.exports=n},{"./Object.assign":29,"./PooledClass":30,"./invariant":137}],8:[function(e,t){"use strict";function n(e){return"SELECT"===e.nodeName||"INPUT"===e.nodeName&&"file"===e.type}function r(e){var t=M.getPooled(P.change,w,e);E.accumulateTwoPhaseDispatches(t),R.batchedUpdates(o,t)}function o(e){g.enqueueEvents(e),g.processEventQueue()}function i(e,t){T=e,w=t,T.attachEvent("onchange",r)}function a(){T&&(T.detachEvent("onchange",r),T=null,w=null)}function s(e,t,n){return e===x.topChange?n:void 0}function u(e,t,n){e===x.topFocus?(a(),i(t,n)):e===x.topBlur&&a()}function c(e,t){T=e,w=t,_=e.value,S=Object.getOwnPropertyDescriptor(e.constructor.prototype,"value"),Object.defineProperty(T,"value",k),T.attachEvent("onpropertychange",p)}function l(){T&&(delete T.value,T.detachEvent("onpropertychange",p),T=null,w=null,_=null,S=null)}function p(e){if("value"===e.propertyName){var t=e.srcElement.value;t!==_&&(_=t,r(e))}}function d(e,t,n){return e===x.topInput?n:void 0}function f(e,t,n){e===x.topFocus?(l(),c(t,n)):e===x.topBlur&&l()}function h(e){return e!==x.topSelectionChange&&e!==x.topKeyUp&&e!==x.topKeyDown||!T||T.value===_?void 0:(_=T.value,w)}function m(e){return"INPUT"===e.nodeName&&("checkbox"===e.type||"radio"===e.type)}function v(e,t,n){return e===x.topClick?n:void 0}var y=e("./EventConstants"),g=e("./EventPluginHub"),E=e("./EventPropagators"),C=e("./ExecutionEnvironment"),R=e("./ReactUpdates"),M=e("./SyntheticEvent"),b=e("./isEventSupported"),O=e("./isTextInputElement"),D=e("./keyOf"),x=y.topLevelTypes,P={change:{phasedRegistrationNames:{bubbled:D({onChange:null}),captured:D({onChangeCapture:null})},dependencies:[x.topBlur,x.topChange,x.topClick,x.topFocus,x.topInput,x.topKeyDown,x.topKeyUp,x.topSelectionChange]}},T=null,w=null,_=null,S=null,N=!1;C.canUseDOM&&(N=b("change")&&(!("documentMode"in document)||document.documentMode>8));var I=!1;C.canUseDOM&&(I=b("input")&&(!("documentMode"in document)||document.documentMode>9));var k={get:function(){return S.get.call(this)},set:function(e){_=""+e,S.set.call(this,e)}},A={eventTypes:P,extractEvents:function(e,t,r,o){var i,a;if(n(t)?N?i=s:a=u:O(t)?I?i=d:(i=h,a=f):m(t)&&(i=v),i){var c=i(e,t,r);if(c){var l=M.getPooled(P.change,c,o);return E.accumulateTwoPhaseDispatches(l),l}}a&&a(e,t,r)}};t.exports=A},{"./EventConstants":17,"./EventPluginHub":19,"./EventPropagators":22,"./ExecutionEnvironment":23,"./ReactUpdates":88,"./SyntheticEvent":96,"./isEventSupported":138,"./isTextInputElement":140,"./keyOf":144}],9:[function(e,t){"use strict";var n=0,r={createReactRootIndex:function(){return n++}};t.exports=r},{}],10:[function(e,t){"use strict";function n(e){switch(e){case y.topCompositionStart:return E.compositionStart;case y.topCompositionEnd:return E.compositionEnd;case y.topCompositionUpdate:return E.compositionUpdate}}function r(e,t){return e===y.topKeyDown&&t.keyCode===h}function o(e,t){switch(e){case y.topKeyUp:return-1!==f.indexOf(t.keyCode);case y.topKeyDown:return t.keyCode!==h;case y.topKeyPress:case y.topMouseDown:case y.topBlur:return!0;default:return!1}}function i(e){this.root=e,this.startSelection=c.getSelection(e),this.startValue=this.getText()}var a=e("./EventConstants"),s=e("./EventPropagators"),u=e("./ExecutionEnvironment"),c=e("./ReactInputSelection"),l=e("./SyntheticCompositionEvent"),p=e("./getTextContentAccessor"),d=e("./keyOf"),f=[9,13,27,32],h=229,m=u.canUseDOM&&"CompositionEvent"in window,v=!m||"documentMode"in document&&document.documentMode>8&&document.documentMode<=11,y=a.topLevelTypes,g=null,E={compositionEnd:{phasedRegistrationNames:{bubbled:d({onCompositionEnd:null}),captured:d({onCompositionEndCapture:null})},dependencies:[y.topBlur,y.topCompositionEnd,y.topKeyDown,y.topKeyPress,y.topKeyUp,y.topMouseDown]},compositionStart:{phasedRegistrationNames:{bubbled:d({onCompositionStart:null}),captured:d({onCompositionStartCapture:null})},dependencies:[y.topBlur,y.topCompositionStart,y.topKeyDown,y.topKeyPress,y.topKeyUp,y.topMouseDown]},compositionUpdate:{phasedRegistrationNames:{bubbled:d({onCompositionUpdate:null}),captured:d({onCompositionUpdateCapture:null})},dependencies:[y.topBlur,y.topCompositionUpdate,y.topKeyDown,y.topKeyPress,y.topKeyUp,y.topMouseDown]}};i.prototype.getText=function(){return this.root.value||this.root[p()]},i.prototype.getData=function(){var e=this.getText(),t=this.startSelection.start,n=this.startValue.length-this.startSelection.end;return e.substr(t,e.length-n-t)};var C={eventTypes:E,extractEvents:function(e,t,a,u){var c,p;if(m?c=n(e):g?o(e,u)&&(c=E.compositionEnd):r(e,u)&&(c=E.compositionStart),v&&(g||c!==E.compositionStart?c===E.compositionEnd&&g&&(p=g.getData(),g=null):g=new i(t)),c){var d=l.getPooled(c,a,u);return p&&(d.data=p),s.accumulateTwoPhaseDispatches(d),d}}};t.exports=C},{"./EventConstants":17,"./EventPropagators":22,"./ExecutionEnvironment":23,"./ReactInputSelection":63,"./SyntheticCompositionEvent":94,"./getTextContentAccessor":132,"./keyOf":144}],11:[function(e,t){"use strict";function n(e,t,n){e.insertBefore(t,e.childNodes[n]||null)}var r,o=e("./Danger"),i=e("./ReactMultiChildUpdateTypes"),a=e("./getTextContentAccessor"),s=e("./invariant"),u=a();r="textContent"===u?function(e,t){e.textContent=t}:function(e,t){for(;e.firstChild;)e.removeChild(e.firstChild);if(t){var n=e.ownerDocument||document;e.appendChild(n.createTextNode(t))}};var c={dangerouslyReplaceNodeWithMarkup:o.dangerouslyReplaceNodeWithMarkup,updateTextContent:r,processUpdates:function(e,t){for(var a,u=null,c=null,l=0;a=e[l];l++)if(a.type===i.MOVE_EXISTING||a.type===i.REMOVE_NODE){var p=a.fromIndex,d=a.parentNode.childNodes[p],f=a.parentID;s(d),u=u||{},u[f]=u[f]||[],u[f][p]=d,c=c||[],c.push(d)}var h=o.dangerouslyRenderMarkup(t);if(c)for(var m=0;m<c.length;m++)c[m].parentNode.removeChild(c[m]);for(var v=0;a=e[v];v++)switch(a.type){case i.INSERT_MARKUP:n(a.parentNode,h[a.markupIndex],a.toIndex);break;case i.MOVE_EXISTING:n(a.parentNode,u[a.parentID][a.fromIndex],a.toIndex);break;case i.TEXT_CONTENT:r(a.parentNode,a.textContent);break;case i.REMOVE_NODE:}}};t.exports=c},{"./Danger":14,"./ReactMultiChildUpdateTypes":70,"./getTextContentAccessor":132,"./invariant":137}],12:[function(e,t){"use strict";function n(e,t){return(e&t)===t}var r=e("./invariant"),o={MUST_USE_ATTRIBUTE:1,MUST_USE_PROPERTY:2,HAS_SIDE_EFFECTS:4,HAS_BOOLEAN_VALUE:8,HAS_NUMERIC_VALUE:16,HAS_POSITIVE_NUMERIC_VALUE:48,HAS_OVERLOADED_BOOLEAN_VALUE:64,injectDOMPropertyConfig:function(e){var t=e.Properties||{},i=e.DOMAttributeNames||{},s=e.DOMPropertyNames||{},u=e.DOMMutationMethods||{};e.isCustomAttribute&&a._isCustomAttributeFunctions.push(e.isCustomAttribute);for(var c in t){r(!a.isStandardName.hasOwnProperty(c)),a.isStandardName[c]=!0;var l=c.toLowerCase();if(a.getPossibleStandardName[l]=c,i.hasOwnProperty(c)){var p=i[c];a.getPossibleStandardName[p]=c,a.getAttributeName[c]=p}else a.getAttributeName[c]=l;a.getPropertyName[c]=s.hasOwnProperty(c)?s[c]:c,a.getMutationMethod[c]=u.hasOwnProperty(c)?u[c]:null;var d=t[c];a.mustUseAttribute[c]=n(d,o.MUST_USE_ATTRIBUTE),a.mustUseProperty[c]=n(d,o.MUST_USE_PROPERTY),a.hasSideEffects[c]=n(d,o.HAS_SIDE_EFFECTS),a.hasBooleanValue[c]=n(d,o.HAS_BOOLEAN_VALUE),a.hasNumericValue[c]=n(d,o.HAS_NUMERIC_VALUE),a.hasPositiveNumericValue[c]=n(d,o.HAS_POSITIVE_NUMERIC_VALUE),a.hasOverloadedBooleanValue[c]=n(d,o.HAS_OVERLOADED_BOOLEAN_VALUE),r(!a.mustUseAttribute[c]||!a.mustUseProperty[c]),r(a.mustUseProperty[c]||!a.hasSideEffects[c]),r(!!a.hasBooleanValue[c]+!!a.hasNumericValue[c]+!!a.hasOverloadedBooleanValue[c]<=1)}}},i={},a={ID_ATTRIBUTE_NAME:"data-reactid",isStandardName:{},getPossibleStandardName:{},getAttributeName:{},getPropertyName:{},getMutationMethod:{},mustUseAttribute:{},mustUseProperty:{},hasSideEffects:{},hasBooleanValue:{},hasNumericValue:{},hasPositiveNumericValue:{},hasOverloadedBooleanValue:{},_isCustomAttributeFunctions:[],isCustomAttribute:function(e){for(var t=0;t<a._isCustomAttributeFunctions.length;t++){var n=a._isCustomAttributeFunctions[t];if(n(e))return!0}return!1},getDefaultValueForProperty:function(e,t){var n,r=i[e];return r||(i[e]=r={}),t in r||(n=document.createElement(e),r[t]=n[t]),r[t]},injection:o};t.exports=a},{"./invariant":137}],13:[function(e,t){"use strict";function n(e,t){return null==t||r.hasBooleanValue[e]&&!t||r.hasNumericValue[e]&&isNaN(t)||r.hasPositiveNumericValue[e]&&1>t||r.hasOverloadedBooleanValue[e]&&t===!1}var r=e("./DOMProperty"),o=e("./escapeTextForBrowser"),i=e("./memoizeStringOnly"),a=(e("./warning"),i(function(e){return o(e)+'="'})),s={createMarkupForID:function(e){return a(r.ID_ATTRIBUTE_NAME)+o(e)+'"'},createMarkupForProperty:function(e,t){if(r.isStandardName.hasOwnProperty(e)&&r.isStandardName[e]){if(n(e,t))return"";var i=r.getAttributeName[e];return r.hasBooleanValue[e]||r.hasOverloadedBooleanValue[e]&&t===!0?o(i):a(i)+o(t)+'"'}return r.isCustomAttribute(e)?null==t?"":a(e)+o(t)+'"':null},setValueForProperty:function(e,t,o){if(r.isStandardName.hasOwnProperty(t)&&r.isStandardName[t]){var i=r.getMutationMethod[t];if(i)i(e,o);else if(n(t,o))this.deleteValueForProperty(e,t);else if(r.mustUseAttribute[t])e.setAttribute(r.getAttributeName[t],""+o);else{var a=r.getPropertyName[t];r.hasSideEffects[t]&&""+e[a]==""+o||(e[a]=o)}}else r.isCustomAttribute(t)&&(null==o?e.removeAttribute(t):e.setAttribute(t,""+o))},deleteValueForProperty:function(e,t){if(r.isStandardName.hasOwnProperty(t)&&r.isStandardName[t]){var n=r.getMutationMethod[t];if(n)n(e,void 0);else if(r.mustUseAttribute[t])e.removeAttribute(r.getAttributeName[t]);else{var o=r.getPropertyName[t],i=r.getDefaultValueForProperty(e.nodeName,o);r.hasSideEffects[t]&&""+e[o]===i||(e[o]=i)}}else r.isCustomAttribute(t)&&e.removeAttribute(t)}};t.exports=s},{"./DOMProperty":12,"./escapeTextForBrowser":120,"./memoizeStringOnly":146,"./warning":155}],14:[function(e,t){"use strict";function n(e){return e.substring(1,e.indexOf(" "))}var r=e("./ExecutionEnvironment"),o=e("./createNodesFromMarkup"),i=e("./emptyFunction"),a=e("./getMarkupWrap"),s=e("./invariant"),u=/^(<[^ \/>]+)/,c="data-danger-index",l={dangerouslyRenderMarkup:function(e){s(r.canUseDOM);for(var t,l={},p=0;p<e.length;p++)s(e[p]),t=n(e[p]),t=a(t)?t:"*",l[t]=l[t]||[],l[t][p]=e[p];var d=[],f=0;for(t in l)if(l.hasOwnProperty(t)){var h=l[t];for(var m in h)if(h.hasOwnProperty(m)){var v=h[m];h[m]=v.replace(u,"$1 "+c+'="'+m+'" ')}var y=o(h.join(""),i);for(p=0;p<y.length;++p){var g=y[p];g.hasAttribute&&g.hasAttribute(c)&&(m=+g.getAttribute(c),g.removeAttribute(c),s(!d.hasOwnProperty(m)),d[m]=g,f+=1)}}return s(f===d.length),s(d.length===e.length),d},dangerouslyReplaceNodeWithMarkup:function(e,t){s(r.canUseDOM),s(t),s("html"!==e.tagName.toLowerCase());var n=o(t,i)[0];e.parentNode.replaceChild(n,e)}};t.exports=l},{"./ExecutionEnvironment":23,"./createNodesFromMarkup":114,"./emptyFunction":118,"./getMarkupWrap":129,"./invariant":137}],15:[function(e,t){"use strict";var n=e("./keyOf"),r=[n({ResponderEventPlugin:null}),n({SimpleEventPlugin:null}),n({TapEventPlugin:null}),n({EnterLeaveEventPlugin:null}),n({ChangeEventPlugin:null}),n({SelectEventPlugin:null}),n({CompositionEventPlugin:null}),n({BeforeInputEventPlugin:null}),n({AnalyticsEventPlugin:null}),n({MobileSafariClickEventPlugin:null})];t.exports=r},{"./keyOf":144}],16:[function(e,t){"use strict";var n=e("./EventConstants"),r=e("./EventPropagators"),o=e("./SyntheticMouseEvent"),i=e("./ReactMount"),a=e("./keyOf"),s=n.topLevelTypes,u=i.getFirstReactDOM,c={mouseEnter:{registrationName:a({onMouseEnter:null}),dependencies:[s.topMouseOut,s.topMouseOver]},mouseLeave:{registrationName:a({onMouseLeave:null}),dependencies:[s.topMouseOut,s.topMouseOver]}},l=[null,null],p={eventTypes:c,extractEvents:function(e,t,n,a){if(e===s.topMouseOver&&(a.relatedTarget||a.fromElement))return null;if(e!==s.topMouseOut&&e!==s.topMouseOver)return null;var p;if(t.window===t)p=t;else{var d=t.ownerDocument;p=d?d.defaultView||d.parentWindow:window}var f,h;if(e===s.topMouseOut?(f=t,h=u(a.relatedTarget||a.toElement)||p):(f=p,h=t),f===h)return null;var m=f?i.getID(f):"",v=h?i.getID(h):"",y=o.getPooled(c.mouseLeave,m,a);y.type="mouseleave",y.target=f,y.relatedTarget=h;var g=o.getPooled(c.mouseEnter,v,a);return g.type="mouseenter",g.target=h,g.relatedTarget=f,r.accumulateEnterLeaveDispatches(y,g,m,v),l[0]=y,l[1]=g,l}};t.exports=p},{"./EventConstants":17,"./EventPropagators":22,"./ReactMount":68,"./SyntheticMouseEvent":100,"./keyOf":144}],17:[function(e,t){"use strict";var n=e("./keyMirror"),r=n({bubbled:null,captured:null}),o=n({topBlur:null,topChange:null,topClick:null,topCompositionEnd:null,topCompositionStart:null,topCompositionUpdate:null,topContextMenu:null,topCopy:null,topCut:null,topDoubleClick:null,topDrag:null,topDragEnd:null,topDragEnter:null,topDragExit:null,topDragLeave:null,topDragOver:null,topDragStart:null,topDrop:null,topError:null,topFocus:null,topInput:null,topKeyDown:null,topKeyPress:null,topKeyUp:null,topLoad:null,topMouseDown:null,topMouseMove:null,topMouseOut:null,topMouseOver:null,topMouseUp:null,topPaste:null,topReset:null,topScroll:null,topSelectionChange:null,topSubmit:null,topTextInput:null,topTouchCancel:null,topTouchEnd:null,topTouchMove:null,topTouchStart:null,topWheel:null}),i={topLevelTypes:o,PropagationPhases:r};t.exports=i},{"./keyMirror":143}],18:[function(e,t){var n=e("./emptyFunction"),r={listen:function(e,t,n){return e.addEventListener?(e.addEventListener(t,n,!1),{remove:function(){e.removeEventListener(t,n,!1)}}):e.attachEvent?(e.attachEvent("on"+t,n),{remove:function(){e.detachEvent("on"+t,n)}}):void 0},capture:function(e,t,r){return e.addEventListener?(e.addEventListener(t,r,!0),{remove:function(){e.removeEventListener(t,r,!0)}}):{remove:n}},registerDefault:function(){}};t.exports=r},{"./emptyFunction":118}],19:[function(e,t){"use strict";var n=e("./EventPluginRegistry"),r=e("./EventPluginUtils"),o=e("./accumulateInto"),i=e("./forEachAccumulated"),a=e("./invariant"),s={},u=null,c=function(e){if(e){var t=r.executeDispatch,o=n.getPluginModuleForEvent(e);o&&o.executeDispatch&&(t=o.executeDispatch),r.executeDispatchesInOrder(e,t),e.isPersistent()||e.constructor.release(e)}},l=null,p={injection:{injectMount:r.injection.injectMount,injectInstanceHandle:function(e){l=e},getInstanceHandle:function(){return l},injectEventPluginOrder:n.injectEventPluginOrder,injectEventPluginsByName:n.injectEventPluginsByName},eventNameDispatchConfigs:n.eventNameDispatchConfigs,registrationNameModules:n.registrationNameModules,putListener:function(e,t,n){a(!n||"function"==typeof n);var r=s[t]||(s[t]={});r[e]=n},getListener:function(e,t){var n=s[t];return n&&n[e]},deleteListener:function(e,t){var n=s[t];n&&delete n[e]},deleteAllListeners:function(e){for(var t in s)delete s[t][e]},extractEvents:function(e,t,r,i){for(var a,s=n.plugins,u=0,c=s.length;c>u;u++){var l=s[u];if(l){var p=l.extractEvents(e,t,r,i);p&&(a=o(a,p))}}return a},enqueueEvents:function(e){e&&(u=o(u,e))},processEventQueue:function(){var e=u;u=null,i(e,c),a(!u)},__purge:function(){s={}},__getListenerBank:function(){return s}};t.exports=p},{"./EventPluginRegistry":20,"./EventPluginUtils":21,"./accumulateInto":106,"./forEachAccumulated":123,"./invariant":137}],20:[function(e,t){"use strict";function n(){if(a)for(var e in s){var t=s[e],n=a.indexOf(e);if(i(n>-1),!u.plugins[n]){i(t.extractEvents),u.plugins[n]=t;var o=t.eventTypes;for(var c in o)i(r(o[c],t,c))}}}function r(e,t,n){i(!u.eventNameDispatchConfigs.hasOwnProperty(n)),u.eventNameDispatchConfigs[n]=e;var r=e.phasedRegistrationNames;if(r){for(var a in r)if(r.hasOwnProperty(a)){var s=r[a];o(s,t,n)}return!0}return e.registrationName?(o(e.registrationName,t,n),!0):!1}function o(e,t,n){i(!u.registrationNameModules[e]),u.registrationNameModules[e]=t,u.registrationNameDependencies[e]=t.eventTypes[n].dependencies}var i=e("./invariant"),a=null,s={},u={plugins:[],eventNameDispatchConfigs:{},registrationNameModules:{},registrationNameDependencies:{},injectEventPluginOrder:function(e){i(!a),a=Array.prototype.slice.call(e),n()},injectEventPluginsByName:function(e){var t=!1;for(var r in e)if(e.hasOwnProperty(r)){var o=e[r];s.hasOwnProperty(r)&&s[r]===o||(i(!s[r]),s[r]=o,t=!0)}t&&n()},getPluginModuleForEvent:function(e){var t=e.dispatchConfig;if(t.registrationName)return u.registrationNameModules[t.registrationName]||null;for(var n in t.phasedRegistrationNames)if(t.phasedRegistrationNames.hasOwnProperty(n)){var r=u.registrationNameModules[t.phasedRegistrationNames[n]];if(r)return r}return null},_resetEventPlugins:function(){a=null;for(var e in s)s.hasOwnProperty(e)&&delete s[e];u.plugins.length=0;var t=u.eventNameDispatchConfigs;for(var n in t)t.hasOwnProperty(n)&&delete t[n];var r=u.registrationNameModules;for(var o in r)r.hasOwnProperty(o)&&delete r[o]}};t.exports=u},{"./invariant":137}],21:[function(e,t){"use strict";function n(e){return e===m.topMouseUp||e===m.topTouchEnd||e===m.topTouchCancel}function r(e){return e===m.topMouseMove||e===m.topTouchMove}function o(e){return e===m.topMouseDown||e===m.topTouchStart}function i(e,t){var n=e._dispatchListeners,r=e._dispatchIDs;if(Array.isArray(n))for(var o=0;o<n.length&&!e.isPropagationStopped();o++)t(e,n[o],r[o]);else n&&t(e,n,r)}function a(e,t,n){e.currentTarget=h.Mount.getNode(n);var r=t(e,n);return e.currentTarget=null,r}function s(e,t){i(e,t),e._dispatchListeners=null,e._dispatchIDs=null}function u(e){var t=e._dispatchListeners,n=e._dispatchIDs;if(Array.isArray(t)){for(var r=0;r<t.length&&!e.isPropagationStopped();r++)if(t[r](e,n[r]))return n[r]}else if(t&&t(e,n))return n;return null}function c(e){var t=u(e);return e._dispatchIDs=null,e._dispatchListeners=null,t}function l(e){var t=e._dispatchListeners,n=e._dispatchIDs;f(!Array.isArray(t));var r=t?t(e,n):null;return e._dispatchListeners=null,e._dispatchIDs=null,r}function p(e){return!!e._dispatchListeners}var d=e("./EventConstants"),f=e("./invariant"),h={Mount:null,injectMount:function(e){h.Mount=e}},m=d.topLevelTypes,v={isEndish:n,isMoveish:r,isStartish:o,executeDirectDispatch:l,executeDispatch:a,executeDispatchesInOrder:s,executeDispatchesInOrderStopAtTrue:c,hasDispatches:p,injection:h,useTouchEvents:!1};t.exports=v},{"./EventConstants":17,"./invariant":137}],22:[function(e,t){"use strict";function n(e,t,n){var r=t.dispatchConfig.phasedRegistrationNames[n];return m(e,r)}function r(e,t,r){var o=t?h.bubbled:h.captured,i=n(e,r,o);i&&(r._dispatchListeners=d(r._dispatchListeners,i),r._dispatchIDs=d(r._dispatchIDs,e))}function o(e){e&&e.dispatchConfig.phasedRegistrationNames&&p.injection.getInstanceHandle().traverseTwoPhase(e.dispatchMarker,r,e)}function i(e,t,n){if(n&&n.dispatchConfig.registrationName){var r=n.dispatchConfig.registrationName,o=m(e,r);o&&(n._dispatchListeners=d(n._dispatchListeners,o),n._dispatchIDs=d(n._dispatchIDs,e))}}function a(e){e&&e.dispatchConfig.registrationName&&i(e.dispatchMarker,null,e)}function s(e){f(e,o)}function u(e,t,n,r){p.injection.getInstanceHandle().traverseEnterLeave(n,r,i,e,t)}function c(e){f(e,a)}var l=e("./EventConstants"),p=e("./EventPluginHub"),d=e("./accumulateInto"),f=e("./forEachAccumulated"),h=l.PropagationPhases,m=p.getListener,v={accumulateTwoPhaseDispatches:s,accumulateDirectDispatches:c,accumulateEnterLeaveDispatches:u};t.exports=v},{"./EventConstants":17,"./EventPluginHub":19,"./accumulateInto":106,"./forEachAccumulated":123}],23:[function(e,t){"use strict";var n=!("undefined"==typeof window||!window.document||!window.document.createElement),r={canUseDOM:n,canUseWorkers:"undefined"!=typeof Worker,canUseEventListeners:n&&!(!window.addEventListener&&!window.attachEvent),canUseViewport:n&&!!window.screen,isInWorker:!n};t.exports=r},{}],24:[function(e,t){"use strict";var n,r=e("./DOMProperty"),o=e("./ExecutionEnvironment"),i=r.injection.MUST_USE_ATTRIBUTE,a=r.injection.MUST_USE_PROPERTY,s=r.injection.HAS_BOOLEAN_VALUE,u=r.injection.HAS_SIDE_EFFECTS,c=r.injection.HAS_NUMERIC_VALUE,l=r.injection.HAS_POSITIVE_NUMERIC_VALUE,p=r.injection.HAS_OVERLOADED_BOOLEAN_VALUE;if(o.canUseDOM){var d=document.implementation;n=d&&d.hasFeature&&d.hasFeature("http://www.w3.org/TR/SVG11/feature#BasicStructure","1.1")}var f={isCustomAttribute:RegExp.prototype.test.bind(/^(data|aria)-[a-z_][a-z\d_.\-]*$/),Properties:{accept:null,acceptCharset:null,accessKey:null,action:null,allowFullScreen:i|s,allowTransparency:i,alt:null,async:s,autoComplete:null,autoPlay:s,cellPadding:null,cellSpacing:null,charSet:i,checked:a|s,classID:i,className:n?i:a,cols:i|l,colSpan:null,content:null,contentEditable:null,contextMenu:i,controls:a|s,coords:null,crossOrigin:null,data:null,dateTime:i,defer:s,dir:null,disabled:i|s,download:p,draggable:null,encType:null,form:i,formAction:i,formEncType:i,formMethod:i,formNoValidate:s,formTarget:i,frameBorder:i,height:i,hidden:i|s,href:null,hrefLang:null,htmlFor:null,httpEquiv:null,icon:null,id:a,label:null,lang:null,list:i,loop:a|s,manifest:i,marginHeight:null,marginWidth:null,max:null,maxLength:i,media:i,mediaGroup:null,method:null,min:null,multiple:a|s,muted:a|s,name:null,noValidate:s,open:null,pattern:null,placeholder:null,poster:null,preload:null,radioGroup:null,readOnly:a|s,rel:null,required:s,role:i,rows:i|l,rowSpan:null,sandbox:null,scope:null,scrolling:null,seamless:i|s,selected:a|s,shape:null,size:i|l,sizes:i,span:l,spellCheck:null,src:null,srcDoc:a,srcSet:i,start:c,step:null,style:null,tabIndex:null,target:null,title:null,type:null,useMap:null,value:a|u,width:i,wmode:i,autoCapitalize:null,autoCorrect:null,itemProp:i,itemScope:i|s,itemType:i,property:null},DOMAttributeNames:{acceptCharset:"accept-charset",className:"class",htmlFor:"for",httpEquiv:"http-equiv"},DOMPropertyNames:{autoCapitalize:"autocapitalize",autoComplete:"autocomplete",autoCorrect:"autocorrect",autoFocus:"autofocus",autoPlay:"autoplay",encType:"enctype",hrefLang:"hreflang",radioGroup:"radiogroup",spellCheck:"spellcheck",srcDoc:"srcdoc",srcSet:"srcset"}};t.exports=f},{"./DOMProperty":12,"./ExecutionEnvironment":23}],25:[function(e,t){"use strict";var n=e("./ReactLink"),r=e("./ReactStateSetters"),o={linkState:function(e){return new n(this.state[e],r.createStateKeySetter(this,e))}};t.exports=o},{"./ReactLink":66,"./ReactStateSetters":83}],26:[function(e,t){"use strict";function n(e){u(null==e.props.checkedLink||null==e.props.valueLink)}function r(e){n(e),u(null==e.props.value&&null==e.props.onChange)}function o(e){n(e),u(null==e.props.checked&&null==e.props.onChange)}function i(e){this.props.valueLink.requestChange(e.target.value)}function a(e){this.props.checkedLink.requestChange(e.target.checked)}var s=e("./ReactPropTypes"),u=e("./invariant"),c={button:!0,checkbox:!0,image:!0,hidden:!0,radio:!0,reset:!0,submit:!0},l={Mixin:{propTypes:{value:function(e,t){return!e[t]||c[e.type]||e.onChange||e.readOnly||e.disabled?void 0:new Error("You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultValue`. Otherwise, set either `onChange` or `readOnly`.")},checked:function(e,t){return!e[t]||e.onChange||e.readOnly||e.disabled?void 0:new Error("You provided a `checked` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultChecked`. Otherwise, set either `onChange` or `readOnly`.")},onChange:s.func}},getValue:function(e){return e.props.valueLink?(r(e),e.props.valueLink.value):e.props.value},getChecked:function(e){return e.props.checkedLink?(o(e),e.props.checkedLink.value):e.props.checked},getOnChange:function(e){return e.props.valueLink?(r(e),i):e.props.checkedLink?(o(e),a):e.props.onChange}};t.exports=l},{"./ReactPropTypes":77,"./invariant":137}],27:[function(e,t){"use strict";function n(e){e.remove()}var r=e("./ReactBrowserEventEmitter"),o=e("./accumulateInto"),i=e("./forEachAccumulated"),a=e("./invariant"),s={trapBubbledEvent:function(e,t){a(this.isMounted());var n=r.trapBubbledEvent(e,t,this.getDOMNode());this._localEventListeners=o(this._localEventListeners,n)},componentWillUnmount:function(){this._localEventListeners&&i(this._localEventListeners,n)}};t.exports=s},{"./ReactBrowserEventEmitter":33,"./accumulateInto":106,"./forEachAccumulated":123,"./invariant":137}],28:[function(e,t){"use strict";var n=e("./EventConstants"),r=e("./emptyFunction"),o=n.topLevelTypes,i={eventTypes:null,extractEvents:function(e,t,n,i){if(e===o.topTouchStart){var a=i.target;a&&!a.onclick&&(a.onclick=r)}}};t.exports=i},{"./EventConstants":17,"./emptyFunction":118}],29:[function(e,t){function n(e){if(null==e)throw new TypeError("Object.assign target cannot be null or undefined");for(var t=Object(e),n=Object.prototype.hasOwnProperty,r=1;r<arguments.length;r++){var o=arguments[r];if(null!=o){var i=Object(o);for(var a in i)n.call(i,a)&&(t[a]=i[a])}}return t}t.exports=n},{}],30:[function(e,t){"use strict";var n=e("./invariant"),r=function(e){var t=this;if(t.instancePool.length){var n=t.instancePool.pop();return t.call(n,e),n}return new t(e)},o=function(e,t){var n=this;if(n.instancePool.length){var r=n.instancePool.pop();return n.call(r,e,t),r}return new n(e,t)},i=function(e,t,n){var r=this;if(r.instancePool.length){var o=r.instancePool.pop();return r.call(o,e,t,n),o}return new r(e,t,n)},a=function(e,t,n,r,o){var i=this;if(i.instancePool.length){var a=i.instancePool.pop();return i.call(a,e,t,n,r,o),a}return new i(e,t,n,r,o)},s=function(e){var t=this;n(e instanceof t),e.destructor&&e.destructor(),t.instancePool.length<t.poolSize&&t.instancePool.push(e)},u=10,c=r,l=function(e,t){var n=e;return n.instancePool=[],n.getPooled=t||c,n.poolSize||(n.poolSize=u),n.release=s,n},p={addPoolingTo:l,oneArgumentPooler:r,twoArgumentPooler:o,threeArgumentPooler:i,fiveArgumentPooler:a};t.exports=p},{"./invariant":137}],31:[function(e,t){"use strict";var n=e("./DOMPropertyOperations"),r=e("./EventPluginUtils"),o=e("./ReactChildren"),i=e("./ReactComponent"),a=e("./ReactCompositeComponent"),s=e("./ReactContext"),u=e("./ReactCurrentOwner"),c=e("./ReactElement"),l=(e("./ReactElementValidator"),e("./ReactDOM")),p=e("./ReactDOMComponent"),d=e("./ReactDefaultInjection"),f=e("./ReactInstanceHandles"),h=e("./ReactLegacyElement"),m=e("./ReactMount"),v=e("./ReactMultiChild"),y=e("./ReactPerf"),g=e("./ReactPropTypes"),E=e("./ReactServerRendering"),C=e("./ReactTextComponent"),R=e("./Object.assign"),M=e("./deprecated"),b=e("./onlyChild");
d.inject();var O=c.createElement,D=c.createFactory;O=h.wrapCreateElement(O),D=h.wrapCreateFactory(D);var x=y.measure("React","render",m.render),P={Children:{map:o.map,forEach:o.forEach,count:o.count,only:b},DOM:l,PropTypes:g,initializeTouchEvents:function(e){r.useTouchEvents=e},createClass:a.createClass,createElement:O,createFactory:D,constructAndRenderComponent:m.constructAndRenderComponent,constructAndRenderComponentByID:m.constructAndRenderComponentByID,render:x,renderToString:E.renderToString,renderToStaticMarkup:E.renderToStaticMarkup,unmountComponentAtNode:m.unmountComponentAtNode,isValidClass:h.isValidClass,isValidElement:c.isValidElement,withContext:s.withContext,__spread:R,renderComponent:M("React","renderComponent","render",this,x),renderComponentToString:M("React","renderComponentToString","renderToString",this,E.renderToString),renderComponentToStaticMarkup:M("React","renderComponentToStaticMarkup","renderToStaticMarkup",this,E.renderToStaticMarkup),isValidComponent:M("React","isValidComponent","isValidElement",this,c.isValidElement)};"undefined"!=typeof __REACT_DEVTOOLS_GLOBAL_HOOK__&&"function"==typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.inject&&__REACT_DEVTOOLS_GLOBAL_HOOK__.inject({Component:i,CurrentOwner:u,DOMComponent:p,DOMPropertyOperations:n,InstanceHandles:f,Mount:m,MultiChild:v,TextComponent:C});P.version="0.12.2",t.exports=P},{"./DOMPropertyOperations":13,"./EventPluginUtils":21,"./Object.assign":29,"./ReactChildren":36,"./ReactComponent":37,"./ReactCompositeComponent":40,"./ReactContext":41,"./ReactCurrentOwner":42,"./ReactDOM":43,"./ReactDOMComponent":45,"./ReactDefaultInjection":55,"./ReactElement":56,"./ReactElementValidator":57,"./ReactInstanceHandles":64,"./ReactLegacyElement":65,"./ReactMount":68,"./ReactMultiChild":69,"./ReactPerf":73,"./ReactPropTypes":77,"./ReactServerRendering":81,"./ReactTextComponent":84,"./deprecated":117,"./onlyChild":148}],32:[function(e,t){"use strict";var n=e("./ReactEmptyComponent"),r=e("./ReactMount"),o=e("./invariant"),i={getDOMNode:function(){return o(this.isMounted()),n.isNullComponentID(this._rootNodeID)?null:r.getNode(this._rootNodeID)}};t.exports=i},{"./ReactEmptyComponent":58,"./ReactMount":68,"./invariant":137}],33:[function(e,t){"use strict";function n(e){return Object.prototype.hasOwnProperty.call(e,h)||(e[h]=d++,l[e[h]]={}),l[e[h]]}var r=e("./EventConstants"),o=e("./EventPluginHub"),i=e("./EventPluginRegistry"),a=e("./ReactEventEmitterMixin"),s=e("./ViewportMetrics"),u=e("./Object.assign"),c=e("./isEventSupported"),l={},p=!1,d=0,f={topBlur:"blur",topChange:"change",topClick:"click",topCompositionEnd:"compositionend",topCompositionStart:"compositionstart",topCompositionUpdate:"compositionupdate",topContextMenu:"contextmenu",topCopy:"copy",topCut:"cut",topDoubleClick:"dblclick",topDrag:"drag",topDragEnd:"dragend",topDragEnter:"dragenter",topDragExit:"dragexit",topDragLeave:"dragleave",topDragOver:"dragover",topDragStart:"dragstart",topDrop:"drop",topFocus:"focus",topInput:"input",topKeyDown:"keydown",topKeyPress:"keypress",topKeyUp:"keyup",topMouseDown:"mousedown",topMouseMove:"mousemove",topMouseOut:"mouseout",topMouseOver:"mouseover",topMouseUp:"mouseup",topPaste:"paste",topScroll:"scroll",topSelectionChange:"selectionchange",topTextInput:"textInput",topTouchCancel:"touchcancel",topTouchEnd:"touchend",topTouchMove:"touchmove",topTouchStart:"touchstart",topWheel:"wheel"},h="_reactListenersID"+String(Math.random()).slice(2),m=u({},a,{ReactEventListener:null,injection:{injectReactEventListener:function(e){e.setHandleTopLevel(m.handleTopLevel),m.ReactEventListener=e}},setEnabled:function(e){m.ReactEventListener&&m.ReactEventListener.setEnabled(e)},isEnabled:function(){return!(!m.ReactEventListener||!m.ReactEventListener.isEnabled())},listenTo:function(e,t){for(var o=t,a=n(o),s=i.registrationNameDependencies[e],u=r.topLevelTypes,l=0,p=s.length;p>l;l++){var d=s[l];a.hasOwnProperty(d)&&a[d]||(d===u.topWheel?c("wheel")?m.ReactEventListener.trapBubbledEvent(u.topWheel,"wheel",o):c("mousewheel")?m.ReactEventListener.trapBubbledEvent(u.topWheel,"mousewheel",o):m.ReactEventListener.trapBubbledEvent(u.topWheel,"DOMMouseScroll",o):d===u.topScroll?c("scroll",!0)?m.ReactEventListener.trapCapturedEvent(u.topScroll,"scroll",o):m.ReactEventListener.trapBubbledEvent(u.topScroll,"scroll",m.ReactEventListener.WINDOW_HANDLE):d===u.topFocus||d===u.topBlur?(c("focus",!0)?(m.ReactEventListener.trapCapturedEvent(u.topFocus,"focus",o),m.ReactEventListener.trapCapturedEvent(u.topBlur,"blur",o)):c("focusin")&&(m.ReactEventListener.trapBubbledEvent(u.topFocus,"focusin",o),m.ReactEventListener.trapBubbledEvent(u.topBlur,"focusout",o)),a[u.topBlur]=!0,a[u.topFocus]=!0):f.hasOwnProperty(d)&&m.ReactEventListener.trapBubbledEvent(d,f[d],o),a[d]=!0)}},trapBubbledEvent:function(e,t,n){return m.ReactEventListener.trapBubbledEvent(e,t,n)},trapCapturedEvent:function(e,t,n){return m.ReactEventListener.trapCapturedEvent(e,t,n)},ensureScrollValueMonitoring:function(){if(!p){var e=s.refreshScrollValues;m.ReactEventListener.monitorScrollValue(e),p=!0}},eventNameDispatchConfigs:o.eventNameDispatchConfigs,registrationNameModules:o.registrationNameModules,putListener:o.putListener,getListener:o.getListener,deleteListener:o.deleteListener,deleteAllListeners:o.deleteAllListeners});t.exports=m},{"./EventConstants":17,"./EventPluginHub":19,"./EventPluginRegistry":20,"./Object.assign":29,"./ReactEventEmitterMixin":60,"./ViewportMetrics":105,"./isEventSupported":138}],34:[function(e,t){"use strict";var n=e("./React"),r=e("./Object.assign"),o=n.createFactory(e("./ReactTransitionGroup")),i=n.createFactory(e("./ReactCSSTransitionGroupChild")),a=n.createClass({displayName:"ReactCSSTransitionGroup",propTypes:{transitionName:n.PropTypes.string.isRequired,transitionEnter:n.PropTypes.bool,transitionLeave:n.PropTypes.bool},getDefaultProps:function(){return{transitionEnter:!0,transitionLeave:!0}},_wrapChild:function(e){return i({name:this.props.transitionName,enter:this.props.transitionEnter,leave:this.props.transitionLeave},e)},render:function(){return o(r({},this.props,{childFactory:this._wrapChild}))}});t.exports=a},{"./Object.assign":29,"./React":31,"./ReactCSSTransitionGroupChild":35,"./ReactTransitionGroup":87}],35:[function(e,t){"use strict";var n=e("./React"),r=e("./CSSCore"),o=e("./ReactTransitionEvents"),i=e("./onlyChild"),a=17,s=n.createClass({displayName:"ReactCSSTransitionGroupChild",transition:function(e,t){var n=this.getDOMNode(),i=this.props.name+"-"+e,a=i+"-active",s=function(e){e&&e.target!==n||(r.removeClass(n,i),r.removeClass(n,a),o.removeEndEventListener(n,s),t&&t())};o.addEndEventListener(n,s),r.addClass(n,i),this.queueClass(a)},queueClass:function(e){this.classNameQueue.push(e),this.timeout||(this.timeout=setTimeout(this.flushClassNameQueue,a))},flushClassNameQueue:function(){this.isMounted()&&this.classNameQueue.forEach(r.addClass.bind(r,this.getDOMNode())),this.classNameQueue.length=0,this.timeout=null},componentWillMount:function(){this.classNameQueue=[]},componentWillUnmount:function(){this.timeout&&clearTimeout(this.timeout)},componentWillEnter:function(e){this.props.enter?this.transition("enter",e):e()},componentWillLeave:function(e){this.props.leave?this.transition("leave",e):e()},render:function(){return i(this.props.children)}});t.exports=s},{"./CSSCore":4,"./React":31,"./ReactTransitionEvents":86,"./onlyChild":148}],36:[function(e,t){"use strict";function n(e,t){this.forEachFunction=e,this.forEachContext=t}function r(e,t,n,r){var o=e;o.forEachFunction.call(o.forEachContext,t,r)}function o(e,t,o){if(null==e)return e;var i=n.getPooled(t,o);p(e,r,i),n.release(i)}function i(e,t,n){this.mapResult=e,this.mapFunction=t,this.mapContext=n}function a(e,t,n,r){var o=e,i=o.mapResult,a=!i.hasOwnProperty(n);if(a){var s=o.mapFunction.call(o.mapContext,t,r);i[n]=s}}function s(e,t,n){if(null==e)return e;var r={},o=i.getPooled(r,t,n);return p(e,a,o),i.release(o),r}function u(){return null}function c(e){return p(e,u,null)}var l=e("./PooledClass"),p=e("./traverseAllChildren"),d=(e("./warning"),l.twoArgumentPooler),f=l.threeArgumentPooler;l.addPoolingTo(n,d),l.addPoolingTo(i,f);var h={forEach:o,map:s,count:c};t.exports=h},{"./PooledClass":30,"./traverseAllChildren":153,"./warning":155}],37:[function(e,t){"use strict";var n=e("./ReactElement"),r=e("./ReactOwner"),o=e("./ReactUpdates"),i=e("./Object.assign"),a=e("./invariant"),s=e("./keyMirror"),u=s({MOUNTED:null,UNMOUNTED:null}),c=!1,l=null,p=null,d={injection:{injectEnvironment:function(e){a(!c),p=e.mountImageIntoNode,l=e.unmountIDFromEnvironment,d.BackendIDOperations=e.BackendIDOperations,c=!0}},LifeCycle:u,BackendIDOperations:null,Mixin:{isMounted:function(){return this._lifeCycleState===u.MOUNTED},setProps:function(e,t){var n=this._pendingElement||this._currentElement;this.replaceProps(i({},n.props,e),t)},replaceProps:function(e,t){a(this.isMounted()),a(0===this._mountDepth),this._pendingElement=n.cloneAndReplaceProps(this._pendingElement||this._currentElement,e),o.enqueueUpdate(this,t)},_setPropsInternal:function(e,t){var r=this._pendingElement||this._currentElement;this._pendingElement=n.cloneAndReplaceProps(r,i({},r.props,e)),o.enqueueUpdate(this,t)},construct:function(e){this.props=e.props,this._owner=e._owner,this._lifeCycleState=u.UNMOUNTED,this._pendingCallbacks=null,this._currentElement=e,this._pendingElement=null},mountComponent:function(e,t,n){a(!this.isMounted());var o=this._currentElement.ref;if(null!=o){var i=this._currentElement._owner;r.addComponentAsRefTo(this,o,i)}this._rootNodeID=e,this._lifeCycleState=u.MOUNTED,this._mountDepth=n},unmountComponent:function(){a(this.isMounted());var e=this._currentElement.ref;null!=e&&r.removeComponentAsRefFrom(this,e,this._owner),l(this._rootNodeID),this._rootNodeID=null,this._lifeCycleState=u.UNMOUNTED},receiveComponent:function(e,t){a(this.isMounted()),this._pendingElement=e,this.performUpdateIfNecessary(t)},performUpdateIfNecessary:function(e){if(null!=this._pendingElement){var t=this._currentElement,n=this._pendingElement;this._currentElement=n,this.props=n.props,this._owner=n._owner,this._pendingElement=null,this.updateComponent(e,t)}},updateComponent:function(e,t){var n=this._currentElement;(n._owner!==t._owner||n.ref!==t.ref)&&(null!=t.ref&&r.removeComponentAsRefFrom(this,t.ref,t._owner),null!=n.ref&&r.addComponentAsRefTo(this,n.ref,n._owner))},mountComponentIntoNode:function(e,t,n){var r=o.ReactReconcileTransaction.getPooled();r.perform(this._mountComponentIntoNode,this,e,t,r,n),o.ReactReconcileTransaction.release(r)},_mountComponentIntoNode:function(e,t,n,r){var o=this.mountComponent(e,n,0);p(o,t,r)},isOwnedBy:function(e){return this._owner===e},getSiblingByRef:function(e){var t=this._owner;return t&&t.refs?t.refs[e]:null}}};t.exports=d},{"./Object.assign":29,"./ReactElement":56,"./ReactOwner":72,"./ReactUpdates":88,"./invariant":137,"./keyMirror":143}],38:[function(e,t){"use strict";var n=e("./ReactDOMIDOperations"),r=e("./ReactMarkupChecksum"),o=e("./ReactMount"),i=e("./ReactPerf"),a=e("./ReactReconcileTransaction"),s=e("./getReactRootElementInContainer"),u=e("./invariant"),c=e("./setInnerHTML"),l=1,p=9,d={ReactReconcileTransaction:a,BackendIDOperations:n,unmountIDFromEnvironment:function(e){o.purgeID(e)},mountImageIntoNode:i.measure("ReactComponentBrowserEnvironment","mountImageIntoNode",function(e,t,n){if(u(t&&(t.nodeType===l||t.nodeType===p)),n){if(r.canReuseMarkup(e,s(t)))return;u(t.nodeType!==p)}u(t.nodeType!==p),c(t,e)})};t.exports=d},{"./ReactDOMIDOperations":47,"./ReactMarkupChecksum":67,"./ReactMount":68,"./ReactPerf":73,"./ReactReconcileTransaction":79,"./getReactRootElementInContainer":131,"./invariant":137,"./setInnerHTML":149}],39:[function(e,t){"use strict";var n=e("./shallowEqual"),r={shouldComponentUpdate:function(e,t){return!n(this.props,e)||!n(this.state,t)}};t.exports=r},{"./shallowEqual":150}],40:[function(e,t){"use strict";function n(e){var t=e._owner||null;return t&&t.constructor&&t.constructor.displayName?" Check the render method of `"+t.constructor.displayName+"`.":""}function r(e,t){for(var n in t)t.hasOwnProperty(n)&&D("function"==typeof t[n])}function o(e,t){var n=I.hasOwnProperty(t)?I[t]:null;L.hasOwnProperty(t)&&D(n===S.OVERRIDE_BASE),e.hasOwnProperty(t)&&D(n===S.DEFINE_MANY||n===S.DEFINE_MANY_MERGED)}function i(e){var t=e._compositeLifeCycleState;D(e.isMounted()||t===A.MOUNTING),D(null==f.current),D(t!==A.UNMOUNTING)}function a(e,t){if(t){D(!y.isValidFactory(t)),D(!h.isValidElement(t));var n=e.prototype;t.hasOwnProperty(_)&&k.mixins(e,t.mixins);for(var r in t)if(t.hasOwnProperty(r)&&r!==_){var i=t[r];if(o(n,r),k.hasOwnProperty(r))k[r](e,i);else{var a=I.hasOwnProperty(r),s=n.hasOwnProperty(r),u=i&&i.__reactDontBind,p="function"==typeof i,d=p&&!a&&!s&&!u;if(d)n.__reactAutoBindMap||(n.__reactAutoBindMap={}),n.__reactAutoBindMap[r]=i,n[r]=i;else if(s){var f=I[r];D(a&&(f===S.DEFINE_MANY_MERGED||f===S.DEFINE_MANY)),f===S.DEFINE_MANY_MERGED?n[r]=c(n[r],i):f===S.DEFINE_MANY&&(n[r]=l(n[r],i))}else n[r]=i}}}}function s(e,t){if(t)for(var n in t){var r=t[n];if(t.hasOwnProperty(n)){var o=n in k;D(!o);var i=n in e;D(!i),e[n]=r}}}function u(e,t){return D(e&&t&&"object"==typeof e&&"object"==typeof t),T(t,function(t,n){D(void 0===e[n]),e[n]=t}),e}function c(e,t){return function(){var n=e.apply(this,arguments),r=t.apply(this,arguments);return null==n?r:null==r?n:u(n,r)}}function l(e,t){return function(){e.apply(this,arguments),t.apply(this,arguments)}}var p=e("./ReactComponent"),d=e("./ReactContext"),f=e("./ReactCurrentOwner"),h=e("./ReactElement"),m=(e("./ReactElementValidator"),e("./ReactEmptyComponent")),v=e("./ReactErrorUtils"),y=e("./ReactLegacyElement"),g=e("./ReactOwner"),E=e("./ReactPerf"),C=e("./ReactPropTransferer"),R=e("./ReactPropTypeLocations"),M=(e("./ReactPropTypeLocationNames"),e("./ReactUpdates")),b=e("./Object.assign"),O=e("./instantiateReactComponent"),D=e("./invariant"),x=e("./keyMirror"),P=e("./keyOf"),T=(e("./monitorCodeUse"),e("./mapObject")),w=e("./shouldUpdateReactComponent"),_=(e("./warning"),P({mixins:null})),S=x({DEFINE_ONCE:null,DEFINE_MANY:null,OVERRIDE_BASE:null,DEFINE_MANY_MERGED:null}),N=[],I={mixins:S.DEFINE_MANY,statics:S.DEFINE_MANY,propTypes:S.DEFINE_MANY,contextTypes:S.DEFINE_MANY,childContextTypes:S.DEFINE_MANY,getDefaultProps:S.DEFINE_MANY_MERGED,getInitialState:S.DEFINE_MANY_MERGED,getChildContext:S.DEFINE_MANY_MERGED,render:S.DEFINE_ONCE,componentWillMount:S.DEFINE_MANY,componentDidMount:S.DEFINE_MANY,componentWillReceiveProps:S.DEFINE_MANY,shouldComponentUpdate:S.DEFINE_ONCE,componentWillUpdate:S.DEFINE_MANY,componentDidUpdate:S.DEFINE_MANY,componentWillUnmount:S.DEFINE_MANY,updateComponent:S.OVERRIDE_BASE},k={displayName:function(e,t){e.displayName=t},mixins:function(e,t){if(t)for(var n=0;n<t.length;n++)a(e,t[n])},childContextTypes:function(e,t){r(e,t,R.childContext),e.childContextTypes=b({},e.childContextTypes,t)},contextTypes:function(e,t){r(e,t,R.context),e.contextTypes=b({},e.contextTypes,t)},getDefaultProps:function(e,t){e.getDefaultProps=e.getDefaultProps?c(e.getDefaultProps,t):t},propTypes:function(e,t){r(e,t,R.prop),e.propTypes=b({},e.propTypes,t)},statics:function(e,t){s(e,t)}},A=x({MOUNTING:null,UNMOUNTING:null,RECEIVING_PROPS:null}),L={construct:function(){p.Mixin.construct.apply(this,arguments),g.Mixin.construct.apply(this,arguments),this.state=null,this._pendingState=null,this.context=null,this._compositeLifeCycleState=null},isMounted:function(){return p.Mixin.isMounted.call(this)&&this._compositeLifeCycleState!==A.MOUNTING},mountComponent:E.measure("ReactCompositeComponent","mountComponent",function(e,t,n){p.Mixin.mountComponent.call(this,e,t,n),this._compositeLifeCycleState=A.MOUNTING,this.__reactAutoBindMap&&this._bindAutoBindMethods(),this.context=this._processContext(this._currentElement._context),this.props=this._processProps(this.props),this.state=this.getInitialState?this.getInitialState():null,D("object"==typeof this.state&&!Array.isArray(this.state)),this._pendingState=null,this._pendingForceUpdate=!1,this.componentWillMount&&(this.componentWillMount(),this._pendingState&&(this.state=this._pendingState,this._pendingState=null)),this._renderedComponent=O(this._renderValidatedComponent(),this._currentElement.type),this._compositeLifeCycleState=null;var r=this._renderedComponent.mountComponent(e,t,n+1);return this.componentDidMount&&t.getReactMountReady().enqueue(this.componentDidMount,this),r}),unmountComponent:function(){this._compositeLifeCycleState=A.UNMOUNTING,this.componentWillUnmount&&this.componentWillUnmount(),this._compositeLifeCycleState=null,this._renderedComponent.unmountComponent(),this._renderedComponent=null,p.Mixin.unmountComponent.call(this)},setState:function(e,t){D("object"==typeof e||null==e),this.replaceState(b({},this._pendingState||this.state,e),t)},replaceState:function(e,t){i(this),this._pendingState=e,this._compositeLifeCycleState!==A.MOUNTING&&M.enqueueUpdate(this,t)},_processContext:function(e){var t=null,n=this.constructor.contextTypes;if(n){t={};for(var r in n)t[r]=e[r]}return t},_processChildContext:function(e){var t=this.getChildContext&&this.getChildContext();if(this.constructor.displayName||"ReactCompositeComponent",t){D("object"==typeof this.constructor.childContextTypes);for(var n in t)D(n in this.constructor.childContextTypes);return b({},e,t)}return e},_processProps:function(e){return e},_checkPropTypes:function(e,t,r){var o=this.constructor.displayName;for(var i in e)if(e.hasOwnProperty(i)){var a=e[i](t,i,o,r);a instanceof Error&&n(this)}},performUpdateIfNecessary:function(e){var t=this._compositeLifeCycleState;if(t!==A.MOUNTING&&t!==A.RECEIVING_PROPS&&(null!=this._pendingElement||null!=this._pendingState||this._pendingForceUpdate)){var n=this.context,r=this.props,o=this._currentElement;null!=this._pendingElement&&(o=this._pendingElement,n=this._processContext(o._context),r=this._processProps(o.props),this._pendingElement=null,this._compositeLifeCycleState=A.RECEIVING_PROPS,this.componentWillReceiveProps&&this.componentWillReceiveProps(r,n)),this._compositeLifeCycleState=null;var i=this._pendingState||this.state;this._pendingState=null;var a=this._pendingForceUpdate||!this.shouldComponentUpdate||this.shouldComponentUpdate(r,i,n);a?(this._pendingForceUpdate=!1,this._performComponentUpdate(o,r,i,n,e)):(this._currentElement=o,this.props=r,this.state=i,this.context=n,this._owner=o._owner)}},_performComponentUpdate:function(e,t,n,r,o){var i=this._currentElement,a=this.props,s=this.state,u=this.context;this.componentWillUpdate&&this.componentWillUpdate(t,n,r),this._currentElement=e,this.props=t,this.state=n,this.context=r,this._owner=e._owner,this.updateComponent(o,i),this.componentDidUpdate&&o.getReactMountReady().enqueue(this.componentDidUpdate.bind(this,a,s,u),this)},receiveComponent:function(e,t){(e!==this._currentElement||null==e._owner)&&p.Mixin.receiveComponent.call(this,e,t)},updateComponent:E.measure("ReactCompositeComponent","updateComponent",function(e,t){p.Mixin.updateComponent.call(this,e,t);var n=this._renderedComponent,r=n._currentElement,o=this._renderValidatedComponent();if(w(r,o))n.receiveComponent(o,e);else{var i=this._rootNodeID,a=n._rootNodeID;n.unmountComponent(),this._renderedComponent=O(o,this._currentElement.type);var s=this._renderedComponent.mountComponent(i,e,this._mountDepth+1);p.BackendIDOperations.dangerouslyReplaceNodeWithMarkupByID(a,s)}}),forceUpdate:function(e){var t=this._compositeLifeCycleState;D(this.isMounted()||t===A.MOUNTING),D(t!==A.UNMOUNTING&&null==f.current),this._pendingForceUpdate=!0,M.enqueueUpdate(this,e)},_renderValidatedComponent:E.measure("ReactCompositeComponent","_renderValidatedComponent",function(){var e,t=d.current;d.current=this._processChildContext(this._currentElement._context),f.current=this;try{e=this.render(),null===e||e===!1?(e=m.getEmptyComponent(),m.registerNullComponentID(this._rootNodeID)):m.deregisterNullComponentID(this._rootNodeID)}finally{d.current=t,f.current=null}return D(h.isValidElement(e)),e}),_bindAutoBindMethods:function(){for(var e in this.__reactAutoBindMap)if(this.__reactAutoBindMap.hasOwnProperty(e)){var t=this.__reactAutoBindMap[e];this[e]=this._bindAutoBindMethod(v.guard(t,this.constructor.displayName+"."+e))}},_bindAutoBindMethod:function(e){var t=this,n=e.bind(t);return n}},U=function(){};b(U.prototype,p.Mixin,g.Mixin,C.Mixin,L);var F={LifeCycle:A,Base:U,createClass:function(e){var t=function(){};t.prototype=new U,t.prototype.constructor=t,N.forEach(a.bind(null,t)),a(t,e),t.getDefaultProps&&(t.defaultProps=t.getDefaultProps()),D(t.prototype.render);for(var n in I)t.prototype[n]||(t.prototype[n]=null);return y.wrapFactory(h.createFactory(t))},injection:{injectMixin:function(e){N.push(e)}}};t.exports=F},{"./Object.assign":29,"./ReactComponent":37,"./ReactContext":41,"./ReactCurrentOwner":42,"./ReactElement":56,"./ReactElementValidator":57,"./ReactEmptyComponent":58,"./ReactErrorUtils":59,"./ReactLegacyElement":65,"./ReactOwner":72,"./ReactPerf":73,"./ReactPropTransferer":74,"./ReactPropTypeLocationNames":75,"./ReactPropTypeLocations":76,"./ReactUpdates":88,"./instantiateReactComponent":136,"./invariant":137,"./keyMirror":143,"./keyOf":144,"./mapObject":145,"./monitorCodeUse":147,"./shouldUpdateReactComponent":151,"./warning":155}],41:[function(e,t){"use strict";var n=e("./Object.assign"),r={current:{},withContext:function(e,t){var o,i=r.current;r.current=n({},i,e);try{o=t()}finally{r.current=i}return o}};t.exports=r},{"./Object.assign":29}],42:[function(e,t){"use strict";var n={current:null};t.exports=n},{}],43:[function(e,t){"use strict";function n(e){return o.markNonLegacyFactory(r.createFactory(e))}var r=e("./ReactElement"),o=(e("./ReactElementValidator"),e("./ReactLegacyElement")),i=e("./mapObject"),a=i({a:"a",abbr:"abbr",address:"address",area:"area",article:"article",aside:"aside",audio:"audio",b:"b",base:"base",bdi:"bdi",bdo:"bdo",big:"big",blockquote:"blockquote",body:"body",br:"br",button:"button",canvas:"canvas",caption:"caption",cite:"cite",code:"code",col:"col",colgroup:"colgroup",data:"data",datalist:"datalist",dd:"dd",del:"del",details:"details",dfn:"dfn",dialog:"dialog",div:"div",dl:"dl",dt:"dt",em:"em",embed:"embed",fieldset:"fieldset",figcaption:"figcaption",figure:"figure",footer:"footer",form:"form",h1:"h1",h2:"h2",h3:"h3",h4:"h4",h5:"h5",h6:"h6",head:"head",header:"header",hr:"hr",html:"html",i:"i",iframe:"iframe",img:"img",input:"input",ins:"ins",kbd:"kbd",keygen:"keygen",label:"label",legend:"legend",li:"li",link:"link",main:"main",map:"map",mark:"mark",menu:"menu",menuitem:"menuitem",meta:"meta",meter:"meter",nav:"nav",noscript:"noscript",object:"object",ol:"ol",optgroup:"optgroup",option:"option",output:"output",p:"p",param:"param",picture:"picture",pre:"pre",progress:"progress",q:"q",rp:"rp",rt:"rt",ruby:"ruby",s:"s",samp:"samp",script:"script",section:"section",select:"select",small:"small",source:"source",span:"span",strong:"strong",style:"style",sub:"sub",summary:"summary",sup:"sup",table:"table",tbody:"tbody",td:"td",textarea:"textarea",tfoot:"tfoot",th:"th",thead:"thead",time:"time",title:"title",tr:"tr",track:"track",u:"u",ul:"ul","var":"var",video:"video",wbr:"wbr",circle:"circle",defs:"defs",ellipse:"ellipse",g:"g",line:"line",linearGradient:"linearGradient",mask:"mask",path:"path",pattern:"pattern",polygon:"polygon",polyline:"polyline",radialGradient:"radialGradient",rect:"rect",stop:"stop",svg:"svg",text:"text",tspan:"tspan"},n);t.exports=a},{"./ReactElement":56,"./ReactElementValidator":57,"./ReactLegacyElement":65,"./mapObject":145}],44:[function(e,t){"use strict";var n=e("./AutoFocusMixin"),r=e("./ReactBrowserComponentMixin"),o=e("./ReactCompositeComponent"),i=e("./ReactElement"),a=e("./ReactDOM"),s=e("./keyMirror"),u=i.createFactory(a.button.type),c=s({onClick:!0,onDoubleClick:!0,onMouseDown:!0,onMouseMove:!0,onMouseUp:!0,onClickCapture:!0,onDoubleClickCapture:!0,onMouseDownCapture:!0,onMouseMoveCapture:!0,onMouseUpCapture:!0}),l=o.createClass({displayName:"ReactDOMButton",mixins:[n,r],render:function(){var e={};for(var t in this.props)!this.props.hasOwnProperty(t)||this.props.disabled&&c[t]||(e[t]=this.props[t]);return u(e,this.props.children)}});t.exports=l},{"./AutoFocusMixin":2,"./ReactBrowserComponentMixin":32,"./ReactCompositeComponent":40,"./ReactDOM":43,"./ReactElement":56,"./keyMirror":143}],45:[function(e,t){"use strict";function n(e){e&&(y(null==e.children||null==e.dangerouslySetInnerHTML),y(null==e.style||"object"==typeof e.style))}function r(e,t,n,r){var o=d.findReactContainerForID(e);if(o){var i=o.nodeType===O?o.ownerDocument:o;C(t,i)}r.getPutListenerQueue().enqueuePutListener(e,t,n)}function o(e){T.call(P,e)||(y(x.test(e)),P[e]=!0)}function i(e){o(e),this._tag=e,this.tagName=e.toUpperCase()}var a=e("./CSSPropertyOperations"),s=e("./DOMProperty"),u=e("./DOMPropertyOperations"),c=e("./ReactBrowserComponentMixin"),l=e("./ReactComponent"),p=e("./ReactBrowserEventEmitter"),d=e("./ReactMount"),f=e("./ReactMultiChild"),h=e("./ReactPerf"),m=e("./Object.assign"),v=e("./escapeTextForBrowser"),y=e("./invariant"),g=(e("./isEventSupported"),e("./keyOf")),E=(e("./monitorCodeUse"),p.deleteListener),C=p.listenTo,R=p.registrationNameModules,M={string:!0,number:!0},b=g({style:null}),O=1,D={area:!0,base:!0,br:!0,col:!0,embed:!0,hr:!0,img:!0,input:!0,keygen:!0,link:!0,meta:!0,param:!0,source:!0,track:!0,wbr:!0},x=/^[a-zA-Z][a-zA-Z:_\.\-\d]*$/,P={},T={}.hasOwnProperty;i.displayName="ReactDOMComponent",i.Mixin={mountComponent:h.measure("ReactDOMComponent","mountComponent",function(e,t,r){l.Mixin.mountComponent.call(this,e,t,r),n(this.props);var o=D[this._tag]?"":"</"+this._tag+">";return this._createOpenTagMarkupAndPutListeners(t)+this._createContentMarkup(t)+o}),_createOpenTagMarkupAndPutListeners:function(e){var t=this.props,n="<"+this._tag;for(var o in t)if(t.hasOwnProperty(o)){var i=t[o];if(null!=i)if(R.hasOwnProperty(o))r(this._rootNodeID,o,i,e);else{o===b&&(i&&(i=t.style=m({},t.style)),i=a.createMarkupForStyles(i));var s=u.createMarkupForProperty(o,i);s&&(n+=" "+s)}}if(e.renderToStaticMarkup)return n+">";var c=u.createMarkupForID(this._rootNodeID);return n+" "+c+">"},_createContentMarkup:function(e){var t=this.props.dangerouslySetInnerHTML;if(null!=t){if(null!=t.__html)return t.__html}else{var n=M[typeof this.props.children]?this.props.children:null,r=null!=n?null:this.props.children;if(null!=n)return v(n);if(null!=r){var o=this.mountChildren(r,e);return o.join("")}}return""},receiveComponent:function(e,t){(e!==this._currentElement||null==e._owner)&&l.Mixin.receiveComponent.call(this,e,t)},updateComponent:h.measure("ReactDOMComponent","updateComponent",function(e,t){n(this._currentElement.props),l.Mixin.updateComponent.call(this,e,t),this._updateDOMProperties(t.props,e),this._updateDOMChildren(t.props,e)}),_updateDOMProperties:function(e,t){var n,o,i,a=this.props;for(n in e)if(!a.hasOwnProperty(n)&&e.hasOwnProperty(n))if(n===b){var u=e[n];for(o in u)u.hasOwnProperty(o)&&(i=i||{},i[o]="")}else R.hasOwnProperty(n)?E(this._rootNodeID,n):(s.isStandardName[n]||s.isCustomAttribute(n))&&l.BackendIDOperations.deletePropertyByID(this._rootNodeID,n);for(n in a){var c=a[n],p=e[n];if(a.hasOwnProperty(n)&&c!==p)if(n===b)if(c&&(c=a.style=m({},c)),p){for(o in p)!p.hasOwnProperty(o)||c&&c.hasOwnProperty(o)||(i=i||{},i[o]="");for(o in c)c.hasOwnProperty(o)&&p[o]!==c[o]&&(i=i||{},i[o]=c[o])}else i=c;else R.hasOwnProperty(n)?r(this._rootNodeID,n,c,t):(s.isStandardName[n]||s.isCustomAttribute(n))&&l.BackendIDOperations.updatePropertyByID(this._rootNodeID,n,c)}i&&l.BackendIDOperations.updateStylesByID(this._rootNodeID,i)},_updateDOMChildren:function(e,t){var n=this.props,r=M[typeof e.children]?e.children:null,o=M[typeof n.children]?n.children:null,i=e.dangerouslySetInnerHTML&&e.dangerouslySetInnerHTML.__html,a=n.dangerouslySetInnerHTML&&n.dangerouslySetInnerHTML.__html,s=null!=r?null:e.children,u=null!=o?null:n.children,c=null!=r||null!=i,p=null!=o||null!=a;null!=s&&null==u?this.updateChildren(null,t):c&&!p&&this.updateTextContent(""),null!=o?r!==o&&this.updateTextContent(""+o):null!=a?i!==a&&l.BackendIDOperations.updateInnerHTMLByID(this._rootNodeID,a):null!=u&&this.updateChildren(u,t)},unmountComponent:function(){this.unmountChildren(),p.deleteAllListeners(this._rootNodeID),l.Mixin.unmountComponent.call(this)}},m(i.prototype,l.Mixin,i.Mixin,f.Mixin,c),t.exports=i},{"./CSSPropertyOperations":6,"./DOMProperty":12,"./DOMPropertyOperations":13,"./Object.assign":29,"./ReactBrowserComponentMixin":32,"./ReactBrowserEventEmitter":33,"./ReactComponent":37,"./ReactMount":68,"./ReactMultiChild":69,"./ReactPerf":73,"./escapeTextForBrowser":120,"./invariant":137,"./isEventSupported":138,"./keyOf":144,"./monitorCodeUse":147}],46:[function(e,t){"use strict";var n=e("./EventConstants"),r=e("./LocalEventTrapMixin"),o=e("./ReactBrowserComponentMixin"),i=e("./ReactCompositeComponent"),a=e("./ReactElement"),s=e("./ReactDOM"),u=a.createFactory(s.form.type),c=i.createClass({displayName:"ReactDOMForm",mixins:[o,r],render:function(){return u(this.props)},componentDidMount:function(){this.trapBubbledEvent(n.topLevelTypes.topReset,"reset"),this.trapBubbledEvent(n.topLevelTypes.topSubmit,"submit")}});t.exports=c},{"./EventConstants":17,"./LocalEventTrapMixin":27,"./ReactBrowserComponentMixin":32,"./ReactCompositeComponent":40,"./ReactDOM":43,"./ReactElement":56}],47:[function(e,t){"use strict";var n=e("./CSSPropertyOperations"),r=e("./DOMChildrenOperations"),o=e("./DOMPropertyOperations"),i=e("./ReactMount"),a=e("./ReactPerf"),s=e("./invariant"),u=e("./setInnerHTML"),c={dangerouslySetInnerHTML:"`dangerouslySetInnerHTML` must be set using `updateInnerHTMLByID()`.",style:"`style` must be set using `updateStylesByID()`."},l={updatePropertyByID:a.measure("ReactDOMIDOperations","updatePropertyByID",function(e,t,n){var r=i.getNode(e);s(!c.hasOwnProperty(t)),null!=n?o.setValueForProperty(r,t,n):o.deleteValueForProperty(r,t)}),deletePropertyByID:a.measure("ReactDOMIDOperations","deletePropertyByID",function(e,t,n){var r=i.getNode(e);s(!c.hasOwnProperty(t)),o.deleteValueForProperty(r,t,n)}),updateStylesByID:a.measure("ReactDOMIDOperations","updateStylesByID",function(e,t){var r=i.getNode(e);n.setValueForStyles(r,t)}),updateInnerHTMLByID:a.measure("ReactDOMIDOperations","updateInnerHTMLByID",function(e,t){var n=i.getNode(e);u(n,t)}),updateTextContentByID:a.measure("ReactDOMIDOperations","updateTextContentByID",function(e,t){var n=i.getNode(e);r.updateTextContent(n,t)}),dangerouslyReplaceNodeWithMarkupByID:a.measure("ReactDOMIDOperations","dangerouslyReplaceNodeWithMarkupByID",function(e,t){var n=i.getNode(e);r.dangerouslyReplaceNodeWithMarkup(n,t)}),dangerouslyProcessChildrenUpdates:a.measure("ReactDOMIDOperations","dangerouslyProcessChildrenUpdates",function(e,t){for(var n=0;n<e.length;n++)e[n].parentNode=i.getNode(e[n].parentID);r.processUpdates(e,t)})};t.exports=l},{"./CSSPropertyOperations":6,"./DOMChildrenOperations":11,"./DOMPropertyOperations":13,"./ReactMount":68,"./ReactPerf":73,"./invariant":137,"./setInnerHTML":149}],48:[function(e,t){"use strict";var n=e("./EventConstants"),r=e("./LocalEventTrapMixin"),o=e("./ReactBrowserComponentMixin"),i=e("./ReactCompositeComponent"),a=e("./ReactElement"),s=e("./ReactDOM"),u=a.createFactory(s.img.type),c=i.createClass({displayName:"ReactDOMImg",tagName:"IMG",mixins:[o,r],render:function(){return u(this.props)},componentDidMount:function(){this.trapBubbledEvent(n.topLevelTypes.topLoad,"load"),this.trapBubbledEvent(n.topLevelTypes.topError,"error")}});t.exports=c},{"./EventConstants":17,"./LocalEventTrapMixin":27,"./ReactBrowserComponentMixin":32,"./ReactCompositeComponent":40,"./ReactDOM":43,"./ReactElement":56}],49:[function(e,t){"use strict";function n(){this.isMounted()&&this.forceUpdate()}var r=e("./AutoFocusMixin"),o=e("./DOMPropertyOperations"),i=e("./LinkedValueUtils"),a=e("./ReactBrowserComponentMixin"),s=e("./ReactCompositeComponent"),u=e("./ReactElement"),c=e("./ReactDOM"),l=e("./ReactMount"),p=e("./ReactUpdates"),d=e("./Object.assign"),f=e("./invariant"),h=u.createFactory(c.input.type),m={},v=s.createClass({displayName:"ReactDOMInput",mixins:[r,i.Mixin,a],getInitialState:function(){var e=this.props.defaultValue;
return{initialChecked:this.props.defaultChecked||!1,initialValue:null!=e?e:null}},render:function(){var e=d({},this.props);e.defaultChecked=null,e.defaultValue=null;var t=i.getValue(this);e.value=null!=t?t:this.state.initialValue;var n=i.getChecked(this);return e.checked=null!=n?n:this.state.initialChecked,e.onChange=this._handleChange,h(e,this.props.children)},componentDidMount:function(){var e=l.getID(this.getDOMNode());m[e]=this},componentWillUnmount:function(){var e=this.getDOMNode(),t=l.getID(e);delete m[t]},componentDidUpdate:function(){var e=this.getDOMNode();null!=this.props.checked&&o.setValueForProperty(e,"checked",this.props.checked||!1);var t=i.getValue(this);null!=t&&o.setValueForProperty(e,"value",""+t)},_handleChange:function(e){var t,r=i.getOnChange(this);r&&(t=r.call(this,e)),p.asap(n,this);var o=this.props.name;if("radio"===this.props.type&&null!=o){for(var a=this.getDOMNode(),s=a;s.parentNode;)s=s.parentNode;for(var u=s.querySelectorAll("input[name="+JSON.stringify(""+o)+'][type="radio"]'),c=0,d=u.length;d>c;c++){var h=u[c];if(h!==a&&h.form===a.form){var v=l.getID(h);f(v);var y=m[v];f(y),p.asap(n,y)}}}return t}});t.exports=v},{"./AutoFocusMixin":2,"./DOMPropertyOperations":13,"./LinkedValueUtils":26,"./Object.assign":29,"./ReactBrowserComponentMixin":32,"./ReactCompositeComponent":40,"./ReactDOM":43,"./ReactElement":56,"./ReactMount":68,"./ReactUpdates":88,"./invariant":137}],50:[function(e,t){"use strict";var n=e("./ReactBrowserComponentMixin"),r=e("./ReactCompositeComponent"),o=e("./ReactElement"),i=e("./ReactDOM"),a=(e("./warning"),o.createFactory(i.option.type)),s=r.createClass({displayName:"ReactDOMOption",mixins:[n],componentWillMount:function(){},render:function(){return a(this.props,this.props.children)}});t.exports=s},{"./ReactBrowserComponentMixin":32,"./ReactCompositeComponent":40,"./ReactDOM":43,"./ReactElement":56,"./warning":155}],51:[function(e,t){"use strict";function n(){this.isMounted()&&(this.setState({value:this._pendingValue}),this._pendingValue=0)}function r(e,t){if(null!=e[t])if(e.multiple){if(!Array.isArray(e[t]))return new Error("The `"+t+"` prop supplied to <select> must be an array if `multiple` is true.")}else if(Array.isArray(e[t]))return new Error("The `"+t+"` prop supplied to <select> must be a scalar value if `multiple` is false.")}function o(e,t){var n,r,o,i=e.props.multiple,a=null!=t?t:e.state.value,s=e.getDOMNode().options;if(i)for(n={},r=0,o=a.length;o>r;++r)n[""+a[r]]=!0;else n=""+a;for(r=0,o=s.length;o>r;r++){var u=i?n.hasOwnProperty(s[r].value):s[r].value===n;u!==s[r].selected&&(s[r].selected=u)}}var i=e("./AutoFocusMixin"),a=e("./LinkedValueUtils"),s=e("./ReactBrowserComponentMixin"),u=e("./ReactCompositeComponent"),c=e("./ReactElement"),l=e("./ReactDOM"),p=e("./ReactUpdates"),d=e("./Object.assign"),f=c.createFactory(l.select.type),h=u.createClass({displayName:"ReactDOMSelect",mixins:[i,a.Mixin,s],propTypes:{defaultValue:r,value:r},getInitialState:function(){return{value:this.props.defaultValue||(this.props.multiple?[]:"")}},componentWillMount:function(){this._pendingValue=null},componentWillReceiveProps:function(e){!this.props.multiple&&e.multiple?this.setState({value:[this.state.value]}):this.props.multiple&&!e.multiple&&this.setState({value:this.state.value[0]})},render:function(){var e=d({},this.props);return e.onChange=this._handleChange,e.value=null,f(e,this.props.children)},componentDidMount:function(){o(this,a.getValue(this))},componentDidUpdate:function(e){var t=a.getValue(this),n=!!e.multiple,r=!!this.props.multiple;(null!=t||n!==r)&&o(this,t)},_handleChange:function(e){var t,r=a.getOnChange(this);r&&(t=r.call(this,e));var o;if(this.props.multiple){o=[];for(var i=e.target.options,s=0,u=i.length;u>s;s++)i[s].selected&&o.push(i[s].value)}else o=e.target.value;return this._pendingValue=o,p.asap(n,this),t}});t.exports=h},{"./AutoFocusMixin":2,"./LinkedValueUtils":26,"./Object.assign":29,"./ReactBrowserComponentMixin":32,"./ReactCompositeComponent":40,"./ReactDOM":43,"./ReactElement":56,"./ReactUpdates":88}],52:[function(e,t){"use strict";function n(e,t,n,r){return e===n&&t===r}function r(e){var t=document.selection,n=t.createRange(),r=n.text.length,o=n.duplicate();o.moveToElementText(e),o.setEndPoint("EndToStart",n);var i=o.text.length,a=i+r;return{start:i,end:a}}function o(e){var t=window.getSelection&&window.getSelection();if(!t||0===t.rangeCount)return null;var r=t.anchorNode,o=t.anchorOffset,i=t.focusNode,a=t.focusOffset,s=t.getRangeAt(0),u=n(t.anchorNode,t.anchorOffset,t.focusNode,t.focusOffset),c=u?0:s.toString().length,l=s.cloneRange();l.selectNodeContents(e),l.setEnd(s.startContainer,s.startOffset);var p=n(l.startContainer,l.startOffset,l.endContainer,l.endOffset),d=p?0:l.toString().length,f=d+c,h=document.createRange();h.setStart(r,o),h.setEnd(i,a);var m=h.collapsed;return{start:m?f:d,end:m?d:f}}function i(e,t){var n,r,o=document.selection.createRange().duplicate();"undefined"==typeof t.end?(n=t.start,r=n):t.start>t.end?(n=t.end,r=t.start):(n=t.start,r=t.end),o.moveToElementText(e),o.moveStart("character",n),o.setEndPoint("EndToStart",o),o.moveEnd("character",r-n),o.select()}function a(e,t){if(window.getSelection){var n=window.getSelection(),r=e[c()].length,o=Math.min(t.start,r),i="undefined"==typeof t.end?o:Math.min(t.end,r);if(!n.extend&&o>i){var a=i;i=o,o=a}var s=u(e,o),l=u(e,i);if(s&&l){var p=document.createRange();p.setStart(s.node,s.offset),n.removeAllRanges(),o>i?(n.addRange(p),n.extend(l.node,l.offset)):(p.setEnd(l.node,l.offset),n.addRange(p))}}}var s=e("./ExecutionEnvironment"),u=e("./getNodeForCharacterOffset"),c=e("./getTextContentAccessor"),l=s.canUseDOM&&document.selection,p={getOffsets:l?r:o,setOffsets:l?i:a};t.exports=p},{"./ExecutionEnvironment":23,"./getNodeForCharacterOffset":130,"./getTextContentAccessor":132}],53:[function(e,t){"use strict";function n(){this.isMounted()&&this.forceUpdate()}var r=e("./AutoFocusMixin"),o=e("./DOMPropertyOperations"),i=e("./LinkedValueUtils"),a=e("./ReactBrowserComponentMixin"),s=e("./ReactCompositeComponent"),u=e("./ReactElement"),c=e("./ReactDOM"),l=e("./ReactUpdates"),p=e("./Object.assign"),d=e("./invariant"),f=(e("./warning"),u.createFactory(c.textarea.type)),h=s.createClass({displayName:"ReactDOMTextarea",mixins:[r,i.Mixin,a],getInitialState:function(){var e=this.props.defaultValue,t=this.props.children;null!=t&&(d(null==e),Array.isArray(t)&&(d(t.length<=1),t=t[0]),e=""+t),null==e&&(e="");var n=i.getValue(this);return{initialValue:""+(null!=n?n:e)}},render:function(){var e=p({},this.props);return d(null==e.dangerouslySetInnerHTML),e.defaultValue=null,e.value=null,e.onChange=this._handleChange,f(e,this.state.initialValue)},componentDidUpdate:function(){var e=i.getValue(this);if(null!=e){var t=this.getDOMNode();o.setValueForProperty(t,"value",""+e)}},_handleChange:function(e){var t,r=i.getOnChange(this);return r&&(t=r.call(this,e)),l.asap(n,this),t}});t.exports=h},{"./AutoFocusMixin":2,"./DOMPropertyOperations":13,"./LinkedValueUtils":26,"./Object.assign":29,"./ReactBrowserComponentMixin":32,"./ReactCompositeComponent":40,"./ReactDOM":43,"./ReactElement":56,"./ReactUpdates":88,"./invariant":137,"./warning":155}],54:[function(e,t){"use strict";function n(){this.reinitializeTransaction()}var r=e("./ReactUpdates"),o=e("./Transaction"),i=e("./Object.assign"),a=e("./emptyFunction"),s={initialize:a,close:function(){p.isBatchingUpdates=!1}},u={initialize:a,close:r.flushBatchedUpdates.bind(r)},c=[u,s];i(n.prototype,o.Mixin,{getTransactionWrappers:function(){return c}});var l=new n,p={isBatchingUpdates:!1,batchedUpdates:function(e,t,n){var r=p.isBatchingUpdates;p.isBatchingUpdates=!0,r?e(t,n):l.perform(e,null,t,n)}};t.exports=p},{"./Object.assign":29,"./ReactUpdates":88,"./Transaction":104,"./emptyFunction":118}],55:[function(e,t){"use strict";function n(){O.EventEmitter.injectReactEventListener(b),O.EventPluginHub.injectEventPluginOrder(s),O.EventPluginHub.injectInstanceHandle(D),O.EventPluginHub.injectMount(x),O.EventPluginHub.injectEventPluginsByName({SimpleEventPlugin:w,EnterLeaveEventPlugin:u,ChangeEventPlugin:o,CompositionEventPlugin:a,MobileSafariClickEventPlugin:p,SelectEventPlugin:P,BeforeInputEventPlugin:r}),O.NativeComponent.injectGenericComponentClass(m),O.NativeComponent.injectComponentClasses({button:v,form:y,img:g,input:E,option:C,select:R,textarea:M,html:S("html"),head:S("head"),body:S("body")}),O.CompositeComponent.injectMixin(d),O.DOMProperty.injectDOMPropertyConfig(l),O.DOMProperty.injectDOMPropertyConfig(_),O.EmptyComponent.injectEmptyComponent("noscript"),O.Updates.injectReconcileTransaction(f.ReactReconcileTransaction),O.Updates.injectBatchingStrategy(h),O.RootIndex.injectCreateReactRootIndex(c.canUseDOM?i.createReactRootIndex:T.createReactRootIndex),O.Component.injectEnvironment(f)}var r=e("./BeforeInputEventPlugin"),o=e("./ChangeEventPlugin"),i=e("./ClientReactRootIndex"),a=e("./CompositionEventPlugin"),s=e("./DefaultEventPluginOrder"),u=e("./EnterLeaveEventPlugin"),c=e("./ExecutionEnvironment"),l=e("./HTMLDOMPropertyConfig"),p=e("./MobileSafariClickEventPlugin"),d=e("./ReactBrowserComponentMixin"),f=e("./ReactComponentBrowserEnvironment"),h=e("./ReactDefaultBatchingStrategy"),m=e("./ReactDOMComponent"),v=e("./ReactDOMButton"),y=e("./ReactDOMForm"),g=e("./ReactDOMImg"),E=e("./ReactDOMInput"),C=e("./ReactDOMOption"),R=e("./ReactDOMSelect"),M=e("./ReactDOMTextarea"),b=e("./ReactEventListener"),O=e("./ReactInjection"),D=e("./ReactInstanceHandles"),x=e("./ReactMount"),P=e("./SelectEventPlugin"),T=e("./ServerReactRootIndex"),w=e("./SimpleEventPlugin"),_=e("./SVGDOMPropertyConfig"),S=e("./createFullPageComponent");t.exports={inject:n}},{"./BeforeInputEventPlugin":3,"./ChangeEventPlugin":8,"./ClientReactRootIndex":9,"./CompositionEventPlugin":10,"./DefaultEventPluginOrder":15,"./EnterLeaveEventPlugin":16,"./ExecutionEnvironment":23,"./HTMLDOMPropertyConfig":24,"./MobileSafariClickEventPlugin":28,"./ReactBrowserComponentMixin":32,"./ReactComponentBrowserEnvironment":38,"./ReactDOMButton":44,"./ReactDOMComponent":45,"./ReactDOMForm":46,"./ReactDOMImg":48,"./ReactDOMInput":49,"./ReactDOMOption":50,"./ReactDOMSelect":51,"./ReactDOMTextarea":53,"./ReactDefaultBatchingStrategy":54,"./ReactEventListener":61,"./ReactInjection":62,"./ReactInstanceHandles":64,"./ReactMount":68,"./SVGDOMPropertyConfig":89,"./SelectEventPlugin":90,"./ServerReactRootIndex":91,"./SimpleEventPlugin":92,"./createFullPageComponent":113}],56:[function(e,t){"use strict";var n=e("./ReactContext"),r=e("./ReactCurrentOwner"),o=(e("./warning"),{key:!0,ref:!0}),i=function(e,t,n,r,o,i){this.type=e,this.key=t,this.ref=n,this._owner=r,this._context=o,this.props=i};i.prototype={_isReactElement:!0},i.createElement=function(e,t,a){var s,u={},c=null,l=null;if(null!=t){l=void 0===t.ref?null:t.ref,c=null==t.key?null:""+t.key;for(s in t)t.hasOwnProperty(s)&&!o.hasOwnProperty(s)&&(u[s]=t[s])}var p=arguments.length-2;if(1===p)u.children=a;else if(p>1){for(var d=Array(p),f=0;p>f;f++)d[f]=arguments[f+2];u.children=d}if(e&&e.defaultProps){var h=e.defaultProps;for(s in h)"undefined"==typeof u[s]&&(u[s]=h[s])}return new i(e,c,l,r.current,n.current,u)},i.createFactory=function(e){var t=i.createElement.bind(null,e);return t.type=e,t},i.cloneAndReplaceProps=function(e,t){var n=new i(e.type,e.key,e.ref,e._owner,e._context,t);return n},i.isValidElement=function(e){var t=!(!e||!e._isReactElement);return t},t.exports=i},{"./ReactContext":41,"./ReactCurrentOwner":42,"./warning":155}],57:[function(e,t){"use strict";function n(){var e=p.current;return e&&e.constructor.displayName||void 0}function r(e,t){e._store.validated||null!=e.key||(e._store.validated=!0,i("react_key_warning",'Each child in an array should have a unique "key" prop.',e,t))}function o(e,t,n){v.test(e)&&i("react_numeric_key_warning","Child objects should have non-numeric keys so ordering is preserved.",t,n)}function i(e,t,r,o){var i=n(),a=o.displayName,s=i||a,u=f[e];if(!u.hasOwnProperty(s)){u[s]=!0,t+=i?" Check the render method of "+i+".":" Check the renderComponent call using <"+a+">.";var c=null;r._owner&&r._owner!==p.current&&(c=r._owner.constructor.displayName,t+=" It was passed a child from "+c+"."),t+=" See http://fb.me/react-warning-keys for more information.",d(e,{component:s,componentOwner:c}),console.warn(t)}}function a(){var e=n()||"";h.hasOwnProperty(e)||(h[e]=!0,d("react_object_map_children"))}function s(e,t){if(Array.isArray(e))for(var n=0;n<e.length;n++){var i=e[n];c.isValidElement(i)&&r(i,t)}else if(c.isValidElement(e))e._store.validated=!0;else if(e&&"object"==typeof e){a();for(var s in e)o(s,e[s],t)}}function u(e,t,n,r){for(var o in t)if(t.hasOwnProperty(o)){var i;try{i=t[o](n,o,e,r)}catch(a){i=a}i instanceof Error&&!(i.message in m)&&(m[i.message]=!0,d("react_failed_descriptor_type_check",{message:i.message}))}}var c=e("./ReactElement"),l=e("./ReactPropTypeLocations"),p=e("./ReactCurrentOwner"),d=e("./monitorCodeUse"),f=(e("./warning"),{react_key_warning:{},react_numeric_key_warning:{}}),h={},m={},v=/^\d+$/,y={createElement:function(e){var t=c.createElement.apply(this,arguments);if(null==t)return t;for(var n=2;n<arguments.length;n++)s(arguments[n],e);if(e){var r=e.displayName;e.propTypes&&u(r,e.propTypes,t.props,l.prop),e.contextTypes&&u(r,e.contextTypes,t._context,l.context)}return t},createFactory:function(e){var t=y.createElement.bind(null,e);return t.type=e,t}};t.exports=y},{"./ReactCurrentOwner":42,"./ReactElement":56,"./ReactPropTypeLocations":76,"./monitorCodeUse":147,"./warning":155}],58:[function(e,t){"use strict";function n(){return u(a),a()}function r(e){c[e]=!0}function o(e){delete c[e]}function i(e){return c[e]}var a,s=e("./ReactElement"),u=e("./invariant"),c={},l={injectEmptyComponent:function(e){a=s.createFactory(e)}},p={deregisterNullComponentID:o,getEmptyComponent:n,injection:l,isNullComponentID:i,registerNullComponentID:r};t.exports=p},{"./ReactElement":56,"./invariant":137}],59:[function(e,t){"use strict";var n={guard:function(e){return e}};t.exports=n},{}],60:[function(e,t){"use strict";function n(e){r.enqueueEvents(e),r.processEventQueue()}var r=e("./EventPluginHub"),o={handleTopLevel:function(e,t,o,i){var a=r.extractEvents(e,t,o,i);n(a)}};t.exports=o},{"./EventPluginHub":19}],61:[function(e,t){"use strict";function n(e){var t=l.getID(e),n=c.getReactRootIDFromNodeID(t),r=l.findReactContainerForID(n),o=l.getFirstReactDOM(r);return o}function r(e,t){this.topLevelType=e,this.nativeEvent=t,this.ancestors=[]}function o(e){for(var t=l.getFirstReactDOM(f(e.nativeEvent))||window,r=t;r;)e.ancestors.push(r),r=n(r);for(var o=0,i=e.ancestors.length;i>o;o++){t=e.ancestors[o];var a=l.getID(t)||"";m._handleTopLevel(e.topLevelType,t,a,e.nativeEvent)}}function i(e){var t=h(window);e(t)}var a=e("./EventListener"),s=e("./ExecutionEnvironment"),u=e("./PooledClass"),c=e("./ReactInstanceHandles"),l=e("./ReactMount"),p=e("./ReactUpdates"),d=e("./Object.assign"),f=e("./getEventTarget"),h=e("./getUnboundedScrollPosition");d(r.prototype,{destructor:function(){this.topLevelType=null,this.nativeEvent=null,this.ancestors.length=0}}),u.addPoolingTo(r,u.twoArgumentPooler);var m={_enabled:!0,_handleTopLevel:null,WINDOW_HANDLE:s.canUseDOM?window:null,setHandleTopLevel:function(e){m._handleTopLevel=e},setEnabled:function(e){m._enabled=!!e},isEnabled:function(){return m._enabled},trapBubbledEvent:function(e,t,n){var r=n;return r?a.listen(r,t,m.dispatchEvent.bind(null,e)):void 0},trapCapturedEvent:function(e,t,n){var r=n;return r?a.capture(r,t,m.dispatchEvent.bind(null,e)):void 0},monitorScrollValue:function(e){var t=i.bind(null,e);a.listen(window,"scroll",t),a.listen(window,"resize",t)},dispatchEvent:function(e,t){if(m._enabled){var n=r.getPooled(e,t);try{p.batchedUpdates(o,n)}finally{r.release(n)}}}};t.exports=m},{"./EventListener":18,"./ExecutionEnvironment":23,"./Object.assign":29,"./PooledClass":30,"./ReactInstanceHandles":64,"./ReactMount":68,"./ReactUpdates":88,"./getEventTarget":128,"./getUnboundedScrollPosition":133}],62:[function(e,t){"use strict";var n=e("./DOMProperty"),r=e("./EventPluginHub"),o=e("./ReactComponent"),i=e("./ReactCompositeComponent"),a=e("./ReactEmptyComponent"),s=e("./ReactBrowserEventEmitter"),u=e("./ReactNativeComponent"),c=e("./ReactPerf"),l=e("./ReactRootIndex"),p=e("./ReactUpdates"),d={Component:o.injection,CompositeComponent:i.injection,DOMProperty:n.injection,EmptyComponent:a.injection,EventPluginHub:r.injection,EventEmitter:s.injection,NativeComponent:u.injection,Perf:c.injection,RootIndex:l.injection,Updates:p.injection};t.exports=d},{"./DOMProperty":12,"./EventPluginHub":19,"./ReactBrowserEventEmitter":33,"./ReactComponent":37,"./ReactCompositeComponent":40,"./ReactEmptyComponent":58,"./ReactNativeComponent":71,"./ReactPerf":73,"./ReactRootIndex":80,"./ReactUpdates":88}],63:[function(e,t){"use strict";function n(e){return o(document.documentElement,e)}var r=e("./ReactDOMSelection"),o=e("./containsNode"),i=e("./focusNode"),a=e("./getActiveElement"),s={hasSelectionCapabilities:function(e){return e&&("INPUT"===e.nodeName&&"text"===e.type||"TEXTAREA"===e.nodeName||"true"===e.contentEditable)},getSelectionInformation:function(){var e=a();return{focusedElem:e,selectionRange:s.hasSelectionCapabilities(e)?s.getSelection(e):null}},restoreSelection:function(e){var t=a(),r=e.focusedElem,o=e.selectionRange;t!==r&&n(r)&&(s.hasSelectionCapabilities(r)&&s.setSelection(r,o),i(r))},getSelection:function(e){var t;if("selectionStart"in e)t={start:e.selectionStart,end:e.selectionEnd};else if(document.selection&&"INPUT"===e.nodeName){var n=document.selection.createRange();n.parentElement()===e&&(t={start:-n.moveStart("character",-e.value.length),end:-n.moveEnd("character",-e.value.length)})}else t=r.getOffsets(e);return t||{start:0,end:0}},setSelection:function(e,t){var n=t.start,o=t.end;if("undefined"==typeof o&&(o=n),"selectionStart"in e)e.selectionStart=n,e.selectionEnd=Math.min(o,e.value.length);else if(document.selection&&"INPUT"===e.nodeName){var i=e.createTextRange();i.collapse(!0),i.moveStart("character",n),i.moveEnd("character",o-n),i.select()}else r.setOffsets(e,t)}};t.exports=s},{"./ReactDOMSelection":52,"./containsNode":111,"./focusNode":122,"./getActiveElement":124}],64:[function(e,t){"use strict";function n(e){return d+e.toString(36)}function r(e,t){return e.charAt(t)===d||t===e.length}function o(e){return""===e||e.charAt(0)===d&&e.charAt(e.length-1)!==d}function i(e,t){return 0===t.indexOf(e)&&r(t,e.length)}function a(e){return e?e.substr(0,e.lastIndexOf(d)):""}function s(e,t){if(p(o(e)&&o(t)),p(i(e,t)),e===t)return e;for(var n=e.length+f,a=n;a<t.length&&!r(t,a);a++);return t.substr(0,a)}function u(e,t){var n=Math.min(e.length,t.length);if(0===n)return"";for(var i=0,a=0;n>=a;a++)if(r(e,a)&&r(t,a))i=a;else if(e.charAt(a)!==t.charAt(a))break;var s=e.substr(0,i);return p(o(s)),s}function c(e,t,n,r,o,u){e=e||"",t=t||"",p(e!==t);var c=i(t,e);p(c||i(e,t));for(var l=0,d=c?a:s,f=e;;f=d(f,t)){var m;if(o&&f===e||u&&f===t||(m=n(f,c,r)),m===!1||f===t)break;p(l++<h)}}var l=e("./ReactRootIndex"),p=e("./invariant"),d=".",f=d.length,h=100,m={createReactRootID:function(){return n(l.createReactRootIndex())},createReactID:function(e,t){return e+t},getReactRootIDFromNodeID:function(e){if(e&&e.charAt(0)===d&&e.length>1){var t=e.indexOf(d,1);return t>-1?e.substr(0,t):e}return null},traverseEnterLeave:function(e,t,n,r,o){var i=u(e,t);i!==e&&c(e,i,n,r,!1,!0),i!==t&&c(i,t,n,o,!0,!1)},traverseTwoPhase:function(e,t,n){e&&(c("",e,t,n,!0,!1),c(e,"",t,n,!1,!0))},traverseAncestors:function(e,t,n){c("",e,t,n,!0,!1)},_getFirstCommonAncestorID:u,_getNextDescendantID:s,isAncestorIDOf:i,SEPARATOR:d};t.exports=m},{"./ReactRootIndex":80,"./invariant":137}],65:[function(e,t){"use strict";function n(e,t){if("function"==typeof t)for(var n in t)if(t.hasOwnProperty(n)){var r=t[n];if("function"==typeof r){var o=r.bind(t);for(var i in r)r.hasOwnProperty(i)&&(o[i]=r[i]);e[n]=o}else e[n]=r}}var r=(e("./ReactCurrentOwner"),e("./invariant")),o=(e("./monitorCodeUse"),e("./warning"),{}),i={},a={};a.wrapCreateFactory=function(e){var t=function(t){return"function"!=typeof t?e(t):t.isReactNonLegacyFactory?e(t.type):t.isReactLegacyFactory?e(t.type):t};return t},a.wrapCreateElement=function(e){var t=function(t){if("function"!=typeof t)return e.apply(this,arguments);var n;return t.isReactNonLegacyFactory?(n=Array.prototype.slice.call(arguments,0),n[0]=t.type,e.apply(this,n)):t.isReactLegacyFactory?(t._isMockFunction&&(t.type._mockedReactClassConstructor=t),n=Array.prototype.slice.call(arguments,0),n[0]=t.type,e.apply(this,n)):t.apply(null,Array.prototype.slice.call(arguments,1))};return t},a.wrapFactory=function(e){r("function"==typeof e);var t=function(){return e.apply(this,arguments)};return n(t,e.type),t.isReactLegacyFactory=o,t.type=e.type,t},a.markNonLegacyFactory=function(e){return e.isReactNonLegacyFactory=i,e},a.isValidFactory=function(e){return"function"==typeof e&&e.isReactLegacyFactory===o},a.isValidClass=function(e){return a.isValidFactory(e)},a._isLegacyCallWarningEnabled=!0,t.exports=a},{"./ReactCurrentOwner":42,"./invariant":137,"./monitorCodeUse":147,"./warning":155}],66:[function(e,t){"use strict";function n(e,t){this.value=e,this.requestChange=t}function r(e){var t={value:"undefined"==typeof e?o.PropTypes.any.isRequired:e.isRequired,requestChange:o.PropTypes.func.isRequired};return o.PropTypes.shape(t)}var o=e("./React");n.PropTypes={link:r},t.exports=n},{"./React":31}],67:[function(e,t){"use strict";var n=e("./adler32"),r={CHECKSUM_ATTR_NAME:"data-react-checksum",addChecksumToMarkup:function(e){var t=n(e);return e.replace(">"," "+r.CHECKSUM_ATTR_NAME+'="'+t+'">')},canReuseMarkup:function(e,t){var o=t.getAttribute(r.CHECKSUM_ATTR_NAME);o=o&&parseInt(o,10);var i=n(e);return i===o}};t.exports=r},{"./adler32":107}],68:[function(e,t){"use strict";function n(e){var t=E(e);return t&&I.getID(t)}function r(e){var t=o(e);if(t)if(x.hasOwnProperty(t)){var n=x[t];n!==e&&(R(!s(n,t)),x[t]=e)}else x[t]=e;return t}function o(e){return e&&e.getAttribute&&e.getAttribute(D)||""}function i(e,t){var n=o(e);n!==t&&delete x[n],e.setAttribute(D,t),x[t]=e}function a(e){return x.hasOwnProperty(e)&&s(x[e],e)||(x[e]=I.findReactNodeByID(e)),x[e]}function s(e,t){if(e){R(o(e)===t);var n=I.findReactContainerForID(t);if(n&&y(n,e))return!0}return!1}function u(e){delete x[e]}function c(e){var t=x[e];return t&&s(t,e)?void(N=t):!1}function l(e){N=null,m.traverseAncestors(e,c);var t=N;return N=null,t}var p=e("./DOMProperty"),d=e("./ReactBrowserEventEmitter"),f=(e("./ReactCurrentOwner"),e("./ReactElement")),h=e("./ReactLegacyElement"),m=e("./ReactInstanceHandles"),v=e("./ReactPerf"),y=e("./containsNode"),g=e("./deprecated"),E=e("./getReactRootElementInContainer"),C=e("./instantiateReactComponent"),R=e("./invariant"),M=e("./shouldUpdateReactComponent"),b=(e("./warning"),h.wrapCreateElement(f.createElement)),O=m.SEPARATOR,D=p.ID_ATTRIBUTE_NAME,x={},P=1,T=9,w={},_={},S=[],N=null,I={_instancesByReactRootID:w,scrollMonitor:function(e,t){t()},_updateRootComponent:function(e,t,n,r){var o=t.props;return I.scrollMonitor(n,function(){e.replaceProps(o,r)}),e},_registerComponent:function(e,t){R(t&&(t.nodeType===P||t.nodeType===T)),d.ensureScrollValueMonitoring();var n=I.registerContainer(t);return w[n]=e,n},_renderNewRootComponent:v.measure("ReactMount","_renderNewRootComponent",function(e,t,n){var r=C(e,null),o=I._registerComponent(r,t);return r.mountComponentIntoNode(o,t,n),r}),render:function(e,t,r){R(f.isValidElement(e));var o=w[n(t)];if(o){var i=o._currentElement;if(M(i,e))return I._updateRootComponent(o,e,t,r);I.unmountComponentAtNode(t)}var a=E(t),s=a&&I.isRenderedByReact(a),u=s&&!o,c=I._renderNewRootComponent(e,t,u);return r&&r.call(c),c},constructAndRenderComponent:function(e,t,n){var r=b(e,t);return I.render(r,n)},constructAndRenderComponentByID:function(e,t,n){var r=document.getElementById(n);return R(r),I.constructAndRenderComponent(e,t,r)},registerContainer:function(e){var t=n(e);return t&&(t=m.getReactRootIDFromNodeID(t)),t||(t=m.createReactRootID()),_[t]=e,t},unmountComponentAtNode:function(e){var t=n(e),r=w[t];return r?(I.unmountComponentFromNode(r,e),delete w[t],delete _[t],!0):!1},unmountComponentFromNode:function(e,t){for(e.unmountComponent(),t.nodeType===T&&(t=t.documentElement);t.lastChild;)t.removeChild(t.lastChild)},findReactContainerForID:function(e){var t=m.getReactRootIDFromNodeID(e),n=_[t];return n},findReactNodeByID:function(e){var t=I.findReactContainerForID(e);return I.findComponentRoot(t,e)},isRenderedByReact:function(e){if(1!==e.nodeType)return!1;var t=I.getID(e);return t?t.charAt(0)===O:!1},getFirstReactDOM:function(e){for(var t=e;t&&t.parentNode!==t;){if(I.isRenderedByReact(t))return t;t=t.parentNode}return null},findComponentRoot:function(e,t){var n=S,r=0,o=l(t)||e;for(n[0]=o.firstChild,n.length=1;r<n.length;){for(var i,a=n[r++];a;){var s=I.getID(a);s?t===s?i=a:m.isAncestorIDOf(s,t)&&(n.length=r=0,n.push(a.firstChild)):n.push(a.firstChild),a=a.nextSibling}if(i)return n.length=0,i}n.length=0,R(!1)},getReactRootID:n,getID:r,setID:i,getNode:a,purgeID:u};I.renderComponent=g("ReactMount","renderComponent","render",this,I.render),t.exports=I},{"./DOMProperty":12,"./ReactBrowserEventEmitter":33,"./ReactCurrentOwner":42,"./ReactElement":56,"./ReactInstanceHandles":64,"./ReactLegacyElement":65,"./ReactPerf":73,"./containsNode":111,"./deprecated":117,"./getReactRootElementInContainer":131,"./instantiateReactComponent":136,"./invariant":137,"./shouldUpdateReactComponent":151,"./warning":155}],69:[function(e,t){"use strict";function n(e,t,n){h.push({parentID:e,parentNode:null,type:c.INSERT_MARKUP,markupIndex:m.push(t)-1,textContent:null,fromIndex:null,toIndex:n})}function r(e,t,n){h.push({parentID:e,parentNode:null,type:c.MOVE_EXISTING,markupIndex:null,textContent:null,fromIndex:t,toIndex:n})}function o(e,t){h.push({parentID:e,parentNode:null,type:c.REMOVE_NODE,markupIndex:null,textContent:null,fromIndex:t,toIndex:null})}function i(e,t){h.push({parentID:e,parentNode:null,type:c.TEXT_CONTENT,markupIndex:null,textContent:t,fromIndex:null,toIndex:null})}function a(){h.length&&(u.BackendIDOperations.dangerouslyProcessChildrenUpdates(h,m),s())}function s(){h.length=0,m.length=0}var u=e("./ReactComponent"),c=e("./ReactMultiChildUpdateTypes"),l=e("./flattenChildren"),p=e("./instantiateReactComponent"),d=e("./shouldUpdateReactComponent"),f=0,h=[],m=[],v={Mixin:{mountChildren:function(e,t){var n=l(e),r=[],o=0;this._renderedChildren=n;for(var i in n){var a=n[i];if(n.hasOwnProperty(i)){var s=p(a,null);n[i]=s;var u=this._rootNodeID+i,c=s.mountComponent(u,t,this._mountDepth+1);s._mountIndex=o,r.push(c),o++}}return r},updateTextContent:function(e){f++;var t=!0;try{var n=this._renderedChildren;for(var r in n)n.hasOwnProperty(r)&&this._unmountChildByName(n[r],r);this.setTextContent(e),t=!1}finally{f--,f||(t?s():a())}},updateChildren:function(e,t){f++;var n=!0;try{this._updateChildren(e,t),n=!1}finally{f--,f||(n?s():a())}},_updateChildren:function(e,t){var n=l(e),r=this._renderedChildren;if(n||r){var o,i=0,a=0;for(o in n)if(n.hasOwnProperty(o)){var s=r&&r[o],u=s&&s._currentElement,c=n[o];if(d(u,c))this.moveChild(s,a,i),i=Math.max(s._mountIndex,i),s.receiveComponent(c,t),s._mountIndex=a;else{s&&(i=Math.max(s._mountIndex,i),this._unmountChildByName(s,o));var f=p(c,null);this._mountChildByNameAtIndex(f,o,a,t)}a++}for(o in r)!r.hasOwnProperty(o)||n&&n[o]||this._unmountChildByName(r[o],o)}},unmountChildren:function(){var e=this._renderedChildren;for(var t in e){var n=e[t];n.unmountComponent&&n.unmountComponent()}this._renderedChildren=null},moveChild:function(e,t,n){e._mountIndex<n&&r(this._rootNodeID,e._mountIndex,t)},createChild:function(e,t){n(this._rootNodeID,t,e._mountIndex)},removeChild:function(e){o(this._rootNodeID,e._mountIndex)},setTextContent:function(e){i(this._rootNodeID,e)},_mountChildByNameAtIndex:function(e,t,n,r){var o=this._rootNodeID+t,i=e.mountComponent(o,r,this._mountDepth+1);e._mountIndex=n,this.createChild(e,i),this._renderedChildren=this._renderedChildren||{},this._renderedChildren[t]=e},_unmountChildByName:function(e,t){this.removeChild(e),e._mountIndex=null,e.unmountComponent(),delete this._renderedChildren[t]}}};t.exports=v},{"./ReactComponent":37,"./ReactMultiChildUpdateTypes":70,"./flattenChildren":121,"./instantiateReactComponent":136,"./shouldUpdateReactComponent":151}],70:[function(e,t){"use strict";var n=e("./keyMirror"),r=n({INSERT_MARKUP:null,MOVE_EXISTING:null,REMOVE_NODE:null,TEXT_CONTENT:null});t.exports=r},{"./keyMirror":143}],71:[function(e,t){"use strict";function n(e,t,n){var r=a[e];return null==r?(o(i),new i(e,t)):n===e?(o(i),new i(e,t)):new r.type(t)}var r=e("./Object.assign"),o=e("./invariant"),i=null,a={},s={injectGenericComponentClass:function(e){i=e},injectComponentClasses:function(e){r(a,e)}},u={createInstanceForTag:n,injection:s};t.exports=u},{"./Object.assign":29,"./invariant":137}],72:[function(e,t){"use strict";var n=e("./emptyObject"),r=e("./invariant"),o={isValidOwner:function(e){return!(!e||"function"!=typeof e.attachRef||"function"!=typeof e.detachRef)},addComponentAsRefTo:function(e,t,n){r(o.isValidOwner(n)),n.attachRef(t,e)},removeComponentAsRefFrom:function(e,t,n){r(o.isValidOwner(n)),n.refs[t]===e&&n.detachRef(t)},Mixin:{construct:function(){this.refs=n},attachRef:function(e,t){r(t.isOwnedBy(this));var o=this.refs===n?this.refs={}:this.refs;o[e]=t},detachRef:function(e){delete this.refs[e]}}};t.exports=o},{"./emptyObject":119,"./invariant":137}],73:[function(e,t){"use strict";function n(e,t,n){return n}var r={enableMeasure:!1,storedMeasure:n,measure:function(e,t,n){return n},injection:{injectMeasure:function(e){r.storedMeasure=e}}};t.exports=r},{}],74:[function(e,t){"use strict";function n(e){return function(t,n,r){t[n]=t.hasOwnProperty(n)?e(t[n],r):r}}function r(e,t){for(var n in t)if(t.hasOwnProperty(n)){var r=c[n];r&&c.hasOwnProperty(n)?r(e,n,t[n]):e.hasOwnProperty(n)||(e[n]=t[n])}return e}var o=e("./Object.assign"),i=e("./emptyFunction"),a=e("./invariant"),s=e("./joinClasses"),u=(e("./warning"),n(function(e,t){return o({},t,e)})),c={children:i,className:n(s),style:u},l={TransferStrategies:c,mergeProps:function(e,t){return r(o({},e),t)},Mixin:{transferPropsTo:function(e){return a(e._owner===this),r(e.props,this.props),e}}};t.exports=l},{"./Object.assign":29,"./emptyFunction":118,"./invariant":137,"./joinClasses":142,"./warning":155}],75:[function(e,t){"use strict";var n={};t.exports=n},{}],76:[function(e,t){"use strict";var n=e("./keyMirror"),r=n({prop:null,context:null,childContext:null});t.exports=r},{"./keyMirror":143}],77:[function(e,t){"use strict";function n(e){function t(t,n,r,o,i){if(o=o||C,null!=n[r])return e(n,r,o,i);var a=y[i];return t?new Error("Required "+a+" `"+r+"` was not specified in "+("`"+o+"`.")):void 0}var n=t.bind(null,!1);return n.isRequired=t.bind(null,!0),n}function r(e){function t(t,n,r,o){var i=t[n],a=h(i);if(a!==e){var s=y[o],u=m(i);return new Error("Invalid "+s+" `"+n+"` of type `"+u+"` "+("supplied to `"+r+"`, expected `"+e+"`."))}}return n(t)}function o(){return n(E.thatReturns())}function i(e){function t(t,n,r,o){var i=t[n];if(!Array.isArray(i)){var a=y[o],s=h(i);return new Error("Invalid "+a+" `"+n+"` of type "+("`"+s+"` supplied to `"+r+"`, expected an array."))}for(var u=0;u<i.length;u++){var c=e(i,u,r,o);if(c instanceof Error)return c}}return n(t)}function a(){function e(e,t,n,r){if(!v.isValidElement(e[t])){var o=y[r];return new Error("Invalid "+o+" `"+t+"` supplied to "+("`"+n+"`, expected a ReactElement."))}}return n(e)}function s(e){function t(t,n,r,o){if(!(t[n]instanceof e)){var i=y[o],a=e.name||C;return new Error("Invalid "+i+" `"+n+"` supplied to "+("`"+r+"`, expected instance of `"+a+"`."))}}return n(t)}function u(e){function t(t,n,r,o){for(var i=t[n],a=0;a<e.length;a++)if(i===e[a])return;var s=y[o],u=JSON.stringify(e);return new Error("Invalid "+s+" `"+n+"` of value `"+i+"` "+("supplied to `"+r+"`, expected one of "+u+"."))}return n(t)}function c(e){function t(t,n,r,o){var i=t[n],a=h(i);
if("object"!==a){var s=y[o];return new Error("Invalid "+s+" `"+n+"` of type "+("`"+a+"` supplied to `"+r+"`, expected an object."))}for(var u in i)if(i.hasOwnProperty(u)){var c=e(i,u,r,o);if(c instanceof Error)return c}}return n(t)}function l(e){function t(t,n,r,o){for(var i=0;i<e.length;i++){var a=e[i];if(null==a(t,n,r,o))return}var s=y[o];return new Error("Invalid "+s+" `"+n+"` supplied to "+("`"+r+"`."))}return n(t)}function p(){function e(e,t,n,r){if(!f(e[t])){var o=y[r];return new Error("Invalid "+o+" `"+t+"` supplied to "+("`"+n+"`, expected a ReactNode."))}}return n(e)}function d(e){function t(t,n,r,o){var i=t[n],a=h(i);if("object"!==a){var s=y[o];return new Error("Invalid "+s+" `"+n+"` of type `"+a+"` "+("supplied to `"+r+"`, expected `object`."))}for(var u in e){var c=e[u];if(c){var l=c(i,u,r,o);if(l)return l}}}return n(t,"expected `object`")}function f(e){switch(typeof e){case"number":case"string":return!0;case"boolean":return!e;case"object":if(Array.isArray(e))return e.every(f);if(v.isValidElement(e))return!0;for(var t in e)if(!f(e[t]))return!1;return!0;default:return!1}}function h(e){var t=typeof e;return Array.isArray(e)?"array":e instanceof RegExp?"object":t}function m(e){var t=h(e);if("object"===t){if(e instanceof Date)return"date";if(e instanceof RegExp)return"regexp"}return t}var v=e("./ReactElement"),y=e("./ReactPropTypeLocationNames"),g=e("./deprecated"),E=e("./emptyFunction"),C="<<anonymous>>",R=a(),M=p(),b={array:r("array"),bool:r("boolean"),func:r("function"),number:r("number"),object:r("object"),string:r("string"),any:o(),arrayOf:i,element:R,instanceOf:s,node:M,objectOf:c,oneOf:u,oneOfType:l,shape:d,component:g("React.PropTypes","component","element",this,R),renderable:g("React.PropTypes","renderable","node",this,M)};t.exports=b},{"./ReactElement":56,"./ReactPropTypeLocationNames":75,"./deprecated":117,"./emptyFunction":118}],78:[function(e,t){"use strict";function n(){this.listenersToPut=[]}var r=e("./PooledClass"),o=e("./ReactBrowserEventEmitter"),i=e("./Object.assign");i(n.prototype,{enqueuePutListener:function(e,t,n){this.listenersToPut.push({rootNodeID:e,propKey:t,propValue:n})},putListeners:function(){for(var e=0;e<this.listenersToPut.length;e++){var t=this.listenersToPut[e];o.putListener(t.rootNodeID,t.propKey,t.propValue)}},reset:function(){this.listenersToPut.length=0},destructor:function(){this.reset()}}),r.addPoolingTo(n),t.exports=n},{"./Object.assign":29,"./PooledClass":30,"./ReactBrowserEventEmitter":33}],79:[function(e,t){"use strict";function n(){this.reinitializeTransaction(),this.renderToStaticMarkup=!1,this.reactMountReady=r.getPooled(null),this.putListenerQueue=s.getPooled()}var r=e("./CallbackQueue"),o=e("./PooledClass"),i=e("./ReactBrowserEventEmitter"),a=e("./ReactInputSelection"),s=e("./ReactPutListenerQueue"),u=e("./Transaction"),c=e("./Object.assign"),l={initialize:a.getSelectionInformation,close:a.restoreSelection},p={initialize:function(){var e=i.isEnabled();return i.setEnabled(!1),e},close:function(e){i.setEnabled(e)}},d={initialize:function(){this.reactMountReady.reset()},close:function(){this.reactMountReady.notifyAll()}},f={initialize:function(){this.putListenerQueue.reset()},close:function(){this.putListenerQueue.putListeners()}},h=[f,l,p,d],m={getTransactionWrappers:function(){return h},getReactMountReady:function(){return this.reactMountReady},getPutListenerQueue:function(){return this.putListenerQueue},destructor:function(){r.release(this.reactMountReady),this.reactMountReady=null,s.release(this.putListenerQueue),this.putListenerQueue=null}};c(n.prototype,u.Mixin,m),o.addPoolingTo(n),t.exports=n},{"./CallbackQueue":7,"./Object.assign":29,"./PooledClass":30,"./ReactBrowserEventEmitter":33,"./ReactInputSelection":63,"./ReactPutListenerQueue":78,"./Transaction":104}],80:[function(e,t){"use strict";var n={injectCreateReactRootIndex:function(e){r.createReactRootIndex=e}},r={createReactRootIndex:null,injection:n};t.exports=r},{}],81:[function(e,t){"use strict";function n(e){c(o.isValidElement(e));var t;try{var n=i.createReactRootID();return t=s.getPooled(!1),t.perform(function(){var r=u(e,null),o=r.mountComponent(n,t,0);return a.addChecksumToMarkup(o)},null)}finally{s.release(t)}}function r(e){c(o.isValidElement(e));var t;try{var n=i.createReactRootID();return t=s.getPooled(!0),t.perform(function(){var r=u(e,null);return r.mountComponent(n,t,0)},null)}finally{s.release(t)}}var o=e("./ReactElement"),i=e("./ReactInstanceHandles"),a=e("./ReactMarkupChecksum"),s=e("./ReactServerRenderingTransaction"),u=e("./instantiateReactComponent"),c=e("./invariant");t.exports={renderToString:n,renderToStaticMarkup:r}},{"./ReactElement":56,"./ReactInstanceHandles":64,"./ReactMarkupChecksum":67,"./ReactServerRenderingTransaction":82,"./instantiateReactComponent":136,"./invariant":137}],82:[function(e,t){"use strict";function n(e){this.reinitializeTransaction(),this.renderToStaticMarkup=e,this.reactMountReady=o.getPooled(null),this.putListenerQueue=i.getPooled()}var r=e("./PooledClass"),o=e("./CallbackQueue"),i=e("./ReactPutListenerQueue"),a=e("./Transaction"),s=e("./Object.assign"),u=e("./emptyFunction"),c={initialize:function(){this.reactMountReady.reset()},close:u},l={initialize:function(){this.putListenerQueue.reset()},close:u},p=[l,c],d={getTransactionWrappers:function(){return p},getReactMountReady:function(){return this.reactMountReady},getPutListenerQueue:function(){return this.putListenerQueue},destructor:function(){o.release(this.reactMountReady),this.reactMountReady=null,i.release(this.putListenerQueue),this.putListenerQueue=null}};s(n.prototype,a.Mixin,d),r.addPoolingTo(n),t.exports=n},{"./CallbackQueue":7,"./Object.assign":29,"./PooledClass":30,"./ReactPutListenerQueue":78,"./Transaction":104,"./emptyFunction":118}],83:[function(e,t){"use strict";function n(e,t){var n={};return function(r){n[t]=r,e.setState(n)}}var r={createStateSetter:function(e,t){return function(n,r,o,i,a,s){var u=t.call(e,n,r,o,i,a,s);u&&e.setState(u)}},createStateKeySetter:function(e,t){var r=e.__keySetters||(e.__keySetters={});return r[t]||(r[t]=n(e,t))}};r.Mixin={createStateSetter:function(e){return r.createStateSetter(this,e)},createStateKeySetter:function(e){return r.createStateKeySetter(this,e)}},t.exports=r},{}],84:[function(e,t){"use strict";var n=e("./DOMPropertyOperations"),r=e("./ReactComponent"),o=e("./ReactElement"),i=e("./Object.assign"),a=e("./escapeTextForBrowser"),s=function(){};i(s.prototype,r.Mixin,{mountComponent:function(e,t,o){r.Mixin.mountComponent.call(this,e,t,o);var i=a(this.props);return t.renderToStaticMarkup?i:"<span "+n.createMarkupForID(e)+">"+i+"</span>"},receiveComponent:function(e){var t=e.props;t!==this.props&&(this.props=t,r.BackendIDOperations.updateTextContentByID(this._rootNodeID,t))}});var u=function(e){return new o(s,null,null,null,null,e)};u.type=s,t.exports=u},{"./DOMPropertyOperations":13,"./Object.assign":29,"./ReactComponent":37,"./ReactElement":56,"./escapeTextForBrowser":120}],85:[function(e,t){"use strict";var n=e("./ReactChildren"),r={getChildMapping:function(e){return n.map(e,function(e){return e})},mergeChildMappings:function(e,t){function n(n){return t.hasOwnProperty(n)?t[n]:e[n]}e=e||{},t=t||{};var r={},o=[];for(var i in e)t.hasOwnProperty(i)?o.length&&(r[i]=o,o=[]):o.push(i);var a,s={};for(var u in t){if(r.hasOwnProperty(u))for(a=0;a<r[u].length;a++){var c=r[u][a];s[r[u][a]]=n(c)}s[u]=n(u)}for(a=0;a<o.length;a++)s[o[a]]=n(o[a]);return s}};t.exports=r},{"./ReactChildren":36}],86:[function(e,t){"use strict";function n(){var e=document.createElement("div"),t=e.style;"AnimationEvent"in window||delete a.animationend.animation,"TransitionEvent"in window||delete a.transitionend.transition;for(var n in a){var r=a[n];for(var o in r)if(o in t){s.push(r[o]);break}}}function r(e,t,n){e.addEventListener(t,n,!1)}function o(e,t,n){e.removeEventListener(t,n,!1)}var i=e("./ExecutionEnvironment"),a={transitionend:{transition:"transitionend",WebkitTransition:"webkitTransitionEnd",MozTransition:"mozTransitionEnd",OTransition:"oTransitionEnd",msTransition:"MSTransitionEnd"},animationend:{animation:"animationend",WebkitAnimation:"webkitAnimationEnd",MozAnimation:"mozAnimationEnd",OAnimation:"oAnimationEnd",msAnimation:"MSAnimationEnd"}},s=[];i.canUseDOM&&n();var u={addEndEventListener:function(e,t){return 0===s.length?void window.setTimeout(t,0):void s.forEach(function(n){r(e,n,t)})},removeEndEventListener:function(e,t){0!==s.length&&s.forEach(function(n){o(e,n,t)})}};t.exports=u},{"./ExecutionEnvironment":23}],87:[function(e,t){"use strict";var n=e("./React"),r=e("./ReactTransitionChildMapping"),o=e("./Object.assign"),i=e("./cloneWithProps"),a=e("./emptyFunction"),s=n.createClass({displayName:"ReactTransitionGroup",propTypes:{component:n.PropTypes.any,childFactory:n.PropTypes.func},getDefaultProps:function(){return{component:"span",childFactory:a.thatReturnsArgument}},getInitialState:function(){return{children:r.getChildMapping(this.props.children)}},componentWillReceiveProps:function(e){var t=r.getChildMapping(e.children),n=this.state.children;this.setState({children:r.mergeChildMappings(n,t)});var o;for(o in t){var i=n&&n.hasOwnProperty(o);!t[o]||i||this.currentlyTransitioningKeys[o]||this.keysToEnter.push(o)}for(o in n){var a=t&&t.hasOwnProperty(o);!n[o]||a||this.currentlyTransitioningKeys[o]||this.keysToLeave.push(o)}},componentWillMount:function(){this.currentlyTransitioningKeys={},this.keysToEnter=[],this.keysToLeave=[]},componentDidUpdate:function(){var e=this.keysToEnter;this.keysToEnter=[],e.forEach(this.performEnter);var t=this.keysToLeave;this.keysToLeave=[],t.forEach(this.performLeave)},performEnter:function(e){this.currentlyTransitioningKeys[e]=!0;var t=this.refs[e];t.componentWillEnter?t.componentWillEnter(this._handleDoneEntering.bind(this,e)):this._handleDoneEntering(e)},_handleDoneEntering:function(e){var t=this.refs[e];t.componentDidEnter&&t.componentDidEnter(),delete this.currentlyTransitioningKeys[e];var n=r.getChildMapping(this.props.children);n&&n.hasOwnProperty(e)||this.performLeave(e)},performLeave:function(e){this.currentlyTransitioningKeys[e]=!0;var t=this.refs[e];t.componentWillLeave?t.componentWillLeave(this._handleDoneLeaving.bind(this,e)):this._handleDoneLeaving(e)},_handleDoneLeaving:function(e){var t=this.refs[e];t.componentDidLeave&&t.componentDidLeave(),delete this.currentlyTransitioningKeys[e];var n=r.getChildMapping(this.props.children);if(n&&n.hasOwnProperty(e))this.performEnter(e);else{var i=o({},this.state.children);delete i[e],this.setState({children:i})}},render:function(){var e={};for(var t in this.state.children){var r=this.state.children[t];r&&(e[t]=i(this.props.childFactory(r),{ref:t}))}return n.createElement(this.props.component,this.props,e)}});t.exports=s},{"./Object.assign":29,"./React":31,"./ReactTransitionChildMapping":85,"./cloneWithProps":110,"./emptyFunction":118}],88:[function(e,t){"use strict";function n(){h(O.ReactReconcileTransaction&&g)}function r(){this.reinitializeTransaction(),this.dirtyComponentsLength=null,this.callbackQueue=c.getPooled(),this.reconcileTransaction=O.ReactReconcileTransaction.getPooled()}function o(e,t,r){n(),g.batchedUpdates(e,t,r)}function i(e,t){return e._mountDepth-t._mountDepth}function a(e){var t=e.dirtyComponentsLength;h(t===m.length),m.sort(i);for(var n=0;t>n;n++){var r=m[n];if(r.isMounted()){var o=r._pendingCallbacks;if(r._pendingCallbacks=null,r.performUpdateIfNecessary(e.reconcileTransaction),o)for(var a=0;a<o.length;a++)e.callbackQueue.enqueue(o[a],r)}}}function s(e,t){return h(!t||"function"==typeof t),n(),g.isBatchingUpdates?(m.push(e),void(t&&(e._pendingCallbacks?e._pendingCallbacks.push(t):e._pendingCallbacks=[t]))):void g.batchedUpdates(s,e,t)}function u(e,t){h(g.isBatchingUpdates),v.enqueue(e,t),y=!0}var c=e("./CallbackQueue"),l=e("./PooledClass"),p=(e("./ReactCurrentOwner"),e("./ReactPerf")),d=e("./Transaction"),f=e("./Object.assign"),h=e("./invariant"),m=(e("./warning"),[]),v=c.getPooled(),y=!1,g=null,E={initialize:function(){this.dirtyComponentsLength=m.length},close:function(){this.dirtyComponentsLength!==m.length?(m.splice(0,this.dirtyComponentsLength),M()):m.length=0}},C={initialize:function(){this.callbackQueue.reset()},close:function(){this.callbackQueue.notifyAll()}},R=[E,C];f(r.prototype,d.Mixin,{getTransactionWrappers:function(){return R},destructor:function(){this.dirtyComponentsLength=null,c.release(this.callbackQueue),this.callbackQueue=null,O.ReactReconcileTransaction.release(this.reconcileTransaction),this.reconcileTransaction=null},perform:function(e,t,n){return d.Mixin.perform.call(this,this.reconcileTransaction.perform,this.reconcileTransaction,e,t,n)}}),l.addPoolingTo(r);var M=p.measure("ReactUpdates","flushBatchedUpdates",function(){for(;m.length||y;){if(m.length){var e=r.getPooled();e.perform(a,null,e),r.release(e)}if(y){y=!1;var t=v;v=c.getPooled(),t.notifyAll(),c.release(t)}}}),b={injectReconcileTransaction:function(e){h(e),O.ReactReconcileTransaction=e},injectBatchingStrategy:function(e){h(e),h("function"==typeof e.batchedUpdates),h("boolean"==typeof e.isBatchingUpdates),g=e}},O={ReactReconcileTransaction:null,batchedUpdates:o,enqueueUpdate:s,flushBatchedUpdates:M,injection:b,asap:u};t.exports=O},{"./CallbackQueue":7,"./Object.assign":29,"./PooledClass":30,"./ReactCurrentOwner":42,"./ReactPerf":73,"./Transaction":104,"./invariant":137,"./warning":155}],89:[function(e,t){"use strict";var n=e("./DOMProperty"),r=n.injection.MUST_USE_ATTRIBUTE,o={Properties:{cx:r,cy:r,d:r,dx:r,dy:r,fill:r,fillOpacity:r,fontFamily:r,fontSize:r,fx:r,fy:r,gradientTransform:r,gradientUnits:r,markerEnd:r,markerMid:r,markerStart:r,offset:r,opacity:r,patternContentUnits:r,patternUnits:r,points:r,preserveAspectRatio:r,r:r,rx:r,ry:r,spreadMethod:r,stopColor:r,stopOpacity:r,stroke:r,strokeDasharray:r,strokeLinecap:r,strokeOpacity:r,strokeWidth:r,textAnchor:r,transform:r,version:r,viewBox:r,x1:r,x2:r,x:r,y1:r,y2:r,y:r},DOMAttributeNames:{fillOpacity:"fill-opacity",fontFamily:"font-family",fontSize:"font-size",gradientTransform:"gradientTransform",gradientUnits:"gradientUnits",markerEnd:"marker-end",markerMid:"marker-mid",markerStart:"marker-start",patternContentUnits:"patternContentUnits",patternUnits:"patternUnits",preserveAspectRatio:"preserveAspectRatio",spreadMethod:"spreadMethod",stopColor:"stop-color",stopOpacity:"stop-opacity",strokeDasharray:"stroke-dasharray",strokeLinecap:"stroke-linecap",strokeOpacity:"stroke-opacity",strokeWidth:"stroke-width",textAnchor:"text-anchor",viewBox:"viewBox"}};t.exports=o},{"./DOMProperty":12}],90:[function(e,t){"use strict";function n(e){if("selectionStart"in e&&a.hasSelectionCapabilities(e))return{start:e.selectionStart,end:e.selectionEnd};if(window.getSelection){var t=window.getSelection();return{anchorNode:t.anchorNode,anchorOffset:t.anchorOffset,focusNode:t.focusNode,focusOffset:t.focusOffset}}if(document.selection){var n=document.selection.createRange();return{parentElement:n.parentElement(),text:n.text,top:n.boundingTop,left:n.boundingLeft}}}function r(e){if(!y&&null!=h&&h==u()){var t=n(h);if(!v||!p(v,t)){v=t;var r=s.getPooled(f.select,m,e);return r.type="select",r.target=h,i.accumulateTwoPhaseDispatches(r),r}}}var o=e("./EventConstants"),i=e("./EventPropagators"),a=e("./ReactInputSelection"),s=e("./SyntheticEvent"),u=e("./getActiveElement"),c=e("./isTextInputElement"),l=e("./keyOf"),p=e("./shallowEqual"),d=o.topLevelTypes,f={select:{phasedRegistrationNames:{bubbled:l({onSelect:null}),captured:l({onSelectCapture:null})},dependencies:[d.topBlur,d.topContextMenu,d.topFocus,d.topKeyDown,d.topMouseDown,d.topMouseUp,d.topSelectionChange]}},h=null,m=null,v=null,y=!1,g={eventTypes:f,extractEvents:function(e,t,n,o){switch(e){case d.topFocus:(c(t)||"true"===t.contentEditable)&&(h=t,m=n,v=null);break;case d.topBlur:h=null,m=null,v=null;break;case d.topMouseDown:y=!0;break;case d.topContextMenu:case d.topMouseUp:return y=!1,r(o);case d.topSelectionChange:case d.topKeyDown:case d.topKeyUp:return r(o)}}};t.exports=g},{"./EventConstants":17,"./EventPropagators":22,"./ReactInputSelection":63,"./SyntheticEvent":96,"./getActiveElement":124,"./isTextInputElement":140,"./keyOf":144,"./shallowEqual":150}],91:[function(e,t){"use strict";var n=Math.pow(2,53),r={createReactRootIndex:function(){return Math.ceil(Math.random()*n)}};t.exports=r},{}],92:[function(e,t){"use strict";var n=e("./EventConstants"),r=e("./EventPluginUtils"),o=e("./EventPropagators"),i=e("./SyntheticClipboardEvent"),a=e("./SyntheticEvent"),s=e("./SyntheticFocusEvent"),u=e("./SyntheticKeyboardEvent"),c=e("./SyntheticMouseEvent"),l=e("./SyntheticDragEvent"),p=e("./SyntheticTouchEvent"),d=e("./SyntheticUIEvent"),f=e("./SyntheticWheelEvent"),h=e("./getEventCharCode"),m=e("./invariant"),v=e("./keyOf"),y=(e("./warning"),n.topLevelTypes),g={blur:{phasedRegistrationNames:{bubbled:v({onBlur:!0}),captured:v({onBlurCapture:!0})}},click:{phasedRegistrationNames:{bubbled:v({onClick:!0}),captured:v({onClickCapture:!0})}},contextMenu:{phasedRegistrationNames:{bubbled:v({onContextMenu:!0}),captured:v({onContextMenuCapture:!0})}},copy:{phasedRegistrationNames:{bubbled:v({onCopy:!0}),captured:v({onCopyCapture:!0})}},cut:{phasedRegistrationNames:{bubbled:v({onCut:!0}),captured:v({onCutCapture:!0})}},doubleClick:{phasedRegistrationNames:{bubbled:v({onDoubleClick:!0}),captured:v({onDoubleClickCapture:!0})}},drag:{phasedRegistrationNames:{bubbled:v({onDrag:!0}),captured:v({onDragCapture:!0})}},dragEnd:{phasedRegistrationNames:{bubbled:v({onDragEnd:!0}),captured:v({onDragEndCapture:!0})}},dragEnter:{phasedRegistrationNames:{bubbled:v({onDragEnter:!0}),captured:v({onDragEnterCapture:!0})}},dragExit:{phasedRegistrationNames:{bubbled:v({onDragExit:!0}),captured:v({onDragExitCapture:!0})}},dragLeave:{phasedRegistrationNames:{bubbled:v({onDragLeave:!0}),captured:v({onDragLeaveCapture:!0})}},dragOver:{phasedRegistrationNames:{bubbled:v({onDragOver:!0}),captured:v({onDragOverCapture:!0})}},dragStart:{phasedRegistrationNames:{bubbled:v({onDragStart:!0}),captured:v({onDragStartCapture:!0})}},drop:{phasedRegistrationNames:{bubbled:v({onDrop:!0}),captured:v({onDropCapture:!0})}},focus:{phasedRegistrationNames:{bubbled:v({onFocus:!0}),captured:v({onFocusCapture:!0})}},input:{phasedRegistrationNames:{bubbled:v({onInput:!0}),captured:v({onInputCapture:!0})}},keyDown:{phasedRegistrationNames:{bubbled:v({onKeyDown:!0}),captured:v({onKeyDownCapture:!0})}},keyPress:{phasedRegistrationNames:{bubbled:v({onKeyPress:!0}),captured:v({onKeyPressCapture:!0})}},keyUp:{phasedRegistrationNames:{bubbled:v({onKeyUp:!0}),captured:v({onKeyUpCapture:!0})}},load:{phasedRegistrationNames:{bubbled:v({onLoad:!0}),captured:v({onLoadCapture:!0})}},error:{phasedRegistrationNames:{bubbled:v({onError:!0}),captured:v({onErrorCapture:!0})}},mouseDown:{phasedRegistrationNames:{bubbled:v({onMouseDown:!0}),captured:v({onMouseDownCapture:!0})}},mouseMove:{phasedRegistrationNames:{bubbled:v({onMouseMove:!0}),captured:v({onMouseMoveCapture:!0})}},mouseOut:{phasedRegistrationNames:{bubbled:v({onMouseOut:!0}),captured:v({onMouseOutCapture:!0})}},mouseOver:{phasedRegistrationNames:{bubbled:v({onMouseOver:!0}),captured:v({onMouseOverCapture:!0})}},mouseUp:{phasedRegistrationNames:{bubbled:v({onMouseUp:!0}),captured:v({onMouseUpCapture:!0})}},paste:{phasedRegistrationNames:{bubbled:v({onPaste:!0}),captured:v({onPasteCapture:!0})}},reset:{phasedRegistrationNames:{bubbled:v({onReset:!0}),captured:v({onResetCapture:!0})}},scroll:{phasedRegistrationNames:{bubbled:v({onScroll:!0}),captured:v({onScrollCapture:!0})}},submit:{phasedRegistrationNames:{bubbled:v({onSubmit:!0}),captured:v({onSubmitCapture:!0})}},touchCancel:{phasedRegistrationNames:{bubbled:v({onTouchCancel:!0}),captured:v({onTouchCancelCapture:!0})}},touchEnd:{phasedRegistrationNames:{bubbled:v({onTouchEnd:!0}),captured:v({onTouchEndCapture:!0})}},touchMove:{phasedRegistrationNames:{bubbled:v({onTouchMove:!0}),captured:v({onTouchMoveCapture:!0})}},touchStart:{phasedRegistrationNames:{bubbled:v({onTouchStart:!0}),captured:v({onTouchStartCapture:!0})}},wheel:{phasedRegistrationNames:{bubbled:v({onWheel:!0}),captured:v({onWheelCapture:!0})}}},E={topBlur:g.blur,topClick:g.click,topContextMenu:g.contextMenu,topCopy:g.copy,topCut:g.cut,topDoubleClick:g.doubleClick,topDrag:g.drag,topDragEnd:g.dragEnd,topDragEnter:g.dragEnter,topDragExit:g.dragExit,topDragLeave:g.dragLeave,topDragOver:g.dragOver,topDragStart:g.dragStart,topDrop:g.drop,topError:g.error,topFocus:g.focus,topInput:g.input,topKeyDown:g.keyDown,topKeyPress:g.keyPress,topKeyUp:g.keyUp,topLoad:g.load,topMouseDown:g.mouseDown,topMouseMove:g.mouseMove,topMouseOut:g.mouseOut,topMouseOver:g.mouseOver,topMouseUp:g.mouseUp,topPaste:g.paste,topReset:g.reset,topScroll:g.scroll,topSubmit:g.submit,topTouchCancel:g.touchCancel,topTouchEnd:g.touchEnd,topTouchMove:g.touchMove,topTouchStart:g.touchStart,topWheel:g.wheel};for(var C in E)E[C].dependencies=[C];var R={eventTypes:g,executeDispatch:function(e,t,n){var o=r.executeDispatch(e,t,n);o===!1&&(e.stopPropagation(),e.preventDefault())},extractEvents:function(e,t,n,r){var v=E[e];if(!v)return null;var g;switch(e){case y.topInput:case y.topLoad:case y.topError:case y.topReset:case y.topSubmit:g=a;break;case y.topKeyPress:if(0===h(r))return null;case y.topKeyDown:case y.topKeyUp:g=u;break;case y.topBlur:case y.topFocus:g=s;break;case y.topClick:if(2===r.button)return null;case y.topContextMenu:case y.topDoubleClick:case y.topMouseDown:case y.topMouseMove:case y.topMouseOut:case y.topMouseOver:case y.topMouseUp:g=c;break;case y.topDrag:case y.topDragEnd:case y.topDragEnter:case y.topDragExit:case y.topDragLeave:case y.topDragOver:case y.topDragStart:case y.topDrop:g=l;break;case y.topTouchCancel:case y.topTouchEnd:case y.topTouchMove:case y.topTouchStart:g=p;break;case y.topScroll:g=d;break;case y.topWheel:g=f;break;case y.topCopy:case y.topCut:case y.topPaste:g=i}m(g);var C=g.getPooled(v,n,r);return o.accumulateTwoPhaseDispatches(C),C}};t.exports=R},{"./EventConstants":17,"./EventPluginUtils":21,"./EventPropagators":22,"./SyntheticClipboardEvent":93,"./SyntheticDragEvent":95,"./SyntheticEvent":96,"./SyntheticFocusEvent":97,"./SyntheticKeyboardEvent":99,"./SyntheticMouseEvent":100,"./SyntheticTouchEvent":101,"./SyntheticUIEvent":102,"./SyntheticWheelEvent":103,"./getEventCharCode":125,"./invariant":137,"./keyOf":144,"./warning":155}],93:[function(e,t){"use strict";function n(e,t,n){r.call(this,e,t,n)}var r=e("./SyntheticEvent"),o={clipboardData:function(e){return"clipboardData"in e?e.clipboardData:window.clipboardData}};r.augmentClass(n,o),t.exports=n},{"./SyntheticEvent":96}],94:[function(e,t){"use strict";function n(e,t,n){r.call(this,e,t,n)}var r=e("./SyntheticEvent"),o={data:null};r.augmentClass(n,o),t.exports=n},{"./SyntheticEvent":96}],95:[function(e,t){"use strict";function n(e,t,n){r.call(this,e,t,n)}var r=e("./SyntheticMouseEvent"),o={dataTransfer:null};r.augmentClass(n,o),t.exports=n},{"./SyntheticMouseEvent":100}],96:[function(e,t){"use strict";function n(e,t,n){this.dispatchConfig=e,this.dispatchMarker=t,this.nativeEvent=n;var r=this.constructor.Interface;for(var o in r)if(r.hasOwnProperty(o)){var a=r[o];this[o]=a?a(n):n[o]}var s=null!=n.defaultPrevented?n.defaultPrevented:n.returnValue===!1;this.isDefaultPrevented=s?i.thatReturnsTrue:i.thatReturnsFalse,this.isPropagationStopped=i.thatReturnsFalse}var r=e("./PooledClass"),o=e("./Object.assign"),i=e("./emptyFunction"),a=e("./getEventTarget"),s={type:null,target:a,currentTarget:i.thatReturnsNull,eventPhase:null,bubbles:null,cancelable:null,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:null,isTrusted:null};o(n.prototype,{preventDefault:function(){this.defaultPrevented=!0;var e=this.nativeEvent;e.preventDefault?e.preventDefault():e.returnValue=!1,this.isDefaultPrevented=i.thatReturnsTrue},stopPropagation:function(){var e=this.nativeEvent;e.stopPropagation?e.stopPropagation():e.cancelBubble=!0,this.isPropagationStopped=i.thatReturnsTrue},persist:function(){this.isPersistent=i.thatReturnsTrue},isPersistent:i.thatReturnsFalse,destructor:function(){var e=this.constructor.Interface;for(var t in e)this[t]=null;this.dispatchConfig=null,this.dispatchMarker=null,this.nativeEvent=null}}),n.Interface=s,n.augmentClass=function(e,t){var n=this,i=Object.create(n.prototype);o(i,e.prototype),e.prototype=i,e.prototype.constructor=e,e.Interface=o({},n.Interface,t),e.augmentClass=n.augmentClass,r.addPoolingTo(e,r.threeArgumentPooler)},r.addPoolingTo(n,r.threeArgumentPooler),t.exports=n},{"./Object.assign":29,"./PooledClass":30,"./emptyFunction":118,"./getEventTarget":128}],97:[function(e,t){"use strict";function n(e,t,n){r.call(this,e,t,n)}var r=e("./SyntheticUIEvent"),o={relatedTarget:null};r.augmentClass(n,o),t.exports=n},{"./SyntheticUIEvent":102}],98:[function(e,t){"use strict";function n(e,t,n){r.call(this,e,t,n)}var r=e("./SyntheticEvent"),o={data:null};r.augmentClass(n,o),t.exports=n},{"./SyntheticEvent":96}],99:[function(e,t){"use strict";function n(e,t,n){r.call(this,e,t,n)}var r=e("./SyntheticUIEvent"),o=e("./getEventCharCode"),i=e("./getEventKey"),a=e("./getEventModifierState"),s={key:i,location:null,ctrlKey:null,shiftKey:null,altKey:null,metaKey:null,repeat:null,locale:null,getModifierState:a,charCode:function(e){return"keypress"===e.type?o(e):0},keyCode:function(e){return"keydown"===e.type||"keyup"===e.type?e.keyCode:0},which:function(e){return"keypress"===e.type?o(e):"keydown"===e.type||"keyup"===e.type?e.keyCode:0}};r.augmentClass(n,s),t.exports=n},{"./SyntheticUIEvent":102,"./getEventCharCode":125,"./getEventKey":126,"./getEventModifierState":127}],100:[function(e,t){"use strict";function n(e,t,n){r.call(this,e,t,n)}var r=e("./SyntheticUIEvent"),o=e("./ViewportMetrics"),i=e("./getEventModifierState"),a={screenX:null,screenY:null,clientX:null,clientY:null,ctrlKey:null,shiftKey:null,altKey:null,metaKey:null,getModifierState:i,button:function(e){var t=e.button;return"which"in e?t:2===t?2:4===t?1:0},buttons:null,relatedTarget:function(e){return e.relatedTarget||(e.fromElement===e.srcElement?e.toElement:e.fromElement)},pageX:function(e){return"pageX"in e?e.pageX:e.clientX+o.currentScrollLeft},pageY:function(e){return"pageY"in e?e.pageY:e.clientY+o.currentScrollTop}};r.augmentClass(n,a),t.exports=n},{"./SyntheticUIEvent":102,"./ViewportMetrics":105,"./getEventModifierState":127}],101:[function(e,t){"use strict";function n(e,t,n){r.call(this,e,t,n)}var r=e("./SyntheticUIEvent"),o=e("./getEventModifierState"),i={touches:null,targetTouches:null,changedTouches:null,altKey:null,metaKey:null,ctrlKey:null,shiftKey:null,getModifierState:o};r.augmentClass(n,i),t.exports=n},{"./SyntheticUIEvent":102,"./getEventModifierState":127}],102:[function(e,t){"use strict";function n(e,t,n){r.call(this,e,t,n)}var r=e("./SyntheticEvent"),o=e("./getEventTarget"),i={view:function(e){if(e.view)return e.view;var t=o(e);if(null!=t&&t.window===t)return t;var n=t.ownerDocument;return n?n.defaultView||n.parentWindow:window},detail:function(e){return e.detail||0}};r.augmentClass(n,i),t.exports=n},{"./SyntheticEvent":96,"./getEventTarget":128}],103:[function(e,t){"use strict";function n(e,t,n){r.call(this,e,t,n)}var r=e("./SyntheticMouseEvent"),o={deltaX:function(e){return"deltaX"in e?e.deltaX:"wheelDeltaX"in e?-e.wheelDeltaX:0},deltaY:function(e){return"deltaY"in e?e.deltaY:"wheelDeltaY"in e?-e.wheelDeltaY:"wheelDelta"in e?-e.wheelDelta:0},deltaZ:null,deltaMode:null};r.augmentClass(n,o),t.exports=n},{"./SyntheticMouseEvent":100}],104:[function(e,t){"use strict";var n=e("./invariant"),r={reinitializeTransaction:function(){this.transactionWrappers=this.getTransactionWrappers(),this.wrapperInitData?this.wrapperInitData.length=0:this.wrapperInitData=[],this._isInTransaction=!1},_isInTransaction:!1,getTransactionWrappers:null,isInTransaction:function(){return!!this._isInTransaction},perform:function(e,t,r,o,i,a,s,u){n(!this.isInTransaction());var c,l;try{this._isInTransaction=!0,c=!0,this.initializeAll(0),l=e.call(t,r,o,i,a,s,u),c=!1}finally{try{if(c)try{this.closeAll(0)}catch(p){}else this.closeAll(0)}finally{this._isInTransaction=!1}}return l},initializeAll:function(e){for(var t=this.transactionWrappers,n=e;n<t.length;n++){var r=t[n];try{this.wrapperInitData[n]=o.OBSERVED_ERROR,this.wrapperInitData[n]=r.initialize?r.initialize.call(this):null}finally{if(this.wrapperInitData[n]===o.OBSERVED_ERROR)try{this.initializeAll(n+1)}catch(i){}}}},closeAll:function(e){n(this.isInTransaction());for(var t=this.transactionWrappers,r=e;r<t.length;r++){var i,a=t[r],s=this.wrapperInitData[r];try{i=!0,s!==o.OBSERVED_ERROR&&a.close&&a.close.call(this,s),i=!1}finally{if(i)try{this.closeAll(r+1)}catch(u){}}}this.wrapperInitData.length=0}},o={Mixin:r,OBSERVED_ERROR:{}};t.exports=o},{"./invariant":137}],105:[function(e,t){"use strict";var n=e("./getUnboundedScrollPosition"),r={currentScrollLeft:0,currentScrollTop:0,refreshScrollValues:function(){var e=n(window);r.currentScrollLeft=e.x,r.currentScrollTop=e.y}};t.exports=r},{"./getUnboundedScrollPosition":133}],106:[function(e,t){"use strict";function n(e,t){if(r(null!=t),null==e)return t;var n=Array.isArray(e),o=Array.isArray(t);return n&&o?(e.push.apply(e,t),e):n?(e.push(t),e):o?[e].concat(t):[e,t]}var r=e("./invariant");t.exports=n},{"./invariant":137}],107:[function(e,t){"use strict";function n(e){for(var t=1,n=0,o=0;o<e.length;o++)t=(t+e.charCodeAt(o))%r,n=(n+t)%r;return t|n<<16}var r=65521;t.exports=n},{}],108:[function(e,t){function n(e){return e.replace(r,function(e,t){return t.toUpperCase()})}var r=/-(.)/g;t.exports=n},{}],109:[function(e,t){"use strict";function n(e){return r(e.replace(o,"ms-"))}var r=e("./camelize"),o=/^-ms-/;t.exports=n},{"./camelize":108}],110:[function(e,t){"use strict";function n(e,t){var n=o.mergeProps(t,e.props);return!n.hasOwnProperty(a)&&e.props.hasOwnProperty(a)&&(n.children=e.props.children),r.createElement(e.type,n)}var r=e("./ReactElement"),o=e("./ReactPropTransferer"),i=e("./keyOf"),a=(e("./warning"),i({children:null}));t.exports=n},{"./ReactElement":56,"./ReactPropTransferer":74,"./keyOf":144,"./warning":155}],111:[function(e,t){function n(e,t){return e&&t?e===t?!0:r(e)?!1:r(t)?n(e,t.parentNode):e.contains?e.contains(t):e.compareDocumentPosition?!!(16&e.compareDocumentPosition(t)):!1:!1}var r=e("./isTextNode");t.exports=n},{"./isTextNode":141}],112:[function(e,t){function n(e){return!!e&&("object"==typeof e||"function"==typeof e)&&"length"in e&&!("setInterval"in e)&&"number"!=typeof e.nodeType&&(Array.isArray(e)||"callee"in e||"item"in e)}function r(e){return n(e)?Array.isArray(e)?e.slice():o(e):[e]}var o=e("./toArray");t.exports=r},{"./toArray":152}],113:[function(e,t){"use strict";function n(e){var t=o.createFactory(e),n=r.createClass({displayName:"ReactFullPageComponent"+e,componentWillUnmount:function(){i(!1)},render:function(){return t(this.props)}});return n}var r=e("./ReactCompositeComponent"),o=e("./ReactElement"),i=e("./invariant");t.exports=n},{"./ReactCompositeComponent":40,"./ReactElement":56,"./invariant":137}],114:[function(e,t){function n(e){var t=e.match(c);return t&&t[1].toLowerCase()}function r(e,t){var r=u;s(!!u);var o=n(e),c=o&&a(o);if(c){r.innerHTML=c[1]+e+c[2];for(var l=c[0];l--;)r=r.lastChild}else r.innerHTML=e;var p=r.getElementsByTagName("script");p.length&&(s(t),i(p).forEach(t));for(var d=i(r.childNodes);r.lastChild;)r.removeChild(r.lastChild);return d}var o=e("./ExecutionEnvironment"),i=e("./createArrayFrom"),a=e("./getMarkupWrap"),s=e("./invariant"),u=o.canUseDOM?document.createElement("div"):null,c=/^\s*<(\w+)/;t.exports=r},{"./ExecutionEnvironment":23,"./createArrayFrom":112,"./getMarkupWrap":129,"./invariant":137}],115:[function(e,t){function n(e){return"object"==typeof e?Object.keys(e).filter(function(t){return e[t]}).join(" "):Array.prototype.join.call(arguments," ")}t.exports=n},{}],116:[function(e,t){"use strict";function n(e,t){var n=null==t||"boolean"==typeof t||""===t;if(n)return"";var r=isNaN(t);return r||0===t||o.hasOwnProperty(e)&&o[e]?""+t:("string"==typeof t&&(t=t.trim()),t+"px")
}var r=e("./CSSProperty"),o=r.isUnitlessNumber;t.exports=n},{"./CSSProperty":5}],117:[function(e,t){function n(e,t,n,r,o){return o}e("./Object.assign"),e("./warning");t.exports=n},{"./Object.assign":29,"./warning":155}],118:[function(e,t){function n(e){return function(){return e}}function r(){}r.thatReturns=n,r.thatReturnsFalse=n(!1),r.thatReturnsTrue=n(!0),r.thatReturnsNull=n(null),r.thatReturnsThis=function(){return this},r.thatReturnsArgument=function(e){return e},t.exports=r},{}],119:[function(e,t){"use strict";var n={};t.exports=n},{}],120:[function(e,t){"use strict";function n(e){return o[e]}function r(e){return(""+e).replace(i,n)}var o={"&":"&amp;",">":"&gt;","<":"&lt;",'"':"&quot;","'":"&#x27;"},i=/[&><"']/g;t.exports=r},{}],121:[function(e,t){"use strict";function n(e,t,n){var r=e,i=!r.hasOwnProperty(n);if(i&&null!=t){var a,s=typeof t;a="string"===s?o(t):"number"===s?o(""+t):t,r[n]=a}}function r(e){if(null==e)return e;var t={};return i(e,n,t),t}{var o=e("./ReactTextComponent"),i=e("./traverseAllChildren");e("./warning")}t.exports=r},{"./ReactTextComponent":84,"./traverseAllChildren":153,"./warning":155}],122:[function(e,t){"use strict";function n(e){try{e.focus()}catch(t){}}t.exports=n},{}],123:[function(e,t){"use strict";var n=function(e,t,n){Array.isArray(e)?e.forEach(t,n):e&&t.call(n,e)};t.exports=n},{}],124:[function(e,t){function n(){try{return document.activeElement||document.body}catch(e){return document.body}}t.exports=n},{}],125:[function(e,t){"use strict";function n(e){var t,n=e.keyCode;return"charCode"in e?(t=e.charCode,0===t&&13===n&&(t=13)):t=n,t>=32||13===t?t:0}t.exports=n},{}],126:[function(e,t){"use strict";function n(e){if(e.key){var t=o[e.key]||e.key;if("Unidentified"!==t)return t}if("keypress"===e.type){var n=r(e);return 13===n?"Enter":String.fromCharCode(n)}return"keydown"===e.type||"keyup"===e.type?i[e.keyCode]||"Unidentified":""}var r=e("./getEventCharCode"),o={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},i={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"};t.exports=n},{"./getEventCharCode":125}],127:[function(e,t){"use strict";function n(e){var t=this,n=t.nativeEvent;if(n.getModifierState)return n.getModifierState(e);var r=o[e];return r?!!n[r]:!1}function r(){return n}var o={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};t.exports=r},{}],128:[function(e,t){"use strict";function n(e){var t=e.target||e.srcElement||window;return 3===t.nodeType?t.parentNode:t}t.exports=n},{}],129:[function(e,t){function n(e){return o(!!i),p.hasOwnProperty(e)||(e="*"),a.hasOwnProperty(e)||(i.innerHTML="*"===e?"<link />":"<"+e+"></"+e+">",a[e]=!i.firstChild),a[e]?p[e]:null}var r=e("./ExecutionEnvironment"),o=e("./invariant"),i=r.canUseDOM?document.createElement("div"):null,a={circle:!0,defs:!0,ellipse:!0,g:!0,line:!0,linearGradient:!0,path:!0,polygon:!0,polyline:!0,radialGradient:!0,rect:!0,stop:!0,text:!0},s=[1,'<select multiple="true">',"</select>"],u=[1,"<table>","</table>"],c=[3,"<table><tbody><tr>","</tr></tbody></table>"],l=[1,"<svg>","</svg>"],p={"*":[1,"?<div>","</div>"],area:[1,"<map>","</map>"],col:[2,"<table><tbody></tbody><colgroup>","</colgroup></table>"],legend:[1,"<fieldset>","</fieldset>"],param:[1,"<object>","</object>"],tr:[2,"<table><tbody>","</tbody></table>"],optgroup:s,option:s,caption:u,colgroup:u,tbody:u,tfoot:u,thead:u,td:c,th:c,circle:l,defs:l,ellipse:l,g:l,line:l,linearGradient:l,path:l,polygon:l,polyline:l,radialGradient:l,rect:l,stop:l,text:l};t.exports=n},{"./ExecutionEnvironment":23,"./invariant":137}],130:[function(e,t){"use strict";function n(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function r(e){for(;e;){if(e.nextSibling)return e.nextSibling;e=e.parentNode}}function o(e,t){for(var o=n(e),i=0,a=0;o;){if(3==o.nodeType){if(a=i+o.textContent.length,t>=i&&a>=t)return{node:o,offset:t-i};i=a}o=n(r(o))}}t.exports=o},{}],131:[function(e,t){"use strict";function n(e){return e?e.nodeType===r?e.documentElement:e.firstChild:null}var r=9;t.exports=n},{}],132:[function(e,t){"use strict";function n(){return!o&&r.canUseDOM&&(o="textContent"in document.documentElement?"textContent":"innerText"),o}var r=e("./ExecutionEnvironment"),o=null;t.exports=n},{"./ExecutionEnvironment":23}],133:[function(e,t){"use strict";function n(e){return e===window?{x:window.pageXOffset||document.documentElement.scrollLeft,y:window.pageYOffset||document.documentElement.scrollTop}:{x:e.scrollLeft,y:e.scrollTop}}t.exports=n},{}],134:[function(e,t){function n(e){return e.replace(r,"-$1").toLowerCase()}var r=/([A-Z])/g;t.exports=n},{}],135:[function(e,t){"use strict";function n(e){return r(e).replace(o,"-ms-")}var r=e("./hyphenate"),o=/^ms-/;t.exports=n},{"./hyphenate":134}],136:[function(e,t){"use strict";function n(e,t){var n;return n="string"==typeof e.type?r.createInstanceForTag(e.type,e.props,t):new e.type(e.props),n.construct(e),n}{var r=(e("./warning"),e("./ReactElement"),e("./ReactLegacyElement"),e("./ReactNativeComponent"));e("./ReactEmptyComponent")}t.exports=n},{"./ReactElement":56,"./ReactEmptyComponent":58,"./ReactLegacyElement":65,"./ReactNativeComponent":71,"./warning":155}],137:[function(e,t){"use strict";var n=function(e,t,n,r,o,i,a,s){if(!e){var u;if(void 0===t)u=new Error("Minified exception occurred; use the non-minified dev environment for the full error message and additional helpful warnings.");else{var c=[n,r,o,i,a,s],l=0;u=new Error("Invariant Violation: "+t.replace(/%s/g,function(){return c[l++]}))}throw u.framesToPop=1,u}};t.exports=n},{}],138:[function(e,t){"use strict";function n(e,t){if(!o.canUseDOM||t&&!("addEventListener"in document))return!1;var n="on"+e,i=n in document;if(!i){var a=document.createElement("div");a.setAttribute(n,"return;"),i="function"==typeof a[n]}return!i&&r&&"wheel"===e&&(i=document.implementation.hasFeature("Events.wheel","3.0")),i}var r,o=e("./ExecutionEnvironment");o.canUseDOM&&(r=document.implementation&&document.implementation.hasFeature&&document.implementation.hasFeature("","")!==!0),t.exports=n},{"./ExecutionEnvironment":23}],139:[function(e,t){function n(e){return!(!e||!("function"==typeof Node?e instanceof Node:"object"==typeof e&&"number"==typeof e.nodeType&&"string"==typeof e.nodeName))}t.exports=n},{}],140:[function(e,t){"use strict";function n(e){return e&&("INPUT"===e.nodeName&&r[e.type]||"TEXTAREA"===e.nodeName)}var r={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};t.exports=n},{}],141:[function(e,t){function n(e){return r(e)&&3==e.nodeType}var r=e("./isNode");t.exports=n},{"./isNode":139}],142:[function(e,t){"use strict";function n(e){e||(e="");var t,n=arguments.length;if(n>1)for(var r=1;n>r;r++)t=arguments[r],t&&(e=(e?e+" ":"")+t);return e}t.exports=n},{}],143:[function(e,t){"use strict";var n=e("./invariant"),r=function(e){var t,r={};n(e instanceof Object&&!Array.isArray(e));for(t in e)e.hasOwnProperty(t)&&(r[t]=t);return r};t.exports=r},{"./invariant":137}],144:[function(e,t){var n=function(e){var t;for(t in e)if(e.hasOwnProperty(t))return t;return null};t.exports=n},{}],145:[function(e,t){"use strict";function n(e,t,n){if(!e)return null;var o={};for(var i in e)r.call(e,i)&&(o[i]=t.call(n,e[i],i,e));return o}var r=Object.prototype.hasOwnProperty;t.exports=n},{}],146:[function(e,t){"use strict";function n(e){var t={};return function(n){return t.hasOwnProperty(n)?t[n]:t[n]=e.call(this,n)}}t.exports=n},{}],147:[function(e,t){"use strict";function n(e){r(e&&!/[^a-z0-9_]/.test(e))}var r=e("./invariant");t.exports=n},{"./invariant":137}],148:[function(e,t){"use strict";function n(e){return o(r.isValidElement(e)),e}var r=e("./ReactElement"),o=e("./invariant");t.exports=n},{"./ReactElement":56,"./invariant":137}],149:[function(e,t){"use strict";var n=e("./ExecutionEnvironment"),r=/^[ \r\n\t\f]/,o=/<(!--|link|noscript|meta|script|style)[ \r\n\t\f\/>]/,i=function(e,t){e.innerHTML=t};if(n.canUseDOM){var a=document.createElement("div");a.innerHTML=" ",""===a.innerHTML&&(i=function(e,t){if(e.parentNode&&e.parentNode.replaceChild(e,e),r.test(t)||"<"===t[0]&&o.test(t)){e.innerHTML=""+t;var n=e.firstChild;1===n.data.length?e.removeChild(n):n.deleteData(0,1)}else e.innerHTML=t})}t.exports=i},{"./ExecutionEnvironment":23}],150:[function(e,t){"use strict";function n(e,t){if(e===t)return!0;var n;for(n in e)if(e.hasOwnProperty(n)&&(!t.hasOwnProperty(n)||e[n]!==t[n]))return!1;for(n in t)if(t.hasOwnProperty(n)&&!e.hasOwnProperty(n))return!1;return!0}t.exports=n},{}],151:[function(e,t){"use strict";function n(e,t){return e&&t&&e.type===t.type&&e.key===t.key&&e._owner===t._owner?!0:!1}t.exports=n},{}],152:[function(e,t){function n(e){var t=e.length;if(r(!Array.isArray(e)&&("object"==typeof e||"function"==typeof e)),r("number"==typeof t),r(0===t||t-1 in e),e.hasOwnProperty)try{return Array.prototype.slice.call(e)}catch(n){}for(var o=Array(t),i=0;t>i;i++)o[i]=e[i];return o}var r=e("./invariant");t.exports=n},{"./invariant":137}],153:[function(e,t){"use strict";function n(e){return d[e]}function r(e,t){return e&&null!=e.key?i(e.key):t.toString(36)}function o(e){return(""+e).replace(f,n)}function i(e){return"$"+o(e)}function a(e,t,n){return null==e?0:h(e,"",0,t,n)}var s=e("./ReactElement"),u=e("./ReactInstanceHandles"),c=e("./invariant"),l=u.SEPARATOR,p=":",d={"=":"=0",".":"=1",":":"=2"},f=/[=.:]/g,h=function(e,t,n,o,a){var u,d,f=0;if(Array.isArray(e))for(var m=0;m<e.length;m++){var v=e[m];u=t+(t?p:l)+r(v,m),d=n+f,f+=h(v,u,d,o,a)}else{var y=typeof e,g=""===t,E=g?l+r(e,0):t;if(null==e||"boolean"===y)o(a,null,E,n),f=1;else if("string"===y||"number"===y||s.isValidElement(e))o(a,e,E,n),f=1;else if("object"===y){c(!e||1!==e.nodeType);for(var C in e)e.hasOwnProperty(C)&&(u=t+(t?p:l)+i(C)+p+r(e[C],0),d=n+f,f+=h(e[C],u,d,o,a))}}return f};t.exports=a},{"./ReactElement":56,"./ReactInstanceHandles":64,"./invariant":137}],154:[function(e,t){"use strict";function n(e){return Array.isArray(e)?e.concat():e&&"object"==typeof e?i(new e.constructor,e):e}function r(e,t,n){s(Array.isArray(e));var r=t[n];s(Array.isArray(r))}function o(e,t){if(s("object"==typeof t),t.hasOwnProperty(p))return s(1===Object.keys(t).length),t[p];var a=n(e);if(t.hasOwnProperty(d)){var h=t[d];s(h&&"object"==typeof h),s(a&&"object"==typeof a),i(a,t[d])}t.hasOwnProperty(u)&&(r(e,t,u),t[u].forEach(function(e){a.push(e)})),t.hasOwnProperty(c)&&(r(e,t,c),t[c].forEach(function(e){a.unshift(e)})),t.hasOwnProperty(l)&&(s(Array.isArray(e)),s(Array.isArray(t[l])),t[l].forEach(function(e){s(Array.isArray(e)),a.splice.apply(a,e)})),t.hasOwnProperty(f)&&(s("function"==typeof t[f]),a=t[f](a));for(var v in t)m.hasOwnProperty(v)&&m[v]||(a[v]=o(e[v],t[v]));return a}var i=e("./Object.assign"),a=e("./keyOf"),s=e("./invariant"),u=a({$push:null}),c=a({$unshift:null}),l=a({$splice:null}),p=a({$set:null}),d=a({$merge:null}),f=a({$apply:null}),h=[u,c,l,p,d,f],m={};h.forEach(function(e){m[e]=!0}),t.exports=o},{"./Object.assign":29,"./invariant":137,"./keyOf":144}],155:[function(e,t){"use strict";var n=e("./emptyFunction"),r=n;t.exports=r},{"./emptyFunction":118}]},{},[1])(1)});
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],53:[function(require,module,exports){
var React = require('react/dist/react-with-addons.min.js');

//var RIBBONBAR = require('./ribbonbar.js');
var TABLE = require('./table');

var APP = React.createClass({displayName: "APP",
  render: function(){
    return (
      React.createElement("div", null, 
        React.createElement(TABLE, null)
      )
    )
  }
});

module.exports = APP;


},{"./table":56,"react/dist/react-with-addons.min.js":52}],54:[function(require,module,exports){
var React = require('react/dist/react-with-addons.min.js');
var classSet = React.addons.classSet;

var CELL = React.createClass({displayName: "CELL",
  getInitialState: function(){
    return {
      editing: false,
      selected: false
    };
  },
  render: function(){
    var cellValue = this.props.cellData.value;
    //var cellEdit = <input autoFocus onKeyDown={this.checkCell} className={'cell-edit'} type='text' defaultValue={cellValue} />;
    var cellView = this.state.editing ? cellEdit : cellValue;
    
    /* set dom event handlers based on state */
    // var cellClick, cellMenu;
    // if (this.state.selected){
    //   cellClick = this.enterEditMode;
    // } else {
    //   cellClick = this.selectCell;
    // }

    /* a css class toggle object based on state */
    var classes = classSet({
      'selected-cell': this.state.selected,
      'cell-view': true
    });

    return (
      React.createElement("td", {className: classes}, 
        cellView
      )
    )
  }
});

module.exports = CELL;

},{"react/dist/react-with-addons.min.js":52}],55:[function(require,module,exports){
var React = require('react/dist/react-with-addons.min.js');

var CELL = require('./cell');

var ROW = React.createClass({displayName: "ROW",
  render: function(){
    var self = this;
    var cells =  this.props.row.map(function(cellData,index){
      return (
        React.createElement(CELL, {key: index, colIndex: index, rowIndex: self.props.index, cellData: cellData})
      )
    });
    return (
      React.createElement("tr", null, 
        React.createElement("th", {className: "r-spreadsheet"}, this.props.index + 1), " ", cells
      )
    )
  }
});

module.exports = ROW;


},{"./cell":54,"react/dist/react-with-addons.min.js":52}],56:[function(require,module,exports){
var React = require('react/dist/react-with-addons.min.js');

var AppStore = require('../stores/app-store');
var ROW = require('./row');

var getAlphaHeader = function(num){
  if (num > 25) return null;
  var alpha = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return alpha[num];
}

function getTableData(){
  return AppStore.getRows();
}

var TABLE = React.createClass({displayName: "TABLE",
  getInitialState: function(){
    return {
      cellInEditMode: false,
      rows: getTableData()
    };
  },
  render: function(){
    var rows = this.state.rows.map(function(rowData,rowIndex){
      return (
        React.createElement(ROW, {key: rowIndex, row: rowData, index: rowIndex})
      )
    });

    var rowsHeaders = this.state.rows[0]
      .slice()
      .concat("")
      .map(function(row,colIndex){
        return React.createElement("th", {key: colIndex, className: "r-spreadsheet"}, " ", getAlphaHeader(colIndex), " ")
    });

    return (
      React.createElement("table", {className: "r-spreadsheet"}, 
        React.createElement("thead", null, 
          React.createElement("tr", null, 

            rowsHeaders

          )
        ), 
        React.createElement("tbody", null, 

          rows

        )
      )
    )
  }
});

module.exports = TABLE;

},{"../stores/app-store":60,"./row":55,"react/dist/react-with-addons.min.js":52}],57:[function(require,module,exports){
module.exports = {
  ActionTypes: {
    ACTION_ACTION: 'ACTION_ACTION'
  }  
};

},{}],58:[function(require,module,exports){
var Dispatcher = require('flux').Dispatcher;
var extend = function(ontoObj,fromObj){
  for (var key in fromObj){
    ontoObj[key] = fromObj[key];
  }
  return ontoObj
}

var AppDispatcher = extend(new Dispatcher(), {

  handleViewAction: function(action) {
    var payload = {
      source: 'VIEW_ACTION',
      action: action
    };
    this.dispatch(payload);
  }

});

module.exports = AppDispatcher;


},{"flux":1}],59:[function(require,module,exports){

var RXSS = require('./components/app');
var React = require('react/dist/react-with-addons.min.js');

module.exports = RXSS;



},{"./components/app":53,"react/dist/react-with-addons.min.js":52}],60:[function(require,module,exports){
var EventEmitter = require('events').EventEmitter;
var _ = {
  map: require('lodash/collection/map'),
  range: require('lodash/utility/range')
};

var AppDispatcher = require('../dispatchers/app-dispatcher');
var AppConstants = require('../constants/app-constants');


var extend = function(ontoObj,fromObj){
  for (var key in fromObj){
    ontoObj[key] = fromObj[key];
  }
  return ontoObj
}

var CHANGE_EVENT = 'change';

var tableRows = _.range(0,30).map(function(num){
  return _.range(0,10).map(function(){
    return {value:'bob'};
  });
});

var AppStore = extend(EventEmitter.prototype, {
  getRows: function(){
    return tableRows;
  }
});

// var ActionTypes = AppConstants.ActionTypes;

// AppStore.dispatchToken = AppDispatcher.register(function(payload){
//   var action = payload.action;

//   switch(action.type) {
    
//     case ActionTypes.BLABLA:
//       break;
    
//     case ActionTypes.BLABLA:
//       break;
    
//     default:
//       // do nothing
//   }
// });

module.exports = AppStore;

},{"../constants/app-constants":57,"../dispatchers/app-dispatcher":58,"events":4,"lodash/collection/map":5,"lodash/utility/range":51}]},{},[59])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2ZsdXgvaW5kZXguanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2ZsdXgvbGliL0Rpc3BhdGNoZXIuanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2ZsdXgvbGliL2ludmFyaWFudC5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9ldmVudHMvZXZlbnRzLmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L25vZGVfbW9kdWxlcy9sb2Rhc2gvY29sbGVjdGlvbi9tYXAuanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2xvZGFzaC9pbnRlcm5hbC9hcnJheUNvcHkuanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2xvZGFzaC9pbnRlcm5hbC9hcnJheUVhY2guanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2xvZGFzaC9pbnRlcm5hbC9hcnJheU1hcC5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL2ludGVybmFsL2Jhc2VDYWxsYmFjay5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL2ludGVybmFsL2Jhc2VDbG9uZS5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL2ludGVybmFsL2Jhc2VDb3B5LmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L25vZGVfbW9kdWxlcy9sb2Rhc2gvaW50ZXJuYWwvYmFzZUVhY2guanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2xvZGFzaC9pbnRlcm5hbC9iYXNlRm9yLmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L25vZGVfbW9kdWxlcy9sb2Rhc2gvaW50ZXJuYWwvYmFzZUZvck93bi5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL2ludGVybmFsL2Jhc2VJc0VxdWFsLmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L25vZGVfbW9kdWxlcy9sb2Rhc2gvaW50ZXJuYWwvYmFzZUlzRXF1YWxEZWVwLmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L25vZGVfbW9kdWxlcy9sb2Rhc2gvaW50ZXJuYWwvYmFzZUlzTWF0Y2guanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2xvZGFzaC9pbnRlcm5hbC9iYXNlTWFwLmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L25vZGVfbW9kdWxlcy9sb2Rhc2gvaW50ZXJuYWwvYmFzZU1hdGNoZXMuanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2xvZGFzaC9pbnRlcm5hbC9iYXNlUHJvcGVydHkuanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2xvZGFzaC9pbnRlcm5hbC9iYXNlU2V0RGF0YS5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL2ludGVybmFsL2Jhc2VUb1N0cmluZy5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL2ludGVybmFsL2JpbmRDYWxsYmFjay5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL2ludGVybmFsL2J1ZmZlckNsb25lLmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L25vZGVfbW9kdWxlcy9sb2Rhc2gvaW50ZXJuYWwvZXF1YWxBcnJheXMuanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2xvZGFzaC9pbnRlcm5hbC9lcXVhbEJ5VGFnLmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L25vZGVfbW9kdWxlcy9sb2Rhc2gvaW50ZXJuYWwvZXF1YWxPYmplY3RzLmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L25vZGVfbW9kdWxlcy9sb2Rhc2gvaW50ZXJuYWwvaW5pdENsb25lQXJyYXkuanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2xvZGFzaC9pbnRlcm5hbC9pbml0Q2xvbmVCeVRhZy5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL2ludGVybmFsL2luaXRDbG9uZU9iamVjdC5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL2ludGVybmFsL2lzQmluZGFibGUuanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2xvZGFzaC9pbnRlcm5hbC9pc0luZGV4LmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L25vZGVfbW9kdWxlcy9sb2Rhc2gvaW50ZXJuYWwvaXNJdGVyYXRlZUNhbGwuanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2xvZGFzaC9pbnRlcm5hbC9pc0xlbmd0aC5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL2ludGVybmFsL2lzT2JqZWN0TGlrZS5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL2ludGVybmFsL2lzU3RyaWN0Q29tcGFyYWJsZS5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL2ludGVybmFsL21ldGFNYXAuanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2xvZGFzaC9pbnRlcm5hbC9zaGltS2V5cy5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL2ludGVybmFsL3RvT2JqZWN0LmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L25vZGVfbW9kdWxlcy9sb2Rhc2gvbGFuZy9pc0FyZ3VtZW50cy5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL2xhbmcvaXNBcnJheS5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL2xhbmcvaXNOYXRpdmUuanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2xvZGFzaC9sYW5nL2lzT2JqZWN0LmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L25vZGVfbW9kdWxlcy9sb2Rhc2gvbGFuZy9pc1R5cGVkQXJyYXkuanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2xvZGFzaC9vYmplY3Qva2V5cy5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL29iamVjdC9rZXlzSW4uanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2xvZGFzaC9zdHJpbmcvZXNjYXBlUmVnRXhwLmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L25vZGVfbW9kdWxlcy9sb2Rhc2gvc3VwcG9ydC5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvbG9kYXNoL3V0aWxpdHkvY29uc3RhbnQuanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvbm9kZV9tb2R1bGVzL2xvZGFzaC91dGlsaXR5L2lkZW50aXR5LmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L25vZGVfbW9kdWxlcy9sb2Rhc2gvdXRpbGl0eS9yYW5nZS5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9ub2RlX21vZHVsZXMvcmVhY3QvZGlzdC9yZWFjdC13aXRoLWFkZG9ucy5taW4uanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvc3JjL2pzL2NvbXBvbmVudHMvYXBwLmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L3NyYy9qcy9jb21wb25lbnRzL2NlbGwuanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvc3JjL2pzL2NvbXBvbmVudHMvcm93LmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L3NyYy9qcy9jb21wb25lbnRzL3RhYmxlLmpzIiwiL1VzZXJzL05pY2tTdGVmYW4vRG9jdW1lbnRzL0pTcHJvamVjdHMvcmVhY3Qtc3ByZWFkLXNoZWV0L3NyYy9qcy9jb25zdGFudHMvYXBwLWNvbnN0YW50cy5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9zcmMvanMvZGlzcGF0Y2hlcnMvYXBwLWRpc3BhdGNoZXIuanMiLCIvVXNlcnMvTmlja1N0ZWZhbi9Eb2N1bWVudHMvSlNwcm9qZWN0cy9yZWFjdC1zcHJlYWQtc2hlZXQvc3JjL2pzL2Zha2VfZGE1NjQzYS5qcyIsIi9Vc2Vycy9OaWNrU3RlZmFuL0RvY3VtZW50cy9KU3Byb2plY3RzL3JlYWN0LXNwcmVhZC1zaGVldC9zcmMvanMvc3RvcmVzL2FwcC1zdG9yZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkEsSUFBSSxLQUFLLEdBQUcsT0FBTyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7O0FBRTNELDRDQUE0QztBQUM1QyxJQUFJLEtBQUssR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7O0FBRS9CLElBQUkseUJBQXlCLG1CQUFBO0VBQzNCLE1BQU0sRUFBRSxVQUFVO0lBQ2hCO01BQ0Usb0JBQUEsS0FBSSxFQUFBLElBQUMsRUFBQTtRQUNILG9CQUFDLEtBQUssRUFBQSxJQUFBLENBQUcsQ0FBQTtNQUNMLENBQUE7S0FDUDtHQUNGO0FBQ0gsQ0FBQyxDQUFDLENBQUM7O0FBRUgsTUFBTSxDQUFDLE9BQU8sR0FBRyxHQUFHLENBQUM7Ozs7QUNmckIsSUFBSSxLQUFLLEdBQUcsT0FBTyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7QUFDM0QsSUFBSSxRQUFRLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7O0FBRXJDLElBQUksMEJBQTBCLG9CQUFBO0VBQzVCLGVBQWUsRUFBRSxVQUFVO0lBQ3pCLE9BQU87TUFDTCxPQUFPLEVBQUUsS0FBSztNQUNkLFFBQVEsRUFBRSxLQUFLO0tBQ2hCLENBQUM7R0FDSDtFQUNELE1BQU0sRUFBRSxVQUFVO0FBQ3BCLElBQUksSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDOztBQUU5QyxJQUFJLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLFFBQVEsR0FBRyxTQUFTLENBQUM7QUFDN0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztJQUVJLElBQUksT0FBTyxHQUFHLFFBQVEsQ0FBQztNQUNyQixlQUFlLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRO01BQ3BDLFdBQVcsRUFBRSxJQUFJO0FBQ3ZCLEtBQUssQ0FBQyxDQUFDOztJQUVIO01BQ0Usb0JBQUEsSUFBRyxFQUFBLENBQUEsQ0FBQyxTQUFBLEVBQVMsQ0FBRSxPQUFTLENBQUEsRUFBQTtRQUNyQixRQUFTO01BQ1AsQ0FBQTtLQUNOO0dBQ0Y7QUFDSCxDQUFDLENBQUMsQ0FBQzs7QUFFSCxNQUFNLENBQUMsT0FBTyxHQUFHLElBQUk7OztBQ3JDckIsSUFBSSxLQUFLLEdBQUcsT0FBTyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7O0FBRTNELElBQUksSUFBSSxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQzs7QUFFN0IsSUFBSSx5QkFBeUIsbUJBQUE7RUFDM0IsTUFBTSxFQUFFLFVBQVU7SUFDaEIsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBQ2hCLElBQUksS0FBSyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxTQUFTLFFBQVEsQ0FBQyxLQUFLLENBQUM7TUFDdEQ7UUFDRSxvQkFBQyxJQUFJLEVBQUEsQ0FBQSxDQUFDLEdBQUEsRUFBRyxDQUFFLEtBQUssRUFBQyxDQUFDLFFBQUEsRUFBUSxDQUFFLEtBQUssRUFBQyxDQUFDLFFBQUEsRUFBUSxDQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFDLENBQUMsUUFBQSxFQUFRLENBQUUsUUFBUyxDQUFBLENBQUcsQ0FBQTtPQUN0RjtLQUNGLENBQUMsQ0FBQztJQUNIO01BQ0Usb0JBQUEsSUFBRyxFQUFBLElBQUMsRUFBQTtRQUNGLG9CQUFBLElBQUcsRUFBQSxDQUFBLENBQUMsU0FBQSxFQUFTLENBQUUsZUFBaUIsQ0FBQSxFQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBTyxDQUFBLEVBQUEsR0FBQSxFQUFFLEtBQU07TUFDakUsQ0FBQTtLQUNOO0dBQ0Y7QUFDSCxDQUFDLENBQUMsQ0FBQzs7QUFFSCxNQUFNLENBQUMsT0FBTyxHQUFHLEdBQUcsQ0FBQzs7OztBQ3BCckIsSUFBSSxLQUFLLEdBQUcsT0FBTyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7O0FBRTNELElBQUksUUFBUSxHQUFHLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0FBQzlDLElBQUksR0FBRyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQzs7QUFFM0IsSUFBSSxjQUFjLEdBQUcsU0FBUyxHQUFHLENBQUM7RUFDaEMsSUFBSSxHQUFHLEdBQUcsRUFBRSxFQUFFLE9BQU8sSUFBSSxDQUFDO0VBQzFCLElBQUksS0FBSyxHQUFHLDZCQUE2QixDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztFQUNwRCxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUNwQixDQUFDOztBQUVELFNBQVMsWUFBWSxFQUFFO0VBQ3JCLE9BQU8sUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQzVCLENBQUM7O0FBRUQsSUFBSSwyQkFBMkIscUJBQUE7RUFDN0IsZUFBZSxFQUFFLFVBQVU7SUFDekIsT0FBTztNQUNMLGNBQWMsRUFBRSxLQUFLO01BQ3JCLElBQUksRUFBRSxZQUFZLEVBQUU7S0FDckIsQ0FBQztHQUNIO0VBQ0QsTUFBTSxFQUFFLFVBQVU7SUFDaEIsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsT0FBTyxDQUFDLFFBQVEsQ0FBQztNQUN2RDtRQUNFLG9CQUFDLEdBQUcsRUFBQSxDQUFBLENBQUMsR0FBQSxFQUFHLENBQUUsUUFBUSxFQUFDLENBQUMsR0FBQSxFQUFHLENBQUUsT0FBTyxFQUFDLENBQUMsS0FBQSxFQUFLLENBQUUsUUFBUyxDQUFBLENBQUcsQ0FBQTtPQUN0RDtBQUNQLEtBQUssQ0FBQyxDQUFDOztJQUVILElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztPQUNqQyxLQUFLLEVBQUU7T0FDUCxNQUFNLENBQUMsRUFBRSxDQUFDO09BQ1YsR0FBRyxDQUFDLFNBQVMsR0FBRyxDQUFDLFFBQVEsQ0FBQztRQUN6QixPQUFPLG9CQUFBLElBQUcsRUFBQSxDQUFBLENBQUMsR0FBQSxFQUFHLENBQUUsUUFBUSxFQUFDLENBQUMsU0FBQSxFQUFTLENBQUUsZUFBaUIsQ0FBQSxFQUFBLEdBQUEsRUFBRSxjQUFjLENBQUMsUUFBUSxDQUFDLEVBQUMsR0FBTSxDQUFBO0FBQy9GLEtBQUssQ0FBQyxDQUFDOztJQUVIO01BQ0Usb0JBQUEsT0FBTSxFQUFBLENBQUEsQ0FBQyxTQUFBLEVBQVMsQ0FBRSxlQUFpQixDQUFBLEVBQUE7UUFDakMsb0JBQUEsT0FBTSxFQUFBLElBQUMsRUFBQTtBQUNmLFVBQVUsb0JBQUEsSUFBRyxFQUFBLElBQUMsRUFBQTs7QUFFZCxZQUFhLFdBQVk7O1VBRVYsQ0FBQTtRQUNDLENBQUEsRUFBQTtBQUNoQixRQUFRLG9CQUFBLE9BQU0sRUFBQSxJQUFDLEVBQUE7O0FBRWYsVUFBVyxJQUFLOztRQUVBLENBQUE7TUFDRixDQUFBO0tBQ1Q7R0FDRjtBQUNILENBQUMsQ0FBQyxDQUFDOztBQUVILE1BQU0sQ0FBQyxPQUFPLEdBQUcsS0FBSzs7O0FDdkR0QixNQUFNLENBQUMsT0FBTyxHQUFHO0VBQ2YsV0FBVyxFQUFFO0lBQ1gsYUFBYSxFQUFFLGVBQWU7R0FDL0I7Q0FDRjs7O0FDSkQsSUFBSSxVQUFVLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFVBQVUsQ0FBQztBQUM1QyxJQUFJLE1BQU0sR0FBRyxTQUFTLE9BQU8sQ0FBQyxPQUFPLENBQUM7RUFDcEMsS0FBSyxJQUFJLEdBQUcsSUFBSSxPQUFPLENBQUM7SUFDdEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztHQUM3QjtFQUNELE9BQU8sT0FBTztBQUNoQixDQUFDOztBQUVELElBQUksYUFBYSxHQUFHLE1BQU0sQ0FBQyxJQUFJLFVBQVUsRUFBRSxFQUFFOztFQUUzQyxnQkFBZ0IsRUFBRSxTQUFTLE1BQU0sRUFBRTtJQUNqQyxJQUFJLE9BQU8sR0FBRztNQUNaLE1BQU0sRUFBRSxhQUFhO01BQ3JCLE1BQU0sRUFBRSxNQUFNO0tBQ2YsQ0FBQztJQUNGLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDM0IsR0FBRzs7QUFFSCxDQUFDLENBQUMsQ0FBQzs7QUFFSCxNQUFNLENBQUMsT0FBTyxHQUFHLGFBQWEsQ0FBQzs7OztBQ3BCL0I7QUFDQSxJQUFJLElBQUksR0FBRyxPQUFPLENBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUN2QyxJQUFJLEtBQUssR0FBRyxPQUFPLENBQUMscUNBQXFDLENBQUMsQ0FBQzs7QUFFM0QsTUFBTSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7Ozs7O0FDSnRCLElBQUksWUFBWSxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxZQUFZLENBQUM7QUFDbEQsSUFBSSxDQUFDLEdBQUc7RUFDTixHQUFHLEVBQUUsT0FBTyxDQUFDLHVCQUF1QixDQUFDO0VBQ3JDLEtBQUssRUFBRSxPQUFPLENBQUMsc0JBQXNCLENBQUM7QUFDeEMsQ0FBQyxDQUFDOztBQUVGLElBQUksYUFBYSxHQUFHLE9BQU8sQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO0FBQzdELElBQUksWUFBWSxHQUFHLE9BQU8sQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO0FBQ3pEOztBQUVBLElBQUksTUFBTSxHQUFHLFNBQVMsT0FBTyxDQUFDLE9BQU8sQ0FBQztFQUNwQyxLQUFLLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQztJQUN0QixPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0dBQzdCO0VBQ0QsT0FBTyxPQUFPO0FBQ2hCLENBQUM7O0FBRUQsSUFBSSxZQUFZLEdBQUcsUUFBUSxDQUFDOztBQUU1QixJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxHQUFHLENBQUM7RUFDN0MsT0FBTyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsVUFBVTtJQUNqQyxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0dBQ3RCLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDOztBQUVILElBQUksUUFBUSxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFO0VBQzVDLE9BQU8sRUFBRSxVQUFVO0lBQ2pCLE9BQU8sU0FBUyxDQUFDO0dBQ2xCO0FBQ0gsQ0FBQyxDQUFDLENBQUM7O0FBRUgsOENBQThDOztBQUU5QyxxRUFBcUU7QUFDckUsaUNBQWlDOztBQUVqQywwQkFBMEI7O0FBRTFCLCtCQUErQjtBQUMvQixlQUFlOztBQUVmLCtCQUErQjtBQUMvQixlQUFlOztBQUVmLGVBQWU7QUFDZixzQkFBc0I7QUFDdEIsTUFBTTtBQUNOLE1BQU07O0FBRU4sTUFBTSxDQUFDLE9BQU8sR0FBRyxRQUFRIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qKlxuICogQ29weXJpZ2h0IChjKSAyMDE0LCBGYWNlYm9vaywgSW5jLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBUaGlzIHNvdXJjZSBjb2RlIGlzIGxpY2Vuc2VkIHVuZGVyIHRoZSBCU0Qtc3R5bGUgbGljZW5zZSBmb3VuZCBpbiB0aGVcbiAqIExJQ0VOU0UgZmlsZSBpbiB0aGUgcm9vdCBkaXJlY3Rvcnkgb2YgdGhpcyBzb3VyY2UgdHJlZS4gQW4gYWRkaXRpb25hbCBncmFudFxuICogb2YgcGF0ZW50IHJpZ2h0cyBjYW4gYmUgZm91bmQgaW4gdGhlIFBBVEVOVFMgZmlsZSBpbiB0aGUgc2FtZSBkaXJlY3RvcnkuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMuRGlzcGF0Y2hlciA9IHJlcXVpcmUoJy4vbGliL0Rpc3BhdGNoZXInKVxuIiwiLypcbiAqIENvcHlyaWdodCAoYykgMjAxNCwgRmFjZWJvb2ssIEluYy5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogVGhpcyBzb3VyY2UgY29kZSBpcyBsaWNlbnNlZCB1bmRlciB0aGUgQlNELXN0eWxlIGxpY2Vuc2UgZm91bmQgaW4gdGhlXG4gKiBMSUNFTlNFIGZpbGUgaW4gdGhlIHJvb3QgZGlyZWN0b3J5IG9mIHRoaXMgc291cmNlIHRyZWUuIEFuIGFkZGl0aW9uYWwgZ3JhbnRcbiAqIG9mIHBhdGVudCByaWdodHMgY2FuIGJlIGZvdW5kIGluIHRoZSBQQVRFTlRTIGZpbGUgaW4gdGhlIHNhbWUgZGlyZWN0b3J5LlxuICpcbiAqIEBwcm92aWRlc01vZHVsZSBEaXNwYXRjaGVyXG4gKiBAdHlwZWNoZWNrc1xuICovXG5cblwidXNlIHN0cmljdFwiO1xuXG52YXIgaW52YXJpYW50ID0gcmVxdWlyZSgnLi9pbnZhcmlhbnQnKTtcblxudmFyIF9sYXN0SUQgPSAxO1xudmFyIF9wcmVmaXggPSAnSURfJztcblxuLyoqXG4gKiBEaXNwYXRjaGVyIGlzIHVzZWQgdG8gYnJvYWRjYXN0IHBheWxvYWRzIHRvIHJlZ2lzdGVyZWQgY2FsbGJhY2tzLiBUaGlzIGlzXG4gKiBkaWZmZXJlbnQgZnJvbSBnZW5lcmljIHB1Yi1zdWIgc3lzdGVtcyBpbiB0d28gd2F5czpcbiAqXG4gKiAgIDEpIENhbGxiYWNrcyBhcmUgbm90IHN1YnNjcmliZWQgdG8gcGFydGljdWxhciBldmVudHMuIEV2ZXJ5IHBheWxvYWQgaXNcbiAqICAgICAgZGlzcGF0Y2hlZCB0byBldmVyeSByZWdpc3RlcmVkIGNhbGxiYWNrLlxuICogICAyKSBDYWxsYmFja3MgY2FuIGJlIGRlZmVycmVkIGluIHdob2xlIG9yIHBhcnQgdW50aWwgb3RoZXIgY2FsbGJhY2tzIGhhdmVcbiAqICAgICAgYmVlbiBleGVjdXRlZC5cbiAqXG4gKiBGb3IgZXhhbXBsZSwgY29uc2lkZXIgdGhpcyBoeXBvdGhldGljYWwgZmxpZ2h0IGRlc3RpbmF0aW9uIGZvcm0sIHdoaWNoXG4gKiBzZWxlY3RzIGEgZGVmYXVsdCBjaXR5IHdoZW4gYSBjb3VudHJ5IGlzIHNlbGVjdGVkOlxuICpcbiAqICAgdmFyIGZsaWdodERpc3BhdGNoZXIgPSBuZXcgRGlzcGF0Y2hlcigpO1xuICpcbiAqICAgLy8gS2VlcHMgdHJhY2sgb2Ygd2hpY2ggY291bnRyeSBpcyBzZWxlY3RlZFxuICogICB2YXIgQ291bnRyeVN0b3JlID0ge2NvdW50cnk6IG51bGx9O1xuICpcbiAqICAgLy8gS2VlcHMgdHJhY2sgb2Ygd2hpY2ggY2l0eSBpcyBzZWxlY3RlZFxuICogICB2YXIgQ2l0eVN0b3JlID0ge2NpdHk6IG51bGx9O1xuICpcbiAqICAgLy8gS2VlcHMgdHJhY2sgb2YgdGhlIGJhc2UgZmxpZ2h0IHByaWNlIG9mIHRoZSBzZWxlY3RlZCBjaXR5XG4gKiAgIHZhciBGbGlnaHRQcmljZVN0b3JlID0ge3ByaWNlOiBudWxsfVxuICpcbiAqIFdoZW4gYSB1c2VyIGNoYW5nZXMgdGhlIHNlbGVjdGVkIGNpdHksIHdlIGRpc3BhdGNoIHRoZSBwYXlsb2FkOlxuICpcbiAqICAgZmxpZ2h0RGlzcGF0Y2hlci5kaXNwYXRjaCh7XG4gKiAgICAgYWN0aW9uVHlwZTogJ2NpdHktdXBkYXRlJyxcbiAqICAgICBzZWxlY3RlZENpdHk6ICdwYXJpcydcbiAqICAgfSk7XG4gKlxuICogVGhpcyBwYXlsb2FkIGlzIGRpZ2VzdGVkIGJ5IGBDaXR5U3RvcmVgOlxuICpcbiAqICAgZmxpZ2h0RGlzcGF0Y2hlci5yZWdpc3RlcihmdW5jdGlvbihwYXlsb2FkKSB7XG4gKiAgICAgaWYgKHBheWxvYWQuYWN0aW9uVHlwZSA9PT0gJ2NpdHktdXBkYXRlJykge1xuICogICAgICAgQ2l0eVN0b3JlLmNpdHkgPSBwYXlsb2FkLnNlbGVjdGVkQ2l0eTtcbiAqICAgICB9XG4gKiAgIH0pO1xuICpcbiAqIFdoZW4gdGhlIHVzZXIgc2VsZWN0cyBhIGNvdW50cnksIHdlIGRpc3BhdGNoIHRoZSBwYXlsb2FkOlxuICpcbiAqICAgZmxpZ2h0RGlzcGF0Y2hlci5kaXNwYXRjaCh7XG4gKiAgICAgYWN0aW9uVHlwZTogJ2NvdW50cnktdXBkYXRlJyxcbiAqICAgICBzZWxlY3RlZENvdW50cnk6ICdhdXN0cmFsaWEnXG4gKiAgIH0pO1xuICpcbiAqIFRoaXMgcGF5bG9hZCBpcyBkaWdlc3RlZCBieSBib3RoIHN0b3JlczpcbiAqXG4gKiAgICBDb3VudHJ5U3RvcmUuZGlzcGF0Y2hUb2tlbiA9IGZsaWdodERpc3BhdGNoZXIucmVnaXN0ZXIoZnVuY3Rpb24ocGF5bG9hZCkge1xuICogICAgIGlmIChwYXlsb2FkLmFjdGlvblR5cGUgPT09ICdjb3VudHJ5LXVwZGF0ZScpIHtcbiAqICAgICAgIENvdW50cnlTdG9yZS5jb3VudHJ5ID0gcGF5bG9hZC5zZWxlY3RlZENvdW50cnk7XG4gKiAgICAgfVxuICogICB9KTtcbiAqXG4gKiBXaGVuIHRoZSBjYWxsYmFjayB0byB1cGRhdGUgYENvdW50cnlTdG9yZWAgaXMgcmVnaXN0ZXJlZCwgd2Ugc2F2ZSBhIHJlZmVyZW5jZVxuICogdG8gdGhlIHJldHVybmVkIHRva2VuLiBVc2luZyB0aGlzIHRva2VuIHdpdGggYHdhaXRGb3IoKWAsIHdlIGNhbiBndWFyYW50ZWVcbiAqIHRoYXQgYENvdW50cnlTdG9yZWAgaXMgdXBkYXRlZCBiZWZvcmUgdGhlIGNhbGxiYWNrIHRoYXQgdXBkYXRlcyBgQ2l0eVN0b3JlYFxuICogbmVlZHMgdG8gcXVlcnkgaXRzIGRhdGEuXG4gKlxuICogICBDaXR5U3RvcmUuZGlzcGF0Y2hUb2tlbiA9IGZsaWdodERpc3BhdGNoZXIucmVnaXN0ZXIoZnVuY3Rpb24ocGF5bG9hZCkge1xuICogICAgIGlmIChwYXlsb2FkLmFjdGlvblR5cGUgPT09ICdjb3VudHJ5LXVwZGF0ZScpIHtcbiAqICAgICAgIC8vIGBDb3VudHJ5U3RvcmUuY291bnRyeWAgbWF5IG5vdCBiZSB1cGRhdGVkLlxuICogICAgICAgZmxpZ2h0RGlzcGF0Y2hlci53YWl0Rm9yKFtDb3VudHJ5U3RvcmUuZGlzcGF0Y2hUb2tlbl0pO1xuICogICAgICAgLy8gYENvdW50cnlTdG9yZS5jb3VudHJ5YCBpcyBub3cgZ3VhcmFudGVlZCB0byBiZSB1cGRhdGVkLlxuICpcbiAqICAgICAgIC8vIFNlbGVjdCB0aGUgZGVmYXVsdCBjaXR5IGZvciB0aGUgbmV3IGNvdW50cnlcbiAqICAgICAgIENpdHlTdG9yZS5jaXR5ID0gZ2V0RGVmYXVsdENpdHlGb3JDb3VudHJ5KENvdW50cnlTdG9yZS5jb3VudHJ5KTtcbiAqICAgICB9XG4gKiAgIH0pO1xuICpcbiAqIFRoZSB1c2FnZSBvZiBgd2FpdEZvcigpYCBjYW4gYmUgY2hhaW5lZCwgZm9yIGV4YW1wbGU6XG4gKlxuICogICBGbGlnaHRQcmljZVN0b3JlLmRpc3BhdGNoVG9rZW4gPVxuICogICAgIGZsaWdodERpc3BhdGNoZXIucmVnaXN0ZXIoZnVuY3Rpb24ocGF5bG9hZCkge1xuICogICAgICAgc3dpdGNoIChwYXlsb2FkLmFjdGlvblR5cGUpIHtcbiAqICAgICAgICAgY2FzZSAnY291bnRyeS11cGRhdGUnOlxuICogICAgICAgICAgIGZsaWdodERpc3BhdGNoZXIud2FpdEZvcihbQ2l0eVN0b3JlLmRpc3BhdGNoVG9rZW5dKTtcbiAqICAgICAgICAgICBGbGlnaHRQcmljZVN0b3JlLnByaWNlID1cbiAqICAgICAgICAgICAgIGdldEZsaWdodFByaWNlU3RvcmUoQ291bnRyeVN0b3JlLmNvdW50cnksIENpdHlTdG9yZS5jaXR5KTtcbiAqICAgICAgICAgICBicmVhaztcbiAqXG4gKiAgICAgICAgIGNhc2UgJ2NpdHktdXBkYXRlJzpcbiAqICAgICAgICAgICBGbGlnaHRQcmljZVN0b3JlLnByaWNlID1cbiAqICAgICAgICAgICAgIEZsaWdodFByaWNlU3RvcmUoQ291bnRyeVN0b3JlLmNvdW50cnksIENpdHlTdG9yZS5jaXR5KTtcbiAqICAgICAgICAgICBicmVhaztcbiAqICAgICB9XG4gKiAgIH0pO1xuICpcbiAqIFRoZSBgY291bnRyeS11cGRhdGVgIHBheWxvYWQgd2lsbCBiZSBndWFyYW50ZWVkIHRvIGludm9rZSB0aGUgc3RvcmVzJ1xuICogcmVnaXN0ZXJlZCBjYWxsYmFja3MgaW4gb3JkZXI6IGBDb3VudHJ5U3RvcmVgLCBgQ2l0eVN0b3JlYCwgdGhlblxuICogYEZsaWdodFByaWNlU3RvcmVgLlxuICovXG5cbiAgZnVuY3Rpb24gRGlzcGF0Y2hlcigpIHtcbiAgICB0aGlzLiREaXNwYXRjaGVyX2NhbGxiYWNrcyA9IHt9O1xuICAgIHRoaXMuJERpc3BhdGNoZXJfaXNQZW5kaW5nID0ge307XG4gICAgdGhpcy4kRGlzcGF0Y2hlcl9pc0hhbmRsZWQgPSB7fTtcbiAgICB0aGlzLiREaXNwYXRjaGVyX2lzRGlzcGF0Y2hpbmcgPSBmYWxzZTtcbiAgICB0aGlzLiREaXNwYXRjaGVyX3BlbmRpbmdQYXlsb2FkID0gbnVsbDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWdpc3RlcnMgYSBjYWxsYmFjayB0byBiZSBpbnZva2VkIHdpdGggZXZlcnkgZGlzcGF0Y2hlZCBwYXlsb2FkLiBSZXR1cm5zXG4gICAqIGEgdG9rZW4gdGhhdCBjYW4gYmUgdXNlZCB3aXRoIGB3YWl0Rm9yKClgLlxuICAgKlxuICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFja1xuICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAqL1xuICBEaXNwYXRjaGVyLnByb3RvdHlwZS5yZWdpc3Rlcj1mdW5jdGlvbihjYWxsYmFjaykge1xuICAgIHZhciBpZCA9IF9wcmVmaXggKyBfbGFzdElEKys7XG4gICAgdGhpcy4kRGlzcGF0Y2hlcl9jYWxsYmFja3NbaWRdID0gY2FsbGJhY2s7XG4gICAgcmV0dXJuIGlkO1xuICB9O1xuXG4gIC8qKlxuICAgKiBSZW1vdmVzIGEgY2FsbGJhY2sgYmFzZWQgb24gaXRzIHRva2VuLlxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gaWRcbiAgICovXG4gIERpc3BhdGNoZXIucHJvdG90eXBlLnVucmVnaXN0ZXI9ZnVuY3Rpb24oaWQpIHtcbiAgICBpbnZhcmlhbnQoXG4gICAgICB0aGlzLiREaXNwYXRjaGVyX2NhbGxiYWNrc1tpZF0sXG4gICAgICAnRGlzcGF0Y2hlci51bnJlZ2lzdGVyKC4uLik6IGAlc2AgZG9lcyBub3QgbWFwIHRvIGEgcmVnaXN0ZXJlZCBjYWxsYmFjay4nLFxuICAgICAgaWRcbiAgICApO1xuICAgIGRlbGV0ZSB0aGlzLiREaXNwYXRjaGVyX2NhbGxiYWNrc1tpZF07XG4gIH07XG5cbiAgLyoqXG4gICAqIFdhaXRzIGZvciB0aGUgY2FsbGJhY2tzIHNwZWNpZmllZCB0byBiZSBpbnZva2VkIGJlZm9yZSBjb250aW51aW5nIGV4ZWN1dGlvblxuICAgKiBvZiB0aGUgY3VycmVudCBjYWxsYmFjay4gVGhpcyBtZXRob2Qgc2hvdWxkIG9ubHkgYmUgdXNlZCBieSBhIGNhbGxiYWNrIGluXG4gICAqIHJlc3BvbnNlIHRvIGEgZGlzcGF0Y2hlZCBwYXlsb2FkLlxuICAgKlxuICAgKiBAcGFyYW0ge2FycmF5PHN0cmluZz59IGlkc1xuICAgKi9cbiAgRGlzcGF0Y2hlci5wcm90b3R5cGUud2FpdEZvcj1mdW5jdGlvbihpZHMpIHtcbiAgICBpbnZhcmlhbnQoXG4gICAgICB0aGlzLiREaXNwYXRjaGVyX2lzRGlzcGF0Y2hpbmcsXG4gICAgICAnRGlzcGF0Y2hlci53YWl0Rm9yKC4uLik6IE11c3QgYmUgaW52b2tlZCB3aGlsZSBkaXNwYXRjaGluZy4nXG4gICAgKTtcbiAgICBmb3IgKHZhciBpaSA9IDA7IGlpIDwgaWRzLmxlbmd0aDsgaWkrKykge1xuICAgICAgdmFyIGlkID0gaWRzW2lpXTtcbiAgICAgIGlmICh0aGlzLiREaXNwYXRjaGVyX2lzUGVuZGluZ1tpZF0pIHtcbiAgICAgICAgaW52YXJpYW50KFxuICAgICAgICAgIHRoaXMuJERpc3BhdGNoZXJfaXNIYW5kbGVkW2lkXSxcbiAgICAgICAgICAnRGlzcGF0Y2hlci53YWl0Rm9yKC4uLik6IENpcmN1bGFyIGRlcGVuZGVuY3kgZGV0ZWN0ZWQgd2hpbGUgJyArXG4gICAgICAgICAgJ3dhaXRpbmcgZm9yIGAlc2AuJyxcbiAgICAgICAgICBpZFxuICAgICAgICApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGludmFyaWFudChcbiAgICAgICAgdGhpcy4kRGlzcGF0Y2hlcl9jYWxsYmFja3NbaWRdLFxuICAgICAgICAnRGlzcGF0Y2hlci53YWl0Rm9yKC4uLik6IGAlc2AgZG9lcyBub3QgbWFwIHRvIGEgcmVnaXN0ZXJlZCBjYWxsYmFjay4nLFxuICAgICAgICBpZFxuICAgICAgKTtcbiAgICAgIHRoaXMuJERpc3BhdGNoZXJfaW52b2tlQ2FsbGJhY2soaWQpO1xuICAgIH1cbiAgfTtcblxuICAvKipcbiAgICogRGlzcGF0Y2hlcyBhIHBheWxvYWQgdG8gYWxsIHJlZ2lzdGVyZWQgY2FsbGJhY2tzLlxuICAgKlxuICAgKiBAcGFyYW0ge29iamVjdH0gcGF5bG9hZFxuICAgKi9cbiAgRGlzcGF0Y2hlci5wcm90b3R5cGUuZGlzcGF0Y2g9ZnVuY3Rpb24ocGF5bG9hZCkge1xuICAgIGludmFyaWFudChcbiAgICAgICF0aGlzLiREaXNwYXRjaGVyX2lzRGlzcGF0Y2hpbmcsXG4gICAgICAnRGlzcGF0Y2guZGlzcGF0Y2goLi4uKTogQ2Fubm90IGRpc3BhdGNoIGluIHRoZSBtaWRkbGUgb2YgYSBkaXNwYXRjaC4nXG4gICAgKTtcbiAgICB0aGlzLiREaXNwYXRjaGVyX3N0YXJ0RGlzcGF0Y2hpbmcocGF5bG9hZCk7XG4gICAgdHJ5IHtcbiAgICAgIGZvciAodmFyIGlkIGluIHRoaXMuJERpc3BhdGNoZXJfY2FsbGJhY2tzKSB7XG4gICAgICAgIGlmICh0aGlzLiREaXNwYXRjaGVyX2lzUGVuZGluZ1tpZF0pIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiREaXNwYXRjaGVyX2ludm9rZUNhbGxiYWNrKGlkKTtcbiAgICAgIH1cbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy4kRGlzcGF0Y2hlcl9zdG9wRGlzcGF0Y2hpbmcoKTtcbiAgICB9XG4gIH07XG5cbiAgLyoqXG4gICAqIElzIHRoaXMgRGlzcGF0Y2hlciBjdXJyZW50bHkgZGlzcGF0Y2hpbmcuXG4gICAqXG4gICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAqL1xuICBEaXNwYXRjaGVyLnByb3RvdHlwZS5pc0Rpc3BhdGNoaW5nPWZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLiREaXNwYXRjaGVyX2lzRGlzcGF0Y2hpbmc7XG4gIH07XG5cbiAgLyoqXG4gICAqIENhbGwgdGhlIGNhbGxiYWNrIHN0b3JlZCB3aXRoIHRoZSBnaXZlbiBpZC4gQWxzbyBkbyBzb21lIGludGVybmFsXG4gICAqIGJvb2trZWVwaW5nLlxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gaWRcbiAgICogQGludGVybmFsXG4gICAqL1xuICBEaXNwYXRjaGVyLnByb3RvdHlwZS4kRGlzcGF0Y2hlcl9pbnZva2VDYWxsYmFjaz1mdW5jdGlvbihpZCkge1xuICAgIHRoaXMuJERpc3BhdGNoZXJfaXNQZW5kaW5nW2lkXSA9IHRydWU7XG4gICAgdGhpcy4kRGlzcGF0Y2hlcl9jYWxsYmFja3NbaWRdKHRoaXMuJERpc3BhdGNoZXJfcGVuZGluZ1BheWxvYWQpO1xuICAgIHRoaXMuJERpc3BhdGNoZXJfaXNIYW5kbGVkW2lkXSA9IHRydWU7XG4gIH07XG5cbiAgLyoqXG4gICAqIFNldCB1cCBib29ra2VlcGluZyBuZWVkZWQgd2hlbiBkaXNwYXRjaGluZy5cbiAgICpcbiAgICogQHBhcmFtIHtvYmplY3R9IHBheWxvYWRcbiAgICogQGludGVybmFsXG4gICAqL1xuICBEaXNwYXRjaGVyLnByb3RvdHlwZS4kRGlzcGF0Y2hlcl9zdGFydERpc3BhdGNoaW5nPWZ1bmN0aW9uKHBheWxvYWQpIHtcbiAgICBmb3IgKHZhciBpZCBpbiB0aGlzLiREaXNwYXRjaGVyX2NhbGxiYWNrcykge1xuICAgICAgdGhpcy4kRGlzcGF0Y2hlcl9pc1BlbmRpbmdbaWRdID0gZmFsc2U7XG4gICAgICB0aGlzLiREaXNwYXRjaGVyX2lzSGFuZGxlZFtpZF0gPSBmYWxzZTtcbiAgICB9XG4gICAgdGhpcy4kRGlzcGF0Y2hlcl9wZW5kaW5nUGF5bG9hZCA9IHBheWxvYWQ7XG4gICAgdGhpcy4kRGlzcGF0Y2hlcl9pc0Rpc3BhdGNoaW5nID0gdHJ1ZTtcbiAgfTtcblxuICAvKipcbiAgICogQ2xlYXIgYm9va2tlZXBpbmcgdXNlZCBmb3IgZGlzcGF0Y2hpbmcuXG4gICAqXG4gICAqIEBpbnRlcm5hbFxuICAgKi9cbiAgRGlzcGF0Y2hlci5wcm90b3R5cGUuJERpc3BhdGNoZXJfc3RvcERpc3BhdGNoaW5nPWZ1bmN0aW9uKCkge1xuICAgIHRoaXMuJERpc3BhdGNoZXJfcGVuZGluZ1BheWxvYWQgPSBudWxsO1xuICAgIHRoaXMuJERpc3BhdGNoZXJfaXNEaXNwYXRjaGluZyA9IGZhbHNlO1xuICB9O1xuXG5cbm1vZHVsZS5leHBvcnRzID0gRGlzcGF0Y2hlcjtcbiIsIi8qKlxuICogQ29weXJpZ2h0IChjKSAyMDE0LCBGYWNlYm9vaywgSW5jLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBUaGlzIHNvdXJjZSBjb2RlIGlzIGxpY2Vuc2VkIHVuZGVyIHRoZSBCU0Qtc3R5bGUgbGljZW5zZSBmb3VuZCBpbiB0aGVcbiAqIExJQ0VOU0UgZmlsZSBpbiB0aGUgcm9vdCBkaXJlY3Rvcnkgb2YgdGhpcyBzb3VyY2UgdHJlZS4gQW4gYWRkaXRpb25hbCBncmFudFxuICogb2YgcGF0ZW50IHJpZ2h0cyBjYW4gYmUgZm91bmQgaW4gdGhlIFBBVEVOVFMgZmlsZSBpbiB0aGUgc2FtZSBkaXJlY3RvcnkuXG4gKlxuICogQHByb3ZpZGVzTW9kdWxlIGludmFyaWFudFxuICovXG5cblwidXNlIHN0cmljdFwiO1xuXG4vKipcbiAqIFVzZSBpbnZhcmlhbnQoKSB0byBhc3NlcnQgc3RhdGUgd2hpY2ggeW91ciBwcm9ncmFtIGFzc3VtZXMgdG8gYmUgdHJ1ZS5cbiAqXG4gKiBQcm92aWRlIHNwcmludGYtc3R5bGUgZm9ybWF0IChvbmx5ICVzIGlzIHN1cHBvcnRlZCkgYW5kIGFyZ3VtZW50c1xuICogdG8gcHJvdmlkZSBpbmZvcm1hdGlvbiBhYm91dCB3aGF0IGJyb2tlIGFuZCB3aGF0IHlvdSB3ZXJlXG4gKiBleHBlY3RpbmcuXG4gKlxuICogVGhlIGludmFyaWFudCBtZXNzYWdlIHdpbGwgYmUgc3RyaXBwZWQgaW4gcHJvZHVjdGlvbiwgYnV0IHRoZSBpbnZhcmlhbnRcbiAqIHdpbGwgcmVtYWluIHRvIGVuc3VyZSBsb2dpYyBkb2VzIG5vdCBkaWZmZXIgaW4gcHJvZHVjdGlvbi5cbiAqL1xuXG52YXIgaW52YXJpYW50ID0gZnVuY3Rpb24oY29uZGl0aW9uLCBmb3JtYXQsIGEsIGIsIGMsIGQsIGUsIGYpIHtcbiAgaWYgKGZhbHNlKSB7XG4gICAgaWYgKGZvcm1hdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2ludmFyaWFudCByZXF1aXJlcyBhbiBlcnJvciBtZXNzYWdlIGFyZ3VtZW50Jyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFjb25kaXRpb24pIHtcbiAgICB2YXIgZXJyb3I7XG4gICAgaWYgKGZvcm1hdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBlcnJvciA9IG5ldyBFcnJvcihcbiAgICAgICAgJ01pbmlmaWVkIGV4Y2VwdGlvbiBvY2N1cnJlZDsgdXNlIHRoZSBub24tbWluaWZpZWQgZGV2IGVudmlyb25tZW50ICcgK1xuICAgICAgICAnZm9yIHRoZSBmdWxsIGVycm9yIG1lc3NhZ2UgYW5kIGFkZGl0aW9uYWwgaGVscGZ1bCB3YXJuaW5ncy4nXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYXJncyA9IFthLCBiLCBjLCBkLCBlLCBmXTtcbiAgICAgIHZhciBhcmdJbmRleCA9IDA7XG4gICAgICBlcnJvciA9IG5ldyBFcnJvcihcbiAgICAgICAgJ0ludmFyaWFudCBWaW9sYXRpb246ICcgK1xuICAgICAgICBmb3JtYXQucmVwbGFjZSgvJXMvZywgZnVuY3Rpb24oKSB7IHJldHVybiBhcmdzW2FyZ0luZGV4KytdOyB9KVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBlcnJvci5mcmFtZXNUb1BvcCA9IDE7IC8vIHdlIGRvbid0IGNhcmUgYWJvdXQgaW52YXJpYW50J3Mgb3duIGZyYW1lXG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gaW52YXJpYW50O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbmZ1bmN0aW9uIEV2ZW50RW1pdHRlcigpIHtcbiAgdGhpcy5fZXZlbnRzID0gdGhpcy5fZXZlbnRzIHx8IHt9O1xuICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSB0aGlzLl9tYXhMaXN0ZW5lcnMgfHwgdW5kZWZpbmVkO1xufVxubW9kdWxlLmV4cG9ydHMgPSBFdmVudEVtaXR0ZXI7XG5cbi8vIEJhY2t3YXJkcy1jb21wYXQgd2l0aCBub2RlIDAuMTAueFxuRXZlbnRFbWl0dGVyLkV2ZW50RW1pdHRlciA9IEV2ZW50RW1pdHRlcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fZXZlbnRzID0gdW5kZWZpbmVkO1xuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fbWF4TGlzdGVuZXJzID0gdW5kZWZpbmVkO1xuXG4vLyBCeSBkZWZhdWx0IEV2ZW50RW1pdHRlcnMgd2lsbCBwcmludCBhIHdhcm5pbmcgaWYgbW9yZSB0aGFuIDEwIGxpc3RlbmVycyBhcmVcbi8vIGFkZGVkIHRvIGl0LiBUaGlzIGlzIGEgdXNlZnVsIGRlZmF1bHQgd2hpY2ggaGVscHMgZmluZGluZyBtZW1vcnkgbGVha3MuXG5FdmVudEVtaXR0ZXIuZGVmYXVsdE1heExpc3RlbmVycyA9IDEwO1xuXG4vLyBPYnZpb3VzbHkgbm90IGFsbCBFbWl0dGVycyBzaG91bGQgYmUgbGltaXRlZCB0byAxMC4gVGhpcyBmdW5jdGlvbiBhbGxvd3Ncbi8vIHRoYXQgdG8gYmUgaW5jcmVhc2VkLiBTZXQgdG8gemVybyBmb3IgdW5saW1pdGVkLlxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5zZXRNYXhMaXN0ZW5lcnMgPSBmdW5jdGlvbihuKSB7XG4gIGlmICghaXNOdW1iZXIobikgfHwgbiA8IDAgfHwgaXNOYU4obikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCduIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInKTtcbiAgdGhpcy5fbWF4TGlzdGVuZXJzID0gbjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmVtaXQgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciBlciwgaGFuZGxlciwgbGVuLCBhcmdzLCBpLCBsaXN0ZW5lcnM7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpXG4gICAgdGhpcy5fZXZlbnRzID0ge307XG5cbiAgLy8gSWYgdGhlcmUgaXMgbm8gJ2Vycm9yJyBldmVudCBsaXN0ZW5lciB0aGVuIHRocm93LlxuICBpZiAodHlwZSA9PT0gJ2Vycm9yJykge1xuICAgIGlmICghdGhpcy5fZXZlbnRzLmVycm9yIHx8XG4gICAgICAgIChpc09iamVjdCh0aGlzLl9ldmVudHMuZXJyb3IpICYmICF0aGlzLl9ldmVudHMuZXJyb3IubGVuZ3RoKSkge1xuICAgICAgZXIgPSBhcmd1bWVudHNbMV07XG4gICAgICBpZiAoZXIgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgICB0aHJvdyBlcjsgLy8gVW5oYW5kbGVkICdlcnJvcicgZXZlbnRcbiAgICAgIH1cbiAgICAgIHRocm93IFR5cGVFcnJvcignVW5jYXVnaHQsIHVuc3BlY2lmaWVkIFwiZXJyb3JcIiBldmVudC4nKTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVyID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIGlmIChpc1VuZGVmaW5lZChoYW5kbGVyKSlcbiAgICByZXR1cm4gZmFsc2U7XG5cbiAgaWYgKGlzRnVuY3Rpb24oaGFuZGxlcikpIHtcbiAgICBzd2l0Y2ggKGFyZ3VtZW50cy5sZW5ndGgpIHtcbiAgICAgIC8vIGZhc3QgY2FzZXNcbiAgICAgIGNhc2UgMTpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMjpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAzOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pO1xuICAgICAgICBicmVhaztcbiAgICAgIC8vIHNsb3dlclxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgbGVuID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShsZW4gLSAxKTtcbiAgICAgICAgZm9yIChpID0gMTsgaSA8IGxlbjsgaSsrKVxuICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH1cbiAgfSBlbHNlIGlmIChpc09iamVjdChoYW5kbGVyKSkge1xuICAgIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgYXJncyA9IG5ldyBBcnJheShsZW4gLSAxKTtcbiAgICBmb3IgKGkgPSAxOyBpIDwgbGVuOyBpKyspXG4gICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcblxuICAgIGxpc3RlbmVycyA9IGhhbmRsZXIuc2xpY2UoKTtcbiAgICBsZW4gPSBsaXN0ZW5lcnMubGVuZ3RoO1xuICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKylcbiAgICAgIGxpc3RlbmVyc1tpXS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIHZhciBtO1xuXG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAvLyBUbyBhdm9pZCByZWN1cnNpb24gaW4gdGhlIGNhc2UgdGhhdCB0eXBlID09PSBcIm5ld0xpc3RlbmVyXCIhIEJlZm9yZVxuICAvLyBhZGRpbmcgaXQgdG8gdGhlIGxpc3RlbmVycywgZmlyc3QgZW1pdCBcIm5ld0xpc3RlbmVyXCIuXG4gIGlmICh0aGlzLl9ldmVudHMubmV3TGlzdGVuZXIpXG4gICAgdGhpcy5lbWl0KCduZXdMaXN0ZW5lcicsIHR5cGUsXG4gICAgICAgICAgICAgIGlzRnVuY3Rpb24obGlzdGVuZXIubGlzdGVuZXIpID9cbiAgICAgICAgICAgICAgbGlzdGVuZXIubGlzdGVuZXIgOiBsaXN0ZW5lcik7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgLy8gT3B0aW1pemUgdGhlIGNhc2Ugb2Ygb25lIGxpc3RlbmVyLiBEb24ndCBuZWVkIHRoZSBleHRyYSBhcnJheSBvYmplY3QuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gbGlzdGVuZXI7XG4gIGVsc2UgaWYgKGlzT2JqZWN0KHRoaXMuX2V2ZW50c1t0eXBlXSkpXG4gICAgLy8gSWYgd2UndmUgYWxyZWFkeSBnb3QgYW4gYXJyYXksIGp1c3QgYXBwZW5kLlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5wdXNoKGxpc3RlbmVyKTtcbiAgZWxzZVxuICAgIC8vIEFkZGluZyB0aGUgc2Vjb25kIGVsZW1lbnQsIG5lZWQgdG8gY2hhbmdlIHRvIGFycmF5LlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IFt0aGlzLl9ldmVudHNbdHlwZV0sIGxpc3RlbmVyXTtcblxuICAvLyBDaGVjayBmb3IgbGlzdGVuZXIgbGVha1xuICBpZiAoaXNPYmplY3QodGhpcy5fZXZlbnRzW3R5cGVdKSAmJiAhdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCkge1xuICAgIHZhciBtO1xuICAgIGlmICghaXNVbmRlZmluZWQodGhpcy5fbWF4TGlzdGVuZXJzKSkge1xuICAgICAgbSA9IHRoaXMuX21heExpc3RlbmVycztcbiAgICB9IGVsc2Uge1xuICAgICAgbSA9IEV2ZW50RW1pdHRlci5kZWZhdWx0TWF4TGlzdGVuZXJzO1xuICAgIH1cblxuICAgIGlmIChtICYmIG0gPiAwICYmIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGggPiBtKSB7XG4gICAgICB0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkID0gdHJ1ZTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJyhub2RlKSB3YXJuaW5nOiBwb3NzaWJsZSBFdmVudEVtaXR0ZXIgbWVtb3J5ICcgK1xuICAgICAgICAgICAgICAgICAgICAnbGVhayBkZXRlY3RlZC4gJWQgbGlzdGVuZXJzIGFkZGVkLiAnICtcbiAgICAgICAgICAgICAgICAgICAgJ1VzZSBlbWl0dGVyLnNldE1heExpc3RlbmVycygpIHRvIGluY3JlYXNlIGxpbWl0LicsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGgpO1xuICAgICAgaWYgKHR5cGVvZiBjb25zb2xlLnRyYWNlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIC8vIG5vdCBzdXBwb3J0ZWQgaW4gSUUgMTBcbiAgICAgICAgY29uc29sZS50cmFjZSgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbiA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGUuYWRkTGlzdGVuZXI7XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICB2YXIgZmlyZWQgPSBmYWxzZTtcblxuICBmdW5jdGlvbiBnKCkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgZyk7XG5cbiAgICBpZiAoIWZpcmVkKSB7XG4gICAgICBmaXJlZCA9IHRydWU7XG4gICAgICBsaXN0ZW5lci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH1cbiAgfVxuXG4gIGcubGlzdGVuZXIgPSBsaXN0ZW5lcjtcbiAgdGhpcy5vbih0eXBlLCBnKTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8vIGVtaXRzIGEgJ3JlbW92ZUxpc3RlbmVyJyBldmVudCBpZmYgdGhlIGxpc3RlbmVyIHdhcyByZW1vdmVkXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUxpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIGxpc3QsIHBvc2l0aW9uLCBsZW5ndGgsIGk7XG5cbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0dXJuIHRoaXM7XG5cbiAgbGlzdCA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgbGVuZ3RoID0gbGlzdC5sZW5ndGg7XG4gIHBvc2l0aW9uID0gLTE7XG5cbiAgaWYgKGxpc3QgPT09IGxpc3RlbmVyIHx8XG4gICAgICAoaXNGdW5jdGlvbihsaXN0Lmxpc3RlbmVyKSAmJiBsaXN0Lmxpc3RlbmVyID09PSBsaXN0ZW5lcikpIHtcbiAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIGlmICh0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpXG4gICAgICB0aGlzLmVtaXQoJ3JlbW92ZUxpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xuXG4gIH0gZWxzZSBpZiAoaXNPYmplY3QobGlzdCkpIHtcbiAgICBmb3IgKGkgPSBsZW5ndGg7IGktLSA+IDA7KSB7XG4gICAgICBpZiAobGlzdFtpXSA9PT0gbGlzdGVuZXIgfHxcbiAgICAgICAgICAobGlzdFtpXS5saXN0ZW5lciAmJiBsaXN0W2ldLmxpc3RlbmVyID09PSBsaXN0ZW5lcikpIHtcbiAgICAgICAgcG9zaXRpb24gPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocG9zaXRpb24gPCAwKVxuICAgICAgcmV0dXJuIHRoaXM7XG5cbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICAgIGxpc3QubGVuZ3RoID0gMDtcbiAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGxpc3Quc3BsaWNlKHBvc2l0aW9uLCAxKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKVxuICAgICAgdGhpcy5lbWl0KCdyZW1vdmVMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciBrZXksIGxpc3RlbmVycztcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICByZXR1cm4gdGhpcztcblxuICAvLyBub3QgbGlzdGVuaW5nIGZvciByZW1vdmVMaXN0ZW5lciwgbm8gbmVlZCB0byBlbWl0XG4gIGlmICghdGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKSB7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApXG4gICAgICB0aGlzLl9ldmVudHMgPSB7fTtcbiAgICBlbHNlIGlmICh0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLy8gZW1pdCByZW1vdmVMaXN0ZW5lciBmb3IgYWxsIGxpc3RlbmVycyBvbiBhbGwgZXZlbnRzXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgZm9yIChrZXkgaW4gdGhpcy5fZXZlbnRzKSB7XG4gICAgICBpZiAoa2V5ID09PSAncmVtb3ZlTGlzdGVuZXInKSBjb250aW51ZTtcbiAgICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKGtleSk7XG4gICAgfVxuICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKCdyZW1vdmVMaXN0ZW5lcicpO1xuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgbGlzdGVuZXJzID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIGlmIChpc0Z1bmN0aW9uKGxpc3RlbmVycykpIHtcbiAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGxpc3RlbmVycyk7XG4gIH0gZWxzZSB7XG4gICAgLy8gTElGTyBvcmRlclxuICAgIHdoaWxlIChsaXN0ZW5lcnMubGVuZ3RoKVxuICAgICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcnNbbGlzdGVuZXJzLmxlbmd0aCAtIDFdKTtcbiAgfVxuICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciByZXQ7XG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0ID0gW107XG4gIGVsc2UgaWYgKGlzRnVuY3Rpb24odGhpcy5fZXZlbnRzW3R5cGVdKSlcbiAgICByZXQgPSBbdGhpcy5fZXZlbnRzW3R5cGVdXTtcbiAgZWxzZVxuICAgIHJldCA9IHRoaXMuX2V2ZW50c1t0eXBlXS5zbGljZSgpO1xuICByZXR1cm4gcmV0O1xufTtcblxuRXZlbnRFbWl0dGVyLmxpc3RlbmVyQ291bnQgPSBmdW5jdGlvbihlbWl0dGVyLCB0eXBlKSB7XG4gIHZhciByZXQ7XG4gIGlmICghZW1pdHRlci5fZXZlbnRzIHx8ICFlbWl0dGVyLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0ID0gMDtcbiAgZWxzZSBpZiAoaXNGdW5jdGlvbihlbWl0dGVyLl9ldmVudHNbdHlwZV0pKVxuICAgIHJldCA9IDE7XG4gIGVsc2VcbiAgICByZXQgPSBlbWl0dGVyLl9ldmVudHNbdHlwZV0ubGVuZ3RoO1xuICByZXR1cm4gcmV0O1xufTtcblxuZnVuY3Rpb24gaXNGdW5jdGlvbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdmdW5jdGlvbic7XG59XG5cbmZ1bmN0aW9uIGlzTnVtYmVyKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ251bWJlcic7XG59XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuIiwidmFyIGFycmF5TWFwID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYXJyYXlNYXAnKSxcbiAgICBiYXNlQ2FsbGJhY2sgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9iYXNlQ2FsbGJhY2snKSxcbiAgICBiYXNlTWFwID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYmFzZU1hcCcpLFxuICAgIGlzQXJyYXkgPSByZXF1aXJlKCcuLi9sYW5nL2lzQXJyYXknKTtcblxuLyoqXG4gKiBDcmVhdGVzIGFuIGFycmF5IG9mIHZhbHVlcyBieSBydW5uaW5nIGVhY2ggZWxlbWVudCBpbiBgY29sbGVjdGlvbmAgdGhyb3VnaFxuICogYGl0ZXJhdGVlYC4gVGhlIGBpdGVyYXRlZWAgaXMgYm91bmQgdG8gYHRoaXNBcmdgIGFuZCBpbnZva2VkIHdpdGggdGhyZWVcbiAqIGFyZ3VtZW50czsgKHZhbHVlLCBpbmRleHxrZXksIGNvbGxlY3Rpb24pLlxuICpcbiAqIElmIGEgcHJvcGVydHkgbmFtZSBpcyBwcm92aWRlZCBmb3IgYHByZWRpY2F0ZWAgdGhlIGNyZWF0ZWQgXCJfLnByb3BlcnR5XCJcbiAqIHN0eWxlIGNhbGxiYWNrIHJldHVybnMgdGhlIHByb3BlcnR5IHZhbHVlIG9mIHRoZSBnaXZlbiBlbGVtZW50LlxuICpcbiAqIElmIGFuIG9iamVjdCBpcyBwcm92aWRlZCBmb3IgYHByZWRpY2F0ZWAgdGhlIGNyZWF0ZWQgXCJfLm1hdGNoZXNcIiBzdHlsZVxuICogY2FsbGJhY2sgcmV0dXJucyBgdHJ1ZWAgZm9yIGVsZW1lbnRzIHRoYXQgaGF2ZSB0aGUgcHJvcGVydGllcyBvZiB0aGUgZ2l2ZW5cbiAqIG9iamVjdCwgZWxzZSBgZmFsc2VgLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAYWxpYXMgY29sbGVjdFxuICogQGNhdGVnb3J5IENvbGxlY3Rpb25cbiAqIEBwYXJhbSB7QXJyYXl8T2JqZWN0fHN0cmluZ30gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufE9iamVjdHxzdHJpbmd9IFtpdGVyYXRlZT1fLmlkZW50aXR5XSBUaGUgZnVuY3Rpb24gaW52b2tlZFxuICogIHBlciBpdGVyYXRpb24uIElmIGEgcHJvcGVydHkgbmFtZSBvciBvYmplY3QgaXMgcHJvdmlkZWQgaXQgaXMgdXNlZCB0b1xuICogIGNyZWF0ZSBhIFwiXy5wcm9wZXJ0eVwiIG9yIFwiXy5tYXRjaGVzXCIgc3R5bGUgY2FsbGJhY2sgcmVzcGVjdGl2ZWx5LlxuICogQHBhcmFtIHsqfSBbdGhpc0FyZ10gVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBpdGVyYXRlZWAuXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgdGhlIG5ldyBtYXBwZWQgYXJyYXkuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8ubWFwKFsxLCAyLCAzXSwgZnVuY3Rpb24obikgeyByZXR1cm4gbiAqIDM7IH0pO1xuICogLy8gPT4gWzMsIDYsIDldXG4gKlxuICogXy5tYXAoeyAnb25lJzogMSwgJ3R3byc6IDIsICd0aHJlZSc6IDMgfSwgZnVuY3Rpb24obikgeyByZXR1cm4gbiAqIDM7IH0pO1xuICogLy8gPT4gWzMsIDYsIDldIChpdGVyYXRpb24gb3JkZXIgaXMgbm90IGd1YXJhbnRlZWQpXG4gKlxuICogdmFyIHVzZXJzID0gW1xuICogICB7ICd1c2VyJzogJ2Jhcm5leScgfSxcbiAqICAgeyAndXNlcic6ICdmcmVkJyB9XG4gKiBdO1xuICpcbiAqIC8vIHVzaW5nIHRoZSBcIl8ucHJvcGVydHlcIiBjYWxsYmFjayBzaG9ydGhhbmRcbiAqIF8ubWFwKHVzZXJzLCAndXNlcicpO1xuICogLy8gPT4gWydiYXJuZXknLCAnZnJlZCddXG4gKi9cbmZ1bmN0aW9uIG1hcChjb2xsZWN0aW9uLCBpdGVyYXRlZSwgdGhpc0FyZykge1xuICB2YXIgZnVuYyA9IGlzQXJyYXkoY29sbGVjdGlvbikgPyBhcnJheU1hcCA6IGJhc2VNYXA7XG4gIGl0ZXJhdGVlID0gYmFzZUNhbGxiYWNrKGl0ZXJhdGVlLCB0aGlzQXJnLCAzKTtcbiAgcmV0dXJuIGZ1bmMoY29sbGVjdGlvbiwgaXRlcmF0ZWUpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IG1hcDtcbiIsIi8qKlxuICogQ29waWVzIHRoZSB2YWx1ZXMgb2YgYHNvdXJjZWAgdG8gYGFycmF5YC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gc291cmNlIFRoZSBhcnJheSB0byBjb3B5IHZhbHVlcyBmcm9tLlxuICogQHBhcmFtIHtBcnJheX0gW2FycmF5PVtdXSBUaGUgYXJyYXkgdG8gY29weSB2YWx1ZXMgdG8uXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgYGFycmF5YC5cbiAqL1xuZnVuY3Rpb24gYXJyYXlDb3B5KHNvdXJjZSwgYXJyYXkpIHtcbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICBsZW5ndGggPSBzb3VyY2UubGVuZ3RoO1xuXG4gIGFycmF5IHx8IChhcnJheSA9IEFycmF5KGxlbmd0aCkpO1xuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIGFycmF5W2luZGV4XSA9IHNvdXJjZVtpbmRleF07XG4gIH1cbiAgcmV0dXJuIGFycmF5O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFycmF5Q29weTtcbiIsIi8qKlxuICogQSBzcGVjaWFsaXplZCB2ZXJzaW9uIG9mIGBfLmZvckVhY2hgIGZvciBhcnJheXMgd2l0aG91dCBzdXBwb3J0IGZvciBjYWxsYmFja1xuICogc2hvcnRoYW5kcyBvciBgdGhpc2AgYmluZGluZy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGl0ZXJhdGVlIFRoZSBmdW5jdGlvbiBpbnZva2VkIHBlciBpdGVyYXRpb24uXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgYGFycmF5YC5cbiAqL1xuZnVuY3Rpb24gYXJyYXlFYWNoKGFycmF5LCBpdGVyYXRlZSkge1xuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGxlbmd0aCA9IGFycmF5Lmxlbmd0aDtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIGlmIChpdGVyYXRlZShhcnJheVtpbmRleF0sIGluZGV4LCBhcnJheSkgPT09IGZhbHNlKSB7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFycmF5O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFycmF5RWFjaDtcbiIsIi8qKlxuICogQSBzcGVjaWFsaXplZCB2ZXJzaW9uIG9mIGBfLm1hcGAgZm9yIGFycmF5cyB3aXRob3V0IHN1cHBvcnQgZm9yIGNhbGxiYWNrXG4gKiBzaG9ydGhhbmRzIG9yIGB0aGlzYCBiaW5kaW5nLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gaXRlcmF0ZWUgVGhlIGZ1bmN0aW9uIGludm9rZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgbmV3IG1hcHBlZCBhcnJheS5cbiAqL1xuZnVuY3Rpb24gYXJyYXlNYXAoYXJyYXksIGl0ZXJhdGVlKSB7XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgbGVuZ3RoID0gYXJyYXkubGVuZ3RoLFxuICAgICAgcmVzdWx0ID0gQXJyYXkobGVuZ3RoKTtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHJlc3VsdFtpbmRleF0gPSBpdGVyYXRlZShhcnJheVtpbmRleF0sIGluZGV4LCBhcnJheSk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBhcnJheU1hcDtcbiIsInZhciBiYXNlTWF0Y2hlcyA9IHJlcXVpcmUoJy4vYmFzZU1hdGNoZXMnKSxcbiAgICBiYXNlUHJvcGVydHkgPSByZXF1aXJlKCcuL2Jhc2VQcm9wZXJ0eScpLFxuICAgIGJhc2VUb1N0cmluZyA9IHJlcXVpcmUoJy4vYmFzZVRvU3RyaW5nJyksXG4gICAgYmluZENhbGxiYWNrID0gcmVxdWlyZSgnLi9iaW5kQ2FsbGJhY2snKSxcbiAgICBpZGVudGl0eSA9IHJlcXVpcmUoJy4uL3V0aWxpdHkvaWRlbnRpdHknKSxcbiAgICBpc0JpbmRhYmxlID0gcmVxdWlyZSgnLi9pc0JpbmRhYmxlJyk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8uY2FsbGJhY2tgIHdoaWNoIHN1cHBvcnRzIHNwZWNpZnlpbmcgdGhlXG4gKiBudW1iZXIgb2YgYXJndW1lbnRzIHRvIHByb3ZpZGUgdG8gYGZ1bmNgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IFtmdW5jPV8uaWRlbnRpdHldIFRoZSB2YWx1ZSB0byBjb252ZXJ0IHRvIGEgY2FsbGJhY2suXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGZ1bmNgLlxuICogQHBhcmFtIHtudW1iZXJ9IFthcmdDb3VudF0gVGhlIG51bWJlciBvZiBhcmd1bWVudHMgdG8gcHJvdmlkZSB0byBgZnVuY2AuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIGNhbGxiYWNrLlxuICovXG5mdW5jdGlvbiBiYXNlQ2FsbGJhY2soZnVuYywgdGhpc0FyZywgYXJnQ291bnQpIHtcbiAgdmFyIHR5cGUgPSB0eXBlb2YgZnVuYztcbiAgaWYgKHR5cGUgPT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybiAodHlwZW9mIHRoaXNBcmcgIT0gJ3VuZGVmaW5lZCcgJiYgaXNCaW5kYWJsZShmdW5jKSlcbiAgICAgID8gYmluZENhbGxiYWNrKGZ1bmMsIHRoaXNBcmcsIGFyZ0NvdW50KVxuICAgICAgOiBmdW5jO1xuICB9XG4gIGlmIChmdW5jID09IG51bGwpIHtcbiAgICByZXR1cm4gaWRlbnRpdHk7XG4gIH1cbiAgLy8gSGFuZGxlIFwiXy5wcm9wZXJ0eVwiIGFuZCBcIl8ubWF0Y2hlc1wiIHN0eWxlIGNhbGxiYWNrIHNob3J0aGFuZHMuXG4gIHJldHVybiB0eXBlID09ICdvYmplY3QnXG4gICAgPyBiYXNlTWF0Y2hlcyhmdW5jLCAhYXJnQ291bnQpXG4gICAgOiBiYXNlUHJvcGVydHkoYXJnQ291bnQgPyBiYXNlVG9TdHJpbmcoZnVuYykgOiBmdW5jKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlQ2FsbGJhY2s7XG4iLCJ2YXIgYXJyYXlDb3B5ID0gcmVxdWlyZSgnLi9hcnJheUNvcHknKSxcbiAgICBhcnJheUVhY2ggPSByZXF1aXJlKCcuL2FycmF5RWFjaCcpLFxuICAgIGJhc2VDb3B5ID0gcmVxdWlyZSgnLi9iYXNlQ29weScpLFxuICAgIGJhc2VGb3JPd24gPSByZXF1aXJlKCcuL2Jhc2VGb3JPd24nKSxcbiAgICBpbml0Q2xvbmVBcnJheSA9IHJlcXVpcmUoJy4vaW5pdENsb25lQXJyYXknKSxcbiAgICBpbml0Q2xvbmVCeVRhZyA9IHJlcXVpcmUoJy4vaW5pdENsb25lQnlUYWcnKSxcbiAgICBpbml0Q2xvbmVPYmplY3QgPSByZXF1aXJlKCcuL2luaXRDbG9uZU9iamVjdCcpLFxuICAgIGlzQXJyYXkgPSByZXF1aXJlKCcuLi9sYW5nL2lzQXJyYXknKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJy4uL2xhbmcvaXNPYmplY3QnKSxcbiAgICBrZXlzID0gcmVxdWlyZSgnLi4vb2JqZWN0L2tleXMnKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIGFyZ3NUYWcgPSAnW29iamVjdCBBcmd1bWVudHNdJyxcbiAgICBhcnJheVRhZyA9ICdbb2JqZWN0IEFycmF5XScsXG4gICAgYm9vbFRhZyA9ICdbb2JqZWN0IEJvb2xlYW5dJyxcbiAgICBkYXRlVGFnID0gJ1tvYmplY3QgRGF0ZV0nLFxuICAgIGVycm9yVGFnID0gJ1tvYmplY3QgRXJyb3JdJyxcbiAgICBmdW5jVGFnID0gJ1tvYmplY3QgRnVuY3Rpb25dJyxcbiAgICBtYXBUYWcgPSAnW29iamVjdCBNYXBdJyxcbiAgICBudW1iZXJUYWcgPSAnW29iamVjdCBOdW1iZXJdJyxcbiAgICBvYmplY3RUYWcgPSAnW29iamVjdCBPYmplY3RdJyxcbiAgICByZWdleHBUYWcgPSAnW29iamVjdCBSZWdFeHBdJyxcbiAgICBzZXRUYWcgPSAnW29iamVjdCBTZXRdJyxcbiAgICBzdHJpbmdUYWcgPSAnW29iamVjdCBTdHJpbmddJyxcbiAgICB3ZWFrTWFwVGFnID0gJ1tvYmplY3QgV2Vha01hcF0nO1xuXG52YXIgYXJyYXlCdWZmZXJUYWcgPSAnW29iamVjdCBBcnJheUJ1ZmZlcl0nLFxuICAgIGZsb2F0MzJUYWcgPSAnW29iamVjdCBGbG9hdDMyQXJyYXldJyxcbiAgICBmbG9hdDY0VGFnID0gJ1tvYmplY3QgRmxvYXQ2NEFycmF5XScsXG4gICAgaW50OFRhZyA9ICdbb2JqZWN0IEludDhBcnJheV0nLFxuICAgIGludDE2VGFnID0gJ1tvYmplY3QgSW50MTZBcnJheV0nLFxuICAgIGludDMyVGFnID0gJ1tvYmplY3QgSW50MzJBcnJheV0nLFxuICAgIHVpbnQ4VGFnID0gJ1tvYmplY3QgVWludDhBcnJheV0nLFxuICAgIHVpbnQ4Q2xhbXBlZFRhZyA9ICdbb2JqZWN0IFVpbnQ4Q2xhbXBlZEFycmF5XScsXG4gICAgdWludDE2VGFnID0gJ1tvYmplY3QgVWludDE2QXJyYXldJyxcbiAgICB1aW50MzJUYWcgPSAnW29iamVjdCBVaW50MzJBcnJheV0nO1xuXG4vKiogVXNlZCB0byBpZGVudGlmeSBgdG9TdHJpbmdUYWdgIHZhbHVlcyBzdXBwb3J0ZWQgYnkgYF8uY2xvbmVgLiAqL1xudmFyIGNsb25lYWJsZVRhZ3MgPSB7fTtcbmNsb25lYWJsZVRhZ3NbYXJnc1RhZ10gPSBjbG9uZWFibGVUYWdzW2FycmF5VGFnXSA9XG5jbG9uZWFibGVUYWdzW2FycmF5QnVmZmVyVGFnXSA9IGNsb25lYWJsZVRhZ3NbYm9vbFRhZ10gPVxuY2xvbmVhYmxlVGFnc1tkYXRlVGFnXSA9IGNsb25lYWJsZVRhZ3NbZmxvYXQzMlRhZ10gPVxuY2xvbmVhYmxlVGFnc1tmbG9hdDY0VGFnXSA9IGNsb25lYWJsZVRhZ3NbaW50OFRhZ10gPVxuY2xvbmVhYmxlVGFnc1tpbnQxNlRhZ10gPSBjbG9uZWFibGVUYWdzW2ludDMyVGFnXSA9XG5jbG9uZWFibGVUYWdzW251bWJlclRhZ10gPSBjbG9uZWFibGVUYWdzW29iamVjdFRhZ10gPVxuY2xvbmVhYmxlVGFnc1tyZWdleHBUYWddID0gY2xvbmVhYmxlVGFnc1tzdHJpbmdUYWddID1cbmNsb25lYWJsZVRhZ3NbdWludDhUYWddID0gY2xvbmVhYmxlVGFnc1t1aW50OENsYW1wZWRUYWddID1cbmNsb25lYWJsZVRhZ3NbdWludDE2VGFnXSA9IGNsb25lYWJsZVRhZ3NbdWludDMyVGFnXSA9IHRydWU7XG5jbG9uZWFibGVUYWdzW2Vycm9yVGFnXSA9IGNsb25lYWJsZVRhZ3NbZnVuY1RhZ10gPVxuY2xvbmVhYmxlVGFnc1ttYXBUYWddID0gY2xvbmVhYmxlVGFnc1tzZXRUYWddID1cbmNsb25lYWJsZVRhZ3Nbd2Vha01hcFRhZ10gPSBmYWxzZTtcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZSBgdG9TdHJpbmdUYWdgIG9mIHZhbHVlcy5cbiAqIFNlZSB0aGUgW0VTIHNwZWNdKGh0dHBzOi8vcGVvcGxlLm1vemlsbGEub3JnL35qb3JlbmRvcmZmL2VzNi1kcmFmdC5odG1sI3NlYy1vYmplY3QucHJvdG90eXBlLnRvc3RyaW5nKVxuICogZm9yIG1vcmUgZGV0YWlscy5cbiAqL1xudmFyIG9ialRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8uY2xvbmVgIHdpdGhvdXQgc3VwcG9ydCBmb3IgYXJndW1lbnQganVnZ2xpbmdcbiAqIGFuZCBgdGhpc2AgYmluZGluZyBgY3VzdG9taXplcmAgZnVuY3Rpb25zLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjbG9uZS5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2lzRGVlcF0gU3BlY2lmeSBhIGRlZXAgY2xvbmUuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY3VzdG9taXplcl0gVGhlIGZ1bmN0aW9uIHRvIGN1c3RvbWl6ZSBjbG9uaW5nIHZhbHVlcy5cbiAqIEBwYXJhbSB7c3RyaW5nfSBba2V5XSBUaGUga2V5IG9mIGB2YWx1ZWAuXG4gKiBAcGFyYW0ge09iamVjdH0gW29iamVjdF0gVGhlIG9iamVjdCBgdmFsdWVgIGJlbG9uZ3MgdG8uXG4gKiBAcGFyYW0ge0FycmF5fSBbc3RhY2tBPVtdXSBUcmFja3MgdHJhdmVyc2VkIHNvdXJjZSBvYmplY3RzLlxuICogQHBhcmFtIHtBcnJheX0gW3N0YWNrQj1bXV0gQXNzb2NpYXRlcyBjbG9uZXMgd2l0aCBzb3VyY2UgY291bnRlcnBhcnRzLlxuICogQHJldHVybnMgeyp9IFJldHVybnMgdGhlIGNsb25lZCB2YWx1ZS5cbiAqL1xuZnVuY3Rpb24gYmFzZUNsb25lKHZhbHVlLCBpc0RlZXAsIGN1c3RvbWl6ZXIsIGtleSwgb2JqZWN0LCBzdGFja0EsIHN0YWNrQikge1xuICB2YXIgcmVzdWx0O1xuICBpZiAoY3VzdG9taXplcikge1xuICAgIHJlc3VsdCA9IG9iamVjdCA/IGN1c3RvbWl6ZXIodmFsdWUsIGtleSwgb2JqZWN0KSA6IGN1c3RvbWl6ZXIodmFsdWUpO1xuICB9XG4gIGlmICh0eXBlb2YgcmVzdWx0ICE9ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuICBpZiAoIWlzT2JqZWN0KHZhbHVlKSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICB2YXIgaXNBcnIgPSBpc0FycmF5KHZhbHVlKTtcbiAgaWYgKGlzQXJyKSB7XG4gICAgcmVzdWx0ID0gaW5pdENsb25lQXJyYXkodmFsdWUpO1xuICAgIGlmICghaXNEZWVwKSB7XG4gICAgICByZXR1cm4gYXJyYXlDb3B5KHZhbHVlLCByZXN1bHQpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB2YXIgdGFnID0gb2JqVG9TdHJpbmcuY2FsbCh2YWx1ZSksXG4gICAgICAgIGlzRnVuYyA9IHRhZyA9PSBmdW5jVGFnO1xuXG4gICAgaWYgKHRhZyA9PSBvYmplY3RUYWcgfHwgdGFnID09IGFyZ3NUYWcgfHwgKGlzRnVuYyAmJiAhb2JqZWN0KSkge1xuICAgICAgcmVzdWx0ID0gaW5pdENsb25lT2JqZWN0KGlzRnVuYyA/IHt9IDogdmFsdWUpO1xuICAgICAgaWYgKCFpc0RlZXApIHtcbiAgICAgICAgcmV0dXJuIGJhc2VDb3B5KHZhbHVlLCByZXN1bHQsIGtleXModmFsdWUpKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGNsb25lYWJsZVRhZ3NbdGFnXVxuICAgICAgICA/IGluaXRDbG9uZUJ5VGFnKHZhbHVlLCB0YWcsIGlzRGVlcClcbiAgICAgICAgOiAob2JqZWN0ID8gdmFsdWUgOiB7fSk7XG4gICAgfVxuICB9XG4gIC8vIENoZWNrIGZvciBjaXJjdWxhciByZWZlcmVuY2VzIGFuZCByZXR1cm4gY29ycmVzcG9uZGluZyBjbG9uZS5cbiAgc3RhY2tBIHx8IChzdGFja0EgPSBbXSk7XG4gIHN0YWNrQiB8fCAoc3RhY2tCID0gW10pO1xuXG4gIHZhciBsZW5ndGggPSBzdGFja0EubGVuZ3RoO1xuICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICBpZiAoc3RhY2tBW2xlbmd0aF0gPT0gdmFsdWUpIHtcbiAgICAgIHJldHVybiBzdGFja0JbbGVuZ3RoXTtcbiAgICB9XG4gIH1cbiAgLy8gQWRkIHRoZSBzb3VyY2UgdmFsdWUgdG8gdGhlIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzIGFuZCBhc3NvY2lhdGUgaXQgd2l0aCBpdHMgY2xvbmUuXG4gIHN0YWNrQS5wdXNoKHZhbHVlKTtcbiAgc3RhY2tCLnB1c2gocmVzdWx0KTtcblxuICAvLyBSZWN1cnNpdmVseSBwb3B1bGF0ZSBjbG9uZSAoc3VzY2VwdGlibGUgdG8gY2FsbCBzdGFjayBsaW1pdHMpLlxuICAoaXNBcnIgPyBhcnJheUVhY2ggOiBiYXNlRm9yT3duKSh2YWx1ZSwgZnVuY3Rpb24oc3ViVmFsdWUsIGtleSkge1xuICAgIHJlc3VsdFtrZXldID0gYmFzZUNsb25lKHN1YlZhbHVlLCBpc0RlZXAsIGN1c3RvbWl6ZXIsIGtleSwgdmFsdWUsIHN0YWNrQSwgc3RhY2tCKTtcbiAgfSk7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUNsb25lO1xuIiwiLyoqXG4gKiBDb3BpZXMgdGhlIHByb3BlcnRpZXMgb2YgYHNvdXJjZWAgdG8gYG9iamVjdGAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBzb3VyY2UgVGhlIG9iamVjdCB0byBjb3B5IHByb3BlcnRpZXMgZnJvbS5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbb2JqZWN0PXt9XSBUaGUgb2JqZWN0IHRvIGNvcHkgcHJvcGVydGllcyB0by5cbiAqIEBwYXJhbSB7QXJyYXl9IHByb3BzIFRoZSBwcm9wZXJ0eSBuYW1lcyB0byBjb3B5LlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyBgb2JqZWN0YC5cbiAqL1xuZnVuY3Rpb24gYmFzZUNvcHkoc291cmNlLCBvYmplY3QsIHByb3BzKSB7XG4gIGlmICghcHJvcHMpIHtcbiAgICBwcm9wcyA9IG9iamVjdDtcbiAgICBvYmplY3QgPSB7fTtcbiAgfVxuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGxlbmd0aCA9IHByb3BzLmxlbmd0aDtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHZhciBrZXkgPSBwcm9wc1tpbmRleF07XG4gICAgb2JqZWN0W2tleV0gPSBzb3VyY2Vba2V5XTtcbiAgfVxuICByZXR1cm4gb2JqZWN0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VDb3B5O1xuIiwidmFyIGJhc2VGb3JPd24gPSByZXF1aXJlKCcuL2Jhc2VGb3JPd24nKSxcbiAgICBpc0xlbmd0aCA9IHJlcXVpcmUoJy4vaXNMZW5ndGgnKSxcbiAgICB0b09iamVjdCA9IHJlcXVpcmUoJy4vdG9PYmplY3QnKTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5mb3JFYWNoYCB3aXRob3V0IHN1cHBvcnQgZm9yIGNhbGxiYWNrXG4gKiBzaG9ydGhhbmRzIGFuZCBgdGhpc2AgYmluZGluZy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheXxPYmplY3R8c3RyaW5nfSBjb2xsZWN0aW9uIFRoZSBjb2xsZWN0aW9uIHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGl0ZXJhdGVlIFRoZSBmdW5jdGlvbiBpbnZva2VkIHBlciBpdGVyYXRpb24uXG4gKiBAcmV0dXJucyB7QXJyYXl8T2JqZWN0fHN0cmluZ30gUmV0dXJucyBgY29sbGVjdGlvbmAuXG4gKi9cbmZ1bmN0aW9uIGJhc2VFYWNoKGNvbGxlY3Rpb24sIGl0ZXJhdGVlKSB7XG4gIHZhciBsZW5ndGggPSBjb2xsZWN0aW9uID8gY29sbGVjdGlvbi5sZW5ndGggOiAwO1xuICBpZiAoIWlzTGVuZ3RoKGxlbmd0aCkpIHtcbiAgICByZXR1cm4gYmFzZUZvck93bihjb2xsZWN0aW9uLCBpdGVyYXRlZSk7XG4gIH1cbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICBpdGVyYWJsZSA9IHRvT2JqZWN0KGNvbGxlY3Rpb24pO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgaWYgKGl0ZXJhdGVlKGl0ZXJhYmxlW2luZGV4XSwgaW5kZXgsIGl0ZXJhYmxlKSA9PT0gZmFsc2UpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29sbGVjdGlvbjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlRWFjaDtcbiIsInZhciB0b09iamVjdCA9IHJlcXVpcmUoJy4vdG9PYmplY3QnKTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgYmFzZUZvckluYCBhbmQgYGJhc2VGb3JPd25gIHdoaWNoIGl0ZXJhdGVzXG4gKiBvdmVyIGBvYmplY3RgIHByb3BlcnRpZXMgcmV0dXJuZWQgYnkgYGtleXNGdW5jYCBpbnZva2luZyBgaXRlcmF0ZWVgIGZvclxuICogZWFjaCBwcm9wZXJ0eS4gSXRlcmF0b3IgZnVuY3Rpb25zIG1heSBleGl0IGl0ZXJhdGlvbiBlYXJseSBieSBleHBsaWNpdGx5XG4gKiByZXR1cm5pbmcgYGZhbHNlYC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGl0ZXJhdGVlIFRoZSBmdW5jdGlvbiBpbnZva2VkIHBlciBpdGVyYXRpb24uXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBrZXlzRnVuYyBUaGUgZnVuY3Rpb24gdG8gZ2V0IHRoZSBrZXlzIG9mIGBvYmplY3RgLlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyBgb2JqZWN0YC5cbiAqL1xuZnVuY3Rpb24gYmFzZUZvcihvYmplY3QsIGl0ZXJhdGVlLCBrZXlzRnVuYykge1xuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGl0ZXJhYmxlID0gdG9PYmplY3Qob2JqZWN0KSxcbiAgICAgIHByb3BzID0ga2V5c0Z1bmMob2JqZWN0KSxcbiAgICAgIGxlbmd0aCA9IHByb3BzLmxlbmd0aDtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHZhciBrZXkgPSBwcm9wc1tpbmRleF07XG4gICAgaWYgKGl0ZXJhdGVlKGl0ZXJhYmxlW2tleV0sIGtleSwgaXRlcmFibGUpID09PSBmYWxzZSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIHJldHVybiBvYmplY3Q7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUZvcjtcbiIsInZhciBiYXNlRm9yID0gcmVxdWlyZSgnLi9iYXNlRm9yJyksXG4gICAga2V5cyA9IHJlcXVpcmUoJy4uL29iamVjdC9rZXlzJyk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8uZm9yT3duYCB3aXRob3V0IHN1cHBvcnQgZm9yIGNhbGxiYWNrXG4gKiBzaG9ydGhhbmRzIGFuZCBgdGhpc2AgYmluZGluZy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGl0ZXJhdGVlIFRoZSBmdW5jdGlvbiBpbnZva2VkIHBlciBpdGVyYXRpb24uXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZXR1cm5zIGBvYmplY3RgLlxuICovXG5mdW5jdGlvbiBiYXNlRm9yT3duKG9iamVjdCwgaXRlcmF0ZWUpIHtcbiAgcmV0dXJuIGJhc2VGb3Iob2JqZWN0LCBpdGVyYXRlZSwga2V5cyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUZvck93bjtcbiIsInZhciBiYXNlSXNFcXVhbERlZXAgPSByZXF1aXJlKCcuL2Jhc2VJc0VxdWFsRGVlcCcpO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmlzRXF1YWxgIHdpdGhvdXQgc3VwcG9ydCBmb3IgYHRoaXNgIGJpbmRpbmdcbiAqIGBjdXN0b21pemVyYCBmdW5jdGlvbnMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNvbXBhcmUuXG4gKiBAcGFyYW0geyp9IG90aGVyIFRoZSBvdGhlciB2YWx1ZSB0byBjb21wYXJlLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2N1c3RvbWl6ZXJdIFRoZSBmdW5jdGlvbiB0byBjdXN0b21pemUgY29tcGFyaW5nIHZhbHVlcy5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2lzV2hlcmVdIFNwZWNpZnkgcGVyZm9ybWluZyBwYXJ0aWFsIGNvbXBhcmlzb25zLlxuICogQHBhcmFtIHtBcnJheX0gW3N0YWNrQV0gVHJhY2tzIHRyYXZlcnNlZCBgdmFsdWVgIG9iamVjdHMuXG4gKiBAcGFyYW0ge0FycmF5fSBbc3RhY2tCXSBUcmFja3MgdHJhdmVyc2VkIGBvdGhlcmAgb2JqZWN0cy5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgdmFsdWVzIGFyZSBlcXVpdmFsZW50LCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGJhc2VJc0VxdWFsKHZhbHVlLCBvdGhlciwgY3VzdG9taXplciwgaXNXaGVyZSwgc3RhY2tBLCBzdGFja0IpIHtcbiAgLy8gRXhpdCBlYXJseSBmb3IgaWRlbnRpY2FsIHZhbHVlcy5cbiAgaWYgKHZhbHVlID09PSBvdGhlcikge1xuICAgIC8vIFRyZWF0IGArMGAgdnMuIGAtMGAgYXMgbm90IGVxdWFsLlxuICAgIHJldHVybiB2YWx1ZSAhPT0gMCB8fCAoMSAvIHZhbHVlID09IDEgLyBvdGhlcik7XG4gIH1cbiAgdmFyIHZhbFR5cGUgPSB0eXBlb2YgdmFsdWUsXG4gICAgICBvdGhUeXBlID0gdHlwZW9mIG90aGVyO1xuXG4gIC8vIEV4aXQgZWFybHkgZm9yIHVubGlrZSBwcmltaXRpdmUgdmFsdWVzLlxuICBpZiAoKHZhbFR5cGUgIT0gJ2Z1bmN0aW9uJyAmJiB2YWxUeXBlICE9ICdvYmplY3QnICYmIG90aFR5cGUgIT0gJ2Z1bmN0aW9uJyAmJiBvdGhUeXBlICE9ICdvYmplY3QnKSB8fFxuICAgICAgdmFsdWUgPT0gbnVsbCB8fCBvdGhlciA9PSBudWxsKSB7XG4gICAgLy8gUmV0dXJuIGBmYWxzZWAgdW5sZXNzIGJvdGggdmFsdWVzIGFyZSBgTmFOYC5cbiAgICByZXR1cm4gdmFsdWUgIT09IHZhbHVlICYmIG90aGVyICE9PSBvdGhlcjtcbiAgfVxuICByZXR1cm4gYmFzZUlzRXF1YWxEZWVwKHZhbHVlLCBvdGhlciwgYmFzZUlzRXF1YWwsIGN1c3RvbWl6ZXIsIGlzV2hlcmUsIHN0YWNrQSwgc3RhY2tCKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlSXNFcXVhbDtcbiIsInZhciBlcXVhbEFycmF5cyA9IHJlcXVpcmUoJy4vZXF1YWxBcnJheXMnKSxcbiAgICBlcXVhbEJ5VGFnID0gcmVxdWlyZSgnLi9lcXVhbEJ5VGFnJyksXG4gICAgZXF1YWxPYmplY3RzID0gcmVxdWlyZSgnLi9lcXVhbE9iamVjdHMnKSxcbiAgICBpc0FycmF5ID0gcmVxdWlyZSgnLi4vbGFuZy9pc0FycmF5JyksXG4gICAgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi4vbGFuZy9pc1R5cGVkQXJyYXknKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIGFyZ3NUYWcgPSAnW29iamVjdCBBcmd1bWVudHNdJyxcbiAgICBhcnJheVRhZyA9ICdbb2JqZWN0IEFycmF5XScsXG4gICAgb2JqZWN0VGFnID0gJ1tvYmplY3QgT2JqZWN0XSc7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byBjaGVjayBvYmplY3RzIGZvciBvd24gcHJvcGVydGllcy4gKi9cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdFByb3RvLmhhc093blByb3BlcnR5O1xuXG4vKipcbiAqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgYHRvU3RyaW5nVGFnYCBvZiB2YWx1ZXMuXG4gKiBTZWUgdGhlIFtFUyBzcGVjXShodHRwczovL3Blb3BsZS5tb3ppbGxhLm9yZy9+am9yZW5kb3JmZi9lczYtZHJhZnQuaHRtbCNzZWMtb2JqZWN0LnByb3RvdHlwZS50b3N0cmluZylcbiAqIGZvciBtb3JlIGRldGFpbHMuXG4gKi9cbnZhciBvYmpUb1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKipcbiAqIEEgc3BlY2lhbGl6ZWQgdmVyc2lvbiBvZiBgYmFzZUlzRXF1YWxgIGZvciBhcnJheXMgYW5kIG9iamVjdHMgd2hpY2ggcGVyZm9ybXNcbiAqIGRlZXAgY29tcGFyaXNvbnMgYW5kIHRyYWNrcyB0cmF2ZXJzZWQgb2JqZWN0cyBlbmFibGluZyBvYmplY3RzIHdpdGggY2lyY3VsYXJcbiAqIHJlZmVyZW5jZXMgdG8gYmUgY29tcGFyZWQuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBjb21wYXJlLlxuICogQHBhcmFtIHtPYmplY3R9IG90aGVyIFRoZSBvdGhlciBvYmplY3QgdG8gY29tcGFyZS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGVxdWFsRnVuYyBUaGUgZnVuY3Rpb24gdG8gZGV0ZXJtaW5lIGVxdWl2YWxlbnRzIG9mIHZhbHVlcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtjdXN0b21pemVyXSBUaGUgZnVuY3Rpb24gdG8gY3VzdG9taXplIGNvbXBhcmluZyBvYmplY3RzLlxuICogQHBhcmFtIHtib29sZWFufSBbaXNXaGVyZV0gU3BlY2lmeSBwZXJmb3JtaW5nIHBhcnRpYWwgY29tcGFyaXNvbnMuXG4gKiBAcGFyYW0ge0FycmF5fSBbc3RhY2tBPVtdXSBUcmFja3MgdHJhdmVyc2VkIGB2YWx1ZWAgb2JqZWN0cy5cbiAqIEBwYXJhbSB7QXJyYXl9IFtzdGFja0I9W11dIFRyYWNrcyB0cmF2ZXJzZWQgYG90aGVyYCBvYmplY3RzLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIHRoZSBvYmplY3RzIGFyZSBlcXVpdmFsZW50LCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGJhc2VJc0VxdWFsRGVlcChvYmplY3QsIG90aGVyLCBlcXVhbEZ1bmMsIGN1c3RvbWl6ZXIsIGlzV2hlcmUsIHN0YWNrQSwgc3RhY2tCKSB7XG4gIHZhciBvYmpJc0FyciA9IGlzQXJyYXkob2JqZWN0KSxcbiAgICAgIG90aElzQXJyID0gaXNBcnJheShvdGhlciksXG4gICAgICBvYmpUYWcgPSBhcnJheVRhZyxcbiAgICAgIG90aFRhZyA9IGFycmF5VGFnO1xuXG4gIGlmICghb2JqSXNBcnIpIHtcbiAgICBvYmpUYWcgPSBvYmpUb1N0cmluZy5jYWxsKG9iamVjdCk7XG4gICAgaWYgKG9ialRhZyA9PSBhcmdzVGFnKSB7XG4gICAgICBvYmpUYWcgPSBvYmplY3RUYWc7XG4gICAgfSBlbHNlIGlmIChvYmpUYWcgIT0gb2JqZWN0VGFnKSB7XG4gICAgICBvYmpJc0FyciA9IGlzVHlwZWRBcnJheShvYmplY3QpO1xuICAgIH1cbiAgfVxuICBpZiAoIW90aElzQXJyKSB7XG4gICAgb3RoVGFnID0gb2JqVG9TdHJpbmcuY2FsbChvdGhlcik7XG4gICAgaWYgKG90aFRhZyA9PSBhcmdzVGFnKSB7XG4gICAgICBvdGhUYWcgPSBvYmplY3RUYWc7XG4gICAgfSBlbHNlIGlmIChvdGhUYWcgIT0gb2JqZWN0VGFnKSB7XG4gICAgICBvdGhJc0FyciA9IGlzVHlwZWRBcnJheShvdGhlcik7XG4gICAgfVxuICB9XG4gIHZhciBvYmpJc09iaiA9IG9ialRhZyA9PSBvYmplY3RUYWcsXG4gICAgICBvdGhJc09iaiA9IG90aFRhZyA9PSBvYmplY3RUYWcsXG4gICAgICBpc1NhbWVUYWcgPSBvYmpUYWcgPT0gb3RoVGFnO1xuXG4gIGlmIChpc1NhbWVUYWcgJiYgIShvYmpJc0FyciB8fCBvYmpJc09iaikpIHtcbiAgICByZXR1cm4gZXF1YWxCeVRhZyhvYmplY3QsIG90aGVyLCBvYmpUYWcpO1xuICB9XG4gIHZhciB2YWxXcmFwcGVkID0gb2JqSXNPYmogJiYgaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsICdfX3dyYXBwZWRfXycpLFxuICAgICAgb3RoV3JhcHBlZCA9IG90aElzT2JqICYmIGhhc093blByb3BlcnR5LmNhbGwob3RoZXIsICdfX3dyYXBwZWRfXycpO1xuXG4gIGlmICh2YWxXcmFwcGVkIHx8IG90aFdyYXBwZWQpIHtcbiAgICByZXR1cm4gZXF1YWxGdW5jKHZhbFdyYXBwZWQgPyBvYmplY3QudmFsdWUoKSA6IG9iamVjdCwgb3RoV3JhcHBlZCA/IG90aGVyLnZhbHVlKCkgOiBvdGhlciwgY3VzdG9taXplciwgaXNXaGVyZSwgc3RhY2tBLCBzdGFja0IpO1xuICB9XG4gIGlmICghaXNTYW1lVGFnKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIC8vIEFzc3VtZSBjeWNsaWMgdmFsdWVzIGFyZSBlcXVhbC5cbiAgLy8gRm9yIG1vcmUgaW5mb3JtYXRpb24gb24gZGV0ZWN0aW5nIGNpcmN1bGFyIHJlZmVyZW5jZXMgc2VlIGh0dHBzOi8vZXM1LmdpdGh1Yi5pby8jSk8uXG4gIHN0YWNrQSB8fCAoc3RhY2tBID0gW10pO1xuICBzdGFja0IgfHwgKHN0YWNrQiA9IFtdKTtcblxuICB2YXIgbGVuZ3RoID0gc3RhY2tBLmxlbmd0aDtcbiAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgaWYgKHN0YWNrQVtsZW5ndGhdID09IG9iamVjdCkge1xuICAgICAgcmV0dXJuIHN0YWNrQltsZW5ndGhdID09IG90aGVyO1xuICAgIH1cbiAgfVxuICAvLyBBZGQgYG9iamVjdGAgYW5kIGBvdGhlcmAgdG8gdGhlIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzLlxuICBzdGFja0EucHVzaChvYmplY3QpO1xuICBzdGFja0IucHVzaChvdGhlcik7XG5cbiAgdmFyIHJlc3VsdCA9IChvYmpJc0FyciA/IGVxdWFsQXJyYXlzIDogZXF1YWxPYmplY3RzKShvYmplY3QsIG90aGVyLCBlcXVhbEZ1bmMsIGN1c3RvbWl6ZXIsIGlzV2hlcmUsIHN0YWNrQSwgc3RhY2tCKTtcblxuICBzdGFja0EucG9wKCk7XG4gIHN0YWNrQi5wb3AoKTtcblxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VJc0VxdWFsRGVlcDtcbiIsInZhciBiYXNlSXNFcXVhbCA9IHJlcXVpcmUoJy4vYmFzZUlzRXF1YWwnKTtcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIGNoZWNrIG9iamVjdHMgZm9yIG93biBwcm9wZXJ0aWVzLiAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8uaXNNYXRjaGAgd2l0aG91dCBzdXBwb3J0IGZvciBjYWxsYmFja1xuICogc2hvcnRoYW5kcyBvciBgdGhpc2AgYmluZGluZy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IHNvdXJjZSBUaGUgb2JqZWN0IHRvIGluc3BlY3QuXG4gKiBAcGFyYW0ge0FycmF5fSBwcm9wcyBUaGUgc291cmNlIHByb3BlcnR5IG5hbWVzIHRvIG1hdGNoLlxuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzIFRoZSBzb3VyY2UgdmFsdWVzIHRvIG1hdGNoLlxuICogQHBhcmFtIHtBcnJheX0gc3RyaWN0Q29tcGFyZUZsYWdzIFN0cmljdCBjb21wYXJpc29uIGZsYWdzIGZvciBzb3VyY2UgdmFsdWVzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2N1c3RvbWl6ZXJdIFRoZSBmdW5jdGlvbiB0byBjdXN0b21pemUgY29tcGFyaW5nIG9iamVjdHMuXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYG9iamVjdGAgaXMgYSBtYXRjaCwgZWxzZSBgZmFsc2VgLlxuICovXG5mdW5jdGlvbiBiYXNlSXNNYXRjaChvYmplY3QsIHByb3BzLCB2YWx1ZXMsIHN0cmljdENvbXBhcmVGbGFncywgY3VzdG9taXplcikge1xuICB2YXIgbGVuZ3RoID0gcHJvcHMubGVuZ3RoO1xuICBpZiAob2JqZWN0ID09IG51bGwpIHtcbiAgICByZXR1cm4gIWxlbmd0aDtcbiAgfVxuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIG5vQ3VzdG9taXplciA9ICFjdXN0b21pemVyO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgaWYgKChub0N1c3RvbWl6ZXIgJiYgc3RyaWN0Q29tcGFyZUZsYWdzW2luZGV4XSlcbiAgICAgICAgICA/IHZhbHVlc1tpbmRleF0gIT09IG9iamVjdFtwcm9wc1tpbmRleF1dXG4gICAgICAgICAgOiAhaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsIHByb3BzW2luZGV4XSlcbiAgICAgICAgKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIGluZGV4ID0gLTE7XG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgdmFyIGtleSA9IHByb3BzW2luZGV4XTtcbiAgICBpZiAobm9DdXN0b21pemVyICYmIHN0cmljdENvbXBhcmVGbGFnc1tpbmRleF0pIHtcbiAgICAgIHZhciByZXN1bHQgPSBoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwga2V5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIG9ialZhbHVlID0gb2JqZWN0W2tleV0sXG4gICAgICAgICAgc3JjVmFsdWUgPSB2YWx1ZXNbaW5kZXhdO1xuXG4gICAgICByZXN1bHQgPSBjdXN0b21pemVyID8gY3VzdG9taXplcihvYmpWYWx1ZSwgc3JjVmFsdWUsIGtleSkgOiB1bmRlZmluZWQ7XG4gICAgICBpZiAodHlwZW9mIHJlc3VsdCA9PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXN1bHQgPSBiYXNlSXNFcXVhbChzcmNWYWx1ZSwgb2JqVmFsdWUsIGN1c3RvbWl6ZXIsIHRydWUpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlSXNNYXRjaDtcbiIsInZhciBiYXNlRWFjaCA9IHJlcXVpcmUoJy4vYmFzZUVhY2gnKTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5tYXBgIHdpdGhvdXQgc3VwcG9ydCBmb3IgY2FsbGJhY2sgc2hvcnRoYW5kc1xuICogb3IgYHRoaXNgIGJpbmRpbmcuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl8T2JqZWN0fHN0cmluZ30gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBpdGVyYXRlZSBUaGUgZnVuY3Rpb24gaW52b2tlZCBwZXIgaXRlcmF0aW9uLlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSBuZXcgbWFwcGVkIGFycmF5LlxuICovXG5mdW5jdGlvbiBiYXNlTWFwKGNvbGxlY3Rpb24sIGl0ZXJhdGVlKSB7XG4gIHZhciByZXN1bHQgPSBbXTtcbiAgYmFzZUVhY2goY29sbGVjdGlvbiwgZnVuY3Rpb24odmFsdWUsIGtleSwgY29sbGVjdGlvbikge1xuICAgIHJlc3VsdC5wdXNoKGl0ZXJhdGVlKHZhbHVlLCBrZXksIGNvbGxlY3Rpb24pKTtcbiAgfSk7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZU1hcDtcbiIsInZhciBiYXNlQ2xvbmUgPSByZXF1aXJlKCcuL2Jhc2VDbG9uZScpLFxuICAgIGJhc2VJc01hdGNoID0gcmVxdWlyZSgnLi9iYXNlSXNNYXRjaCcpLFxuICAgIGlzU3RyaWN0Q29tcGFyYWJsZSA9IHJlcXVpcmUoJy4vaXNTdHJpY3RDb21wYXJhYmxlJyksXG4gICAga2V5cyA9IHJlcXVpcmUoJy4uL29iamVjdC9rZXlzJyk7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byBjaGVjayBvYmplY3RzIGZvciBvd24gcHJvcGVydGllcy4gKi9cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdFByb3RvLmhhc093blByb3BlcnR5O1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLm1hdGNoZXNgIHdoaWNoIHN1cHBvcnRzIHNwZWNpZnlpbmcgd2hldGhlclxuICogYHNvdXJjZWAgc2hvdWxkIGJlIGNsb25lZC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IHNvdXJjZSBUaGUgb2JqZWN0IG9mIHByb3BlcnR5IHZhbHVlcyB0byBtYXRjaC5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2lzQ2xvbmVkXSBTcGVjaWZ5IGNsb25pbmcgdGhlIHNvdXJjZSBvYmplY3QuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gYmFzZU1hdGNoZXMoc291cmNlLCBpc0Nsb25lZCkge1xuICB2YXIgcHJvcHMgPSBrZXlzKHNvdXJjZSksXG4gICAgICBsZW5ndGggPSBwcm9wcy5sZW5ndGg7XG5cbiAgaWYgKGxlbmd0aCA9PSAxKSB7XG4gICAgdmFyIGtleSA9IHByb3BzWzBdLFxuICAgICAgICB2YWx1ZSA9IHNvdXJjZVtrZXldO1xuXG4gICAgaWYgKGlzU3RyaWN0Q29tcGFyYWJsZSh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbihvYmplY3QpIHtcbiAgICAgICAgcmV0dXJuIG9iamVjdCAhPSBudWxsICYmIHZhbHVlID09PSBvYmplY3Rba2V5XSAmJiBoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwga2V5KTtcbiAgICAgIH07XG4gICAgfVxuICB9XG4gIGlmIChpc0Nsb25lZCkge1xuICAgIHNvdXJjZSA9IGJhc2VDbG9uZShzb3VyY2UsIHRydWUpO1xuICB9XG4gIHZhciB2YWx1ZXMgPSBBcnJheShsZW5ndGgpLFxuICAgICAgc3RyaWN0Q29tcGFyZUZsYWdzID0gQXJyYXkobGVuZ3RoKTtcblxuICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICB2YWx1ZSA9IHNvdXJjZVtwcm9wc1tsZW5ndGhdXTtcbiAgICB2YWx1ZXNbbGVuZ3RoXSA9IHZhbHVlO1xuICAgIHN0cmljdENvbXBhcmVGbGFnc1tsZW5ndGhdID0gaXNTdHJpY3RDb21wYXJhYmxlKHZhbHVlKTtcbiAgfVxuICByZXR1cm4gZnVuY3Rpb24ob2JqZWN0KSB7XG4gICAgcmV0dXJuIGJhc2VJc01hdGNoKG9iamVjdCwgcHJvcHMsIHZhbHVlcywgc3RyaWN0Q29tcGFyZUZsYWdzKTtcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlTWF0Y2hlcztcbiIsIi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8ucHJvcGVydHlgIHdoaWNoIGRvZXMgbm90IGNvZXJjZSBga2V5YCB0byBhIHN0cmluZy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtzdHJpbmd9IGtleSBUaGUga2V5IG9mIHRoZSBwcm9wZXJ0eSB0byBnZXQuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gYmFzZVByb3BlcnR5KGtleSkge1xuICByZXR1cm4gZnVuY3Rpb24ob2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdCA9PSBudWxsID8gdW5kZWZpbmVkIDogb2JqZWN0W2tleV07XG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZVByb3BlcnR5O1xuIiwidmFyIGlkZW50aXR5ID0gcmVxdWlyZSgnLi4vdXRpbGl0eS9pZGVudGl0eScpLFxuICAgIG1ldGFNYXAgPSByZXF1aXJlKCcuL21ldGFNYXAnKTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgc2V0RGF0YWAgd2l0aG91dCBzdXBwb3J0IGZvciBob3QgbG9vcCBkZXRlY3Rpb24uXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIGFzc29jaWF0ZSBtZXRhZGF0YSB3aXRoLlxuICogQHBhcmFtIHsqfSBkYXRhIFRoZSBtZXRhZGF0YS5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyBgZnVuY2AuXG4gKi9cbnZhciBiYXNlU2V0RGF0YSA9ICFtZXRhTWFwID8gaWRlbnRpdHkgOiBmdW5jdGlvbihmdW5jLCBkYXRhKSB7XG4gIG1ldGFNYXAuc2V0KGZ1bmMsIGRhdGEpO1xuICByZXR1cm4gZnVuYztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZVNldERhdGE7XG4iLCIvKipcbiAqIENvbnZlcnRzIGB2YWx1ZWAgdG8gYSBzdHJpbmcgaWYgaXQgaXMgbm90IG9uZS4gQW4gZW1wdHkgc3RyaW5nIGlzIHJldHVybmVkXG4gKiBmb3IgYG51bGxgIG9yIGB1bmRlZmluZWRgIHZhbHVlcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gcHJvY2Vzcy5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFJldHVybnMgdGhlIHN0cmluZy5cbiAqL1xuZnVuY3Rpb24gYmFzZVRvU3RyaW5nKHZhbHVlKSB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgcmV0dXJuIHZhbHVlID09IG51bGwgPyAnJyA6ICh2YWx1ZSArICcnKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlVG9TdHJpbmc7XG4iLCJ2YXIgaWRlbnRpdHkgPSByZXF1aXJlKCcuLi91dGlsaXR5L2lkZW50aXR5Jyk7XG5cbi8qKlxuICogQSBzcGVjaWFsaXplZCB2ZXJzaW9uIG9mIGBiYXNlQ2FsbGJhY2tgIHdoaWNoIG9ubHkgc3VwcG9ydHMgYHRoaXNgIGJpbmRpbmdcbiAqIGFuZCBzcGVjaWZ5aW5nIHRoZSBudW1iZXIgb2YgYXJndW1lbnRzIHRvIHByb3ZpZGUgdG8gYGZ1bmNgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBiaW5kLlxuICogQHBhcmFtIHsqfSB0aGlzQXJnIFRoZSBgdGhpc2AgYmluZGluZyBvZiBgZnVuY2AuXG4gKiBAcGFyYW0ge251bWJlcn0gW2FyZ0NvdW50XSBUaGUgbnVtYmVyIG9mIGFyZ3VtZW50cyB0byBwcm92aWRlIHRvIGBmdW5jYC5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgY2FsbGJhY2suXG4gKi9cbmZ1bmN0aW9uIGJpbmRDYWxsYmFjayhmdW5jLCB0aGlzQXJnLCBhcmdDb3VudCkge1xuICBpZiAodHlwZW9mIGZ1bmMgIT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybiBpZGVudGl0eTtcbiAgfVxuICBpZiAodHlwZW9mIHRoaXNBcmcgPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4gZnVuYztcbiAgfVxuICBzd2l0Y2ggKGFyZ0NvdW50KSB7XG4gICAgY2FzZSAxOiByZXR1cm4gZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIHJldHVybiBmdW5jLmNhbGwodGhpc0FyZywgdmFsdWUpO1xuICAgIH07XG4gICAgY2FzZSAzOiByZXR1cm4gZnVuY3Rpb24odmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKSB7XG4gICAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNBcmcsIHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbik7XG4gICAgfTtcbiAgICBjYXNlIDQ6IHJldHVybiBmdW5jdGlvbihhY2N1bXVsYXRvciwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKSB7XG4gICAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNBcmcsIGFjY3VtdWxhdG9yLCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pO1xuICAgIH07XG4gICAgY2FzZSA1OiByZXR1cm4gZnVuY3Rpb24odmFsdWUsIG90aGVyLCBrZXksIG9iamVjdCwgc291cmNlKSB7XG4gICAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNBcmcsIHZhbHVlLCBvdGhlciwga2V5LCBvYmplY3QsIHNvdXJjZSk7XG4gICAgfTtcbiAgfVxuICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGZ1bmMuYXBwbHkodGhpc0FyZywgYXJndW1lbnRzKTtcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiaW5kQ2FsbGJhY2s7XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG52YXIgY29uc3RhbnQgPSByZXF1aXJlKCcuLi91dGlsaXR5L2NvbnN0YW50JyksXG4gICAgaXNOYXRpdmUgPSByZXF1aXJlKCcuLi9sYW5nL2lzTmF0aXZlJyk7XG5cbi8qKiBOYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgQXJyYXlCdWZmZXIgPSBpc05hdGl2ZShBcnJheUJ1ZmZlciA9IGdsb2JhbC5BcnJheUJ1ZmZlcikgJiYgQXJyYXlCdWZmZXIsXG4gICAgYnVmZmVyU2xpY2UgPSBpc05hdGl2ZShidWZmZXJTbGljZSA9IEFycmF5QnVmZmVyICYmIG5ldyBBcnJheUJ1ZmZlcigwKS5zbGljZSkgJiYgYnVmZmVyU2xpY2UsXG4gICAgZmxvb3IgPSBNYXRoLmZsb29yLFxuICAgIFVpbnQ4QXJyYXkgPSBpc05hdGl2ZShVaW50OEFycmF5ID0gZ2xvYmFsLlVpbnQ4QXJyYXkpICYmIFVpbnQ4QXJyYXk7XG5cbi8qKiBVc2VkIHRvIGNsb25lIGFycmF5IGJ1ZmZlcnMuICovXG52YXIgRmxvYXQ2NEFycmF5ID0gKGZ1bmN0aW9uKCkge1xuICAvLyBTYWZhcmkgNSBlcnJvcnMgd2hlbiB1c2luZyBhbiBhcnJheSBidWZmZXIgdG8gaW5pdGlhbGl6ZSBhIHR5cGVkIGFycmF5XG4gIC8vIHdoZXJlIHRoZSBhcnJheSBidWZmZXIncyBgYnl0ZUxlbmd0aGAgaXMgbm90IGEgbXVsdGlwbGUgb2YgdGhlIHR5cGVkXG4gIC8vIGFycmF5J3MgYEJZVEVTX1BFUl9FTEVNRU5UYC5cbiAgdHJ5IHtcbiAgICB2YXIgZnVuYyA9IGlzTmF0aXZlKGZ1bmMgPSBnbG9iYWwuRmxvYXQ2NEFycmF5KSAmJiBmdW5jLFxuICAgICAgICByZXN1bHQgPSBuZXcgZnVuYyhuZXcgQXJyYXlCdWZmZXIoMTApLCAwLCAxKSAmJiBmdW5jO1xuICB9IGNhdGNoKGUpIHt9XG4gIHJldHVybiByZXN1bHQ7XG59KCkpO1xuXG4vKiogVXNlZCBhcyB0aGUgc2l6ZSwgaW4gYnl0ZXMsIG9mIGVhY2ggYEZsb2F0NjRBcnJheWAgZWxlbWVudC4gKi9cbnZhciBGTE9BVDY0X0JZVEVTX1BFUl9FTEVNRU5UID0gRmxvYXQ2NEFycmF5ID8gRmxvYXQ2NEFycmF5LkJZVEVTX1BFUl9FTEVNRU5UIDogMDtcblxuLyoqXG4gKiBDcmVhdGVzIGEgY2xvbmUgb2YgdGhlIGdpdmVuIGFycmF5IGJ1ZmZlci5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheUJ1ZmZlcn0gYnVmZmVyIFRoZSBhcnJheSBidWZmZXIgdG8gY2xvbmUuXG4gKiBAcmV0dXJucyB7QXJyYXlCdWZmZXJ9IFJldHVybnMgdGhlIGNsb25lZCBhcnJheSBidWZmZXIuXG4gKi9cbmZ1bmN0aW9uIGJ1ZmZlckNsb25lKGJ1ZmZlcikge1xuICByZXR1cm4gYnVmZmVyU2xpY2UuY2FsbChidWZmZXIsIDApO1xufVxuaWYgKCFidWZmZXJTbGljZSkge1xuICAvLyBQaGFudG9tSlMgaGFzIGBBcnJheUJ1ZmZlcmAgYW5kIGBVaW50OEFycmF5YCBidXQgbm90IGBGbG9hdDY0QXJyYXlgLlxuICBidWZmZXJDbG9uZSA9ICEoQXJyYXlCdWZmZXIgJiYgVWludDhBcnJheSkgPyBjb25zdGFudChudWxsKSA6IGZ1bmN0aW9uKGJ1ZmZlcikge1xuICAgIHZhciBieXRlTGVuZ3RoID0gYnVmZmVyLmJ5dGVMZW5ndGgsXG4gICAgICAgIGZsb2F0TGVuZ3RoID0gRmxvYXQ2NEFycmF5ID8gZmxvb3IoYnl0ZUxlbmd0aCAvIEZMT0FUNjRfQllURVNfUEVSX0VMRU1FTlQpIDogMCxcbiAgICAgICAgb2Zmc2V0ID0gZmxvYXRMZW5ndGggKiBGTE9BVDY0X0JZVEVTX1BFUl9FTEVNRU5ULFxuICAgICAgICByZXN1bHQgPSBuZXcgQXJyYXlCdWZmZXIoYnl0ZUxlbmd0aCk7XG5cbiAgICBpZiAoZmxvYXRMZW5ndGgpIHtcbiAgICAgIHZhciB2aWV3ID0gbmV3IEZsb2F0NjRBcnJheShyZXN1bHQsIDAsIGZsb2F0TGVuZ3RoKTtcbiAgICAgIHZpZXcuc2V0KG5ldyBGbG9hdDY0QXJyYXkoYnVmZmVyLCAwLCBmbG9hdExlbmd0aCkpO1xuICAgIH1cbiAgICBpZiAoYnl0ZUxlbmd0aCAhPSBvZmZzZXQpIHtcbiAgICAgIHZpZXcgPSBuZXcgVWludDhBcnJheShyZXN1bHQsIG9mZnNldCk7XG4gICAgICB2aWV3LnNldChuZXcgVWludDhBcnJheShidWZmZXIsIG9mZnNldCkpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJ1ZmZlckNsb25lO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIi8qKlxuICogQSBzcGVjaWFsaXplZCB2ZXJzaW9uIG9mIGBiYXNlSXNFcXVhbERlZXBgIGZvciBhcnJheXMgd2l0aCBzdXBwb3J0IGZvclxuICogcGFydGlhbCBkZWVwIGNvbXBhcmlzb25zLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gY29tcGFyZS5cbiAqIEBwYXJhbSB7QXJyYXl9IG90aGVyIFRoZSBvdGhlciBhcnJheSB0byBjb21wYXJlLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZXF1YWxGdW5jIFRoZSBmdW5jdGlvbiB0byBkZXRlcm1pbmUgZXF1aXZhbGVudHMgb2YgdmFsdWVzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2N1c3RvbWl6ZXJdIFRoZSBmdW5jdGlvbiB0byBjdXN0b21pemUgY29tcGFyaW5nIGFycmF5cy5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2lzV2hlcmVdIFNwZWNpZnkgcGVyZm9ybWluZyBwYXJ0aWFsIGNvbXBhcmlzb25zLlxuICogQHBhcmFtIHtBcnJheX0gW3N0YWNrQV0gVHJhY2tzIHRyYXZlcnNlZCBgdmFsdWVgIG9iamVjdHMuXG4gKiBAcGFyYW0ge0FycmF5fSBbc3RhY2tCXSBUcmFja3MgdHJhdmVyc2VkIGBvdGhlcmAgb2JqZWN0cy5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYXJyYXlzIGFyZSBlcXVpdmFsZW50LCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGVxdWFsQXJyYXlzKGFycmF5LCBvdGhlciwgZXF1YWxGdW5jLCBjdXN0b21pemVyLCBpc1doZXJlLCBzdGFja0EsIHN0YWNrQikge1xuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGFyckxlbmd0aCA9IGFycmF5Lmxlbmd0aCxcbiAgICAgIG90aExlbmd0aCA9IG90aGVyLmxlbmd0aCxcbiAgICAgIHJlc3VsdCA9IHRydWU7XG5cbiAgaWYgKGFyckxlbmd0aCAhPSBvdGhMZW5ndGggJiYgIShpc1doZXJlICYmIG90aExlbmd0aCA+IGFyckxlbmd0aCkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgLy8gRGVlcCBjb21wYXJlIHRoZSBjb250ZW50cywgaWdub3Jpbmcgbm9uLW51bWVyaWMgcHJvcGVydGllcy5cbiAgd2hpbGUgKHJlc3VsdCAmJiArK2luZGV4IDwgYXJyTGVuZ3RoKSB7XG4gICAgdmFyIGFyclZhbHVlID0gYXJyYXlbaW5kZXhdLFxuICAgICAgICBvdGhWYWx1ZSA9IG90aGVyW2luZGV4XTtcblxuICAgIHJlc3VsdCA9IHVuZGVmaW5lZDtcbiAgICBpZiAoY3VzdG9taXplcikge1xuICAgICAgcmVzdWx0ID0gaXNXaGVyZVxuICAgICAgICA/IGN1c3RvbWl6ZXIob3RoVmFsdWUsIGFyclZhbHVlLCBpbmRleClcbiAgICAgICAgOiBjdXN0b21pemVyKGFyclZhbHVlLCBvdGhWYWx1ZSwgaW5kZXgpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHJlc3VsdCA9PSAndW5kZWZpbmVkJykge1xuICAgICAgLy8gUmVjdXJzaXZlbHkgY29tcGFyZSBhcnJheXMgKHN1c2NlcHRpYmxlIHRvIGNhbGwgc3RhY2sgbGltaXRzKS5cbiAgICAgIGlmIChpc1doZXJlKSB7XG4gICAgICAgIHZhciBvdGhJbmRleCA9IG90aExlbmd0aDtcbiAgICAgICAgd2hpbGUgKG90aEluZGV4LS0pIHtcbiAgICAgICAgICBvdGhWYWx1ZSA9IG90aGVyW290aEluZGV4XTtcbiAgICAgICAgICByZXN1bHQgPSAoYXJyVmFsdWUgJiYgYXJyVmFsdWUgPT09IG90aFZhbHVlKSB8fCBlcXVhbEZ1bmMoYXJyVmFsdWUsIG90aFZhbHVlLCBjdXN0b21pemVyLCBpc1doZXJlLCBzdGFja0EsIHN0YWNrQik7XG4gICAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHQgPSAoYXJyVmFsdWUgJiYgYXJyVmFsdWUgPT09IG90aFZhbHVlKSB8fCBlcXVhbEZ1bmMoYXJyVmFsdWUsIG90aFZhbHVlLCBjdXN0b21pemVyLCBpc1doZXJlLCBzdGFja0EsIHN0YWNrQik7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiAhIXJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBlcXVhbEFycmF5cztcbiIsInZhciBiYXNlVG9TdHJpbmcgPSByZXF1aXJlKCcuL2Jhc2VUb1N0cmluZycpO1xuXG4vKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHJlZmVyZW5jZXMuICovXG52YXIgYm9vbFRhZyA9ICdbb2JqZWN0IEJvb2xlYW5dJyxcbiAgICBkYXRlVGFnID0gJ1tvYmplY3QgRGF0ZV0nLFxuICAgIGVycm9yVGFnID0gJ1tvYmplY3QgRXJyb3JdJyxcbiAgICBudW1iZXJUYWcgPSAnW29iamVjdCBOdW1iZXJdJyxcbiAgICByZWdleHBUYWcgPSAnW29iamVjdCBSZWdFeHBdJyxcbiAgICBzdHJpbmdUYWcgPSAnW29iamVjdCBTdHJpbmddJztcblxuLyoqXG4gKiBBIHNwZWNpYWxpemVkIHZlcnNpb24gb2YgYGJhc2VJc0VxdWFsRGVlcGAgZm9yIGNvbXBhcmluZyBvYmplY3RzIG9mXG4gKiB0aGUgc2FtZSBgdG9TdHJpbmdUYWdgLlxuICpcbiAqICoqTm90ZToqKiBUaGlzIGZ1bmN0aW9uIG9ubHkgc3VwcG9ydHMgY29tcGFyaW5nIHZhbHVlcyB3aXRoIHRhZ3Mgb2ZcbiAqIGBCb29sZWFuYCwgYERhdGVgLCBgRXJyb3JgLCBgTnVtYmVyYCwgYFJlZ0V4cGAsIG9yIGBTdHJpbmdgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gdmFsdWUgVGhlIG9iamVjdCB0byBjb21wYXJlLlxuICogQHBhcmFtIHtPYmplY3R9IG90aGVyIFRoZSBvdGhlciBvYmplY3QgdG8gY29tcGFyZS5cbiAqIEBwYXJhbSB7c3RyaW5nfSB0YWcgVGhlIGB0b1N0cmluZ1RhZ2Agb2YgdGhlIG9iamVjdHMgdG8gY29tcGFyZS5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgb2JqZWN0cyBhcmUgZXF1aXZhbGVudCwgZWxzZSBgZmFsc2VgLlxuICovXG5mdW5jdGlvbiBlcXVhbEJ5VGFnKG9iamVjdCwgb3RoZXIsIHRhZykge1xuICBzd2l0Y2ggKHRhZykge1xuICAgIGNhc2UgYm9vbFRhZzpcbiAgICBjYXNlIGRhdGVUYWc6XG4gICAgICAvLyBDb2VyY2UgZGF0ZXMgYW5kIGJvb2xlYW5zIHRvIG51bWJlcnMsIGRhdGVzIHRvIG1pbGxpc2Vjb25kcyBhbmQgYm9vbGVhbnNcbiAgICAgIC8vIHRvIGAxYCBvciBgMGAgdHJlYXRpbmcgaW52YWxpZCBkYXRlcyBjb2VyY2VkIHRvIGBOYU5gIGFzIG5vdCBlcXVhbC5cbiAgICAgIHJldHVybiArb2JqZWN0ID09ICtvdGhlcjtcblxuICAgIGNhc2UgZXJyb3JUYWc6XG4gICAgICByZXR1cm4gb2JqZWN0Lm5hbWUgPT0gb3RoZXIubmFtZSAmJiBvYmplY3QubWVzc2FnZSA9PSBvdGhlci5tZXNzYWdlO1xuXG4gICAgY2FzZSBudW1iZXJUYWc6XG4gICAgICAvLyBUcmVhdCBgTmFOYCB2cy4gYE5hTmAgYXMgZXF1YWwuXG4gICAgICByZXR1cm4gKG9iamVjdCAhPSArb2JqZWN0KVxuICAgICAgICA/IG90aGVyICE9ICtvdGhlclxuICAgICAgICAvLyBCdXQsIHRyZWF0IGAtMGAgdnMuIGArMGAgYXMgbm90IGVxdWFsLlxuICAgICAgICA6IChvYmplY3QgPT0gMCA/ICgoMSAvIG9iamVjdCkgPT0gKDEgLyBvdGhlcikpIDogb2JqZWN0ID09ICtvdGhlcik7XG5cbiAgICBjYXNlIHJlZ2V4cFRhZzpcbiAgICBjYXNlIHN0cmluZ1RhZzpcbiAgICAgIC8vIENvZXJjZSByZWdleGVzIHRvIHN0cmluZ3MgYW5kIHRyZWF0IHN0cmluZ3MgcHJpbWl0aXZlcyBhbmQgc3RyaW5nXG4gICAgICAvLyBvYmplY3RzIGFzIGVxdWFsLiBTZWUgaHR0cHM6Ly9lczUuZ2l0aHViLmlvLyN4MTUuMTAuNi40IGZvciBtb3JlIGRldGFpbHMuXG4gICAgICByZXR1cm4gb2JqZWN0ID09IGJhc2VUb1N0cmluZyhvdGhlcik7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGVxdWFsQnlUYWc7XG4iLCJ2YXIga2V5cyA9IHJlcXVpcmUoJy4uL29iamVjdC9rZXlzJyk7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byBjaGVjayBvYmplY3RzIGZvciBvd24gcHJvcGVydGllcy4gKi9cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdFByb3RvLmhhc093blByb3BlcnR5O1xuXG4vKipcbiAqIEEgc3BlY2lhbGl6ZWQgdmVyc2lvbiBvZiBgYmFzZUlzRXF1YWxEZWVwYCBmb3Igb2JqZWN0cyB3aXRoIHN1cHBvcnQgZm9yXG4gKiBwYXJ0aWFsIGRlZXAgY29tcGFyaXNvbnMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBjb21wYXJlLlxuICogQHBhcmFtIHtPYmplY3R9IG90aGVyIFRoZSBvdGhlciBvYmplY3QgdG8gY29tcGFyZS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGVxdWFsRnVuYyBUaGUgZnVuY3Rpb24gdG8gZGV0ZXJtaW5lIGVxdWl2YWxlbnRzIG9mIHZhbHVlcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtjdXN0b21pemVyXSBUaGUgZnVuY3Rpb24gdG8gY3VzdG9taXplIGNvbXBhcmluZyB2YWx1ZXMuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtpc1doZXJlXSBTcGVjaWZ5IHBlcmZvcm1pbmcgcGFydGlhbCBjb21wYXJpc29ucy5cbiAqIEBwYXJhbSB7QXJyYXl9IFtzdGFja0FdIFRyYWNrcyB0cmF2ZXJzZWQgYHZhbHVlYCBvYmplY3RzLlxuICogQHBhcmFtIHtBcnJheX0gW3N0YWNrQl0gVHJhY2tzIHRyYXZlcnNlZCBgb3RoZXJgIG9iamVjdHMuXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIG9iamVjdHMgYXJlIGVxdWl2YWxlbnQsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gZXF1YWxPYmplY3RzKG9iamVjdCwgb3RoZXIsIGVxdWFsRnVuYywgY3VzdG9taXplciwgaXNXaGVyZSwgc3RhY2tBLCBzdGFja0IpIHtcbiAgdmFyIG9ialByb3BzID0ga2V5cyhvYmplY3QpLFxuICAgICAgb2JqTGVuZ3RoID0gb2JqUHJvcHMubGVuZ3RoLFxuICAgICAgb3RoUHJvcHMgPSBrZXlzKG90aGVyKSxcbiAgICAgIG90aExlbmd0aCA9IG90aFByb3BzLmxlbmd0aDtcblxuICBpZiAob2JqTGVuZ3RoICE9IG90aExlbmd0aCAmJiAhaXNXaGVyZSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB2YXIgaGFzQ3RvcixcbiAgICAgIGluZGV4ID0gLTE7XG5cbiAgd2hpbGUgKCsraW5kZXggPCBvYmpMZW5ndGgpIHtcbiAgICB2YXIga2V5ID0gb2JqUHJvcHNbaW5kZXhdLFxuICAgICAgICByZXN1bHQgPSBoYXNPd25Qcm9wZXJ0eS5jYWxsKG90aGVyLCBrZXkpO1xuXG4gICAgaWYgKHJlc3VsdCkge1xuICAgICAgdmFyIG9ialZhbHVlID0gb2JqZWN0W2tleV0sXG4gICAgICAgICAgb3RoVmFsdWUgPSBvdGhlcltrZXldO1xuXG4gICAgICByZXN1bHQgPSB1bmRlZmluZWQ7XG4gICAgICBpZiAoY3VzdG9taXplcikge1xuICAgICAgICByZXN1bHQgPSBpc1doZXJlXG4gICAgICAgICAgPyBjdXN0b21pemVyKG90aFZhbHVlLCBvYmpWYWx1ZSwga2V5KVxuICAgICAgICAgIDogY3VzdG9taXplcihvYmpWYWx1ZSwgb3RoVmFsdWUsIGtleSk7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIHJlc3VsdCA9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAvLyBSZWN1cnNpdmVseSBjb21wYXJlIG9iamVjdHMgKHN1c2NlcHRpYmxlIHRvIGNhbGwgc3RhY2sgbGltaXRzKS5cbiAgICAgICAgcmVzdWx0ID0gKG9ialZhbHVlICYmIG9ialZhbHVlID09PSBvdGhWYWx1ZSkgfHwgZXF1YWxGdW5jKG9ialZhbHVlLCBvdGhWYWx1ZSwgY3VzdG9taXplciwgaXNXaGVyZSwgc3RhY2tBLCBzdGFja0IpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBoYXNDdG9yIHx8IChoYXNDdG9yID0ga2V5ID09ICdjb25zdHJ1Y3RvcicpO1xuICB9XG4gIGlmICghaGFzQ3Rvcikge1xuICAgIHZhciBvYmpDdG9yID0gb2JqZWN0LmNvbnN0cnVjdG9yLFxuICAgICAgICBvdGhDdG9yID0gb3RoZXIuY29uc3RydWN0b3I7XG5cbiAgICAvLyBOb24gYE9iamVjdGAgb2JqZWN0IGluc3RhbmNlcyB3aXRoIGRpZmZlcmVudCBjb25zdHJ1Y3RvcnMgYXJlIG5vdCBlcXVhbC5cbiAgICBpZiAob2JqQ3RvciAhPSBvdGhDdG9yICYmICgnY29uc3RydWN0b3InIGluIG9iamVjdCAmJiAnY29uc3RydWN0b3InIGluIG90aGVyKSAmJlxuICAgICAgICAhKHR5cGVvZiBvYmpDdG9yID09ICdmdW5jdGlvbicgJiYgb2JqQ3RvciBpbnN0YW5jZW9mIG9iakN0b3IgJiYgdHlwZW9mIG90aEN0b3IgPT0gJ2Z1bmN0aW9uJyAmJiBvdGhDdG9yIGluc3RhbmNlb2Ygb3RoQ3RvcikpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZXF1YWxPYmplY3RzO1xuIiwiLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIGNoZWNrIG9iamVjdHMgZm9yIG93biBwcm9wZXJ0aWVzLiAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKlxuICogSW5pdGlhbGl6ZXMgYW4gYXJyYXkgY2xvbmUuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBjbG9uZS5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgaW5pdGlhbGl6ZWQgY2xvbmUuXG4gKi9cbmZ1bmN0aW9uIGluaXRDbG9uZUFycmF5KGFycmF5KSB7XG4gIHZhciBsZW5ndGggPSBhcnJheS5sZW5ndGgsXG4gICAgICByZXN1bHQgPSBuZXcgYXJyYXkuY29uc3RydWN0b3IobGVuZ3RoKTtcblxuICAvLyBBZGQgYXJyYXkgcHJvcGVydGllcyBhc3NpZ25lZCBieSBgUmVnRXhwI2V4ZWNgLlxuICBpZiAobGVuZ3RoICYmIHR5cGVvZiBhcnJheVswXSA9PSAnc3RyaW5nJyAmJiBoYXNPd25Qcm9wZXJ0eS5jYWxsKGFycmF5LCAnaW5kZXgnKSkge1xuICAgIHJlc3VsdC5pbmRleCA9IGFycmF5LmluZGV4O1xuICAgIHJlc3VsdC5pbnB1dCA9IGFycmF5LmlucHV0O1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaW5pdENsb25lQXJyYXk7XG4iLCJ2YXIgYnVmZmVyQ2xvbmUgPSByZXF1aXJlKCcuL2J1ZmZlckNsb25lJyk7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBib29sVGFnID0gJ1tvYmplY3QgQm9vbGVhbl0nLFxuICAgIGRhdGVUYWcgPSAnW29iamVjdCBEYXRlXScsXG4gICAgbnVtYmVyVGFnID0gJ1tvYmplY3QgTnVtYmVyXScsXG4gICAgcmVnZXhwVGFnID0gJ1tvYmplY3QgUmVnRXhwXScsXG4gICAgc3RyaW5nVGFnID0gJ1tvYmplY3QgU3RyaW5nXSc7XG5cbnZhciBhcnJheUJ1ZmZlclRhZyA9ICdbb2JqZWN0IEFycmF5QnVmZmVyXScsXG4gICAgZmxvYXQzMlRhZyA9ICdbb2JqZWN0IEZsb2F0MzJBcnJheV0nLFxuICAgIGZsb2F0NjRUYWcgPSAnW29iamVjdCBGbG9hdDY0QXJyYXldJyxcbiAgICBpbnQ4VGFnID0gJ1tvYmplY3QgSW50OEFycmF5XScsXG4gICAgaW50MTZUYWcgPSAnW29iamVjdCBJbnQxNkFycmF5XScsXG4gICAgaW50MzJUYWcgPSAnW29iamVjdCBJbnQzMkFycmF5XScsXG4gICAgdWludDhUYWcgPSAnW29iamVjdCBVaW50OEFycmF5XScsXG4gICAgdWludDhDbGFtcGVkVGFnID0gJ1tvYmplY3QgVWludDhDbGFtcGVkQXJyYXldJyxcbiAgICB1aW50MTZUYWcgPSAnW29iamVjdCBVaW50MTZBcnJheV0nLFxuICAgIHVpbnQzMlRhZyA9ICdbb2JqZWN0IFVpbnQzMkFycmF5XSc7XG5cbi8qKiBVc2VkIHRvIG1hdGNoIGBSZWdFeHBgIGZsYWdzIGZyb20gdGhlaXIgY29lcmNlZCBzdHJpbmcgdmFsdWVzLiAqL1xudmFyIHJlRmxhZ3MgPSAvXFx3KiQvO1xuXG4vKipcbiAqIEluaXRpYWxpemVzIGFuIG9iamVjdCBjbG9uZSBiYXNlZCBvbiBpdHMgYHRvU3RyaW5nVGFnYC5cbiAqXG4gKiAqKk5vdGU6KiogVGhpcyBmdW5jdGlvbiBvbmx5IHN1cHBvcnRzIGNsb25pbmcgdmFsdWVzIHdpdGggdGFncyBvZlxuICogYEJvb2xlYW5gLCBgRGF0ZWAsIGBFcnJvcmAsIGBOdW1iZXJgLCBgUmVnRXhwYCwgb3IgYFN0cmluZ2AuXG4gKlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gY2xvbmUuXG4gKiBAcGFyYW0ge3N0cmluZ30gdGFnIFRoZSBgdG9TdHJpbmdUYWdgIG9mIHRoZSBvYmplY3QgdG8gY2xvbmUuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtpc0RlZXBdIFNwZWNpZnkgYSBkZWVwIGNsb25lLlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyB0aGUgaW5pdGlhbGl6ZWQgY2xvbmUuXG4gKi9cbmZ1bmN0aW9uIGluaXRDbG9uZUJ5VGFnKG9iamVjdCwgdGFnLCBpc0RlZXApIHtcbiAgdmFyIEN0b3IgPSBvYmplY3QuY29uc3RydWN0b3I7XG4gIHN3aXRjaCAodGFnKSB7XG4gICAgY2FzZSBhcnJheUJ1ZmZlclRhZzpcbiAgICAgIHJldHVybiBidWZmZXJDbG9uZShvYmplY3QpO1xuXG4gICAgY2FzZSBib29sVGFnOlxuICAgIGNhc2UgZGF0ZVRhZzpcbiAgICAgIHJldHVybiBuZXcgQ3Rvcigrb2JqZWN0KTtcblxuICAgIGNhc2UgZmxvYXQzMlRhZzogY2FzZSBmbG9hdDY0VGFnOlxuICAgIGNhc2UgaW50OFRhZzogY2FzZSBpbnQxNlRhZzogY2FzZSBpbnQzMlRhZzpcbiAgICBjYXNlIHVpbnQ4VGFnOiBjYXNlIHVpbnQ4Q2xhbXBlZFRhZzogY2FzZSB1aW50MTZUYWc6IGNhc2UgdWludDMyVGFnOlxuICAgICAgdmFyIGJ1ZmZlciA9IG9iamVjdC5idWZmZXI7XG4gICAgICByZXR1cm4gbmV3IEN0b3IoaXNEZWVwID8gYnVmZmVyQ2xvbmUoYnVmZmVyKSA6IGJ1ZmZlciwgb2JqZWN0LmJ5dGVPZmZzZXQsIG9iamVjdC5sZW5ndGgpO1xuXG4gICAgY2FzZSBudW1iZXJUYWc6XG4gICAgY2FzZSBzdHJpbmdUYWc6XG4gICAgICByZXR1cm4gbmV3IEN0b3Iob2JqZWN0KTtcblxuICAgIGNhc2UgcmVnZXhwVGFnOlxuICAgICAgdmFyIHJlc3VsdCA9IG5ldyBDdG9yKG9iamVjdC5zb3VyY2UsIHJlRmxhZ3MuZXhlYyhvYmplY3QpKTtcbiAgICAgIHJlc3VsdC5sYXN0SW5kZXggPSBvYmplY3QubGFzdEluZGV4O1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaW5pdENsb25lQnlUYWc7XG4iLCIvKipcbiAqIEluaXRpYWxpemVzIGFuIG9iamVjdCBjbG9uZS5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGNsb25lLlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyB0aGUgaW5pdGlhbGl6ZWQgY2xvbmUuXG4gKi9cbmZ1bmN0aW9uIGluaXRDbG9uZU9iamVjdChvYmplY3QpIHtcbiAgdmFyIEN0b3IgPSBvYmplY3QuY29uc3RydWN0b3I7XG4gIGlmICghKHR5cGVvZiBDdG9yID09ICdmdW5jdGlvbicgJiYgQ3RvciBpbnN0YW5jZW9mIEN0b3IpKSB7XG4gICAgQ3RvciA9IE9iamVjdDtcbiAgfVxuICByZXR1cm4gbmV3IEN0b3I7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaW5pdENsb25lT2JqZWN0O1xuIiwidmFyIGJhc2VTZXREYXRhID0gcmVxdWlyZSgnLi9iYXNlU2V0RGF0YScpLFxuICAgIGlzTmF0aXZlID0gcmVxdWlyZSgnLi4vbGFuZy9pc05hdGl2ZScpLFxuICAgIHN1cHBvcnQgPSByZXF1aXJlKCcuLi9zdXBwb3J0Jyk7XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBuYW1lZCBmdW5jdGlvbnMuICovXG52YXIgcmVGdW5jTmFtZSA9IC9eXFxzKmZ1bmN0aW9uWyBcXG5cXHJcXHRdK1xcdy87XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBmdW5jdGlvbnMgY29udGFpbmluZyBhIGB0aGlzYCByZWZlcmVuY2UuICovXG52YXIgcmVUaGlzID0gL1xcYnRoaXNcXGIvO1xuXG4vKiogVXNlZCB0byByZXNvbHZlIHRoZSBkZWNvbXBpbGVkIHNvdXJjZSBvZiBmdW5jdGlvbnMuICovXG52YXIgZm5Ub1N0cmluZyA9IEZ1bmN0aW9uLnByb3RvdHlwZS50b1N0cmluZztcblxuLyoqXG4gKiBDaGVja3MgaWYgYGZ1bmNgIGlzIGVsaWdpYmxlIGZvciBgdGhpc2AgYmluZGluZy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYGZ1bmNgIGlzIGVsaWdpYmxlLCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGlzQmluZGFibGUoZnVuYykge1xuICB2YXIgcmVzdWx0ID0gIShzdXBwb3J0LmZ1bmNOYW1lcyA/IGZ1bmMubmFtZSA6IHN1cHBvcnQuZnVuY0RlY29tcCk7XG5cbiAgaWYgKCFyZXN1bHQpIHtcbiAgICB2YXIgc291cmNlID0gZm5Ub1N0cmluZy5jYWxsKGZ1bmMpO1xuICAgIGlmICghc3VwcG9ydC5mdW5jTmFtZXMpIHtcbiAgICAgIHJlc3VsdCA9ICFyZUZ1bmNOYW1lLnRlc3Qoc291cmNlKTtcbiAgICB9XG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIC8vIENoZWNrIGlmIGBmdW5jYCByZWZlcmVuY2VzIHRoZSBgdGhpc2Aga2V5d29yZCBhbmQgc3RvcmUgdGhlIHJlc3VsdC5cbiAgICAgIHJlc3VsdCA9IHJlVGhpcy50ZXN0KHNvdXJjZSkgfHwgaXNOYXRpdmUoZnVuYyk7XG4gICAgICBiYXNlU2V0RGF0YShmdW5jLCByZXN1bHQpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzQmluZGFibGU7XG4iLCIvKipcbiAqIFVzZWQgYXMgdGhlIG1heGltdW0gbGVuZ3RoIG9mIGFuIGFycmF5LWxpa2UgdmFsdWUuXG4gKiBTZWUgdGhlIFtFUyBzcGVjXShodHRwczovL3Blb3BsZS5tb3ppbGxhLm9yZy9+am9yZW5kb3JmZi9lczYtZHJhZnQuaHRtbCNzZWMtdG9sZW5ndGgpXG4gKiBmb3IgbW9yZSBkZXRhaWxzLlxuICovXG52YXIgTUFYX1NBRkVfSU5URUdFUiA9IE1hdGgucG93KDIsIDUzKSAtIDE7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYSB2YWxpZCBhcnJheS1saWtlIGluZGV4LlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEBwYXJhbSB7bnVtYmVyfSBbbGVuZ3RoPU1BWF9TQUZFX0lOVEVHRVJdIFRoZSB1cHBlciBib3VuZHMgb2YgYSB2YWxpZCBpbmRleC5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGEgdmFsaWQgaW5kZXgsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNJbmRleCh2YWx1ZSwgbGVuZ3RoKSB7XG4gIHZhbHVlID0gK3ZhbHVlO1xuICBsZW5ndGggPSBsZW5ndGggPT0gbnVsbCA/IE1BWF9TQUZFX0lOVEVHRVIgOiBsZW5ndGg7XG4gIHJldHVybiB2YWx1ZSA+IC0xICYmIHZhbHVlICUgMSA9PSAwICYmIHZhbHVlIDwgbGVuZ3RoO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzSW5kZXg7XG4iLCJ2YXIgaXNJbmRleCA9IHJlcXVpcmUoJy4vaXNJbmRleCcpLFxuICAgIGlzTGVuZ3RoID0gcmVxdWlyZSgnLi9pc0xlbmd0aCcpLFxuICAgIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi4vbGFuZy9pc09iamVjdCcpO1xuXG4vKipcbiAqIENoZWNrcyBpZiB0aGUgcHJvdmlkZWQgYXJndW1lbnRzIGFyZSBmcm9tIGFuIGl0ZXJhdGVlIGNhbGwuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHBvdGVudGlhbCBpdGVyYXRlZSB2YWx1ZSBhcmd1bWVudC5cbiAqIEBwYXJhbSB7Kn0gaW5kZXggVGhlIHBvdGVudGlhbCBpdGVyYXRlZSBpbmRleCBvciBrZXkgYXJndW1lbnQuXG4gKiBAcGFyYW0geyp9IG9iamVjdCBUaGUgcG90ZW50aWFsIGl0ZXJhdGVlIG9iamVjdCBhcmd1bWVudC5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYXJndW1lbnRzIGFyZSBmcm9tIGFuIGl0ZXJhdGVlIGNhbGwsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNJdGVyYXRlZUNhbGwodmFsdWUsIGluZGV4LCBvYmplY3QpIHtcbiAgaWYgKCFpc09iamVjdChvYmplY3QpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHZhciB0eXBlID0gdHlwZW9mIGluZGV4O1xuICBpZiAodHlwZSA9PSAnbnVtYmVyJykge1xuICAgIHZhciBsZW5ndGggPSBvYmplY3QubGVuZ3RoLFxuICAgICAgICBwcmVyZXEgPSBpc0xlbmd0aChsZW5ndGgpICYmIGlzSW5kZXgoaW5kZXgsIGxlbmd0aCk7XG4gIH0gZWxzZSB7XG4gICAgcHJlcmVxID0gdHlwZSA9PSAnc3RyaW5nJyAmJiBpbmRleCBpbiB2YWx1ZTtcbiAgfVxuICByZXR1cm4gcHJlcmVxICYmIG9iamVjdFtpbmRleF0gPT09IHZhbHVlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzSXRlcmF0ZWVDYWxsO1xuIiwiLyoqXG4gKiBVc2VkIGFzIHRoZSBtYXhpbXVtIGxlbmd0aCBvZiBhbiBhcnJheS1saWtlIHZhbHVlLlxuICogU2VlIHRoZSBbRVMgc3BlY10oaHR0cHM6Ly9wZW9wbGUubW96aWxsYS5vcmcvfmpvcmVuZG9yZmYvZXM2LWRyYWZ0Lmh0bWwjc2VjLXRvbGVuZ3RoKVxuICogZm9yIG1vcmUgZGV0YWlscy5cbiAqL1xudmFyIE1BWF9TQUZFX0lOVEVHRVIgPSBNYXRoLnBvdygyLCA1MykgLSAxO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgdmFsaWQgYXJyYXktbGlrZSBsZW5ndGguXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYSB2YWxpZCBsZW5ndGgsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNMZW5ndGgodmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PSAnbnVtYmVyJyAmJiB2YWx1ZSA+IC0xICYmIHZhbHVlICUgMSA9PSAwICYmIHZhbHVlIDw9IE1BWF9TQUZFX0lOVEVHRVI7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNMZW5ndGg7XG4iLCIvKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIG9iamVjdC1saWtlLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIG9iamVjdC1saWtlLCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGlzT2JqZWN0TGlrZSh2YWx1ZSkge1xuICByZXR1cm4gKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0JykgfHwgZmFsc2U7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNPYmplY3RMaWtlO1xuIiwidmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi4vbGFuZy9pc09iamVjdCcpO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIHN1aXRhYmxlIGZvciBzdHJpY3QgZXF1YWxpdHkgY29tcGFyaXNvbnMsIGkuZS4gYD09PWAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaWYgc3VpdGFibGUgZm9yIHN0cmljdFxuICogIGVxdWFsaXR5IGNvbXBhcmlzb25zLCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGlzU3RyaWN0Q29tcGFyYWJsZSh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgPT09IHZhbHVlICYmICh2YWx1ZSA9PT0gMCA/ICgoMSAvIHZhbHVlKSA+IDApIDogIWlzT2JqZWN0KHZhbHVlKSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNTdHJpY3RDb21wYXJhYmxlO1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xudmFyIGlzTmF0aXZlID0gcmVxdWlyZSgnLi4vbGFuZy9pc05hdGl2ZScpO1xuXG4vKiogTmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIFdlYWtNYXAgPSBpc05hdGl2ZShXZWFrTWFwID0gZ2xvYmFsLldlYWtNYXApICYmIFdlYWtNYXA7XG5cbi8qKiBVc2VkIHRvIHN0b3JlIGZ1bmN0aW9uIG1ldGFkYXRhLiAqL1xudmFyIG1ldGFNYXAgPSBXZWFrTWFwICYmIG5ldyBXZWFrTWFwO1xuXG5tb2R1bGUuZXhwb3J0cyA9IG1ldGFNYXA7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwidmFyIGlzQXJndW1lbnRzID0gcmVxdWlyZSgnLi4vbGFuZy9pc0FyZ3VtZW50cycpLFxuICAgIGlzQXJyYXkgPSByZXF1aXJlKCcuLi9sYW5nL2lzQXJyYXknKSxcbiAgICBpc0luZGV4ID0gcmVxdWlyZSgnLi9pc0luZGV4JyksXG4gICAgaXNMZW5ndGggPSByZXF1aXJlKCcuL2lzTGVuZ3RoJyksXG4gICAga2V5c0luID0gcmVxdWlyZSgnLi4vb2JqZWN0L2tleXNJbicpLFxuICAgIHN1cHBvcnQgPSByZXF1aXJlKCcuLi9zdXBwb3J0Jyk7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byBjaGVjayBvYmplY3RzIGZvciBvd24gcHJvcGVydGllcy4gKi9cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdFByb3RvLmhhc093blByb3BlcnR5O1xuXG4vKipcbiAqIEEgZmFsbGJhY2sgaW1wbGVtZW50YXRpb24gb2YgYE9iamVjdC5rZXlzYCB3aGljaCBjcmVhdGVzIGFuIGFycmF5IG9mIHRoZVxuICogb3duIGVudW1lcmFibGUgcHJvcGVydHkgbmFtZXMgb2YgYG9iamVjdGAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBpbnNwZWN0LlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSBhcnJheSBvZiBwcm9wZXJ0eSBuYW1lcy5cbiAqL1xuZnVuY3Rpb24gc2hpbUtleXMob2JqZWN0KSB7XG4gIHZhciBwcm9wcyA9IGtleXNJbihvYmplY3QpLFxuICAgICAgcHJvcHNMZW5ndGggPSBwcm9wcy5sZW5ndGgsXG4gICAgICBsZW5ndGggPSBwcm9wc0xlbmd0aCAmJiBvYmplY3QubGVuZ3RoO1xuXG4gIHZhciBhbGxvd0luZGV4ZXMgPSBsZW5ndGggJiYgaXNMZW5ndGgobGVuZ3RoKSAmJlxuICAgIChpc0FycmF5KG9iamVjdCkgfHwgKHN1cHBvcnQubm9uRW51bUFyZ3MgJiYgaXNBcmd1bWVudHMob2JqZWN0KSkpO1xuXG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgcmVzdWx0ID0gW107XG5cbiAgd2hpbGUgKCsraW5kZXggPCBwcm9wc0xlbmd0aCkge1xuICAgIHZhciBrZXkgPSBwcm9wc1tpbmRleF07XG4gICAgaWYgKChhbGxvd0luZGV4ZXMgJiYgaXNJbmRleChrZXksIGxlbmd0aCkpIHx8IGhhc093blByb3BlcnR5LmNhbGwob2JqZWN0LCBrZXkpKSB7XG4gICAgICByZXN1bHQucHVzaChrZXkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHNoaW1LZXlzO1xuIiwidmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi4vbGFuZy9pc09iamVjdCcpO1xuXG4vKipcbiAqIENvbnZlcnRzIGB2YWx1ZWAgdG8gYW4gb2JqZWN0IGlmIGl0IGlzIG5vdCBvbmUuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIHByb2Nlc3MuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZXR1cm5zIHRoZSBvYmplY3QuXG4gKi9cbmZ1bmN0aW9uIHRvT2JqZWN0KHZhbHVlKSB7XG4gIHJldHVybiBpc09iamVjdCh2YWx1ZSkgPyB2YWx1ZSA6IE9iamVjdCh2YWx1ZSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gdG9PYmplY3Q7XG4iLCJ2YXIgaXNMZW5ndGggPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc0xlbmd0aCcpLFxuICAgIGlzT2JqZWN0TGlrZSA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2lzT2JqZWN0TGlrZScpO1xuXG4vKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHJlZmVyZW5jZXMuICovXG52YXIgYXJnc1RhZyA9ICdbb2JqZWN0IEFyZ3VtZW50c10nO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqXG4gKiBVc2VkIHRvIHJlc29sdmUgdGhlIGB0b1N0cmluZ1RhZ2Agb2YgdmFsdWVzLlxuICogU2VlIHRoZSBbRVMgc3BlY10oaHR0cHM6Ly9wZW9wbGUubW96aWxsYS5vcmcvfmpvcmVuZG9yZmYvZXM2LWRyYWZ0Lmh0bWwjc2VjLW9iamVjdC5wcm90b3R5cGUudG9zdHJpbmcpXG4gKiBmb3IgbW9yZSBkZXRhaWxzLlxuICovXG52YXIgb2JqVG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBjbGFzc2lmaWVkIGFzIGFuIGBhcmd1bWVudHNgIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgY29ycmVjdGx5IGNsYXNzaWZpZWQsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogKGZ1bmN0aW9uKCkgeyByZXR1cm4gXy5pc0FyZ3VtZW50cyhhcmd1bWVudHMpOyB9KSgpO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNBcmd1bWVudHMoWzEsIDIsIDNdKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzQXJndW1lbnRzKHZhbHVlKSB7XG4gIHZhciBsZW5ndGggPSBpc09iamVjdExpa2UodmFsdWUpID8gdmFsdWUubGVuZ3RoIDogdW5kZWZpbmVkO1xuICByZXR1cm4gKGlzTGVuZ3RoKGxlbmd0aCkgJiYgb2JqVG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gYXJnc1RhZykgfHwgZmFsc2U7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNBcmd1bWVudHM7XG4iLCJ2YXIgaXNMZW5ndGggPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc0xlbmd0aCcpLFxuICAgIGlzTmF0aXZlID0gcmVxdWlyZSgnLi9pc05hdGl2ZScpLFxuICAgIGlzT2JqZWN0TGlrZSA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2lzT2JqZWN0TGlrZScpO1xuXG4vKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHJlZmVyZW5jZXMuICovXG52YXIgYXJyYXlUYWcgPSAnW29iamVjdCBBcnJheV0nO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqXG4gKiBVc2VkIHRvIHJlc29sdmUgdGhlIGB0b1N0cmluZ1RhZ2Agb2YgdmFsdWVzLlxuICogU2VlIHRoZSBbRVMgc3BlY10oaHR0cHM6Ly9wZW9wbGUubW96aWxsYS5vcmcvfmpvcmVuZG9yZmYvZXM2LWRyYWZ0Lmh0bWwjc2VjLW9iamVjdC5wcm90b3R5cGUudG9zdHJpbmcpXG4gKiBmb3IgbW9yZSBkZXRhaWxzLlxuICovXG52YXIgb2JqVG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyogTmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzIGZvciB0aG9zZSB3aXRoIHRoZSBzYW1lIG5hbWUgYXMgb3RoZXIgYGxvZGFzaGAgbWV0aG9kcy4gKi9cbnZhciBuYXRpdmVJc0FycmF5ID0gaXNOYXRpdmUobmF0aXZlSXNBcnJheSA9IEFycmF5LmlzQXJyYXkpICYmIG5hdGl2ZUlzQXJyYXk7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgY2xhc3NpZmllZCBhcyBhbiBgQXJyYXlgIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgY29ycmVjdGx5IGNsYXNzaWZpZWQsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc0FycmF5KFsxLCAyLCAzXSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogKGZ1bmN0aW9uKCkgeyByZXR1cm4gXy5pc0FycmF5KGFyZ3VtZW50cyk7IH0pKCk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG52YXIgaXNBcnJheSA9IG5hdGl2ZUlzQXJyYXkgfHwgZnVuY3Rpb24odmFsdWUpIHtcbiAgcmV0dXJuIChpc09iamVjdExpa2UodmFsdWUpICYmIGlzTGVuZ3RoKHZhbHVlLmxlbmd0aCkgJiYgb2JqVG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gYXJyYXlUYWcpIHx8IGZhbHNlO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBpc0FycmF5O1xuIiwidmFyIGVzY2FwZVJlZ0V4cCA9IHJlcXVpcmUoJy4uL3N0cmluZy9lc2NhcGVSZWdFeHAnKSxcbiAgICBpc09iamVjdExpa2UgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc09iamVjdExpa2UnKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIGZ1bmNUYWcgPSAnW29iamVjdCBGdW5jdGlvbl0nO1xuXG4vKiogVXNlZCB0byBkZXRlY3QgaG9zdCBjb25zdHJ1Y3RvcnMgKFNhZmFyaSA+IDUpLiAqL1xudmFyIHJlSG9zdEN0b3IgPSAvXlxcW29iamVjdCAuKz9Db25zdHJ1Y3RvclxcXSQvO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgZGVjb21waWxlZCBzb3VyY2Ugb2YgZnVuY3Rpb25zLiAqL1xudmFyIGZuVG9TdHJpbmcgPSBGdW5jdGlvbi5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZSBgdG9TdHJpbmdUYWdgIG9mIHZhbHVlcy5cbiAqIFNlZSB0aGUgW0VTIHNwZWNdKGh0dHBzOi8vcGVvcGxlLm1vemlsbGEub3JnL35qb3JlbmRvcmZmL2VzNi1kcmFmdC5odG1sI3NlYy1vYmplY3QucHJvdG90eXBlLnRvc3RyaW5nKVxuICogZm9yIG1vcmUgZGV0YWlscy5cbiAqL1xudmFyIG9ialRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBpZiBhIG1ldGhvZCBpcyBuYXRpdmUuICovXG52YXIgcmVOYXRpdmUgPSBSZWdFeHAoJ14nICtcbiAgZXNjYXBlUmVnRXhwKG9ialRvU3RyaW5nKVxuICAucmVwbGFjZSgvdG9TdHJpbmd8KGZ1bmN0aW9uKS4qPyg/PVxcXFxcXCgpfCBmb3IgLis/KD89XFxcXFxcXSkvZywgJyQxLio/JykgKyAnJCdcbik7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYSBuYXRpdmUgZnVuY3Rpb24uXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGEgbmF0aXZlIGZ1bmN0aW9uLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNOYXRpdmUoQXJyYXkucHJvdG90eXBlLnB1c2gpO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNOYXRpdmUoXyk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc05hdGl2ZSh2YWx1ZSkge1xuICBpZiAodmFsdWUgPT0gbnVsbCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAob2JqVG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gZnVuY1RhZykge1xuICAgIHJldHVybiByZU5hdGl2ZS50ZXN0KGZuVG9TdHJpbmcuY2FsbCh2YWx1ZSkpO1xuICB9XG4gIHJldHVybiAoaXNPYmplY3RMaWtlKHZhbHVlKSAmJiByZUhvc3RDdG9yLnRlc3QodmFsdWUpKSB8fCBmYWxzZTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc05hdGl2ZTtcbiIsIi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgdGhlIGxhbmd1YWdlIHR5cGUgb2YgYE9iamVjdGAuXG4gKiAoZS5nLiBhcnJheXMsIGZ1bmN0aW9ucywgb2JqZWN0cywgcmVnZXhlcywgYG5ldyBOdW1iZXIoMClgLCBhbmQgYG5ldyBTdHJpbmcoJycpYClcbiAqXG4gKiAqKk5vdGU6KiogU2VlIHRoZSBbRVM1IHNwZWNdKGh0dHBzOi8vZXM1LmdpdGh1Yi5pby8jeDgpIGZvciBtb3JlIGRldGFpbHMuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGFuIG9iamVjdCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzT2JqZWN0KHt9KTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0KFsxLCAyLCAzXSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdCgxKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzT2JqZWN0KHZhbHVlKSB7XG4gIC8vIEF2b2lkIGEgVjggSklUIGJ1ZyBpbiBDaHJvbWUgMTktMjAuXG4gIC8vIFNlZSBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL3Y4L2lzc3Vlcy9kZXRhaWw/aWQ9MjI5MSBmb3IgbW9yZSBkZXRhaWxzLlxuICB2YXIgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcbiAgcmV0dXJuIHR5cGUgPT0gJ2Z1bmN0aW9uJyB8fCAodmFsdWUgJiYgdHlwZSA9PSAnb2JqZWN0JykgfHwgZmFsc2U7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNPYmplY3Q7XG4iLCJ2YXIgaXNMZW5ndGggPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc0xlbmd0aCcpLFxuICAgIGlzT2JqZWN0TGlrZSA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2lzT2JqZWN0TGlrZScpO1xuXG4vKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHJlZmVyZW5jZXMuICovXG52YXIgYXJnc1RhZyA9ICdbb2JqZWN0IEFyZ3VtZW50c10nLFxuICAgIGFycmF5VGFnID0gJ1tvYmplY3QgQXJyYXldJyxcbiAgICBib29sVGFnID0gJ1tvYmplY3QgQm9vbGVhbl0nLFxuICAgIGRhdGVUYWcgPSAnW29iamVjdCBEYXRlXScsXG4gICAgZXJyb3JUYWcgPSAnW29iamVjdCBFcnJvcl0nLFxuICAgIGZ1bmNUYWcgPSAnW29iamVjdCBGdW5jdGlvbl0nLFxuICAgIG1hcFRhZyA9ICdbb2JqZWN0IE1hcF0nLFxuICAgIG51bWJlclRhZyA9ICdbb2JqZWN0IE51bWJlcl0nLFxuICAgIG9iamVjdFRhZyA9ICdbb2JqZWN0IE9iamVjdF0nLFxuICAgIHJlZ2V4cFRhZyA9ICdbb2JqZWN0IFJlZ0V4cF0nLFxuICAgIHNldFRhZyA9ICdbb2JqZWN0IFNldF0nLFxuICAgIHN0cmluZ1RhZyA9ICdbb2JqZWN0IFN0cmluZ10nLFxuICAgIHdlYWtNYXBUYWcgPSAnW29iamVjdCBXZWFrTWFwXSc7XG5cbnZhciBhcnJheUJ1ZmZlclRhZyA9ICdbb2JqZWN0IEFycmF5QnVmZmVyXScsXG4gICAgZmxvYXQzMlRhZyA9ICdbb2JqZWN0IEZsb2F0MzJBcnJheV0nLFxuICAgIGZsb2F0NjRUYWcgPSAnW29iamVjdCBGbG9hdDY0QXJyYXldJyxcbiAgICBpbnQ4VGFnID0gJ1tvYmplY3QgSW50OEFycmF5XScsXG4gICAgaW50MTZUYWcgPSAnW29iamVjdCBJbnQxNkFycmF5XScsXG4gICAgaW50MzJUYWcgPSAnW29iamVjdCBJbnQzMkFycmF5XScsXG4gICAgdWludDhUYWcgPSAnW29iamVjdCBVaW50OEFycmF5XScsXG4gICAgdWludDhDbGFtcGVkVGFnID0gJ1tvYmplY3QgVWludDhDbGFtcGVkQXJyYXldJyxcbiAgICB1aW50MTZUYWcgPSAnW29iamVjdCBVaW50MTZBcnJheV0nLFxuICAgIHVpbnQzMlRhZyA9ICdbb2JqZWN0IFVpbnQzMkFycmF5XSc7XG5cbi8qKiBVc2VkIHRvIGlkZW50aWZ5IGB0b1N0cmluZ1RhZ2AgdmFsdWVzIG9mIHR5cGVkIGFycmF5cy4gKi9cbnZhciB0eXBlZEFycmF5VGFncyA9IHt9O1xudHlwZWRBcnJheVRhZ3NbZmxvYXQzMlRhZ10gPSB0eXBlZEFycmF5VGFnc1tmbG9hdDY0VGFnXSA9XG50eXBlZEFycmF5VGFnc1tpbnQ4VGFnXSA9IHR5cGVkQXJyYXlUYWdzW2ludDE2VGFnXSA9XG50eXBlZEFycmF5VGFnc1tpbnQzMlRhZ10gPSB0eXBlZEFycmF5VGFnc1t1aW50OFRhZ10gPVxudHlwZWRBcnJheVRhZ3NbdWludDhDbGFtcGVkVGFnXSA9IHR5cGVkQXJyYXlUYWdzW3VpbnQxNlRhZ10gPVxudHlwZWRBcnJheVRhZ3NbdWludDMyVGFnXSA9IHRydWU7XG50eXBlZEFycmF5VGFnc1thcmdzVGFnXSA9IHR5cGVkQXJyYXlUYWdzW2FycmF5VGFnXSA9XG50eXBlZEFycmF5VGFnc1thcnJheUJ1ZmZlclRhZ10gPSB0eXBlZEFycmF5VGFnc1tib29sVGFnXSA9XG50eXBlZEFycmF5VGFnc1tkYXRlVGFnXSA9IHR5cGVkQXJyYXlUYWdzW2Vycm9yVGFnXSA9XG50eXBlZEFycmF5VGFnc1tmdW5jVGFnXSA9IHR5cGVkQXJyYXlUYWdzW21hcFRhZ10gPVxudHlwZWRBcnJheVRhZ3NbbnVtYmVyVGFnXSA9IHR5cGVkQXJyYXlUYWdzW29iamVjdFRhZ10gPVxudHlwZWRBcnJheVRhZ3NbcmVnZXhwVGFnXSA9IHR5cGVkQXJyYXlUYWdzW3NldFRhZ10gPVxudHlwZWRBcnJheVRhZ3Nbc3RyaW5nVGFnXSA9IHR5cGVkQXJyYXlUYWdzW3dlYWtNYXBUYWddID0gZmFsc2U7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKipcbiAqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgYHRvU3RyaW5nVGFnYCBvZiB2YWx1ZXMuXG4gKiBTZWUgdGhlIFtFUyBzcGVjXShodHRwczovL3Blb3BsZS5tb3ppbGxhLm9yZy9+am9yZW5kb3JmZi9lczYtZHJhZnQuaHRtbCNzZWMtb2JqZWN0LnByb3RvdHlwZS50b3N0cmluZylcbiAqIGZvciBtb3JlIGRldGFpbHMuXG4gKi9cbnZhciBvYmpUb1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGNsYXNzaWZpZWQgYXMgYSB0eXBlZCBhcnJheS5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgY29ycmVjdGx5IGNsYXNzaWZpZWQsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc1R5cGVkQXJyYXkobmV3IFVpbnQ4QXJyYXkpO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNUeXBlZEFycmF5KFtdKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzVHlwZWRBcnJheSh2YWx1ZSkge1xuICByZXR1cm4gKGlzT2JqZWN0TGlrZSh2YWx1ZSkgJiYgaXNMZW5ndGgodmFsdWUubGVuZ3RoKSAmJiB0eXBlZEFycmF5VGFnc1tvYmpUb1N0cmluZy5jYWxsKHZhbHVlKV0pIHx8IGZhbHNlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzVHlwZWRBcnJheTtcbiIsInZhciBpc0xlbmd0aCA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2lzTGVuZ3RoJyksXG4gICAgaXNOYXRpdmUgPSByZXF1aXJlKCcuLi9sYW5nL2lzTmF0aXZlJyksXG4gICAgaXNPYmplY3QgPSByZXF1aXJlKCcuLi9sYW5nL2lzT2JqZWN0JyksXG4gICAgc2hpbUtleXMgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9zaGltS2V5cycpO1xuXG4vKiBOYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgZm9yIHRob3NlIHdpdGggdGhlIHNhbWUgbmFtZSBhcyBvdGhlciBgbG9kYXNoYCBtZXRob2RzLiAqL1xudmFyIG5hdGl2ZUtleXMgPSBpc05hdGl2ZShuYXRpdmVLZXlzID0gT2JqZWN0LmtleXMpICYmIG5hdGl2ZUtleXM7XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBhcnJheSBvZiB0aGUgb3duIGVudW1lcmFibGUgcHJvcGVydHkgbmFtZXMgb2YgYG9iamVjdGAuXG4gKlxuICogKipOb3RlOioqIE5vbi1vYmplY3QgdmFsdWVzIGFyZSBjb2VyY2VkIHRvIG9iamVjdHMuIFNlZSB0aGVcbiAqIFtFUyBzcGVjXShodHRwczovL3Blb3BsZS5tb3ppbGxhLm9yZy9+am9yZW5kb3JmZi9lczYtZHJhZnQuaHRtbCNzZWMtb2JqZWN0LmtleXMpXG4gKiBmb3IgbW9yZSBkZXRhaWxzLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgT2JqZWN0XG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gaW5zcGVjdC5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgYXJyYXkgb2YgcHJvcGVydHkgbmFtZXMuXG4gKiBAZXhhbXBsZVxuICpcbiAqIGZ1bmN0aW9uIEZvbygpIHtcbiAqICAgdGhpcy5hID0gMTtcbiAqICAgdGhpcy5iID0gMjtcbiAqIH1cbiAqXG4gKiBGb28ucHJvdG90eXBlLmMgPSAzO1xuICpcbiAqIF8ua2V5cyhuZXcgRm9vKTtcbiAqIC8vID0+IFsnYScsICdiJ10gKGl0ZXJhdGlvbiBvcmRlciBpcyBub3QgZ3VhcmFudGVlZClcbiAqXG4gKiBfLmtleXMoJ2hpJyk7XG4gKiAvLyA9PiBbJzAnLCAnMSddXG4gKi9cbnZhciBrZXlzID0gIW5hdGl2ZUtleXMgPyBzaGltS2V5cyA6IGZ1bmN0aW9uKG9iamVjdCkge1xuICBpZiAob2JqZWN0KSB7XG4gICAgdmFyIEN0b3IgPSBvYmplY3QuY29uc3RydWN0b3IsXG4gICAgICAgIGxlbmd0aCA9IG9iamVjdC5sZW5ndGg7XG4gIH1cbiAgaWYgKCh0eXBlb2YgQ3RvciA9PSAnZnVuY3Rpb24nICYmIEN0b3IucHJvdG90eXBlID09PSBvYmplY3QpIHx8XG4gICAgICh0eXBlb2Ygb2JqZWN0ICE9ICdmdW5jdGlvbicgJiYgKGxlbmd0aCAmJiBpc0xlbmd0aChsZW5ndGgpKSkpIHtcbiAgICByZXR1cm4gc2hpbUtleXMob2JqZWN0KTtcbiAgfVxuICByZXR1cm4gaXNPYmplY3Qob2JqZWN0KSA/IG5hdGl2ZUtleXMob2JqZWN0KSA6IFtdO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBrZXlzO1xuIiwidmFyIGlzQXJndW1lbnRzID0gcmVxdWlyZSgnLi4vbGFuZy9pc0FyZ3VtZW50cycpLFxuICAgIGlzQXJyYXkgPSByZXF1aXJlKCcuLi9sYW5nL2lzQXJyYXknKSxcbiAgICBpc0luZGV4ID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNJbmRleCcpLFxuICAgIGlzTGVuZ3RoID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNMZW5ndGgnKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJy4uL2xhbmcvaXNPYmplY3QnKSxcbiAgICBzdXBwb3J0ID0gcmVxdWlyZSgnLi4vc3VwcG9ydCcpO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gY2hlY2sgb2JqZWN0cyBmb3Igb3duIHByb3BlcnRpZXMuICovXG52YXIgaGFzT3duUHJvcGVydHkgPSBvYmplY3RQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuLyoqXG4gKiBDcmVhdGVzIGFuIGFycmF5IG9mIHRoZSBvd24gYW5kIGluaGVyaXRlZCBlbnVtZXJhYmxlIHByb3BlcnR5IG5hbWVzIG9mIGBvYmplY3RgLlxuICpcbiAqICoqTm90ZToqKiBOb24tb2JqZWN0IHZhbHVlcyBhcmUgY29lcmNlZCB0byBvYmplY3RzLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgT2JqZWN0XG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gaW5zcGVjdC5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgYXJyYXkgb2YgcHJvcGVydHkgbmFtZXMuXG4gKiBAZXhhbXBsZVxuICpcbiAqIGZ1bmN0aW9uIEZvbygpIHtcbiAqICAgdGhpcy5hID0gMTtcbiAqICAgdGhpcy5iID0gMjtcbiAqIH1cbiAqXG4gKiBGb28ucHJvdG90eXBlLmMgPSAzO1xuICpcbiAqIF8ua2V5c0luKG5ldyBGb28pO1xuICogLy8gPT4gWydhJywgJ2InLCAnYyddIChpdGVyYXRpb24gb3JkZXIgaXMgbm90IGd1YXJhbnRlZWQpXG4gKi9cbmZ1bmN0aW9uIGtleXNJbihvYmplY3QpIHtcbiAgaWYgKG9iamVjdCA9PSBudWxsKSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG4gIGlmICghaXNPYmplY3Qob2JqZWN0KSkge1xuICAgIG9iamVjdCA9IE9iamVjdChvYmplY3QpO1xuICB9XG4gIHZhciBsZW5ndGggPSBvYmplY3QubGVuZ3RoO1xuICBsZW5ndGggPSAobGVuZ3RoICYmIGlzTGVuZ3RoKGxlbmd0aCkgJiZcbiAgICAoaXNBcnJheShvYmplY3QpIHx8IChzdXBwb3J0Lm5vbkVudW1BcmdzICYmIGlzQXJndW1lbnRzKG9iamVjdCkpKSAmJiBsZW5ndGgpIHx8IDA7XG5cbiAgdmFyIEN0b3IgPSBvYmplY3QuY29uc3RydWN0b3IsXG4gICAgICBpbmRleCA9IC0xLFxuICAgICAgaXNQcm90byA9IHR5cGVvZiBDdG9yID09ICdmdW5jdGlvbicgJiYgQ3Rvci5wcm90b3R5cGUgPT0gb2JqZWN0LFxuICAgICAgcmVzdWx0ID0gQXJyYXkobGVuZ3RoKSxcbiAgICAgIHNraXBJbmRleGVzID0gbGVuZ3RoID4gMDtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHJlc3VsdFtpbmRleF0gPSAoaW5kZXggKyAnJyk7XG4gIH1cbiAgZm9yICh2YXIga2V5IGluIG9iamVjdCkge1xuICAgIGlmICghKHNraXBJbmRleGVzICYmIGlzSW5kZXgoa2V5LCBsZW5ndGgpKSAmJlxuICAgICAgICAhKGtleSA9PSAnY29uc3RydWN0b3InICYmIChpc1Byb3RvIHx8ICFoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwga2V5KSkpKSB7XG4gICAgICByZXN1bHQucHVzaChrZXkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGtleXNJbjtcbiIsInZhciBiYXNlVG9TdHJpbmcgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9iYXNlVG9TdHJpbmcnKTtcblxuLyoqXG4gKiBVc2VkIHRvIG1hdGNoIGBSZWdFeHBgIHNwZWNpYWwgY2hhcmFjdGVycy5cbiAqIFNlZSB0aGlzIFthcnRpY2xlIG9uIGBSZWdFeHBgIGNoYXJhY3RlcnNdKGh0dHA6Ly93d3cucmVndWxhci1leHByZXNzaW9ucy5pbmZvL2NoYXJhY3RlcnMuaHRtbCNzcGVjaWFsKVxuICogZm9yIG1vcmUgZGV0YWlscy5cbiAqL1xudmFyIHJlUmVnRXhwQ2hhcnMgPSAvWy4qKz9eJHt9KCl8W1xcXVxcL1xcXFxdL2csXG4gICAgcmVIYXNSZWdFeHBDaGFycyA9IFJlZ0V4cChyZVJlZ0V4cENoYXJzLnNvdXJjZSk7XG5cbi8qKlxuICogRXNjYXBlcyB0aGUgYFJlZ0V4cGAgc3BlY2lhbCBjaGFyYWN0ZXJzIFwiXFxcIiwgXCJeXCIsIFwiJFwiLCBcIi5cIiwgXCJ8XCIsIFwiP1wiLCBcIipcIixcbiAqIFwiK1wiLCBcIihcIiwgXCIpXCIsIFwiW1wiLCBcIl1cIiwgXCJ7XCIgYW5kIFwifVwiIGluIGBzdHJpbmdgLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgU3RyaW5nXG4gKiBAcGFyYW0ge3N0cmluZ30gW3N0cmluZz0nJ10gVGhlIHN0cmluZyB0byBlc2NhcGUuXG4gKiBAcmV0dXJucyB7c3RyaW5nfSBSZXR1cm5zIHRoZSBlc2NhcGVkIHN0cmluZy5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5lc2NhcGVSZWdFeHAoJ1tsb2Rhc2hdKGh0dHBzOi8vbG9kYXNoLmNvbS8pJyk7XG4gKiAvLyA9PiAnXFxbbG9kYXNoXFxdXFwoaHR0cHM6Ly9sb2Rhc2hcXC5jb20vXFwpJ1xuICovXG5mdW5jdGlvbiBlc2NhcGVSZWdFeHAoc3RyaW5nKSB7XG4gIHN0cmluZyA9IGJhc2VUb1N0cmluZyhzdHJpbmcpO1xuICByZXR1cm4gKHN0cmluZyAmJiByZUhhc1JlZ0V4cENoYXJzLnRlc3Qoc3RyaW5nKSlcbiAgICA/IHN0cmluZy5yZXBsYWNlKHJlUmVnRXhwQ2hhcnMsICdcXFxcJCYnKVxuICAgIDogc3RyaW5nO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGVzY2FwZVJlZ0V4cDtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbnZhciBpc05hdGl2ZSA9IHJlcXVpcmUoJy4vbGFuZy9pc05hdGl2ZScpO1xuXG4vKiogVXNlZCB0byBkZXRlY3QgZnVuY3Rpb25zIGNvbnRhaW5pbmcgYSBgdGhpc2AgcmVmZXJlbmNlLiAqL1xudmFyIHJlVGhpcyA9IC9cXGJ0aGlzXFxiLztcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBET00gc3VwcG9ydC4gKi9cbnZhciBkb2N1bWVudCA9IChkb2N1bWVudCA9IGdsb2JhbC53aW5kb3cpICYmIGRvY3VtZW50LmRvY3VtZW50O1xuXG4vKiogTmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIHByb3BlcnR5SXNFbnVtZXJhYmxlID0gb2JqZWN0UHJvdG8ucHJvcGVydHlJc0VudW1lcmFibGU7XG5cbi8qKlxuICogQW4gb2JqZWN0IGVudmlyb25tZW50IGZlYXR1cmUgZmxhZ3MuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEB0eXBlIE9iamVjdFxuICovXG52YXIgc3VwcG9ydCA9IHt9O1xuXG4oZnVuY3Rpb24oeCkge1xuXG4gIC8qKlxuICAgKiBEZXRlY3QgaWYgZnVuY3Rpb25zIGNhbiBiZSBkZWNvbXBpbGVkIGJ5IGBGdW5jdGlvbiN0b1N0cmluZ2BcbiAgICogKGFsbCBidXQgRmlyZWZveCBPUyBjZXJ0aWZpZWQgYXBwcywgb2xkZXIgT3BlcmEgbW9iaWxlIGJyb3dzZXJzLCBhbmRcbiAgICogdGhlIFBsYXlTdGF0aW9uIDM7IGZvcmNlZCBgZmFsc2VgIGZvciBXaW5kb3dzIDggYXBwcykuXG4gICAqXG4gICAqIEBtZW1iZXJPZiBfLnN1cHBvcnRcbiAgICogQHR5cGUgYm9vbGVhblxuICAgKi9cbiAgc3VwcG9ydC5mdW5jRGVjb21wID0gIWlzTmF0aXZlKGdsb2JhbC5XaW5SVEVycm9yKSAmJiByZVRoaXMudGVzdChmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXM7IH0pO1xuXG4gIC8qKlxuICAgKiBEZXRlY3QgaWYgYEZ1bmN0aW9uI25hbWVgIGlzIHN1cHBvcnRlZCAoYWxsIGJ1dCBJRSkuXG4gICAqXG4gICAqIEBtZW1iZXJPZiBfLnN1cHBvcnRcbiAgICogQHR5cGUgYm9vbGVhblxuICAgKi9cbiAgc3VwcG9ydC5mdW5jTmFtZXMgPSB0eXBlb2YgRnVuY3Rpb24ubmFtZSA9PSAnc3RyaW5nJztcblxuICAvKipcbiAgICogRGV0ZWN0IGlmIHRoZSBET00gaXMgc3VwcG9ydGVkLlxuICAgKlxuICAgKiBAbWVtYmVyT2YgXy5zdXBwb3J0XG4gICAqIEB0eXBlIGJvb2xlYW5cbiAgICovXG4gIHRyeSB7XG4gICAgc3VwcG9ydC5kb20gPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCkubm9kZVR5cGUgPT09IDExO1xuICB9IGNhdGNoKGUpIHtcbiAgICBzdXBwb3J0LmRvbSA9IGZhbHNlO1xuICB9XG5cbiAgLyoqXG4gICAqIERldGVjdCBpZiBgYXJndW1lbnRzYCBvYmplY3QgaW5kZXhlcyBhcmUgbm9uLWVudW1lcmFibGUuXG4gICAqXG4gICAqIEluIEZpcmVmb3ggPCA0LCBJRSA8IDksIFBoYW50b21KUywgYW5kIFNhZmFyaSA8IDUuMSBgYXJndW1lbnRzYCBvYmplY3RcbiAgICogaW5kZXhlcyBhcmUgbm9uLWVudW1lcmFibGUuIENocm9tZSA8IDI1IGFuZCBOb2RlLmpzIDwgMC4xMS4wIHRyZWF0XG4gICAqIGBhcmd1bWVudHNgIG9iamVjdCBpbmRleGVzIGFzIG5vbi1lbnVtZXJhYmxlIGFuZCBmYWlsIGBoYXNPd25Qcm9wZXJ0eWBcbiAgICogY2hlY2tzIGZvciBpbmRleGVzIHRoYXQgZXhjZWVkIHRoZWlyIGZ1bmN0aW9uJ3MgZm9ybWFsIHBhcmFtZXRlcnMgd2l0aFxuICAgKiBhc3NvY2lhdGVkIHZhbHVlcyBvZiBgMGAuXG4gICAqXG4gICAqIEBtZW1iZXJPZiBfLnN1cHBvcnRcbiAgICogQHR5cGUgYm9vbGVhblxuICAgKi9cbiAgdHJ5IHtcbiAgICBzdXBwb3J0Lm5vbkVudW1BcmdzID0gIXByb3BlcnR5SXNFbnVtZXJhYmxlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgfSBjYXRjaChlKSB7XG4gICAgc3VwcG9ydC5ub25FbnVtQXJncyA9IHRydWU7XG4gIH1cbn0oMCwgMCkpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHN1cHBvcnQ7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiLyoqXG4gKiBDcmVhdGVzIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIGB2YWx1ZWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBVdGlsaXR5XG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byByZXR1cm4gZnJvbSB0aGUgbmV3IGZ1bmN0aW9uLlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBuZXcgZnVuY3Rpb24uXG4gKiBAZXhhbXBsZVxuICpcbiAqIHZhciBvYmplY3QgPSB7ICd1c2VyJzogJ2ZyZWQnIH07XG4gKiB2YXIgZ2V0dGVyID0gXy5jb25zdGFudChvYmplY3QpO1xuICogZ2V0dGVyKCkgPT09IG9iamVjdDtcbiAqIC8vID0+IHRydWVcbiAqL1xuZnVuY3Rpb24gY29uc3RhbnQodmFsdWUpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjb25zdGFudDtcbiIsIi8qKlxuICogVGhpcyBtZXRob2QgcmV0dXJucyB0aGUgZmlyc3QgYXJndW1lbnQgcHJvdmlkZWQgdG8gaXQuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBVdGlsaXR5XG4gKiBAcGFyYW0geyp9IHZhbHVlIEFueSB2YWx1ZS5cbiAqIEByZXR1cm5zIHsqfSBSZXR1cm5zIGB2YWx1ZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIHZhciBvYmplY3QgPSB7ICd1c2VyJzogJ2ZyZWQnIH07XG4gKiBfLmlkZW50aXR5KG9iamVjdCkgPT09IG9iamVjdDtcbiAqIC8vID0+IHRydWVcbiAqL1xuZnVuY3Rpb24gaWRlbnRpdHkodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlkZW50aXR5O1xuIiwidmFyIGlzSXRlcmF0ZWVDYWxsID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNJdGVyYXRlZUNhbGwnKTtcblxuLyoqIE5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBjZWlsID0gTWF0aC5jZWlsO1xuXG4vKiBOYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgZm9yIHRob3NlIHdpdGggdGhlIHNhbWUgbmFtZSBhcyBvdGhlciBgbG9kYXNoYCBtZXRob2RzLiAqL1xudmFyIG5hdGl2ZU1heCA9IE1hdGgubWF4O1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gYXJyYXkgb2YgbnVtYmVycyAocG9zaXRpdmUgYW5kL29yIG5lZ2F0aXZlKSBwcm9ncmVzc2luZyBmcm9tXG4gKiBgc3RhcnRgIHVwIHRvLCBidXQgbm90IGluY2x1ZGluZywgYGVuZGAuIElmIGBzdGFydGAgaXMgbGVzcyB0aGFuIGBlbmRgIGFcbiAqIHplcm8tbGVuZ3RoIHJhbmdlIGlzIGNyZWF0ZWQgdW5sZXNzIGEgbmVnYXRpdmUgYHN0ZXBgIGlzIHNwZWNpZmllZC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IFV0aWxpdHlcbiAqIEBwYXJhbSB7bnVtYmVyfSBbc3RhcnQ9MF0gVGhlIHN0YXJ0IG9mIHRoZSByYW5nZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSBlbmQgVGhlIGVuZCBvZiB0aGUgcmFuZ2UuXG4gKiBAcGFyYW0ge251bWJlcn0gW3N0ZXA9MV0gVGhlIHZhbHVlIHRvIGluY3JlbWVudCBvciBkZWNyZW1lbnQgYnkuXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgdGhlIG5ldyBhcnJheSBvZiBudW1iZXJzLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLnJhbmdlKDQpO1xuICogLy8gPT4gWzAsIDEsIDIsIDNdXG4gKlxuICogXy5yYW5nZSgxLCA1KTtcbiAqIC8vID0+IFsxLCAyLCAzLCA0XVxuICpcbiAqIF8ucmFuZ2UoMCwgMjAsIDUpO1xuICogLy8gPT4gWzAsIDUsIDEwLCAxNV1cbiAqXG4gKiBfLnJhbmdlKDAsIC00LCAtMSk7XG4gKiAvLyA9PiBbMCwgLTEsIC0yLCAtM11cbiAqXG4gKiBfLnJhbmdlKDEsIDQsIDApO1xuICogLy8gPT4gWzEsIDEsIDFdXG4gKlxuICogXy5yYW5nZSgwKTtcbiAqIC8vID0+IFtdXG4gKi9cbmZ1bmN0aW9uIHJhbmdlKHN0YXJ0LCBlbmQsIHN0ZXApIHtcbiAgaWYgKHN0ZXAgJiYgaXNJdGVyYXRlZUNhbGwoc3RhcnQsIGVuZCwgc3RlcCkpIHtcbiAgICBlbmQgPSBzdGVwID0gbnVsbDtcbiAgfVxuICBzdGFydCA9ICtzdGFydCB8fCAwO1xuICBzdGVwID0gc3RlcCA9PSBudWxsID8gMSA6ICgrc3RlcCB8fCAwKTtcblxuICBpZiAoZW5kID09IG51bGwpIHtcbiAgICBlbmQgPSBzdGFydDtcbiAgICBzdGFydCA9IDA7XG4gIH0gZWxzZSB7XG4gICAgZW5kID0gK2VuZCB8fCAwO1xuICB9XG4gIC8vIFVzZSBgQXJyYXkobGVuZ3RoKWAgc28gZW5naW5lcyBsaWtlIENoYWtyYSBhbmQgVjggYXZvaWQgc2xvd2VyIG1vZGVzLlxuICAvLyBTZWUgaHR0cHM6Ly95b3V0dS5iZS9YQXFJcEdVOFpaayN0PTE3bTI1cyBmb3IgbW9yZSBkZXRhaWxzLlxuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGxlbmd0aCA9IG5hdGl2ZU1heChjZWlsKChlbmQgLSBzdGFydCkgLyAoc3RlcCB8fCAxKSksIDApLFxuICAgICAgcmVzdWx0ID0gQXJyYXkobGVuZ3RoKTtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHJlc3VsdFtpbmRleF0gPSBzdGFydDtcbiAgICBzdGFydCArPSBzdGVwO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcmFuZ2U7XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vKipcbiAqIFJlYWN0ICh3aXRoIGFkZG9ucykgdjAuMTIuMlxuICpcbiAqIENvcHlyaWdodCAyMDEzLTIwMTQsIEZhY2Vib29rLCBJbmMuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFRoaXMgc291cmNlIGNvZGUgaXMgbGljZW5zZWQgdW5kZXIgdGhlIEJTRC1zdHlsZSBsaWNlbnNlIGZvdW5kIGluIHRoZVxuICogTElDRU5TRSBmaWxlIGluIHRoZSByb290IGRpcmVjdG9yeSBvZiB0aGlzIHNvdXJjZSB0cmVlLiBBbiBhZGRpdGlvbmFsIGdyYW50XG4gKiBvZiBwYXRlbnQgcmlnaHRzIGNhbiBiZSBmb3VuZCBpbiB0aGUgUEFURU5UUyBmaWxlIGluIHRoZSBzYW1lIGRpcmVjdG9yeS5cbiAqXG4gKi9cbiFmdW5jdGlvbihlKXtpZihcIm9iamVjdFwiPT10eXBlb2YgZXhwb3J0cyYmXCJ1bmRlZmluZWRcIiE9dHlwZW9mIG1vZHVsZSltb2R1bGUuZXhwb3J0cz1lKCk7ZWxzZSBpZihcImZ1bmN0aW9uXCI9PXR5cGVvZiBkZWZpbmUmJmRlZmluZS5hbWQpZGVmaW5lKFtdLGUpO2Vsc2V7dmFyIHQ7XCJ1bmRlZmluZWRcIiE9dHlwZW9mIHdpbmRvdz90PXdpbmRvdzpcInVuZGVmaW5lZFwiIT10eXBlb2YgZ2xvYmFsP3Q9Z2xvYmFsOlwidW5kZWZpbmVkXCIhPXR5cGVvZiBzZWxmJiYodD1zZWxmKSx0LlJlYWN0PWUoKX19KGZ1bmN0aW9uKCl7cmV0dXJuIGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIG8oYSxzKXtpZighblthXSl7aWYoIXRbYV0pe3ZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIXMmJnUpcmV0dXJuIHUoYSwhMCk7aWYoaSlyZXR1cm4gaShhLCEwKTt2YXIgYz1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2ErXCInXCIpO3Rocm93IGMuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixjfXZhciBsPW5bYV09e2V4cG9ydHM6e319O3RbYV1bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFthXVsxXVtlXTtyZXR1cm4gbyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW2FdLmV4cG9ydHN9Zm9yKHZhciBpPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsYT0wO2E8ci5sZW5ndGg7YSsrKW8oclthXSk7cmV0dXJuIG99KHsxOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPWUoXCIuL0xpbmtlZFN0YXRlTWl4aW5cIikscj1lKFwiLi9SZWFjdFwiKSxvPWUoXCIuL1JlYWN0Q29tcG9uZW50V2l0aFB1cmVSZW5kZXJNaXhpblwiKSxpPWUoXCIuL1JlYWN0Q1NTVHJhbnNpdGlvbkdyb3VwXCIpLGE9ZShcIi4vUmVhY3RUcmFuc2l0aW9uR3JvdXBcIikscz1lKFwiLi9SZWFjdFVwZGF0ZXNcIiksdT1lKFwiLi9jeFwiKSxjPWUoXCIuL2Nsb25lV2l0aFByb3BzXCIpLGw9ZShcIi4vdXBkYXRlXCIpO3IuYWRkb25zPXtDU1NUcmFuc2l0aW9uR3JvdXA6aSxMaW5rZWRTdGF0ZU1peGluOm4sUHVyZVJlbmRlck1peGluOm8sVHJhbnNpdGlvbkdyb3VwOmEsYmF0Y2hlZFVwZGF0ZXM6cy5iYXRjaGVkVXBkYXRlcyxjbGFzc1NldDp1LGNsb25lV2l0aFByb3BzOmMsdXBkYXRlOmx9LHQuZXhwb3J0cz1yfSx7XCIuL0xpbmtlZFN0YXRlTWl4aW5cIjoyNSxcIi4vUmVhY3RcIjozMSxcIi4vUmVhY3RDU1NUcmFuc2l0aW9uR3JvdXBcIjozNCxcIi4vUmVhY3RDb21wb25lbnRXaXRoUHVyZVJlbmRlck1peGluXCI6MzksXCIuL1JlYWN0VHJhbnNpdGlvbkdyb3VwXCI6ODcsXCIuL1JlYWN0VXBkYXRlc1wiOjg4LFwiLi9jbG9uZVdpdGhQcm9wc1wiOjExMCxcIi4vY3hcIjoxMTUsXCIuL3VwZGF0ZVwiOjE1NH1dLDI6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG49ZShcIi4vZm9jdXNOb2RlXCIpLHI9e2NvbXBvbmVudERpZE1vdW50OmZ1bmN0aW9uKCl7dGhpcy5wcm9wcy5hdXRvRm9jdXMmJm4odGhpcy5nZXRET01Ob2RlKCkpfX07dC5leHBvcnRzPXJ9LHtcIi4vZm9jdXNOb2RlXCI6MTIyfV0sMzpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKCl7dmFyIGU9d2luZG93Lm9wZXJhO3JldHVyblwib2JqZWN0XCI9PXR5cGVvZiBlJiZcImZ1bmN0aW9uXCI9PXR5cGVvZiBlLnZlcnNpb24mJnBhcnNlSW50KGUudmVyc2lvbigpLDEwKTw9MTJ9ZnVuY3Rpb24gcihlKXtyZXR1cm4oZS5jdHJsS2V5fHxlLmFsdEtleXx8ZS5tZXRhS2V5KSYmIShlLmN0cmxLZXkmJmUuYWx0S2V5KX12YXIgbz1lKFwiLi9FdmVudENvbnN0YW50c1wiKSxpPWUoXCIuL0V2ZW50UHJvcGFnYXRvcnNcIiksYT1lKFwiLi9FeGVjdXRpb25FbnZpcm9ubWVudFwiKSxzPWUoXCIuL1N5bnRoZXRpY0lucHV0RXZlbnRcIiksdT1lKFwiLi9rZXlPZlwiKSxjPWEuY2FuVXNlRE9NJiZcIlRleHRFdmVudFwiaW4gd2luZG93JiYhKFwiZG9jdW1lbnRNb2RlXCJpbiBkb2N1bWVudHx8bigpKSxsPTMyLHA9U3RyaW5nLmZyb21DaGFyQ29kZShsKSxkPW8udG9wTGV2ZWxUeXBlcyxmPXtiZWZvcmVJbnB1dDp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dSh7b25CZWZvcmVJbnB1dDpudWxsfSksY2FwdHVyZWQ6dSh7b25CZWZvcmVJbnB1dENhcHR1cmU6bnVsbH0pfSxkZXBlbmRlbmNpZXM6W2QudG9wQ29tcG9zaXRpb25FbmQsZC50b3BLZXlQcmVzcyxkLnRvcFRleHRJbnB1dCxkLnRvcFBhc3RlXX19LGg9bnVsbCxtPSExLHY9e2V2ZW50VHlwZXM6ZixleHRyYWN0RXZlbnRzOmZ1bmN0aW9uKGUsdCxuLG8pe3ZhciBhO2lmKGMpc3dpdGNoKGUpe2Nhc2UgZC50b3BLZXlQcmVzczp2YXIgdT1vLndoaWNoO2lmKHUhPT1sKXJldHVybjttPSEwLGE9cDticmVhaztjYXNlIGQudG9wVGV4dElucHV0OmlmKGE9by5kYXRhLGE9PT1wJiZtKXJldHVybjticmVhaztkZWZhdWx0OnJldHVybn1lbHNle3N3aXRjaChlKXtjYXNlIGQudG9wUGFzdGU6aD1udWxsO2JyZWFrO2Nhc2UgZC50b3BLZXlQcmVzczpvLndoaWNoJiYhcihvKSYmKGg9U3RyaW5nLmZyb21DaGFyQ29kZShvLndoaWNoKSk7YnJlYWs7Y2FzZSBkLnRvcENvbXBvc2l0aW9uRW5kOmg9by5kYXRhfWlmKG51bGw9PT1oKXJldHVybjthPWh9aWYoYSl7dmFyIHY9cy5nZXRQb29sZWQoZi5iZWZvcmVJbnB1dCxuLG8pO3JldHVybiB2LmRhdGE9YSxoPW51bGwsaS5hY2N1bXVsYXRlVHdvUGhhc2VEaXNwYXRjaGVzKHYpLHZ9fX07dC5leHBvcnRzPXZ9LHtcIi4vRXZlbnRDb25zdGFudHNcIjoxNyxcIi4vRXZlbnRQcm9wYWdhdG9yc1wiOjIyLFwiLi9FeGVjdXRpb25FbnZpcm9ubWVudFwiOjIzLFwiLi9TeW50aGV0aWNJbnB1dEV2ZW50XCI6OTgsXCIuL2tleU9mXCI6MTQ0fV0sNDpbZnVuY3Rpb24oZSx0KXt2YXIgbj1lKFwiLi9pbnZhcmlhbnRcIikscj17YWRkQ2xhc3M6ZnVuY3Rpb24oZSx0KXtyZXR1cm4gbighL1xccy8udGVzdCh0KSksdCYmKGUuY2xhc3NMaXN0P2UuY2xhc3NMaXN0LmFkZCh0KTpyLmhhc0NsYXNzKGUsdCl8fChlLmNsYXNzTmFtZT1lLmNsYXNzTmFtZStcIiBcIit0KSksZX0scmVtb3ZlQ2xhc3M6ZnVuY3Rpb24oZSx0KXtyZXR1cm4gbighL1xccy8udGVzdCh0KSksdCYmKGUuY2xhc3NMaXN0P2UuY2xhc3NMaXN0LnJlbW92ZSh0KTpyLmhhc0NsYXNzKGUsdCkmJihlLmNsYXNzTmFtZT1lLmNsYXNzTmFtZS5yZXBsYWNlKG5ldyBSZWdFeHAoXCIoXnxcXFxccylcIit0K1wiKD86XFxcXHN8JClcIixcImdcIiksXCIkMVwiKS5yZXBsYWNlKC9cXHMrL2csXCIgXCIpLnJlcGxhY2UoL15cXHMqfFxccyokL2csXCJcIikpKSxlfSxjb25kaXRpb25DbGFzczpmdW5jdGlvbihlLHQsbil7cmV0dXJuKG4/ci5hZGRDbGFzczpyLnJlbW92ZUNsYXNzKShlLHQpfSxoYXNDbGFzczpmdW5jdGlvbihlLHQpe3JldHVybiBuKCEvXFxzLy50ZXN0KHQpKSxlLmNsYXNzTGlzdD8hIXQmJmUuY2xhc3NMaXN0LmNvbnRhaW5zKHQpOihcIiBcIitlLmNsYXNzTmFtZStcIiBcIikuaW5kZXhPZihcIiBcIit0K1wiIFwiKT4tMX19O3QuZXhwb3J0cz1yfSx7XCIuL2ludmFyaWFudFwiOjEzN31dLDU6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlLHQpe3JldHVybiBlK3QuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkrdC5zdWJzdHJpbmcoMSl9dmFyIHI9e2NvbHVtbkNvdW50OiEwLGZsZXg6ITAsZmxleEdyb3c6ITAsZmxleFNocmluazohMCxmb250V2VpZ2h0OiEwLGxpbmVDbGFtcDohMCxsaW5lSGVpZ2h0OiEwLG9wYWNpdHk6ITAsb3JkZXI6ITAsb3JwaGFuczohMCx3aWRvd3M6ITAsekluZGV4OiEwLHpvb206ITAsZmlsbE9wYWNpdHk6ITAsc3Ryb2tlT3BhY2l0eTohMH0sbz1bXCJXZWJraXRcIixcIm1zXCIsXCJNb3pcIixcIk9cIl07T2JqZWN0LmtleXMocikuZm9yRWFjaChmdW5jdGlvbihlKXtvLmZvckVhY2goZnVuY3Rpb24odCl7cltuKHQsZSldPXJbZV19KX0pO3ZhciBpPXtiYWNrZ3JvdW5kOntiYWNrZ3JvdW5kSW1hZ2U6ITAsYmFja2dyb3VuZFBvc2l0aW9uOiEwLGJhY2tncm91bmRSZXBlYXQ6ITAsYmFja2dyb3VuZENvbG9yOiEwfSxib3JkZXI6e2JvcmRlcldpZHRoOiEwLGJvcmRlclN0eWxlOiEwLGJvcmRlckNvbG9yOiEwfSxib3JkZXJCb3R0b206e2JvcmRlckJvdHRvbVdpZHRoOiEwLGJvcmRlckJvdHRvbVN0eWxlOiEwLGJvcmRlckJvdHRvbUNvbG9yOiEwfSxib3JkZXJMZWZ0Ontib3JkZXJMZWZ0V2lkdGg6ITAsYm9yZGVyTGVmdFN0eWxlOiEwLGJvcmRlckxlZnRDb2xvcjohMH0sYm9yZGVyUmlnaHQ6e2JvcmRlclJpZ2h0V2lkdGg6ITAsYm9yZGVyUmlnaHRTdHlsZTohMCxib3JkZXJSaWdodENvbG9yOiEwfSxib3JkZXJUb3A6e2JvcmRlclRvcFdpZHRoOiEwLGJvcmRlclRvcFN0eWxlOiEwLGJvcmRlclRvcENvbG9yOiEwfSxmb250Ontmb250U3R5bGU6ITAsZm9udFZhcmlhbnQ6ITAsZm9udFdlaWdodDohMCxmb250U2l6ZTohMCxsaW5lSGVpZ2h0OiEwLGZvbnRGYW1pbHk6ITB9fSxhPXtpc1VuaXRsZXNzTnVtYmVyOnIsc2hvcnRoYW5kUHJvcGVydHlFeHBhbnNpb25zOml9O3QuZXhwb3J0cz1hfSx7fV0sNjpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbj1lKFwiLi9DU1NQcm9wZXJ0eVwiKSxyPWUoXCIuL0V4ZWN1dGlvbkVudmlyb25tZW50XCIpLG89KGUoXCIuL2NhbWVsaXplU3R5bGVOYW1lXCIpLGUoXCIuL2Rhbmdlcm91c1N0eWxlVmFsdWVcIikpLGk9ZShcIi4vaHlwaGVuYXRlU3R5bGVOYW1lXCIpLGE9ZShcIi4vbWVtb2l6ZVN0cmluZ09ubHlcIikscz0oZShcIi4vd2FybmluZ1wiKSxhKGZ1bmN0aW9uKGUpe3JldHVybiBpKGUpfSkpLHU9XCJjc3NGbG9hdFwiO3IuY2FuVXNlRE9NJiZ2b2lkIDA9PT1kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUuY3NzRmxvYXQmJih1PVwic3R5bGVGbG9hdFwiKTt2YXIgYz17Y3JlYXRlTWFya3VwRm9yU3R5bGVzOmZ1bmN0aW9uKGUpe3ZhciB0PVwiXCI7Zm9yKHZhciBuIGluIGUpaWYoZS5oYXNPd25Qcm9wZXJ0eShuKSl7dmFyIHI9ZVtuXTtudWxsIT1yJiYodCs9cyhuKStcIjpcIix0Kz1vKG4scikrXCI7XCIpfXJldHVybiB0fHxudWxsfSxzZXRWYWx1ZUZvclN0eWxlczpmdW5jdGlvbihlLHQpe3ZhciByPWUuc3R5bGU7Zm9yKHZhciBpIGluIHQpaWYodC5oYXNPd25Qcm9wZXJ0eShpKSl7dmFyIGE9byhpLHRbaV0pO2lmKFwiZmxvYXRcIj09PWkmJihpPXUpLGEpcltpXT1hO2Vsc2V7dmFyIHM9bi5zaG9ydGhhbmRQcm9wZXJ0eUV4cGFuc2lvbnNbaV07aWYocylmb3IodmFyIGMgaW4gcylyW2NdPVwiXCI7ZWxzZSByW2ldPVwiXCJ9fX19O3QuZXhwb3J0cz1jfSx7XCIuL0NTU1Byb3BlcnR5XCI6NSxcIi4vRXhlY3V0aW9uRW52aXJvbm1lbnRcIjoyMyxcIi4vY2FtZWxpemVTdHlsZU5hbWVcIjoxMDksXCIuL2Rhbmdlcm91c1N0eWxlVmFsdWVcIjoxMTYsXCIuL2h5cGhlbmF0ZVN0eWxlTmFtZVwiOjEzNSxcIi4vbWVtb2l6ZVN0cmluZ09ubHlcIjoxNDYsXCIuL3dhcm5pbmdcIjoxNTV9XSw3OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oKXt0aGlzLl9jYWxsYmFja3M9bnVsbCx0aGlzLl9jb250ZXh0cz1udWxsfXZhciByPWUoXCIuL1Bvb2xlZENsYXNzXCIpLG89ZShcIi4vT2JqZWN0LmFzc2lnblwiKSxpPWUoXCIuL2ludmFyaWFudFwiKTtvKG4ucHJvdG90eXBlLHtlbnF1ZXVlOmZ1bmN0aW9uKGUsdCl7dGhpcy5fY2FsbGJhY2tzPXRoaXMuX2NhbGxiYWNrc3x8W10sdGhpcy5fY29udGV4dHM9dGhpcy5fY29udGV4dHN8fFtdLHRoaXMuX2NhbGxiYWNrcy5wdXNoKGUpLHRoaXMuX2NvbnRleHRzLnB1c2godCl9LG5vdGlmeUFsbDpmdW5jdGlvbigpe3ZhciBlPXRoaXMuX2NhbGxiYWNrcyx0PXRoaXMuX2NvbnRleHRzO2lmKGUpe2koZS5sZW5ndGg9PT10Lmxlbmd0aCksdGhpcy5fY2FsbGJhY2tzPW51bGwsdGhpcy5fY29udGV4dHM9bnVsbDtmb3IodmFyIG49MCxyPWUubGVuZ3RoO3I+bjtuKyspZVtuXS5jYWxsKHRbbl0pO2UubGVuZ3RoPTAsdC5sZW5ndGg9MH19LHJlc2V0OmZ1bmN0aW9uKCl7dGhpcy5fY2FsbGJhY2tzPW51bGwsdGhpcy5fY29udGV4dHM9bnVsbH0sZGVzdHJ1Y3RvcjpmdW5jdGlvbigpe3RoaXMucmVzZXQoKX19KSxyLmFkZFBvb2xpbmdUbyhuKSx0LmV4cG9ydHM9bn0se1wiLi9PYmplY3QuYXNzaWduXCI6MjksXCIuL1Bvb2xlZENsYXNzXCI6MzAsXCIuL2ludmFyaWFudFwiOjEzN31dLDg6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlKXtyZXR1cm5cIlNFTEVDVFwiPT09ZS5ub2RlTmFtZXx8XCJJTlBVVFwiPT09ZS5ub2RlTmFtZSYmXCJmaWxlXCI9PT1lLnR5cGV9ZnVuY3Rpb24gcihlKXt2YXIgdD1NLmdldFBvb2xlZChQLmNoYW5nZSx3LGUpO0UuYWNjdW11bGF0ZVR3b1BoYXNlRGlzcGF0Y2hlcyh0KSxSLmJhdGNoZWRVcGRhdGVzKG8sdCl9ZnVuY3Rpb24gbyhlKXtnLmVucXVldWVFdmVudHMoZSksZy5wcm9jZXNzRXZlbnRRdWV1ZSgpfWZ1bmN0aW9uIGkoZSx0KXtUPWUsdz10LFQuYXR0YWNoRXZlbnQoXCJvbmNoYW5nZVwiLHIpfWZ1bmN0aW9uIGEoKXtUJiYoVC5kZXRhY2hFdmVudChcIm9uY2hhbmdlXCIsciksVD1udWxsLHc9bnVsbCl9ZnVuY3Rpb24gcyhlLHQsbil7cmV0dXJuIGU9PT14LnRvcENoYW5nZT9uOnZvaWQgMH1mdW5jdGlvbiB1KGUsdCxuKXtlPT09eC50b3BGb2N1cz8oYSgpLGkodCxuKSk6ZT09PXgudG9wQmx1ciYmYSgpfWZ1bmN0aW9uIGMoZSx0KXtUPWUsdz10LF89ZS52YWx1ZSxTPU9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoZS5jb25zdHJ1Y3Rvci5wcm90b3R5cGUsXCJ2YWx1ZVwiKSxPYmplY3QuZGVmaW5lUHJvcGVydHkoVCxcInZhbHVlXCIsayksVC5hdHRhY2hFdmVudChcIm9ucHJvcGVydHljaGFuZ2VcIixwKX1mdW5jdGlvbiBsKCl7VCYmKGRlbGV0ZSBULnZhbHVlLFQuZGV0YWNoRXZlbnQoXCJvbnByb3BlcnR5Y2hhbmdlXCIscCksVD1udWxsLHc9bnVsbCxfPW51bGwsUz1udWxsKX1mdW5jdGlvbiBwKGUpe2lmKFwidmFsdWVcIj09PWUucHJvcGVydHlOYW1lKXt2YXIgdD1lLnNyY0VsZW1lbnQudmFsdWU7dCE9PV8mJihfPXQscihlKSl9fWZ1bmN0aW9uIGQoZSx0LG4pe3JldHVybiBlPT09eC50b3BJbnB1dD9uOnZvaWQgMH1mdW5jdGlvbiBmKGUsdCxuKXtlPT09eC50b3BGb2N1cz8obCgpLGModCxuKSk6ZT09PXgudG9wQmx1ciYmbCgpfWZ1bmN0aW9uIGgoZSl7cmV0dXJuIGUhPT14LnRvcFNlbGVjdGlvbkNoYW5nZSYmZSE9PXgudG9wS2V5VXAmJmUhPT14LnRvcEtleURvd258fCFUfHxULnZhbHVlPT09Xz92b2lkIDA6KF89VC52YWx1ZSx3KX1mdW5jdGlvbiBtKGUpe3JldHVyblwiSU5QVVRcIj09PWUubm9kZU5hbWUmJihcImNoZWNrYm94XCI9PT1lLnR5cGV8fFwicmFkaW9cIj09PWUudHlwZSl9ZnVuY3Rpb24gdihlLHQsbil7cmV0dXJuIGU9PT14LnRvcENsaWNrP246dm9pZCAwfXZhciB5PWUoXCIuL0V2ZW50Q29uc3RhbnRzXCIpLGc9ZShcIi4vRXZlbnRQbHVnaW5IdWJcIiksRT1lKFwiLi9FdmVudFByb3BhZ2F0b3JzXCIpLEM9ZShcIi4vRXhlY3V0aW9uRW52aXJvbm1lbnRcIiksUj1lKFwiLi9SZWFjdFVwZGF0ZXNcIiksTT1lKFwiLi9TeW50aGV0aWNFdmVudFwiKSxiPWUoXCIuL2lzRXZlbnRTdXBwb3J0ZWRcIiksTz1lKFwiLi9pc1RleHRJbnB1dEVsZW1lbnRcIiksRD1lKFwiLi9rZXlPZlwiKSx4PXkudG9wTGV2ZWxUeXBlcyxQPXtjaGFuZ2U6e3BoYXNlZFJlZ2lzdHJhdGlvbk5hbWVzOntidWJibGVkOkQoe29uQ2hhbmdlOm51bGx9KSxjYXB0dXJlZDpEKHtvbkNoYW5nZUNhcHR1cmU6bnVsbH0pfSxkZXBlbmRlbmNpZXM6W3gudG9wQmx1cix4LnRvcENoYW5nZSx4LnRvcENsaWNrLHgudG9wRm9jdXMseC50b3BJbnB1dCx4LnRvcEtleURvd24seC50b3BLZXlVcCx4LnRvcFNlbGVjdGlvbkNoYW5nZV19fSxUPW51bGwsdz1udWxsLF89bnVsbCxTPW51bGwsTj0hMTtDLmNhblVzZURPTSYmKE49YihcImNoYW5nZVwiKSYmKCEoXCJkb2N1bWVudE1vZGVcImluIGRvY3VtZW50KXx8ZG9jdW1lbnQuZG9jdW1lbnRNb2RlPjgpKTt2YXIgST0hMTtDLmNhblVzZURPTSYmKEk9YihcImlucHV0XCIpJiYoIShcImRvY3VtZW50TW9kZVwiaW4gZG9jdW1lbnQpfHxkb2N1bWVudC5kb2N1bWVudE1vZGU+OSkpO3ZhciBrPXtnZXQ6ZnVuY3Rpb24oKXtyZXR1cm4gUy5nZXQuY2FsbCh0aGlzKX0sc2V0OmZ1bmN0aW9uKGUpe189XCJcIitlLFMuc2V0LmNhbGwodGhpcyxlKX19LEE9e2V2ZW50VHlwZXM6UCxleHRyYWN0RXZlbnRzOmZ1bmN0aW9uKGUsdCxyLG8pe3ZhciBpLGE7aWYobih0KT9OP2k9czphPXU6Tyh0KT9JP2k9ZDooaT1oLGE9Zik6bSh0KSYmKGk9diksaSl7dmFyIGM9aShlLHQscik7aWYoYyl7dmFyIGw9TS5nZXRQb29sZWQoUC5jaGFuZ2UsYyxvKTtyZXR1cm4gRS5hY2N1bXVsYXRlVHdvUGhhc2VEaXNwYXRjaGVzKGwpLGx9fWEmJmEoZSx0LHIpfX07dC5leHBvcnRzPUF9LHtcIi4vRXZlbnRDb25zdGFudHNcIjoxNyxcIi4vRXZlbnRQbHVnaW5IdWJcIjoxOSxcIi4vRXZlbnRQcm9wYWdhdG9yc1wiOjIyLFwiLi9FeGVjdXRpb25FbnZpcm9ubWVudFwiOjIzLFwiLi9SZWFjdFVwZGF0ZXNcIjo4OCxcIi4vU3ludGhldGljRXZlbnRcIjo5NixcIi4vaXNFdmVudFN1cHBvcnRlZFwiOjEzOCxcIi4vaXNUZXh0SW5wdXRFbGVtZW50XCI6MTQwLFwiLi9rZXlPZlwiOjE0NH1dLDk6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG49MCxyPXtjcmVhdGVSZWFjdFJvb3RJbmRleDpmdW5jdGlvbigpe3JldHVybiBuKyt9fTt0LmV4cG9ydHM9cn0se31dLDEwOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSl7c3dpdGNoKGUpe2Nhc2UgeS50b3BDb21wb3NpdGlvblN0YXJ0OnJldHVybiBFLmNvbXBvc2l0aW9uU3RhcnQ7Y2FzZSB5LnRvcENvbXBvc2l0aW9uRW5kOnJldHVybiBFLmNvbXBvc2l0aW9uRW5kO2Nhc2UgeS50b3BDb21wb3NpdGlvblVwZGF0ZTpyZXR1cm4gRS5jb21wb3NpdGlvblVwZGF0ZX19ZnVuY3Rpb24gcihlLHQpe3JldHVybiBlPT09eS50b3BLZXlEb3duJiZ0LmtleUNvZGU9PT1ofWZ1bmN0aW9uIG8oZSx0KXtzd2l0Y2goZSl7Y2FzZSB5LnRvcEtleVVwOnJldHVybi0xIT09Zi5pbmRleE9mKHQua2V5Q29kZSk7Y2FzZSB5LnRvcEtleURvd246cmV0dXJuIHQua2V5Q29kZSE9PWg7Y2FzZSB5LnRvcEtleVByZXNzOmNhc2UgeS50b3BNb3VzZURvd246Y2FzZSB5LnRvcEJsdXI6cmV0dXJuITA7ZGVmYXVsdDpyZXR1cm4hMX19ZnVuY3Rpb24gaShlKXt0aGlzLnJvb3Q9ZSx0aGlzLnN0YXJ0U2VsZWN0aW9uPWMuZ2V0U2VsZWN0aW9uKGUpLHRoaXMuc3RhcnRWYWx1ZT10aGlzLmdldFRleHQoKX12YXIgYT1lKFwiLi9FdmVudENvbnN0YW50c1wiKSxzPWUoXCIuL0V2ZW50UHJvcGFnYXRvcnNcIiksdT1lKFwiLi9FeGVjdXRpb25FbnZpcm9ubWVudFwiKSxjPWUoXCIuL1JlYWN0SW5wdXRTZWxlY3Rpb25cIiksbD1lKFwiLi9TeW50aGV0aWNDb21wb3NpdGlvbkV2ZW50XCIpLHA9ZShcIi4vZ2V0VGV4dENvbnRlbnRBY2Nlc3NvclwiKSxkPWUoXCIuL2tleU9mXCIpLGY9WzksMTMsMjcsMzJdLGg9MjI5LG09dS5jYW5Vc2VET00mJlwiQ29tcG9zaXRpb25FdmVudFwiaW4gd2luZG93LHY9IW18fFwiZG9jdW1lbnRNb2RlXCJpbiBkb2N1bWVudCYmZG9jdW1lbnQuZG9jdW1lbnRNb2RlPjgmJmRvY3VtZW50LmRvY3VtZW50TW9kZTw9MTEseT1hLnRvcExldmVsVHlwZXMsZz1udWxsLEU9e2NvbXBvc2l0aW9uRW5kOntwaGFzZWRSZWdpc3RyYXRpb25OYW1lczp7YnViYmxlZDpkKHtvbkNvbXBvc2l0aW9uRW5kOm51bGx9KSxjYXB0dXJlZDpkKHtvbkNvbXBvc2l0aW9uRW5kQ2FwdHVyZTpudWxsfSl9LGRlcGVuZGVuY2llczpbeS50b3BCbHVyLHkudG9wQ29tcG9zaXRpb25FbmQseS50b3BLZXlEb3duLHkudG9wS2V5UHJlc3MseS50b3BLZXlVcCx5LnRvcE1vdXNlRG93bl19LGNvbXBvc2l0aW9uU3RhcnQ6e3BoYXNlZFJlZ2lzdHJhdGlvbk5hbWVzOntidWJibGVkOmQoe29uQ29tcG9zaXRpb25TdGFydDpudWxsfSksY2FwdHVyZWQ6ZCh7b25Db21wb3NpdGlvblN0YXJ0Q2FwdHVyZTpudWxsfSl9LGRlcGVuZGVuY2llczpbeS50b3BCbHVyLHkudG9wQ29tcG9zaXRpb25TdGFydCx5LnRvcEtleURvd24seS50b3BLZXlQcmVzcyx5LnRvcEtleVVwLHkudG9wTW91c2VEb3duXX0sY29tcG9zaXRpb25VcGRhdGU6e3BoYXNlZFJlZ2lzdHJhdGlvbk5hbWVzOntidWJibGVkOmQoe29uQ29tcG9zaXRpb25VcGRhdGU6bnVsbH0pLGNhcHR1cmVkOmQoe29uQ29tcG9zaXRpb25VcGRhdGVDYXB0dXJlOm51bGx9KX0sZGVwZW5kZW5jaWVzOlt5LnRvcEJsdXIseS50b3BDb21wb3NpdGlvblVwZGF0ZSx5LnRvcEtleURvd24seS50b3BLZXlQcmVzcyx5LnRvcEtleVVwLHkudG9wTW91c2VEb3duXX19O2kucHJvdG90eXBlLmdldFRleHQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5yb290LnZhbHVlfHx0aGlzLnJvb3RbcCgpXX0saS5wcm90b3R5cGUuZ2V0RGF0YT1mdW5jdGlvbigpe3ZhciBlPXRoaXMuZ2V0VGV4dCgpLHQ9dGhpcy5zdGFydFNlbGVjdGlvbi5zdGFydCxuPXRoaXMuc3RhcnRWYWx1ZS5sZW5ndGgtdGhpcy5zdGFydFNlbGVjdGlvbi5lbmQ7cmV0dXJuIGUuc3Vic3RyKHQsZS5sZW5ndGgtbi10KX07dmFyIEM9e2V2ZW50VHlwZXM6RSxleHRyYWN0RXZlbnRzOmZ1bmN0aW9uKGUsdCxhLHUpe3ZhciBjLHA7aWYobT9jPW4oZSk6Zz9vKGUsdSkmJihjPUUuY29tcG9zaXRpb25FbmQpOnIoZSx1KSYmKGM9RS5jb21wb3NpdGlvblN0YXJ0KSx2JiYoZ3x8YyE9PUUuY29tcG9zaXRpb25TdGFydD9jPT09RS5jb21wb3NpdGlvbkVuZCYmZyYmKHA9Zy5nZXREYXRhKCksZz1udWxsKTpnPW5ldyBpKHQpKSxjKXt2YXIgZD1sLmdldFBvb2xlZChjLGEsdSk7cmV0dXJuIHAmJihkLmRhdGE9cCkscy5hY2N1bXVsYXRlVHdvUGhhc2VEaXNwYXRjaGVzKGQpLGR9fX07dC5leHBvcnRzPUN9LHtcIi4vRXZlbnRDb25zdGFudHNcIjoxNyxcIi4vRXZlbnRQcm9wYWdhdG9yc1wiOjIyLFwiLi9FeGVjdXRpb25FbnZpcm9ubWVudFwiOjIzLFwiLi9SZWFjdElucHV0U2VsZWN0aW9uXCI6NjMsXCIuL1N5bnRoZXRpY0NvbXBvc2l0aW9uRXZlbnRcIjo5NCxcIi4vZ2V0VGV4dENvbnRlbnRBY2Nlc3NvclwiOjEzMixcIi4va2V5T2ZcIjoxNDR9XSwxMTpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUsdCxuKXtlLmluc2VydEJlZm9yZSh0LGUuY2hpbGROb2Rlc1tuXXx8bnVsbCl9dmFyIHIsbz1lKFwiLi9EYW5nZXJcIiksaT1lKFwiLi9SZWFjdE11bHRpQ2hpbGRVcGRhdGVUeXBlc1wiKSxhPWUoXCIuL2dldFRleHRDb250ZW50QWNjZXNzb3JcIikscz1lKFwiLi9pbnZhcmlhbnRcIiksdT1hKCk7cj1cInRleHRDb250ZW50XCI9PT11P2Z1bmN0aW9uKGUsdCl7ZS50ZXh0Q29udGVudD10fTpmdW5jdGlvbihlLHQpe2Zvcig7ZS5maXJzdENoaWxkOyllLnJlbW92ZUNoaWxkKGUuZmlyc3RDaGlsZCk7aWYodCl7dmFyIG49ZS5vd25lckRvY3VtZW50fHxkb2N1bWVudDtlLmFwcGVuZENoaWxkKG4uY3JlYXRlVGV4dE5vZGUodCkpfX07dmFyIGM9e2Rhbmdlcm91c2x5UmVwbGFjZU5vZGVXaXRoTWFya3VwOm8uZGFuZ2Vyb3VzbHlSZXBsYWNlTm9kZVdpdGhNYXJrdXAsdXBkYXRlVGV4dENvbnRlbnQ6cixwcm9jZXNzVXBkYXRlczpmdW5jdGlvbihlLHQpe2Zvcih2YXIgYSx1PW51bGwsYz1udWxsLGw9MDthPWVbbF07bCsrKWlmKGEudHlwZT09PWkuTU9WRV9FWElTVElOR3x8YS50eXBlPT09aS5SRU1PVkVfTk9ERSl7dmFyIHA9YS5mcm9tSW5kZXgsZD1hLnBhcmVudE5vZGUuY2hpbGROb2Rlc1twXSxmPWEucGFyZW50SUQ7cyhkKSx1PXV8fHt9LHVbZl09dVtmXXx8W10sdVtmXVtwXT1kLGM9Y3x8W10sYy5wdXNoKGQpfXZhciBoPW8uZGFuZ2Vyb3VzbHlSZW5kZXJNYXJrdXAodCk7aWYoYylmb3IodmFyIG09MDttPGMubGVuZ3RoO20rKyljW21dLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoY1ttXSk7Zm9yKHZhciB2PTA7YT1lW3ZdO3YrKylzd2l0Y2goYS50eXBlKXtjYXNlIGkuSU5TRVJUX01BUktVUDpuKGEucGFyZW50Tm9kZSxoW2EubWFya3VwSW5kZXhdLGEudG9JbmRleCk7YnJlYWs7Y2FzZSBpLk1PVkVfRVhJU1RJTkc6bihhLnBhcmVudE5vZGUsdVthLnBhcmVudElEXVthLmZyb21JbmRleF0sYS50b0luZGV4KTticmVhaztjYXNlIGkuVEVYVF9DT05URU5UOnIoYS5wYXJlbnROb2RlLGEudGV4dENvbnRlbnQpO2JyZWFrO2Nhc2UgaS5SRU1PVkVfTk9ERTp9fX07dC5leHBvcnRzPWN9LHtcIi4vRGFuZ2VyXCI6MTQsXCIuL1JlYWN0TXVsdGlDaGlsZFVwZGF0ZVR5cGVzXCI6NzAsXCIuL2dldFRleHRDb250ZW50QWNjZXNzb3JcIjoxMzIsXCIuL2ludmFyaWFudFwiOjEzN31dLDEyOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSx0KXtyZXR1cm4oZSZ0KT09PXR9dmFyIHI9ZShcIi4vaW52YXJpYW50XCIpLG89e01VU1RfVVNFX0FUVFJJQlVURToxLE1VU1RfVVNFX1BST1BFUlRZOjIsSEFTX1NJREVfRUZGRUNUUzo0LEhBU19CT09MRUFOX1ZBTFVFOjgsSEFTX05VTUVSSUNfVkFMVUU6MTYsSEFTX1BPU0lUSVZFX05VTUVSSUNfVkFMVUU6NDgsSEFTX09WRVJMT0FERURfQk9PTEVBTl9WQUxVRTo2NCxpbmplY3RET01Qcm9wZXJ0eUNvbmZpZzpmdW5jdGlvbihlKXt2YXIgdD1lLlByb3BlcnRpZXN8fHt9LGk9ZS5ET01BdHRyaWJ1dGVOYW1lc3x8e30scz1lLkRPTVByb3BlcnR5TmFtZXN8fHt9LHU9ZS5ET01NdXRhdGlvbk1ldGhvZHN8fHt9O2UuaXNDdXN0b21BdHRyaWJ1dGUmJmEuX2lzQ3VzdG9tQXR0cmlidXRlRnVuY3Rpb25zLnB1c2goZS5pc0N1c3RvbUF0dHJpYnV0ZSk7Zm9yKHZhciBjIGluIHQpe3IoIWEuaXNTdGFuZGFyZE5hbWUuaGFzT3duUHJvcGVydHkoYykpLGEuaXNTdGFuZGFyZE5hbWVbY109ITA7dmFyIGw9Yy50b0xvd2VyQ2FzZSgpO2lmKGEuZ2V0UG9zc2libGVTdGFuZGFyZE5hbWVbbF09YyxpLmhhc093blByb3BlcnR5KGMpKXt2YXIgcD1pW2NdO2EuZ2V0UG9zc2libGVTdGFuZGFyZE5hbWVbcF09YyxhLmdldEF0dHJpYnV0ZU5hbWVbY109cH1lbHNlIGEuZ2V0QXR0cmlidXRlTmFtZVtjXT1sO2EuZ2V0UHJvcGVydHlOYW1lW2NdPXMuaGFzT3duUHJvcGVydHkoYyk/c1tjXTpjLGEuZ2V0TXV0YXRpb25NZXRob2RbY109dS5oYXNPd25Qcm9wZXJ0eShjKT91W2NdOm51bGw7dmFyIGQ9dFtjXTthLm11c3RVc2VBdHRyaWJ1dGVbY109bihkLG8uTVVTVF9VU0VfQVRUUklCVVRFKSxhLm11c3RVc2VQcm9wZXJ0eVtjXT1uKGQsby5NVVNUX1VTRV9QUk9QRVJUWSksYS5oYXNTaWRlRWZmZWN0c1tjXT1uKGQsby5IQVNfU0lERV9FRkZFQ1RTKSxhLmhhc0Jvb2xlYW5WYWx1ZVtjXT1uKGQsby5IQVNfQk9PTEVBTl9WQUxVRSksYS5oYXNOdW1lcmljVmFsdWVbY109bihkLG8uSEFTX05VTUVSSUNfVkFMVUUpLGEuaGFzUG9zaXRpdmVOdW1lcmljVmFsdWVbY109bihkLG8uSEFTX1BPU0lUSVZFX05VTUVSSUNfVkFMVUUpLGEuaGFzT3ZlcmxvYWRlZEJvb2xlYW5WYWx1ZVtjXT1uKGQsby5IQVNfT1ZFUkxPQURFRF9CT09MRUFOX1ZBTFVFKSxyKCFhLm11c3RVc2VBdHRyaWJ1dGVbY118fCFhLm11c3RVc2VQcm9wZXJ0eVtjXSkscihhLm11c3RVc2VQcm9wZXJ0eVtjXXx8IWEuaGFzU2lkZUVmZmVjdHNbY10pLHIoISFhLmhhc0Jvb2xlYW5WYWx1ZVtjXSshIWEuaGFzTnVtZXJpY1ZhbHVlW2NdKyEhYS5oYXNPdmVybG9hZGVkQm9vbGVhblZhbHVlW2NdPD0xKX19fSxpPXt9LGE9e0lEX0FUVFJJQlVURV9OQU1FOlwiZGF0YS1yZWFjdGlkXCIsaXNTdGFuZGFyZE5hbWU6e30sZ2V0UG9zc2libGVTdGFuZGFyZE5hbWU6e30sZ2V0QXR0cmlidXRlTmFtZTp7fSxnZXRQcm9wZXJ0eU5hbWU6e30sZ2V0TXV0YXRpb25NZXRob2Q6e30sbXVzdFVzZUF0dHJpYnV0ZTp7fSxtdXN0VXNlUHJvcGVydHk6e30saGFzU2lkZUVmZmVjdHM6e30saGFzQm9vbGVhblZhbHVlOnt9LGhhc051bWVyaWNWYWx1ZTp7fSxoYXNQb3NpdGl2ZU51bWVyaWNWYWx1ZTp7fSxoYXNPdmVybG9hZGVkQm9vbGVhblZhbHVlOnt9LF9pc0N1c3RvbUF0dHJpYnV0ZUZ1bmN0aW9uczpbXSxpc0N1c3RvbUF0dHJpYnV0ZTpmdW5jdGlvbihlKXtmb3IodmFyIHQ9MDt0PGEuX2lzQ3VzdG9tQXR0cmlidXRlRnVuY3Rpb25zLmxlbmd0aDt0Kyspe3ZhciBuPWEuX2lzQ3VzdG9tQXR0cmlidXRlRnVuY3Rpb25zW3RdO2lmKG4oZSkpcmV0dXJuITB9cmV0dXJuITF9LGdldERlZmF1bHRWYWx1ZUZvclByb3BlcnR5OmZ1bmN0aW9uKGUsdCl7dmFyIG4scj1pW2VdO3JldHVybiByfHwoaVtlXT1yPXt9KSx0IGluIHJ8fChuPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoZSksclt0XT1uW3RdKSxyW3RdfSxpbmplY3Rpb246b307dC5leHBvcnRzPWF9LHtcIi4vaW52YXJpYW50XCI6MTM3fV0sMTM6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlLHQpe3JldHVybiBudWxsPT10fHxyLmhhc0Jvb2xlYW5WYWx1ZVtlXSYmIXR8fHIuaGFzTnVtZXJpY1ZhbHVlW2VdJiZpc05hTih0KXx8ci5oYXNQb3NpdGl2ZU51bWVyaWNWYWx1ZVtlXSYmMT50fHxyLmhhc092ZXJsb2FkZWRCb29sZWFuVmFsdWVbZV0mJnQ9PT0hMX12YXIgcj1lKFwiLi9ET01Qcm9wZXJ0eVwiKSxvPWUoXCIuL2VzY2FwZVRleHRGb3JCcm93c2VyXCIpLGk9ZShcIi4vbWVtb2l6ZVN0cmluZ09ubHlcIiksYT0oZShcIi4vd2FybmluZ1wiKSxpKGZ1bmN0aW9uKGUpe3JldHVybiBvKGUpKyc9XCInfSkpLHM9e2NyZWF0ZU1hcmt1cEZvcklEOmZ1bmN0aW9uKGUpe3JldHVybiBhKHIuSURfQVRUUklCVVRFX05BTUUpK28oZSkrJ1wiJ30sY3JlYXRlTWFya3VwRm9yUHJvcGVydHk6ZnVuY3Rpb24oZSx0KXtpZihyLmlzU3RhbmRhcmROYW1lLmhhc093blByb3BlcnR5KGUpJiZyLmlzU3RhbmRhcmROYW1lW2VdKXtpZihuKGUsdCkpcmV0dXJuXCJcIjt2YXIgaT1yLmdldEF0dHJpYnV0ZU5hbWVbZV07cmV0dXJuIHIuaGFzQm9vbGVhblZhbHVlW2VdfHxyLmhhc092ZXJsb2FkZWRCb29sZWFuVmFsdWVbZV0mJnQ9PT0hMD9vKGkpOmEoaSkrbyh0KSsnXCInfXJldHVybiByLmlzQ3VzdG9tQXR0cmlidXRlKGUpP251bGw9PXQ/XCJcIjphKGUpK28odCkrJ1wiJzpudWxsfSxzZXRWYWx1ZUZvclByb3BlcnR5OmZ1bmN0aW9uKGUsdCxvKXtpZihyLmlzU3RhbmRhcmROYW1lLmhhc093blByb3BlcnR5KHQpJiZyLmlzU3RhbmRhcmROYW1lW3RdKXt2YXIgaT1yLmdldE11dGF0aW9uTWV0aG9kW3RdO2lmKGkpaShlLG8pO2Vsc2UgaWYobih0LG8pKXRoaXMuZGVsZXRlVmFsdWVGb3JQcm9wZXJ0eShlLHQpO2Vsc2UgaWYoci5tdXN0VXNlQXR0cmlidXRlW3RdKWUuc2V0QXR0cmlidXRlKHIuZ2V0QXR0cmlidXRlTmFtZVt0XSxcIlwiK28pO2Vsc2V7dmFyIGE9ci5nZXRQcm9wZXJ0eU5hbWVbdF07ci5oYXNTaWRlRWZmZWN0c1t0XSYmXCJcIitlW2FdPT1cIlwiK298fChlW2FdPW8pfX1lbHNlIHIuaXNDdXN0b21BdHRyaWJ1dGUodCkmJihudWxsPT1vP2UucmVtb3ZlQXR0cmlidXRlKHQpOmUuc2V0QXR0cmlidXRlKHQsXCJcIitvKSl9LGRlbGV0ZVZhbHVlRm9yUHJvcGVydHk6ZnVuY3Rpb24oZSx0KXtpZihyLmlzU3RhbmRhcmROYW1lLmhhc093blByb3BlcnR5KHQpJiZyLmlzU3RhbmRhcmROYW1lW3RdKXt2YXIgbj1yLmdldE11dGF0aW9uTWV0aG9kW3RdO2lmKG4pbihlLHZvaWQgMCk7ZWxzZSBpZihyLm11c3RVc2VBdHRyaWJ1dGVbdF0pZS5yZW1vdmVBdHRyaWJ1dGUoci5nZXRBdHRyaWJ1dGVOYW1lW3RdKTtlbHNle3ZhciBvPXIuZ2V0UHJvcGVydHlOYW1lW3RdLGk9ci5nZXREZWZhdWx0VmFsdWVGb3JQcm9wZXJ0eShlLm5vZGVOYW1lLG8pO3IuaGFzU2lkZUVmZmVjdHNbdF0mJlwiXCIrZVtvXT09PWl8fChlW29dPWkpfX1lbHNlIHIuaXNDdXN0b21BdHRyaWJ1dGUodCkmJmUucmVtb3ZlQXR0cmlidXRlKHQpfX07dC5leHBvcnRzPXN9LHtcIi4vRE9NUHJvcGVydHlcIjoxMixcIi4vZXNjYXBlVGV4dEZvckJyb3dzZXJcIjoxMjAsXCIuL21lbW9pemVTdHJpbmdPbmx5XCI6MTQ2LFwiLi93YXJuaW5nXCI6MTU1fV0sMTQ6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlKXtyZXR1cm4gZS5zdWJzdHJpbmcoMSxlLmluZGV4T2YoXCIgXCIpKX12YXIgcj1lKFwiLi9FeGVjdXRpb25FbnZpcm9ubWVudFwiKSxvPWUoXCIuL2NyZWF0ZU5vZGVzRnJvbU1hcmt1cFwiKSxpPWUoXCIuL2VtcHR5RnVuY3Rpb25cIiksYT1lKFwiLi9nZXRNYXJrdXBXcmFwXCIpLHM9ZShcIi4vaW52YXJpYW50XCIpLHU9L14oPFteIFxcLz5dKykvLGM9XCJkYXRhLWRhbmdlci1pbmRleFwiLGw9e2Rhbmdlcm91c2x5UmVuZGVyTWFya3VwOmZ1bmN0aW9uKGUpe3Moci5jYW5Vc2VET00pO2Zvcih2YXIgdCxsPXt9LHA9MDtwPGUubGVuZ3RoO3ArKylzKGVbcF0pLHQ9bihlW3BdKSx0PWEodCk/dDpcIipcIixsW3RdPWxbdF18fFtdLGxbdF1bcF09ZVtwXTt2YXIgZD1bXSxmPTA7Zm9yKHQgaW4gbClpZihsLmhhc093blByb3BlcnR5KHQpKXt2YXIgaD1sW3RdO2Zvcih2YXIgbSBpbiBoKWlmKGguaGFzT3duUHJvcGVydHkobSkpe3ZhciB2PWhbbV07aFttXT12LnJlcGxhY2UodSxcIiQxIFwiK2MrJz1cIicrbSsnXCIgJyl9dmFyIHk9byhoLmpvaW4oXCJcIiksaSk7Zm9yKHA9MDtwPHkubGVuZ3RoOysrcCl7dmFyIGc9eVtwXTtnLmhhc0F0dHJpYnV0ZSYmZy5oYXNBdHRyaWJ1dGUoYykmJihtPStnLmdldEF0dHJpYnV0ZShjKSxnLnJlbW92ZUF0dHJpYnV0ZShjKSxzKCFkLmhhc093blByb3BlcnR5KG0pKSxkW21dPWcsZis9MSl9fXJldHVybiBzKGY9PT1kLmxlbmd0aCkscyhkLmxlbmd0aD09PWUubGVuZ3RoKSxkfSxkYW5nZXJvdXNseVJlcGxhY2VOb2RlV2l0aE1hcmt1cDpmdW5jdGlvbihlLHQpe3Moci5jYW5Vc2VET00pLHModCkscyhcImh0bWxcIiE9PWUudGFnTmFtZS50b0xvd2VyQ2FzZSgpKTt2YXIgbj1vKHQsaSlbMF07ZS5wYXJlbnROb2RlLnJlcGxhY2VDaGlsZChuLGUpfX07dC5leHBvcnRzPWx9LHtcIi4vRXhlY3V0aW9uRW52aXJvbm1lbnRcIjoyMyxcIi4vY3JlYXRlTm9kZXNGcm9tTWFya3VwXCI6MTE0LFwiLi9lbXB0eUZ1bmN0aW9uXCI6MTE4LFwiLi9nZXRNYXJrdXBXcmFwXCI6MTI5LFwiLi9pbnZhcmlhbnRcIjoxMzd9XSwxNTpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbj1lKFwiLi9rZXlPZlwiKSxyPVtuKHtSZXNwb25kZXJFdmVudFBsdWdpbjpudWxsfSksbih7U2ltcGxlRXZlbnRQbHVnaW46bnVsbH0pLG4oe1RhcEV2ZW50UGx1Z2luOm51bGx9KSxuKHtFbnRlckxlYXZlRXZlbnRQbHVnaW46bnVsbH0pLG4oe0NoYW5nZUV2ZW50UGx1Z2luOm51bGx9KSxuKHtTZWxlY3RFdmVudFBsdWdpbjpudWxsfSksbih7Q29tcG9zaXRpb25FdmVudFBsdWdpbjpudWxsfSksbih7QmVmb3JlSW5wdXRFdmVudFBsdWdpbjpudWxsfSksbih7QW5hbHl0aWNzRXZlbnRQbHVnaW46bnVsbH0pLG4oe01vYmlsZVNhZmFyaUNsaWNrRXZlbnRQbHVnaW46bnVsbH0pXTt0LmV4cG9ydHM9cn0se1wiLi9rZXlPZlwiOjE0NH1dLDE2OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPWUoXCIuL0V2ZW50Q29uc3RhbnRzXCIpLHI9ZShcIi4vRXZlbnRQcm9wYWdhdG9yc1wiKSxvPWUoXCIuL1N5bnRoZXRpY01vdXNlRXZlbnRcIiksaT1lKFwiLi9SZWFjdE1vdW50XCIpLGE9ZShcIi4va2V5T2ZcIikscz1uLnRvcExldmVsVHlwZXMsdT1pLmdldEZpcnN0UmVhY3RET00sYz17bW91c2VFbnRlcjp7cmVnaXN0cmF0aW9uTmFtZTphKHtvbk1vdXNlRW50ZXI6bnVsbH0pLGRlcGVuZGVuY2llczpbcy50b3BNb3VzZU91dCxzLnRvcE1vdXNlT3Zlcl19LG1vdXNlTGVhdmU6e3JlZ2lzdHJhdGlvbk5hbWU6YSh7b25Nb3VzZUxlYXZlOm51bGx9KSxkZXBlbmRlbmNpZXM6W3MudG9wTW91c2VPdXQscy50b3BNb3VzZU92ZXJdfX0sbD1bbnVsbCxudWxsXSxwPXtldmVudFR5cGVzOmMsZXh0cmFjdEV2ZW50czpmdW5jdGlvbihlLHQsbixhKXtpZihlPT09cy50b3BNb3VzZU92ZXImJihhLnJlbGF0ZWRUYXJnZXR8fGEuZnJvbUVsZW1lbnQpKXJldHVybiBudWxsO2lmKGUhPT1zLnRvcE1vdXNlT3V0JiZlIT09cy50b3BNb3VzZU92ZXIpcmV0dXJuIG51bGw7dmFyIHA7aWYodC53aW5kb3c9PT10KXA9dDtlbHNle3ZhciBkPXQub3duZXJEb2N1bWVudDtwPWQ/ZC5kZWZhdWx0Vmlld3x8ZC5wYXJlbnRXaW5kb3c6d2luZG93fXZhciBmLGg7aWYoZT09PXMudG9wTW91c2VPdXQ/KGY9dCxoPXUoYS5yZWxhdGVkVGFyZ2V0fHxhLnRvRWxlbWVudCl8fHApOihmPXAsaD10KSxmPT09aClyZXR1cm4gbnVsbDt2YXIgbT1mP2kuZ2V0SUQoZik6XCJcIix2PWg/aS5nZXRJRChoKTpcIlwiLHk9by5nZXRQb29sZWQoYy5tb3VzZUxlYXZlLG0sYSk7eS50eXBlPVwibW91c2VsZWF2ZVwiLHkudGFyZ2V0PWYseS5yZWxhdGVkVGFyZ2V0PWg7dmFyIGc9by5nZXRQb29sZWQoYy5tb3VzZUVudGVyLHYsYSk7cmV0dXJuIGcudHlwZT1cIm1vdXNlZW50ZXJcIixnLnRhcmdldD1oLGcucmVsYXRlZFRhcmdldD1mLHIuYWNjdW11bGF0ZUVudGVyTGVhdmVEaXNwYXRjaGVzKHksZyxtLHYpLGxbMF09eSxsWzFdPWcsbH19O3QuZXhwb3J0cz1wfSx7XCIuL0V2ZW50Q29uc3RhbnRzXCI6MTcsXCIuL0V2ZW50UHJvcGFnYXRvcnNcIjoyMixcIi4vUmVhY3RNb3VudFwiOjY4LFwiLi9TeW50aGV0aWNNb3VzZUV2ZW50XCI6MTAwLFwiLi9rZXlPZlwiOjE0NH1dLDE3OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPWUoXCIuL2tleU1pcnJvclwiKSxyPW4oe2J1YmJsZWQ6bnVsbCxjYXB0dXJlZDpudWxsfSksbz1uKHt0b3BCbHVyOm51bGwsdG9wQ2hhbmdlOm51bGwsdG9wQ2xpY2s6bnVsbCx0b3BDb21wb3NpdGlvbkVuZDpudWxsLHRvcENvbXBvc2l0aW9uU3RhcnQ6bnVsbCx0b3BDb21wb3NpdGlvblVwZGF0ZTpudWxsLHRvcENvbnRleHRNZW51Om51bGwsdG9wQ29weTpudWxsLHRvcEN1dDpudWxsLHRvcERvdWJsZUNsaWNrOm51bGwsdG9wRHJhZzpudWxsLHRvcERyYWdFbmQ6bnVsbCx0b3BEcmFnRW50ZXI6bnVsbCx0b3BEcmFnRXhpdDpudWxsLHRvcERyYWdMZWF2ZTpudWxsLHRvcERyYWdPdmVyOm51bGwsdG9wRHJhZ1N0YXJ0Om51bGwsdG9wRHJvcDpudWxsLHRvcEVycm9yOm51bGwsdG9wRm9jdXM6bnVsbCx0b3BJbnB1dDpudWxsLHRvcEtleURvd246bnVsbCx0b3BLZXlQcmVzczpudWxsLHRvcEtleVVwOm51bGwsdG9wTG9hZDpudWxsLHRvcE1vdXNlRG93bjpudWxsLHRvcE1vdXNlTW92ZTpudWxsLHRvcE1vdXNlT3V0Om51bGwsdG9wTW91c2VPdmVyOm51bGwsdG9wTW91c2VVcDpudWxsLHRvcFBhc3RlOm51bGwsdG9wUmVzZXQ6bnVsbCx0b3BTY3JvbGw6bnVsbCx0b3BTZWxlY3Rpb25DaGFuZ2U6bnVsbCx0b3BTdWJtaXQ6bnVsbCx0b3BUZXh0SW5wdXQ6bnVsbCx0b3BUb3VjaENhbmNlbDpudWxsLHRvcFRvdWNoRW5kOm51bGwsdG9wVG91Y2hNb3ZlOm51bGwsdG9wVG91Y2hTdGFydDpudWxsLHRvcFdoZWVsOm51bGx9KSxpPXt0b3BMZXZlbFR5cGVzOm8sUHJvcGFnYXRpb25QaGFzZXM6cn07dC5leHBvcnRzPWl9LHtcIi4va2V5TWlycm9yXCI6MTQzfV0sMTg6W2Z1bmN0aW9uKGUsdCl7dmFyIG49ZShcIi4vZW1wdHlGdW5jdGlvblwiKSxyPXtsaXN0ZW46ZnVuY3Rpb24oZSx0LG4pe3JldHVybiBlLmFkZEV2ZW50TGlzdGVuZXI/KGUuYWRkRXZlbnRMaXN0ZW5lcih0LG4sITEpLHtyZW1vdmU6ZnVuY3Rpb24oKXtlLnJlbW92ZUV2ZW50TGlzdGVuZXIodCxuLCExKX19KTplLmF0dGFjaEV2ZW50PyhlLmF0dGFjaEV2ZW50KFwib25cIit0LG4pLHtyZW1vdmU6ZnVuY3Rpb24oKXtlLmRldGFjaEV2ZW50KFwib25cIit0LG4pfX0pOnZvaWQgMH0sY2FwdHVyZTpmdW5jdGlvbihlLHQscil7cmV0dXJuIGUuYWRkRXZlbnRMaXN0ZW5lcj8oZS5hZGRFdmVudExpc3RlbmVyKHQsciwhMCkse3JlbW92ZTpmdW5jdGlvbigpe2UucmVtb3ZlRXZlbnRMaXN0ZW5lcih0LHIsITApfX0pOntyZW1vdmU6bn19LHJlZ2lzdGVyRGVmYXVsdDpmdW5jdGlvbigpe319O3QuZXhwb3J0cz1yfSx7XCIuL2VtcHR5RnVuY3Rpb25cIjoxMTh9XSwxOTpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbj1lKFwiLi9FdmVudFBsdWdpblJlZ2lzdHJ5XCIpLHI9ZShcIi4vRXZlbnRQbHVnaW5VdGlsc1wiKSxvPWUoXCIuL2FjY3VtdWxhdGVJbnRvXCIpLGk9ZShcIi4vZm9yRWFjaEFjY3VtdWxhdGVkXCIpLGE9ZShcIi4vaW52YXJpYW50XCIpLHM9e30sdT1udWxsLGM9ZnVuY3Rpb24oZSl7aWYoZSl7dmFyIHQ9ci5leGVjdXRlRGlzcGF0Y2gsbz1uLmdldFBsdWdpbk1vZHVsZUZvckV2ZW50KGUpO28mJm8uZXhlY3V0ZURpc3BhdGNoJiYodD1vLmV4ZWN1dGVEaXNwYXRjaCksci5leGVjdXRlRGlzcGF0Y2hlc0luT3JkZXIoZSx0KSxlLmlzUGVyc2lzdGVudCgpfHxlLmNvbnN0cnVjdG9yLnJlbGVhc2UoZSl9fSxsPW51bGwscD17aW5qZWN0aW9uOntpbmplY3RNb3VudDpyLmluamVjdGlvbi5pbmplY3RNb3VudCxpbmplY3RJbnN0YW5jZUhhbmRsZTpmdW5jdGlvbihlKXtsPWV9LGdldEluc3RhbmNlSGFuZGxlOmZ1bmN0aW9uKCl7cmV0dXJuIGx9LGluamVjdEV2ZW50UGx1Z2luT3JkZXI6bi5pbmplY3RFdmVudFBsdWdpbk9yZGVyLGluamVjdEV2ZW50UGx1Z2luc0J5TmFtZTpuLmluamVjdEV2ZW50UGx1Z2luc0J5TmFtZX0sZXZlbnROYW1lRGlzcGF0Y2hDb25maWdzOm4uZXZlbnROYW1lRGlzcGF0Y2hDb25maWdzLHJlZ2lzdHJhdGlvbk5hbWVNb2R1bGVzOm4ucmVnaXN0cmF0aW9uTmFtZU1vZHVsZXMscHV0TGlzdGVuZXI6ZnVuY3Rpb24oZSx0LG4pe2EoIW58fFwiZnVuY3Rpb25cIj09dHlwZW9mIG4pO3ZhciByPXNbdF18fChzW3RdPXt9KTtyW2VdPW59LGdldExpc3RlbmVyOmZ1bmN0aW9uKGUsdCl7dmFyIG49c1t0XTtyZXR1cm4gbiYmbltlXX0sZGVsZXRlTGlzdGVuZXI6ZnVuY3Rpb24oZSx0KXt2YXIgbj1zW3RdO24mJmRlbGV0ZSBuW2VdfSxkZWxldGVBbGxMaXN0ZW5lcnM6ZnVuY3Rpb24oZSl7Zm9yKHZhciB0IGluIHMpZGVsZXRlIHNbdF1bZV19LGV4dHJhY3RFdmVudHM6ZnVuY3Rpb24oZSx0LHIsaSl7Zm9yKHZhciBhLHM9bi5wbHVnaW5zLHU9MCxjPXMubGVuZ3RoO2M+dTt1Kyspe3ZhciBsPXNbdV07aWYobCl7dmFyIHA9bC5leHRyYWN0RXZlbnRzKGUsdCxyLGkpO3AmJihhPW8oYSxwKSl9fXJldHVybiBhfSxlbnF1ZXVlRXZlbnRzOmZ1bmN0aW9uKGUpe2UmJih1PW8odSxlKSl9LHByb2Nlc3NFdmVudFF1ZXVlOmZ1bmN0aW9uKCl7dmFyIGU9dTt1PW51bGwsaShlLGMpLGEoIXUpfSxfX3B1cmdlOmZ1bmN0aW9uKCl7cz17fX0sX19nZXRMaXN0ZW5lckJhbms6ZnVuY3Rpb24oKXtyZXR1cm4gc319O3QuZXhwb3J0cz1wfSx7XCIuL0V2ZW50UGx1Z2luUmVnaXN0cnlcIjoyMCxcIi4vRXZlbnRQbHVnaW5VdGlsc1wiOjIxLFwiLi9hY2N1bXVsYXRlSW50b1wiOjEwNixcIi4vZm9yRWFjaEFjY3VtdWxhdGVkXCI6MTIzLFwiLi9pbnZhcmlhbnRcIjoxMzd9XSwyMDpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKCl7aWYoYSlmb3IodmFyIGUgaW4gcyl7dmFyIHQ9c1tlXSxuPWEuaW5kZXhPZihlKTtpZihpKG4+LTEpLCF1LnBsdWdpbnNbbl0pe2kodC5leHRyYWN0RXZlbnRzKSx1LnBsdWdpbnNbbl09dDt2YXIgbz10LmV2ZW50VHlwZXM7Zm9yKHZhciBjIGluIG8paShyKG9bY10sdCxjKSl9fX1mdW5jdGlvbiByKGUsdCxuKXtpKCF1LmV2ZW50TmFtZURpc3BhdGNoQ29uZmlncy5oYXNPd25Qcm9wZXJ0eShuKSksdS5ldmVudE5hbWVEaXNwYXRjaENvbmZpZ3Nbbl09ZTt2YXIgcj1lLnBoYXNlZFJlZ2lzdHJhdGlvbk5hbWVzO2lmKHIpe2Zvcih2YXIgYSBpbiByKWlmKHIuaGFzT3duUHJvcGVydHkoYSkpe3ZhciBzPXJbYV07byhzLHQsbil9cmV0dXJuITB9cmV0dXJuIGUucmVnaXN0cmF0aW9uTmFtZT8obyhlLnJlZ2lzdHJhdGlvbk5hbWUsdCxuKSwhMCk6ITF9ZnVuY3Rpb24gbyhlLHQsbil7aSghdS5yZWdpc3RyYXRpb25OYW1lTW9kdWxlc1tlXSksdS5yZWdpc3RyYXRpb25OYW1lTW9kdWxlc1tlXT10LHUucmVnaXN0cmF0aW9uTmFtZURlcGVuZGVuY2llc1tlXT10LmV2ZW50VHlwZXNbbl0uZGVwZW5kZW5jaWVzfXZhciBpPWUoXCIuL2ludmFyaWFudFwiKSxhPW51bGwscz17fSx1PXtwbHVnaW5zOltdLGV2ZW50TmFtZURpc3BhdGNoQ29uZmlnczp7fSxyZWdpc3RyYXRpb25OYW1lTW9kdWxlczp7fSxyZWdpc3RyYXRpb25OYW1lRGVwZW5kZW5jaWVzOnt9LGluamVjdEV2ZW50UGx1Z2luT3JkZXI6ZnVuY3Rpb24oZSl7aSghYSksYT1BcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChlKSxuKCl9LGluamVjdEV2ZW50UGx1Z2luc0J5TmFtZTpmdW5jdGlvbihlKXt2YXIgdD0hMTtmb3IodmFyIHIgaW4gZSlpZihlLmhhc093blByb3BlcnR5KHIpKXt2YXIgbz1lW3JdO3MuaGFzT3duUHJvcGVydHkocikmJnNbcl09PT1vfHwoaSghc1tyXSksc1tyXT1vLHQ9ITApfXQmJm4oKX0sZ2V0UGx1Z2luTW9kdWxlRm9yRXZlbnQ6ZnVuY3Rpb24oZSl7dmFyIHQ9ZS5kaXNwYXRjaENvbmZpZztpZih0LnJlZ2lzdHJhdGlvbk5hbWUpcmV0dXJuIHUucmVnaXN0cmF0aW9uTmFtZU1vZHVsZXNbdC5yZWdpc3RyYXRpb25OYW1lXXx8bnVsbDtmb3IodmFyIG4gaW4gdC5waGFzZWRSZWdpc3RyYXRpb25OYW1lcylpZih0LnBoYXNlZFJlZ2lzdHJhdGlvbk5hbWVzLmhhc093blByb3BlcnR5KG4pKXt2YXIgcj11LnJlZ2lzdHJhdGlvbk5hbWVNb2R1bGVzW3QucGhhc2VkUmVnaXN0cmF0aW9uTmFtZXNbbl1dO2lmKHIpcmV0dXJuIHJ9cmV0dXJuIG51bGx9LF9yZXNldEV2ZW50UGx1Z2luczpmdW5jdGlvbigpe2E9bnVsbDtmb3IodmFyIGUgaW4gcylzLmhhc093blByb3BlcnR5KGUpJiZkZWxldGUgc1tlXTt1LnBsdWdpbnMubGVuZ3RoPTA7dmFyIHQ9dS5ldmVudE5hbWVEaXNwYXRjaENvbmZpZ3M7Zm9yKHZhciBuIGluIHQpdC5oYXNPd25Qcm9wZXJ0eShuKSYmZGVsZXRlIHRbbl07dmFyIHI9dS5yZWdpc3RyYXRpb25OYW1lTW9kdWxlcztmb3IodmFyIG8gaW4gcilyLmhhc093blByb3BlcnR5KG8pJiZkZWxldGUgcltvXX19O3QuZXhwb3J0cz11fSx7XCIuL2ludmFyaWFudFwiOjEzN31dLDIxOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSl7cmV0dXJuIGU9PT1tLnRvcE1vdXNlVXB8fGU9PT1tLnRvcFRvdWNoRW5kfHxlPT09bS50b3BUb3VjaENhbmNlbH1mdW5jdGlvbiByKGUpe3JldHVybiBlPT09bS50b3BNb3VzZU1vdmV8fGU9PT1tLnRvcFRvdWNoTW92ZX1mdW5jdGlvbiBvKGUpe3JldHVybiBlPT09bS50b3BNb3VzZURvd258fGU9PT1tLnRvcFRvdWNoU3RhcnR9ZnVuY3Rpb24gaShlLHQpe3ZhciBuPWUuX2Rpc3BhdGNoTGlzdGVuZXJzLHI9ZS5fZGlzcGF0Y2hJRHM7aWYoQXJyYXkuaXNBcnJheShuKSlmb3IodmFyIG89MDtvPG4ubGVuZ3RoJiYhZS5pc1Byb3BhZ2F0aW9uU3RvcHBlZCgpO28rKyl0KGUsbltvXSxyW29dKTtlbHNlIG4mJnQoZSxuLHIpfWZ1bmN0aW9uIGEoZSx0LG4pe2UuY3VycmVudFRhcmdldD1oLk1vdW50LmdldE5vZGUobik7dmFyIHI9dChlLG4pO3JldHVybiBlLmN1cnJlbnRUYXJnZXQ9bnVsbCxyfWZ1bmN0aW9uIHMoZSx0KXtpKGUsdCksZS5fZGlzcGF0Y2hMaXN0ZW5lcnM9bnVsbCxlLl9kaXNwYXRjaElEcz1udWxsfWZ1bmN0aW9uIHUoZSl7dmFyIHQ9ZS5fZGlzcGF0Y2hMaXN0ZW5lcnMsbj1lLl9kaXNwYXRjaElEcztpZihBcnJheS5pc0FycmF5KHQpKXtmb3IodmFyIHI9MDtyPHQubGVuZ3RoJiYhZS5pc1Byb3BhZ2F0aW9uU3RvcHBlZCgpO3IrKylpZih0W3JdKGUsbltyXSkpcmV0dXJuIG5bcl19ZWxzZSBpZih0JiZ0KGUsbikpcmV0dXJuIG47cmV0dXJuIG51bGx9ZnVuY3Rpb24gYyhlKXt2YXIgdD11KGUpO3JldHVybiBlLl9kaXNwYXRjaElEcz1udWxsLGUuX2Rpc3BhdGNoTGlzdGVuZXJzPW51bGwsdH1mdW5jdGlvbiBsKGUpe3ZhciB0PWUuX2Rpc3BhdGNoTGlzdGVuZXJzLG49ZS5fZGlzcGF0Y2hJRHM7ZighQXJyYXkuaXNBcnJheSh0KSk7dmFyIHI9dD90KGUsbik6bnVsbDtyZXR1cm4gZS5fZGlzcGF0Y2hMaXN0ZW5lcnM9bnVsbCxlLl9kaXNwYXRjaElEcz1udWxsLHJ9ZnVuY3Rpb24gcChlKXtyZXR1cm4hIWUuX2Rpc3BhdGNoTGlzdGVuZXJzfXZhciBkPWUoXCIuL0V2ZW50Q29uc3RhbnRzXCIpLGY9ZShcIi4vaW52YXJpYW50XCIpLGg9e01vdW50Om51bGwsaW5qZWN0TW91bnQ6ZnVuY3Rpb24oZSl7aC5Nb3VudD1lfX0sbT1kLnRvcExldmVsVHlwZXMsdj17aXNFbmRpc2g6bixpc01vdmVpc2g6cixpc1N0YXJ0aXNoOm8sZXhlY3V0ZURpcmVjdERpc3BhdGNoOmwsZXhlY3V0ZURpc3BhdGNoOmEsZXhlY3V0ZURpc3BhdGNoZXNJbk9yZGVyOnMsZXhlY3V0ZURpc3BhdGNoZXNJbk9yZGVyU3RvcEF0VHJ1ZTpjLGhhc0Rpc3BhdGNoZXM6cCxpbmplY3Rpb246aCx1c2VUb3VjaEV2ZW50czohMX07dC5leHBvcnRzPXZ9LHtcIi4vRXZlbnRDb25zdGFudHNcIjoxNyxcIi4vaW52YXJpYW50XCI6MTM3fV0sMjI6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlLHQsbil7dmFyIHI9dC5kaXNwYXRjaENvbmZpZy5waGFzZWRSZWdpc3RyYXRpb25OYW1lc1tuXTtyZXR1cm4gbShlLHIpfWZ1bmN0aW9uIHIoZSx0LHIpe3ZhciBvPXQ/aC5idWJibGVkOmguY2FwdHVyZWQsaT1uKGUscixvKTtpJiYoci5fZGlzcGF0Y2hMaXN0ZW5lcnM9ZChyLl9kaXNwYXRjaExpc3RlbmVycyxpKSxyLl9kaXNwYXRjaElEcz1kKHIuX2Rpc3BhdGNoSURzLGUpKX1mdW5jdGlvbiBvKGUpe2UmJmUuZGlzcGF0Y2hDb25maWcucGhhc2VkUmVnaXN0cmF0aW9uTmFtZXMmJnAuaW5qZWN0aW9uLmdldEluc3RhbmNlSGFuZGxlKCkudHJhdmVyc2VUd29QaGFzZShlLmRpc3BhdGNoTWFya2VyLHIsZSl9ZnVuY3Rpb24gaShlLHQsbil7aWYobiYmbi5kaXNwYXRjaENvbmZpZy5yZWdpc3RyYXRpb25OYW1lKXt2YXIgcj1uLmRpc3BhdGNoQ29uZmlnLnJlZ2lzdHJhdGlvbk5hbWUsbz1tKGUscik7byYmKG4uX2Rpc3BhdGNoTGlzdGVuZXJzPWQobi5fZGlzcGF0Y2hMaXN0ZW5lcnMsbyksbi5fZGlzcGF0Y2hJRHM9ZChuLl9kaXNwYXRjaElEcyxlKSl9fWZ1bmN0aW9uIGEoZSl7ZSYmZS5kaXNwYXRjaENvbmZpZy5yZWdpc3RyYXRpb25OYW1lJiZpKGUuZGlzcGF0Y2hNYXJrZXIsbnVsbCxlKX1mdW5jdGlvbiBzKGUpe2YoZSxvKX1mdW5jdGlvbiB1KGUsdCxuLHIpe3AuaW5qZWN0aW9uLmdldEluc3RhbmNlSGFuZGxlKCkudHJhdmVyc2VFbnRlckxlYXZlKG4scixpLGUsdCl9ZnVuY3Rpb24gYyhlKXtmKGUsYSl9dmFyIGw9ZShcIi4vRXZlbnRDb25zdGFudHNcIikscD1lKFwiLi9FdmVudFBsdWdpbkh1YlwiKSxkPWUoXCIuL2FjY3VtdWxhdGVJbnRvXCIpLGY9ZShcIi4vZm9yRWFjaEFjY3VtdWxhdGVkXCIpLGg9bC5Qcm9wYWdhdGlvblBoYXNlcyxtPXAuZ2V0TGlzdGVuZXIsdj17YWNjdW11bGF0ZVR3b1BoYXNlRGlzcGF0Y2hlczpzLGFjY3VtdWxhdGVEaXJlY3REaXNwYXRjaGVzOmMsYWNjdW11bGF0ZUVudGVyTGVhdmVEaXNwYXRjaGVzOnV9O3QuZXhwb3J0cz12fSx7XCIuL0V2ZW50Q29uc3RhbnRzXCI6MTcsXCIuL0V2ZW50UGx1Z2luSHViXCI6MTksXCIuL2FjY3VtdWxhdGVJbnRvXCI6MTA2LFwiLi9mb3JFYWNoQWNjdW11bGF0ZWRcIjoxMjN9XSwyMzpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbj0hKFwidW5kZWZpbmVkXCI9PXR5cGVvZiB3aW5kb3d8fCF3aW5kb3cuZG9jdW1lbnR8fCF3aW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCkscj17Y2FuVXNlRE9NOm4sY2FuVXNlV29ya2VyczpcInVuZGVmaW5lZFwiIT10eXBlb2YgV29ya2VyLGNhblVzZUV2ZW50TGlzdGVuZXJzOm4mJiEoIXdpbmRvdy5hZGRFdmVudExpc3RlbmVyJiYhd2luZG93LmF0dGFjaEV2ZW50KSxjYW5Vc2VWaWV3cG9ydDpuJiYhIXdpbmRvdy5zY3JlZW4saXNJbldvcmtlcjohbn07dC5leHBvcnRzPXJ9LHt9XSwyNDpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbixyPWUoXCIuL0RPTVByb3BlcnR5XCIpLG89ZShcIi4vRXhlY3V0aW9uRW52aXJvbm1lbnRcIiksaT1yLmluamVjdGlvbi5NVVNUX1VTRV9BVFRSSUJVVEUsYT1yLmluamVjdGlvbi5NVVNUX1VTRV9QUk9QRVJUWSxzPXIuaW5qZWN0aW9uLkhBU19CT09MRUFOX1ZBTFVFLHU9ci5pbmplY3Rpb24uSEFTX1NJREVfRUZGRUNUUyxjPXIuaW5qZWN0aW9uLkhBU19OVU1FUklDX1ZBTFVFLGw9ci5pbmplY3Rpb24uSEFTX1BPU0lUSVZFX05VTUVSSUNfVkFMVUUscD1yLmluamVjdGlvbi5IQVNfT1ZFUkxPQURFRF9CT09MRUFOX1ZBTFVFO2lmKG8uY2FuVXNlRE9NKXt2YXIgZD1kb2N1bWVudC5pbXBsZW1lbnRhdGlvbjtuPWQmJmQuaGFzRmVhdHVyZSYmZC5oYXNGZWF0dXJlKFwiaHR0cDovL3d3dy53My5vcmcvVFIvU1ZHMTEvZmVhdHVyZSNCYXNpY1N0cnVjdHVyZVwiLFwiMS4xXCIpfXZhciBmPXtpc0N1c3RvbUF0dHJpYnV0ZTpSZWdFeHAucHJvdG90eXBlLnRlc3QuYmluZCgvXihkYXRhfGFyaWEpLVthLXpfXVthLXpcXGRfLlxcLV0qJC8pLFByb3BlcnRpZXM6e2FjY2VwdDpudWxsLGFjY2VwdENoYXJzZXQ6bnVsbCxhY2Nlc3NLZXk6bnVsbCxhY3Rpb246bnVsbCxhbGxvd0Z1bGxTY3JlZW46aXxzLGFsbG93VHJhbnNwYXJlbmN5OmksYWx0Om51bGwsYXN5bmM6cyxhdXRvQ29tcGxldGU6bnVsbCxhdXRvUGxheTpzLGNlbGxQYWRkaW5nOm51bGwsY2VsbFNwYWNpbmc6bnVsbCxjaGFyU2V0OmksY2hlY2tlZDphfHMsY2xhc3NJRDppLGNsYXNzTmFtZTpuP2k6YSxjb2xzOml8bCxjb2xTcGFuOm51bGwsY29udGVudDpudWxsLGNvbnRlbnRFZGl0YWJsZTpudWxsLGNvbnRleHRNZW51OmksY29udHJvbHM6YXxzLGNvb3JkczpudWxsLGNyb3NzT3JpZ2luOm51bGwsZGF0YTpudWxsLGRhdGVUaW1lOmksZGVmZXI6cyxkaXI6bnVsbCxkaXNhYmxlZDppfHMsZG93bmxvYWQ6cCxkcmFnZ2FibGU6bnVsbCxlbmNUeXBlOm51bGwsZm9ybTppLGZvcm1BY3Rpb246aSxmb3JtRW5jVHlwZTppLGZvcm1NZXRob2Q6aSxmb3JtTm9WYWxpZGF0ZTpzLGZvcm1UYXJnZXQ6aSxmcmFtZUJvcmRlcjppLGhlaWdodDppLGhpZGRlbjppfHMsaHJlZjpudWxsLGhyZWZMYW5nOm51bGwsaHRtbEZvcjpudWxsLGh0dHBFcXVpdjpudWxsLGljb246bnVsbCxpZDphLGxhYmVsOm51bGwsbGFuZzpudWxsLGxpc3Q6aSxsb29wOmF8cyxtYW5pZmVzdDppLG1hcmdpbkhlaWdodDpudWxsLG1hcmdpbldpZHRoOm51bGwsbWF4Om51bGwsbWF4TGVuZ3RoOmksbWVkaWE6aSxtZWRpYUdyb3VwOm51bGwsbWV0aG9kOm51bGwsbWluOm51bGwsbXVsdGlwbGU6YXxzLG11dGVkOmF8cyxuYW1lOm51bGwsbm9WYWxpZGF0ZTpzLG9wZW46bnVsbCxwYXR0ZXJuOm51bGwscGxhY2Vob2xkZXI6bnVsbCxwb3N0ZXI6bnVsbCxwcmVsb2FkOm51bGwscmFkaW9Hcm91cDpudWxsLHJlYWRPbmx5OmF8cyxyZWw6bnVsbCxyZXF1aXJlZDpzLHJvbGU6aSxyb3dzOml8bCxyb3dTcGFuOm51bGwsc2FuZGJveDpudWxsLHNjb3BlOm51bGwsc2Nyb2xsaW5nOm51bGwsc2VhbWxlc3M6aXxzLHNlbGVjdGVkOmF8cyxzaGFwZTpudWxsLHNpemU6aXxsLHNpemVzOmksc3BhbjpsLHNwZWxsQ2hlY2s6bnVsbCxzcmM6bnVsbCxzcmNEb2M6YSxzcmNTZXQ6aSxzdGFydDpjLHN0ZXA6bnVsbCxzdHlsZTpudWxsLHRhYkluZGV4Om51bGwsdGFyZ2V0Om51bGwsdGl0bGU6bnVsbCx0eXBlOm51bGwsdXNlTWFwOm51bGwsdmFsdWU6YXx1LHdpZHRoOmksd21vZGU6aSxhdXRvQ2FwaXRhbGl6ZTpudWxsLGF1dG9Db3JyZWN0Om51bGwsaXRlbVByb3A6aSxpdGVtU2NvcGU6aXxzLGl0ZW1UeXBlOmkscHJvcGVydHk6bnVsbH0sRE9NQXR0cmlidXRlTmFtZXM6e2FjY2VwdENoYXJzZXQ6XCJhY2NlcHQtY2hhcnNldFwiLGNsYXNzTmFtZTpcImNsYXNzXCIsaHRtbEZvcjpcImZvclwiLGh0dHBFcXVpdjpcImh0dHAtZXF1aXZcIn0sRE9NUHJvcGVydHlOYW1lczp7YXV0b0NhcGl0YWxpemU6XCJhdXRvY2FwaXRhbGl6ZVwiLGF1dG9Db21wbGV0ZTpcImF1dG9jb21wbGV0ZVwiLGF1dG9Db3JyZWN0OlwiYXV0b2NvcnJlY3RcIixhdXRvRm9jdXM6XCJhdXRvZm9jdXNcIixhdXRvUGxheTpcImF1dG9wbGF5XCIsZW5jVHlwZTpcImVuY3R5cGVcIixocmVmTGFuZzpcImhyZWZsYW5nXCIscmFkaW9Hcm91cDpcInJhZGlvZ3JvdXBcIixzcGVsbENoZWNrOlwic3BlbGxjaGVja1wiLHNyY0RvYzpcInNyY2RvY1wiLHNyY1NldDpcInNyY3NldFwifX07dC5leHBvcnRzPWZ9LHtcIi4vRE9NUHJvcGVydHlcIjoxMixcIi4vRXhlY3V0aW9uRW52aXJvbm1lbnRcIjoyM31dLDI1OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPWUoXCIuL1JlYWN0TGlua1wiKSxyPWUoXCIuL1JlYWN0U3RhdGVTZXR0ZXJzXCIpLG89e2xpbmtTdGF0ZTpmdW5jdGlvbihlKXtyZXR1cm4gbmV3IG4odGhpcy5zdGF0ZVtlXSxyLmNyZWF0ZVN0YXRlS2V5U2V0dGVyKHRoaXMsZSkpfX07dC5leHBvcnRzPW99LHtcIi4vUmVhY3RMaW5rXCI6NjYsXCIuL1JlYWN0U3RhdGVTZXR0ZXJzXCI6ODN9XSwyNjpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUpe3UobnVsbD09ZS5wcm9wcy5jaGVja2VkTGlua3x8bnVsbD09ZS5wcm9wcy52YWx1ZUxpbmspfWZ1bmN0aW9uIHIoZSl7bihlKSx1KG51bGw9PWUucHJvcHMudmFsdWUmJm51bGw9PWUucHJvcHMub25DaGFuZ2UpfWZ1bmN0aW9uIG8oZSl7bihlKSx1KG51bGw9PWUucHJvcHMuY2hlY2tlZCYmbnVsbD09ZS5wcm9wcy5vbkNoYW5nZSl9ZnVuY3Rpb24gaShlKXt0aGlzLnByb3BzLnZhbHVlTGluay5yZXF1ZXN0Q2hhbmdlKGUudGFyZ2V0LnZhbHVlKX1mdW5jdGlvbiBhKGUpe3RoaXMucHJvcHMuY2hlY2tlZExpbmsucmVxdWVzdENoYW5nZShlLnRhcmdldC5jaGVja2VkKX12YXIgcz1lKFwiLi9SZWFjdFByb3BUeXBlc1wiKSx1PWUoXCIuL2ludmFyaWFudFwiKSxjPXtidXR0b246ITAsY2hlY2tib3g6ITAsaW1hZ2U6ITAsaGlkZGVuOiEwLHJhZGlvOiEwLHJlc2V0OiEwLHN1Ym1pdDohMH0sbD17TWl4aW46e3Byb3BUeXBlczp7dmFsdWU6ZnVuY3Rpb24oZSx0KXtyZXR1cm4hZVt0XXx8Y1tlLnR5cGVdfHxlLm9uQ2hhbmdlfHxlLnJlYWRPbmx5fHxlLmRpc2FibGVkP3ZvaWQgMDpuZXcgRXJyb3IoXCJZb3UgcHJvdmlkZWQgYSBgdmFsdWVgIHByb3AgdG8gYSBmb3JtIGZpZWxkIHdpdGhvdXQgYW4gYG9uQ2hhbmdlYCBoYW5kbGVyLiBUaGlzIHdpbGwgcmVuZGVyIGEgcmVhZC1vbmx5IGZpZWxkLiBJZiB0aGUgZmllbGQgc2hvdWxkIGJlIG11dGFibGUgdXNlIGBkZWZhdWx0VmFsdWVgLiBPdGhlcndpc2UsIHNldCBlaXRoZXIgYG9uQ2hhbmdlYCBvciBgcmVhZE9ubHlgLlwiKX0sY2hlY2tlZDpmdW5jdGlvbihlLHQpe3JldHVybiFlW3RdfHxlLm9uQ2hhbmdlfHxlLnJlYWRPbmx5fHxlLmRpc2FibGVkP3ZvaWQgMDpuZXcgRXJyb3IoXCJZb3UgcHJvdmlkZWQgYSBgY2hlY2tlZGAgcHJvcCB0byBhIGZvcm0gZmllbGQgd2l0aG91dCBhbiBgb25DaGFuZ2VgIGhhbmRsZXIuIFRoaXMgd2lsbCByZW5kZXIgYSByZWFkLW9ubHkgZmllbGQuIElmIHRoZSBmaWVsZCBzaG91bGQgYmUgbXV0YWJsZSB1c2UgYGRlZmF1bHRDaGVja2VkYC4gT3RoZXJ3aXNlLCBzZXQgZWl0aGVyIGBvbkNoYW5nZWAgb3IgYHJlYWRPbmx5YC5cIil9LG9uQ2hhbmdlOnMuZnVuY319LGdldFZhbHVlOmZ1bmN0aW9uKGUpe3JldHVybiBlLnByb3BzLnZhbHVlTGluaz8ocihlKSxlLnByb3BzLnZhbHVlTGluay52YWx1ZSk6ZS5wcm9wcy52YWx1ZX0sZ2V0Q2hlY2tlZDpmdW5jdGlvbihlKXtyZXR1cm4gZS5wcm9wcy5jaGVja2VkTGluaz8obyhlKSxlLnByb3BzLmNoZWNrZWRMaW5rLnZhbHVlKTplLnByb3BzLmNoZWNrZWR9LGdldE9uQ2hhbmdlOmZ1bmN0aW9uKGUpe3JldHVybiBlLnByb3BzLnZhbHVlTGluaz8ocihlKSxpKTplLnByb3BzLmNoZWNrZWRMaW5rPyhvKGUpLGEpOmUucHJvcHMub25DaGFuZ2V9fTt0LmV4cG9ydHM9bH0se1wiLi9SZWFjdFByb3BUeXBlc1wiOjc3LFwiLi9pbnZhcmlhbnRcIjoxMzd9XSwyNzpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUpe2UucmVtb3ZlKCl9dmFyIHI9ZShcIi4vUmVhY3RCcm93c2VyRXZlbnRFbWl0dGVyXCIpLG89ZShcIi4vYWNjdW11bGF0ZUludG9cIiksaT1lKFwiLi9mb3JFYWNoQWNjdW11bGF0ZWRcIiksYT1lKFwiLi9pbnZhcmlhbnRcIikscz17dHJhcEJ1YmJsZWRFdmVudDpmdW5jdGlvbihlLHQpe2EodGhpcy5pc01vdW50ZWQoKSk7dmFyIG49ci50cmFwQnViYmxlZEV2ZW50KGUsdCx0aGlzLmdldERPTU5vZGUoKSk7dGhpcy5fbG9jYWxFdmVudExpc3RlbmVycz1vKHRoaXMuX2xvY2FsRXZlbnRMaXN0ZW5lcnMsbil9LGNvbXBvbmVudFdpbGxVbm1vdW50OmZ1bmN0aW9uKCl7dGhpcy5fbG9jYWxFdmVudExpc3RlbmVycyYmaSh0aGlzLl9sb2NhbEV2ZW50TGlzdGVuZXJzLG4pfX07dC5leHBvcnRzPXN9LHtcIi4vUmVhY3RCcm93c2VyRXZlbnRFbWl0dGVyXCI6MzMsXCIuL2FjY3VtdWxhdGVJbnRvXCI6MTA2LFwiLi9mb3JFYWNoQWNjdW11bGF0ZWRcIjoxMjMsXCIuL2ludmFyaWFudFwiOjEzN31dLDI4OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPWUoXCIuL0V2ZW50Q29uc3RhbnRzXCIpLHI9ZShcIi4vZW1wdHlGdW5jdGlvblwiKSxvPW4udG9wTGV2ZWxUeXBlcyxpPXtldmVudFR5cGVzOm51bGwsZXh0cmFjdEV2ZW50czpmdW5jdGlvbihlLHQsbixpKXtpZihlPT09by50b3BUb3VjaFN0YXJ0KXt2YXIgYT1pLnRhcmdldDthJiYhYS5vbmNsaWNrJiYoYS5vbmNsaWNrPXIpfX19O3QuZXhwb3J0cz1pfSx7XCIuL0V2ZW50Q29uc3RhbnRzXCI6MTcsXCIuL2VtcHR5RnVuY3Rpb25cIjoxMTh9XSwyOTpbZnVuY3Rpb24oZSx0KXtmdW5jdGlvbiBuKGUpe2lmKG51bGw9PWUpdGhyb3cgbmV3IFR5cGVFcnJvcihcIk9iamVjdC5hc3NpZ24gdGFyZ2V0IGNhbm5vdCBiZSBudWxsIG9yIHVuZGVmaW5lZFwiKTtmb3IodmFyIHQ9T2JqZWN0KGUpLG49T2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSxyPTE7cjxhcmd1bWVudHMubGVuZ3RoO3IrKyl7dmFyIG89YXJndW1lbnRzW3JdO2lmKG51bGwhPW8pe3ZhciBpPU9iamVjdChvKTtmb3IodmFyIGEgaW4gaSluLmNhbGwoaSxhKSYmKHRbYV09aVthXSl9fXJldHVybiB0fXQuZXhwb3J0cz1ufSx7fV0sMzA6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG49ZShcIi4vaW52YXJpYW50XCIpLHI9ZnVuY3Rpb24oZSl7dmFyIHQ9dGhpcztpZih0Lmluc3RhbmNlUG9vbC5sZW5ndGgpe3ZhciBuPXQuaW5zdGFuY2VQb29sLnBvcCgpO3JldHVybiB0LmNhbGwobixlKSxufXJldHVybiBuZXcgdChlKX0sbz1mdW5jdGlvbihlLHQpe3ZhciBuPXRoaXM7aWYobi5pbnN0YW5jZVBvb2wubGVuZ3RoKXt2YXIgcj1uLmluc3RhbmNlUG9vbC5wb3AoKTtyZXR1cm4gbi5jYWxsKHIsZSx0KSxyfXJldHVybiBuZXcgbihlLHQpfSxpPWZ1bmN0aW9uKGUsdCxuKXt2YXIgcj10aGlzO2lmKHIuaW5zdGFuY2VQb29sLmxlbmd0aCl7dmFyIG89ci5pbnN0YW5jZVBvb2wucG9wKCk7cmV0dXJuIHIuY2FsbChvLGUsdCxuKSxvfXJldHVybiBuZXcgcihlLHQsbil9LGE9ZnVuY3Rpb24oZSx0LG4scixvKXt2YXIgaT10aGlzO2lmKGkuaW5zdGFuY2VQb29sLmxlbmd0aCl7dmFyIGE9aS5pbnN0YW5jZVBvb2wucG9wKCk7cmV0dXJuIGkuY2FsbChhLGUsdCxuLHIsbyksYX1yZXR1cm4gbmV3IGkoZSx0LG4scixvKX0scz1mdW5jdGlvbihlKXt2YXIgdD10aGlzO24oZSBpbnN0YW5jZW9mIHQpLGUuZGVzdHJ1Y3RvciYmZS5kZXN0cnVjdG9yKCksdC5pbnN0YW5jZVBvb2wubGVuZ3RoPHQucG9vbFNpemUmJnQuaW5zdGFuY2VQb29sLnB1c2goZSl9LHU9MTAsYz1yLGw9ZnVuY3Rpb24oZSx0KXt2YXIgbj1lO3JldHVybiBuLmluc3RhbmNlUG9vbD1bXSxuLmdldFBvb2xlZD10fHxjLG4ucG9vbFNpemV8fChuLnBvb2xTaXplPXUpLG4ucmVsZWFzZT1zLG59LHA9e2FkZFBvb2xpbmdUbzpsLG9uZUFyZ3VtZW50UG9vbGVyOnIsdHdvQXJndW1lbnRQb29sZXI6byx0aHJlZUFyZ3VtZW50UG9vbGVyOmksZml2ZUFyZ3VtZW50UG9vbGVyOmF9O3QuZXhwb3J0cz1wfSx7XCIuL2ludmFyaWFudFwiOjEzN31dLDMxOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPWUoXCIuL0RPTVByb3BlcnR5T3BlcmF0aW9uc1wiKSxyPWUoXCIuL0V2ZW50UGx1Z2luVXRpbHNcIiksbz1lKFwiLi9SZWFjdENoaWxkcmVuXCIpLGk9ZShcIi4vUmVhY3RDb21wb25lbnRcIiksYT1lKFwiLi9SZWFjdENvbXBvc2l0ZUNvbXBvbmVudFwiKSxzPWUoXCIuL1JlYWN0Q29udGV4dFwiKSx1PWUoXCIuL1JlYWN0Q3VycmVudE93bmVyXCIpLGM9ZShcIi4vUmVhY3RFbGVtZW50XCIpLGw9KGUoXCIuL1JlYWN0RWxlbWVudFZhbGlkYXRvclwiKSxlKFwiLi9SZWFjdERPTVwiKSkscD1lKFwiLi9SZWFjdERPTUNvbXBvbmVudFwiKSxkPWUoXCIuL1JlYWN0RGVmYXVsdEluamVjdGlvblwiKSxmPWUoXCIuL1JlYWN0SW5zdGFuY2VIYW5kbGVzXCIpLGg9ZShcIi4vUmVhY3RMZWdhY3lFbGVtZW50XCIpLG09ZShcIi4vUmVhY3RNb3VudFwiKSx2PWUoXCIuL1JlYWN0TXVsdGlDaGlsZFwiKSx5PWUoXCIuL1JlYWN0UGVyZlwiKSxnPWUoXCIuL1JlYWN0UHJvcFR5cGVzXCIpLEU9ZShcIi4vUmVhY3RTZXJ2ZXJSZW5kZXJpbmdcIiksQz1lKFwiLi9SZWFjdFRleHRDb21wb25lbnRcIiksUj1lKFwiLi9PYmplY3QuYXNzaWduXCIpLE09ZShcIi4vZGVwcmVjYXRlZFwiKSxiPWUoXCIuL29ubHlDaGlsZFwiKTtcbmQuaW5qZWN0KCk7dmFyIE89Yy5jcmVhdGVFbGVtZW50LEQ9Yy5jcmVhdGVGYWN0b3J5O089aC53cmFwQ3JlYXRlRWxlbWVudChPKSxEPWgud3JhcENyZWF0ZUZhY3RvcnkoRCk7dmFyIHg9eS5tZWFzdXJlKFwiUmVhY3RcIixcInJlbmRlclwiLG0ucmVuZGVyKSxQPXtDaGlsZHJlbjp7bWFwOm8ubWFwLGZvckVhY2g6by5mb3JFYWNoLGNvdW50Om8uY291bnQsb25seTpifSxET006bCxQcm9wVHlwZXM6Zyxpbml0aWFsaXplVG91Y2hFdmVudHM6ZnVuY3Rpb24oZSl7ci51c2VUb3VjaEV2ZW50cz1lfSxjcmVhdGVDbGFzczphLmNyZWF0ZUNsYXNzLGNyZWF0ZUVsZW1lbnQ6TyxjcmVhdGVGYWN0b3J5OkQsY29uc3RydWN0QW5kUmVuZGVyQ29tcG9uZW50Om0uY29uc3RydWN0QW5kUmVuZGVyQ29tcG9uZW50LGNvbnN0cnVjdEFuZFJlbmRlckNvbXBvbmVudEJ5SUQ6bS5jb25zdHJ1Y3RBbmRSZW5kZXJDb21wb25lbnRCeUlELHJlbmRlcjp4LHJlbmRlclRvU3RyaW5nOkUucmVuZGVyVG9TdHJpbmcscmVuZGVyVG9TdGF0aWNNYXJrdXA6RS5yZW5kZXJUb1N0YXRpY01hcmt1cCx1bm1vdW50Q29tcG9uZW50QXROb2RlOm0udW5tb3VudENvbXBvbmVudEF0Tm9kZSxpc1ZhbGlkQ2xhc3M6aC5pc1ZhbGlkQ2xhc3MsaXNWYWxpZEVsZW1lbnQ6Yy5pc1ZhbGlkRWxlbWVudCx3aXRoQ29udGV4dDpzLndpdGhDb250ZXh0LF9fc3ByZWFkOlIscmVuZGVyQ29tcG9uZW50Ok0oXCJSZWFjdFwiLFwicmVuZGVyQ29tcG9uZW50XCIsXCJyZW5kZXJcIix0aGlzLHgpLHJlbmRlckNvbXBvbmVudFRvU3RyaW5nOk0oXCJSZWFjdFwiLFwicmVuZGVyQ29tcG9uZW50VG9TdHJpbmdcIixcInJlbmRlclRvU3RyaW5nXCIsdGhpcyxFLnJlbmRlclRvU3RyaW5nKSxyZW5kZXJDb21wb25lbnRUb1N0YXRpY01hcmt1cDpNKFwiUmVhY3RcIixcInJlbmRlckNvbXBvbmVudFRvU3RhdGljTWFya3VwXCIsXCJyZW5kZXJUb1N0YXRpY01hcmt1cFwiLHRoaXMsRS5yZW5kZXJUb1N0YXRpY01hcmt1cCksaXNWYWxpZENvbXBvbmVudDpNKFwiUmVhY3RcIixcImlzVmFsaWRDb21wb25lbnRcIixcImlzVmFsaWRFbGVtZW50XCIsdGhpcyxjLmlzVmFsaWRFbGVtZW50KX07XCJ1bmRlZmluZWRcIiE9dHlwZW9mIF9fUkVBQ1RfREVWVE9PTFNfR0xPQkFMX0hPT0tfXyYmXCJmdW5jdGlvblwiPT10eXBlb2YgX19SRUFDVF9ERVZUT09MU19HTE9CQUxfSE9PS19fLmluamVjdCYmX19SRUFDVF9ERVZUT09MU19HTE9CQUxfSE9PS19fLmluamVjdCh7Q29tcG9uZW50OmksQ3VycmVudE93bmVyOnUsRE9NQ29tcG9uZW50OnAsRE9NUHJvcGVydHlPcGVyYXRpb25zOm4sSW5zdGFuY2VIYW5kbGVzOmYsTW91bnQ6bSxNdWx0aUNoaWxkOnYsVGV4dENvbXBvbmVudDpDfSk7UC52ZXJzaW9uPVwiMC4xMi4yXCIsdC5leHBvcnRzPVB9LHtcIi4vRE9NUHJvcGVydHlPcGVyYXRpb25zXCI6MTMsXCIuL0V2ZW50UGx1Z2luVXRpbHNcIjoyMSxcIi4vT2JqZWN0LmFzc2lnblwiOjI5LFwiLi9SZWFjdENoaWxkcmVuXCI6MzYsXCIuL1JlYWN0Q29tcG9uZW50XCI6MzcsXCIuL1JlYWN0Q29tcG9zaXRlQ29tcG9uZW50XCI6NDAsXCIuL1JlYWN0Q29udGV4dFwiOjQxLFwiLi9SZWFjdEN1cnJlbnRPd25lclwiOjQyLFwiLi9SZWFjdERPTVwiOjQzLFwiLi9SZWFjdERPTUNvbXBvbmVudFwiOjQ1LFwiLi9SZWFjdERlZmF1bHRJbmplY3Rpb25cIjo1NSxcIi4vUmVhY3RFbGVtZW50XCI6NTYsXCIuL1JlYWN0RWxlbWVudFZhbGlkYXRvclwiOjU3LFwiLi9SZWFjdEluc3RhbmNlSGFuZGxlc1wiOjY0LFwiLi9SZWFjdExlZ2FjeUVsZW1lbnRcIjo2NSxcIi4vUmVhY3RNb3VudFwiOjY4LFwiLi9SZWFjdE11bHRpQ2hpbGRcIjo2OSxcIi4vUmVhY3RQZXJmXCI6NzMsXCIuL1JlYWN0UHJvcFR5cGVzXCI6NzcsXCIuL1JlYWN0U2VydmVyUmVuZGVyaW5nXCI6ODEsXCIuL1JlYWN0VGV4dENvbXBvbmVudFwiOjg0LFwiLi9kZXByZWNhdGVkXCI6MTE3LFwiLi9vbmx5Q2hpbGRcIjoxNDh9XSwzMjpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbj1lKFwiLi9SZWFjdEVtcHR5Q29tcG9uZW50XCIpLHI9ZShcIi4vUmVhY3RNb3VudFwiKSxvPWUoXCIuL2ludmFyaWFudFwiKSxpPXtnZXRET01Ob2RlOmZ1bmN0aW9uKCl7cmV0dXJuIG8odGhpcy5pc01vdW50ZWQoKSksbi5pc051bGxDb21wb25lbnRJRCh0aGlzLl9yb290Tm9kZUlEKT9udWxsOnIuZ2V0Tm9kZSh0aGlzLl9yb290Tm9kZUlEKX19O3QuZXhwb3J0cz1pfSx7XCIuL1JlYWN0RW1wdHlDb21wb25lbnRcIjo1OCxcIi4vUmVhY3RNb3VudFwiOjY4LFwiLi9pbnZhcmlhbnRcIjoxMzd9XSwzMzpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUpe3JldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZSxoKXx8KGVbaF09ZCsrLGxbZVtoXV09e30pLGxbZVtoXV19dmFyIHI9ZShcIi4vRXZlbnRDb25zdGFudHNcIiksbz1lKFwiLi9FdmVudFBsdWdpbkh1YlwiKSxpPWUoXCIuL0V2ZW50UGx1Z2luUmVnaXN0cnlcIiksYT1lKFwiLi9SZWFjdEV2ZW50RW1pdHRlck1peGluXCIpLHM9ZShcIi4vVmlld3BvcnRNZXRyaWNzXCIpLHU9ZShcIi4vT2JqZWN0LmFzc2lnblwiKSxjPWUoXCIuL2lzRXZlbnRTdXBwb3J0ZWRcIiksbD17fSxwPSExLGQ9MCxmPXt0b3BCbHVyOlwiYmx1clwiLHRvcENoYW5nZTpcImNoYW5nZVwiLHRvcENsaWNrOlwiY2xpY2tcIix0b3BDb21wb3NpdGlvbkVuZDpcImNvbXBvc2l0aW9uZW5kXCIsdG9wQ29tcG9zaXRpb25TdGFydDpcImNvbXBvc2l0aW9uc3RhcnRcIix0b3BDb21wb3NpdGlvblVwZGF0ZTpcImNvbXBvc2l0aW9udXBkYXRlXCIsdG9wQ29udGV4dE1lbnU6XCJjb250ZXh0bWVudVwiLHRvcENvcHk6XCJjb3B5XCIsdG9wQ3V0OlwiY3V0XCIsdG9wRG91YmxlQ2xpY2s6XCJkYmxjbGlja1wiLHRvcERyYWc6XCJkcmFnXCIsdG9wRHJhZ0VuZDpcImRyYWdlbmRcIix0b3BEcmFnRW50ZXI6XCJkcmFnZW50ZXJcIix0b3BEcmFnRXhpdDpcImRyYWdleGl0XCIsdG9wRHJhZ0xlYXZlOlwiZHJhZ2xlYXZlXCIsdG9wRHJhZ092ZXI6XCJkcmFnb3ZlclwiLHRvcERyYWdTdGFydDpcImRyYWdzdGFydFwiLHRvcERyb3A6XCJkcm9wXCIsdG9wRm9jdXM6XCJmb2N1c1wiLHRvcElucHV0OlwiaW5wdXRcIix0b3BLZXlEb3duOlwia2V5ZG93blwiLHRvcEtleVByZXNzOlwia2V5cHJlc3NcIix0b3BLZXlVcDpcImtleXVwXCIsdG9wTW91c2VEb3duOlwibW91c2Vkb3duXCIsdG9wTW91c2VNb3ZlOlwibW91c2Vtb3ZlXCIsdG9wTW91c2VPdXQ6XCJtb3VzZW91dFwiLHRvcE1vdXNlT3ZlcjpcIm1vdXNlb3ZlclwiLHRvcE1vdXNlVXA6XCJtb3VzZXVwXCIsdG9wUGFzdGU6XCJwYXN0ZVwiLHRvcFNjcm9sbDpcInNjcm9sbFwiLHRvcFNlbGVjdGlvbkNoYW5nZTpcInNlbGVjdGlvbmNoYW5nZVwiLHRvcFRleHRJbnB1dDpcInRleHRJbnB1dFwiLHRvcFRvdWNoQ2FuY2VsOlwidG91Y2hjYW5jZWxcIix0b3BUb3VjaEVuZDpcInRvdWNoZW5kXCIsdG9wVG91Y2hNb3ZlOlwidG91Y2htb3ZlXCIsdG9wVG91Y2hTdGFydDpcInRvdWNoc3RhcnRcIix0b3BXaGVlbDpcIndoZWVsXCJ9LGg9XCJfcmVhY3RMaXN0ZW5lcnNJRFwiK1N0cmluZyhNYXRoLnJhbmRvbSgpKS5zbGljZSgyKSxtPXUoe30sYSx7UmVhY3RFdmVudExpc3RlbmVyOm51bGwsaW5qZWN0aW9uOntpbmplY3RSZWFjdEV2ZW50TGlzdGVuZXI6ZnVuY3Rpb24oZSl7ZS5zZXRIYW5kbGVUb3BMZXZlbChtLmhhbmRsZVRvcExldmVsKSxtLlJlYWN0RXZlbnRMaXN0ZW5lcj1lfX0sc2V0RW5hYmxlZDpmdW5jdGlvbihlKXttLlJlYWN0RXZlbnRMaXN0ZW5lciYmbS5SZWFjdEV2ZW50TGlzdGVuZXIuc2V0RW5hYmxlZChlKX0saXNFbmFibGVkOmZ1bmN0aW9uKCl7cmV0dXJuISghbS5SZWFjdEV2ZW50TGlzdGVuZXJ8fCFtLlJlYWN0RXZlbnRMaXN0ZW5lci5pc0VuYWJsZWQoKSl9LGxpc3RlblRvOmZ1bmN0aW9uKGUsdCl7Zm9yKHZhciBvPXQsYT1uKG8pLHM9aS5yZWdpc3RyYXRpb25OYW1lRGVwZW5kZW5jaWVzW2VdLHU9ci50b3BMZXZlbFR5cGVzLGw9MCxwPXMubGVuZ3RoO3A+bDtsKyspe3ZhciBkPXNbbF07YS5oYXNPd25Qcm9wZXJ0eShkKSYmYVtkXXx8KGQ9PT11LnRvcFdoZWVsP2MoXCJ3aGVlbFwiKT9tLlJlYWN0RXZlbnRMaXN0ZW5lci50cmFwQnViYmxlZEV2ZW50KHUudG9wV2hlZWwsXCJ3aGVlbFwiLG8pOmMoXCJtb3VzZXdoZWVsXCIpP20uUmVhY3RFdmVudExpc3RlbmVyLnRyYXBCdWJibGVkRXZlbnQodS50b3BXaGVlbCxcIm1vdXNld2hlZWxcIixvKTptLlJlYWN0RXZlbnRMaXN0ZW5lci50cmFwQnViYmxlZEV2ZW50KHUudG9wV2hlZWwsXCJET01Nb3VzZVNjcm9sbFwiLG8pOmQ9PT11LnRvcFNjcm9sbD9jKFwic2Nyb2xsXCIsITApP20uUmVhY3RFdmVudExpc3RlbmVyLnRyYXBDYXB0dXJlZEV2ZW50KHUudG9wU2Nyb2xsLFwic2Nyb2xsXCIsbyk6bS5SZWFjdEV2ZW50TGlzdGVuZXIudHJhcEJ1YmJsZWRFdmVudCh1LnRvcFNjcm9sbCxcInNjcm9sbFwiLG0uUmVhY3RFdmVudExpc3RlbmVyLldJTkRPV19IQU5ETEUpOmQ9PT11LnRvcEZvY3VzfHxkPT09dS50b3BCbHVyPyhjKFwiZm9jdXNcIiwhMCk/KG0uUmVhY3RFdmVudExpc3RlbmVyLnRyYXBDYXB0dXJlZEV2ZW50KHUudG9wRm9jdXMsXCJmb2N1c1wiLG8pLG0uUmVhY3RFdmVudExpc3RlbmVyLnRyYXBDYXB0dXJlZEV2ZW50KHUudG9wQmx1cixcImJsdXJcIixvKSk6YyhcImZvY3VzaW5cIikmJihtLlJlYWN0RXZlbnRMaXN0ZW5lci50cmFwQnViYmxlZEV2ZW50KHUudG9wRm9jdXMsXCJmb2N1c2luXCIsbyksbS5SZWFjdEV2ZW50TGlzdGVuZXIudHJhcEJ1YmJsZWRFdmVudCh1LnRvcEJsdXIsXCJmb2N1c291dFwiLG8pKSxhW3UudG9wQmx1cl09ITAsYVt1LnRvcEZvY3VzXT0hMCk6Zi5oYXNPd25Qcm9wZXJ0eShkKSYmbS5SZWFjdEV2ZW50TGlzdGVuZXIudHJhcEJ1YmJsZWRFdmVudChkLGZbZF0sbyksYVtkXT0hMCl9fSx0cmFwQnViYmxlZEV2ZW50OmZ1bmN0aW9uKGUsdCxuKXtyZXR1cm4gbS5SZWFjdEV2ZW50TGlzdGVuZXIudHJhcEJ1YmJsZWRFdmVudChlLHQsbil9LHRyYXBDYXB0dXJlZEV2ZW50OmZ1bmN0aW9uKGUsdCxuKXtyZXR1cm4gbS5SZWFjdEV2ZW50TGlzdGVuZXIudHJhcENhcHR1cmVkRXZlbnQoZSx0LG4pfSxlbnN1cmVTY3JvbGxWYWx1ZU1vbml0b3Jpbmc6ZnVuY3Rpb24oKXtpZighcCl7dmFyIGU9cy5yZWZyZXNoU2Nyb2xsVmFsdWVzO20uUmVhY3RFdmVudExpc3RlbmVyLm1vbml0b3JTY3JvbGxWYWx1ZShlKSxwPSEwfX0sZXZlbnROYW1lRGlzcGF0Y2hDb25maWdzOm8uZXZlbnROYW1lRGlzcGF0Y2hDb25maWdzLHJlZ2lzdHJhdGlvbk5hbWVNb2R1bGVzOm8ucmVnaXN0cmF0aW9uTmFtZU1vZHVsZXMscHV0TGlzdGVuZXI6by5wdXRMaXN0ZW5lcixnZXRMaXN0ZW5lcjpvLmdldExpc3RlbmVyLGRlbGV0ZUxpc3RlbmVyOm8uZGVsZXRlTGlzdGVuZXIsZGVsZXRlQWxsTGlzdGVuZXJzOm8uZGVsZXRlQWxsTGlzdGVuZXJzfSk7dC5leHBvcnRzPW19LHtcIi4vRXZlbnRDb25zdGFudHNcIjoxNyxcIi4vRXZlbnRQbHVnaW5IdWJcIjoxOSxcIi4vRXZlbnRQbHVnaW5SZWdpc3RyeVwiOjIwLFwiLi9PYmplY3QuYXNzaWduXCI6MjksXCIuL1JlYWN0RXZlbnRFbWl0dGVyTWl4aW5cIjo2MCxcIi4vVmlld3BvcnRNZXRyaWNzXCI6MTA1LFwiLi9pc0V2ZW50U3VwcG9ydGVkXCI6MTM4fV0sMzQ6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG49ZShcIi4vUmVhY3RcIikscj1lKFwiLi9PYmplY3QuYXNzaWduXCIpLG89bi5jcmVhdGVGYWN0b3J5KGUoXCIuL1JlYWN0VHJhbnNpdGlvbkdyb3VwXCIpKSxpPW4uY3JlYXRlRmFjdG9yeShlKFwiLi9SZWFjdENTU1RyYW5zaXRpb25Hcm91cENoaWxkXCIpKSxhPW4uY3JlYXRlQ2xhc3Moe2Rpc3BsYXlOYW1lOlwiUmVhY3RDU1NUcmFuc2l0aW9uR3JvdXBcIixwcm9wVHlwZXM6e3RyYW5zaXRpb25OYW1lOm4uUHJvcFR5cGVzLnN0cmluZy5pc1JlcXVpcmVkLHRyYW5zaXRpb25FbnRlcjpuLlByb3BUeXBlcy5ib29sLHRyYW5zaXRpb25MZWF2ZTpuLlByb3BUeXBlcy5ib29sfSxnZXREZWZhdWx0UHJvcHM6ZnVuY3Rpb24oKXtyZXR1cm57dHJhbnNpdGlvbkVudGVyOiEwLHRyYW5zaXRpb25MZWF2ZTohMH19LF93cmFwQ2hpbGQ6ZnVuY3Rpb24oZSl7cmV0dXJuIGkoe25hbWU6dGhpcy5wcm9wcy50cmFuc2l0aW9uTmFtZSxlbnRlcjp0aGlzLnByb3BzLnRyYW5zaXRpb25FbnRlcixsZWF2ZTp0aGlzLnByb3BzLnRyYW5zaXRpb25MZWF2ZX0sZSl9LHJlbmRlcjpmdW5jdGlvbigpe3JldHVybiBvKHIoe30sdGhpcy5wcm9wcyx7Y2hpbGRGYWN0b3J5OnRoaXMuX3dyYXBDaGlsZH0pKX19KTt0LmV4cG9ydHM9YX0se1wiLi9PYmplY3QuYXNzaWduXCI6MjksXCIuL1JlYWN0XCI6MzEsXCIuL1JlYWN0Q1NTVHJhbnNpdGlvbkdyb3VwQ2hpbGRcIjozNSxcIi4vUmVhY3RUcmFuc2l0aW9uR3JvdXBcIjo4N31dLDM1OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPWUoXCIuL1JlYWN0XCIpLHI9ZShcIi4vQ1NTQ29yZVwiKSxvPWUoXCIuL1JlYWN0VHJhbnNpdGlvbkV2ZW50c1wiKSxpPWUoXCIuL29ubHlDaGlsZFwiKSxhPTE3LHM9bi5jcmVhdGVDbGFzcyh7ZGlzcGxheU5hbWU6XCJSZWFjdENTU1RyYW5zaXRpb25Hcm91cENoaWxkXCIsdHJhbnNpdGlvbjpmdW5jdGlvbihlLHQpe3ZhciBuPXRoaXMuZ2V0RE9NTm9kZSgpLGk9dGhpcy5wcm9wcy5uYW1lK1wiLVwiK2UsYT1pK1wiLWFjdGl2ZVwiLHM9ZnVuY3Rpb24oZSl7ZSYmZS50YXJnZXQhPT1ufHwoci5yZW1vdmVDbGFzcyhuLGkpLHIucmVtb3ZlQ2xhc3MobixhKSxvLnJlbW92ZUVuZEV2ZW50TGlzdGVuZXIobixzKSx0JiZ0KCkpfTtvLmFkZEVuZEV2ZW50TGlzdGVuZXIobixzKSxyLmFkZENsYXNzKG4saSksdGhpcy5xdWV1ZUNsYXNzKGEpfSxxdWV1ZUNsYXNzOmZ1bmN0aW9uKGUpe3RoaXMuY2xhc3NOYW1lUXVldWUucHVzaChlKSx0aGlzLnRpbWVvdXR8fCh0aGlzLnRpbWVvdXQ9c2V0VGltZW91dCh0aGlzLmZsdXNoQ2xhc3NOYW1lUXVldWUsYSkpfSxmbHVzaENsYXNzTmFtZVF1ZXVlOmZ1bmN0aW9uKCl7dGhpcy5pc01vdW50ZWQoKSYmdGhpcy5jbGFzc05hbWVRdWV1ZS5mb3JFYWNoKHIuYWRkQ2xhc3MuYmluZChyLHRoaXMuZ2V0RE9NTm9kZSgpKSksdGhpcy5jbGFzc05hbWVRdWV1ZS5sZW5ndGg9MCx0aGlzLnRpbWVvdXQ9bnVsbH0sY29tcG9uZW50V2lsbE1vdW50OmZ1bmN0aW9uKCl7dGhpcy5jbGFzc05hbWVRdWV1ZT1bXX0sY29tcG9uZW50V2lsbFVubW91bnQ6ZnVuY3Rpb24oKXt0aGlzLnRpbWVvdXQmJmNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXQpfSxjb21wb25lbnRXaWxsRW50ZXI6ZnVuY3Rpb24oZSl7dGhpcy5wcm9wcy5lbnRlcj90aGlzLnRyYW5zaXRpb24oXCJlbnRlclwiLGUpOmUoKX0sY29tcG9uZW50V2lsbExlYXZlOmZ1bmN0aW9uKGUpe3RoaXMucHJvcHMubGVhdmU/dGhpcy50cmFuc2l0aW9uKFwibGVhdmVcIixlKTplKCl9LHJlbmRlcjpmdW5jdGlvbigpe3JldHVybiBpKHRoaXMucHJvcHMuY2hpbGRyZW4pfX0pO3QuZXhwb3J0cz1zfSx7XCIuL0NTU0NvcmVcIjo0LFwiLi9SZWFjdFwiOjMxLFwiLi9SZWFjdFRyYW5zaXRpb25FdmVudHNcIjo4NixcIi4vb25seUNoaWxkXCI6MTQ4fV0sMzY6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlLHQpe3RoaXMuZm9yRWFjaEZ1bmN0aW9uPWUsdGhpcy5mb3JFYWNoQ29udGV4dD10fWZ1bmN0aW9uIHIoZSx0LG4scil7dmFyIG89ZTtvLmZvckVhY2hGdW5jdGlvbi5jYWxsKG8uZm9yRWFjaENvbnRleHQsdCxyKX1mdW5jdGlvbiBvKGUsdCxvKXtpZihudWxsPT1lKXJldHVybiBlO3ZhciBpPW4uZ2V0UG9vbGVkKHQsbyk7cChlLHIsaSksbi5yZWxlYXNlKGkpfWZ1bmN0aW9uIGkoZSx0LG4pe3RoaXMubWFwUmVzdWx0PWUsdGhpcy5tYXBGdW5jdGlvbj10LHRoaXMubWFwQ29udGV4dD1ufWZ1bmN0aW9uIGEoZSx0LG4scil7dmFyIG89ZSxpPW8ubWFwUmVzdWx0LGE9IWkuaGFzT3duUHJvcGVydHkobik7aWYoYSl7dmFyIHM9by5tYXBGdW5jdGlvbi5jYWxsKG8ubWFwQ29udGV4dCx0LHIpO2lbbl09c319ZnVuY3Rpb24gcyhlLHQsbil7aWYobnVsbD09ZSlyZXR1cm4gZTt2YXIgcj17fSxvPWkuZ2V0UG9vbGVkKHIsdCxuKTtyZXR1cm4gcChlLGEsbyksaS5yZWxlYXNlKG8pLHJ9ZnVuY3Rpb24gdSgpe3JldHVybiBudWxsfWZ1bmN0aW9uIGMoZSl7cmV0dXJuIHAoZSx1LG51bGwpfXZhciBsPWUoXCIuL1Bvb2xlZENsYXNzXCIpLHA9ZShcIi4vdHJhdmVyc2VBbGxDaGlsZHJlblwiKSxkPShlKFwiLi93YXJuaW5nXCIpLGwudHdvQXJndW1lbnRQb29sZXIpLGY9bC50aHJlZUFyZ3VtZW50UG9vbGVyO2wuYWRkUG9vbGluZ1RvKG4sZCksbC5hZGRQb29saW5nVG8oaSxmKTt2YXIgaD17Zm9yRWFjaDpvLG1hcDpzLGNvdW50OmN9O3QuZXhwb3J0cz1ofSx7XCIuL1Bvb2xlZENsYXNzXCI6MzAsXCIuL3RyYXZlcnNlQWxsQ2hpbGRyZW5cIjoxNTMsXCIuL3dhcm5pbmdcIjoxNTV9XSwzNzpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbj1lKFwiLi9SZWFjdEVsZW1lbnRcIikscj1lKFwiLi9SZWFjdE93bmVyXCIpLG89ZShcIi4vUmVhY3RVcGRhdGVzXCIpLGk9ZShcIi4vT2JqZWN0LmFzc2lnblwiKSxhPWUoXCIuL2ludmFyaWFudFwiKSxzPWUoXCIuL2tleU1pcnJvclwiKSx1PXMoe01PVU5URUQ6bnVsbCxVTk1PVU5URUQ6bnVsbH0pLGM9ITEsbD1udWxsLHA9bnVsbCxkPXtpbmplY3Rpb246e2luamVjdEVudmlyb25tZW50OmZ1bmN0aW9uKGUpe2EoIWMpLHA9ZS5tb3VudEltYWdlSW50b05vZGUsbD1lLnVubW91bnRJREZyb21FbnZpcm9ubWVudCxkLkJhY2tlbmRJRE9wZXJhdGlvbnM9ZS5CYWNrZW5kSURPcGVyYXRpb25zLGM9ITB9fSxMaWZlQ3ljbGU6dSxCYWNrZW5kSURPcGVyYXRpb25zOm51bGwsTWl4aW46e2lzTW91bnRlZDpmdW5jdGlvbigpe3JldHVybiB0aGlzLl9saWZlQ3ljbGVTdGF0ZT09PXUuTU9VTlRFRH0sc2V0UHJvcHM6ZnVuY3Rpb24oZSx0KXt2YXIgbj10aGlzLl9wZW5kaW5nRWxlbWVudHx8dGhpcy5fY3VycmVudEVsZW1lbnQ7dGhpcy5yZXBsYWNlUHJvcHMoaSh7fSxuLnByb3BzLGUpLHQpfSxyZXBsYWNlUHJvcHM6ZnVuY3Rpb24oZSx0KXthKHRoaXMuaXNNb3VudGVkKCkpLGEoMD09PXRoaXMuX21vdW50RGVwdGgpLHRoaXMuX3BlbmRpbmdFbGVtZW50PW4uY2xvbmVBbmRSZXBsYWNlUHJvcHModGhpcy5fcGVuZGluZ0VsZW1lbnR8fHRoaXMuX2N1cnJlbnRFbGVtZW50LGUpLG8uZW5xdWV1ZVVwZGF0ZSh0aGlzLHQpfSxfc2V0UHJvcHNJbnRlcm5hbDpmdW5jdGlvbihlLHQpe3ZhciByPXRoaXMuX3BlbmRpbmdFbGVtZW50fHx0aGlzLl9jdXJyZW50RWxlbWVudDt0aGlzLl9wZW5kaW5nRWxlbWVudD1uLmNsb25lQW5kUmVwbGFjZVByb3BzKHIsaSh7fSxyLnByb3BzLGUpKSxvLmVucXVldWVVcGRhdGUodGhpcyx0KX0sY29uc3RydWN0OmZ1bmN0aW9uKGUpe3RoaXMucHJvcHM9ZS5wcm9wcyx0aGlzLl9vd25lcj1lLl9vd25lcix0aGlzLl9saWZlQ3ljbGVTdGF0ZT11LlVOTU9VTlRFRCx0aGlzLl9wZW5kaW5nQ2FsbGJhY2tzPW51bGwsdGhpcy5fY3VycmVudEVsZW1lbnQ9ZSx0aGlzLl9wZW5kaW5nRWxlbWVudD1udWxsfSxtb3VudENvbXBvbmVudDpmdW5jdGlvbihlLHQsbil7YSghdGhpcy5pc01vdW50ZWQoKSk7dmFyIG89dGhpcy5fY3VycmVudEVsZW1lbnQucmVmO2lmKG51bGwhPW8pe3ZhciBpPXRoaXMuX2N1cnJlbnRFbGVtZW50Ll9vd25lcjtyLmFkZENvbXBvbmVudEFzUmVmVG8odGhpcyxvLGkpfXRoaXMuX3Jvb3ROb2RlSUQ9ZSx0aGlzLl9saWZlQ3ljbGVTdGF0ZT11Lk1PVU5URUQsdGhpcy5fbW91bnREZXB0aD1ufSx1bm1vdW50Q29tcG9uZW50OmZ1bmN0aW9uKCl7YSh0aGlzLmlzTW91bnRlZCgpKTt2YXIgZT10aGlzLl9jdXJyZW50RWxlbWVudC5yZWY7bnVsbCE9ZSYmci5yZW1vdmVDb21wb25lbnRBc1JlZkZyb20odGhpcyxlLHRoaXMuX293bmVyKSxsKHRoaXMuX3Jvb3ROb2RlSUQpLHRoaXMuX3Jvb3ROb2RlSUQ9bnVsbCx0aGlzLl9saWZlQ3ljbGVTdGF0ZT11LlVOTU9VTlRFRH0scmVjZWl2ZUNvbXBvbmVudDpmdW5jdGlvbihlLHQpe2EodGhpcy5pc01vdW50ZWQoKSksdGhpcy5fcGVuZGluZ0VsZW1lbnQ9ZSx0aGlzLnBlcmZvcm1VcGRhdGVJZk5lY2Vzc2FyeSh0KX0scGVyZm9ybVVwZGF0ZUlmTmVjZXNzYXJ5OmZ1bmN0aW9uKGUpe2lmKG51bGwhPXRoaXMuX3BlbmRpbmdFbGVtZW50KXt2YXIgdD10aGlzLl9jdXJyZW50RWxlbWVudCxuPXRoaXMuX3BlbmRpbmdFbGVtZW50O3RoaXMuX2N1cnJlbnRFbGVtZW50PW4sdGhpcy5wcm9wcz1uLnByb3BzLHRoaXMuX293bmVyPW4uX293bmVyLHRoaXMuX3BlbmRpbmdFbGVtZW50PW51bGwsdGhpcy51cGRhdGVDb21wb25lbnQoZSx0KX19LHVwZGF0ZUNvbXBvbmVudDpmdW5jdGlvbihlLHQpe3ZhciBuPXRoaXMuX2N1cnJlbnRFbGVtZW50OyhuLl9vd25lciE9PXQuX293bmVyfHxuLnJlZiE9PXQucmVmKSYmKG51bGwhPXQucmVmJiZyLnJlbW92ZUNvbXBvbmVudEFzUmVmRnJvbSh0aGlzLHQucmVmLHQuX293bmVyKSxudWxsIT1uLnJlZiYmci5hZGRDb21wb25lbnRBc1JlZlRvKHRoaXMsbi5yZWYsbi5fb3duZXIpKX0sbW91bnRDb21wb25lbnRJbnRvTm9kZTpmdW5jdGlvbihlLHQsbil7dmFyIHI9by5SZWFjdFJlY29uY2lsZVRyYW5zYWN0aW9uLmdldFBvb2xlZCgpO3IucGVyZm9ybSh0aGlzLl9tb3VudENvbXBvbmVudEludG9Ob2RlLHRoaXMsZSx0LHIsbiksby5SZWFjdFJlY29uY2lsZVRyYW5zYWN0aW9uLnJlbGVhc2Uocil9LF9tb3VudENvbXBvbmVudEludG9Ob2RlOmZ1bmN0aW9uKGUsdCxuLHIpe3ZhciBvPXRoaXMubW91bnRDb21wb25lbnQoZSxuLDApO3Aobyx0LHIpfSxpc093bmVkQnk6ZnVuY3Rpb24oZSl7cmV0dXJuIHRoaXMuX293bmVyPT09ZX0sZ2V0U2libGluZ0J5UmVmOmZ1bmN0aW9uKGUpe3ZhciB0PXRoaXMuX293bmVyO3JldHVybiB0JiZ0LnJlZnM/dC5yZWZzW2VdOm51bGx9fX07dC5leHBvcnRzPWR9LHtcIi4vT2JqZWN0LmFzc2lnblwiOjI5LFwiLi9SZWFjdEVsZW1lbnRcIjo1NixcIi4vUmVhY3RPd25lclwiOjcyLFwiLi9SZWFjdFVwZGF0ZXNcIjo4OCxcIi4vaW52YXJpYW50XCI6MTM3LFwiLi9rZXlNaXJyb3JcIjoxNDN9XSwzODpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbj1lKFwiLi9SZWFjdERPTUlET3BlcmF0aW9uc1wiKSxyPWUoXCIuL1JlYWN0TWFya3VwQ2hlY2tzdW1cIiksbz1lKFwiLi9SZWFjdE1vdW50XCIpLGk9ZShcIi4vUmVhY3RQZXJmXCIpLGE9ZShcIi4vUmVhY3RSZWNvbmNpbGVUcmFuc2FjdGlvblwiKSxzPWUoXCIuL2dldFJlYWN0Um9vdEVsZW1lbnRJbkNvbnRhaW5lclwiKSx1PWUoXCIuL2ludmFyaWFudFwiKSxjPWUoXCIuL3NldElubmVySFRNTFwiKSxsPTEscD05LGQ9e1JlYWN0UmVjb25jaWxlVHJhbnNhY3Rpb246YSxCYWNrZW5kSURPcGVyYXRpb25zOm4sdW5tb3VudElERnJvbUVudmlyb25tZW50OmZ1bmN0aW9uKGUpe28ucHVyZ2VJRChlKX0sbW91bnRJbWFnZUludG9Ob2RlOmkubWVhc3VyZShcIlJlYWN0Q29tcG9uZW50QnJvd3NlckVudmlyb25tZW50XCIsXCJtb3VudEltYWdlSW50b05vZGVcIixmdW5jdGlvbihlLHQsbil7aWYodSh0JiYodC5ub2RlVHlwZT09PWx8fHQubm9kZVR5cGU9PT1wKSksbil7aWYoci5jYW5SZXVzZU1hcmt1cChlLHModCkpKXJldHVybjt1KHQubm9kZVR5cGUhPT1wKX11KHQubm9kZVR5cGUhPT1wKSxjKHQsZSl9KX07dC5leHBvcnRzPWR9LHtcIi4vUmVhY3RET01JRE9wZXJhdGlvbnNcIjo0NyxcIi4vUmVhY3RNYXJrdXBDaGVja3N1bVwiOjY3LFwiLi9SZWFjdE1vdW50XCI6NjgsXCIuL1JlYWN0UGVyZlwiOjczLFwiLi9SZWFjdFJlY29uY2lsZVRyYW5zYWN0aW9uXCI6NzksXCIuL2dldFJlYWN0Um9vdEVsZW1lbnRJbkNvbnRhaW5lclwiOjEzMSxcIi4vaW52YXJpYW50XCI6MTM3LFwiLi9zZXRJbm5lckhUTUxcIjoxNDl9XSwzOTpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbj1lKFwiLi9zaGFsbG93RXF1YWxcIikscj17c2hvdWxkQ29tcG9uZW50VXBkYXRlOmZ1bmN0aW9uKGUsdCl7cmV0dXJuIW4odGhpcy5wcm9wcyxlKXx8IW4odGhpcy5zdGF0ZSx0KX19O3QuZXhwb3J0cz1yfSx7XCIuL3NoYWxsb3dFcXVhbFwiOjE1MH1dLDQwOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSl7dmFyIHQ9ZS5fb3duZXJ8fG51bGw7cmV0dXJuIHQmJnQuY29uc3RydWN0b3ImJnQuY29uc3RydWN0b3IuZGlzcGxheU5hbWU/XCIgQ2hlY2sgdGhlIHJlbmRlciBtZXRob2Qgb2YgYFwiK3QuY29uc3RydWN0b3IuZGlzcGxheU5hbWUrXCJgLlwiOlwiXCJ9ZnVuY3Rpb24gcihlLHQpe2Zvcih2YXIgbiBpbiB0KXQuaGFzT3duUHJvcGVydHkobikmJkQoXCJmdW5jdGlvblwiPT10eXBlb2YgdFtuXSl9ZnVuY3Rpb24gbyhlLHQpe3ZhciBuPUkuaGFzT3duUHJvcGVydHkodCk/SVt0XTpudWxsO0wuaGFzT3duUHJvcGVydHkodCkmJkQobj09PVMuT1ZFUlJJREVfQkFTRSksZS5oYXNPd25Qcm9wZXJ0eSh0KSYmRChuPT09Uy5ERUZJTkVfTUFOWXx8bj09PVMuREVGSU5FX01BTllfTUVSR0VEKX1mdW5jdGlvbiBpKGUpe3ZhciB0PWUuX2NvbXBvc2l0ZUxpZmVDeWNsZVN0YXRlO0QoZS5pc01vdW50ZWQoKXx8dD09PUEuTU9VTlRJTkcpLEQobnVsbD09Zi5jdXJyZW50KSxEKHQhPT1BLlVOTU9VTlRJTkcpfWZ1bmN0aW9uIGEoZSx0KXtpZih0KXtEKCF5LmlzVmFsaWRGYWN0b3J5KHQpKSxEKCFoLmlzVmFsaWRFbGVtZW50KHQpKTt2YXIgbj1lLnByb3RvdHlwZTt0Lmhhc093blByb3BlcnR5KF8pJiZrLm1peGlucyhlLHQubWl4aW5zKTtmb3IodmFyIHIgaW4gdClpZih0Lmhhc093blByb3BlcnR5KHIpJiZyIT09Xyl7dmFyIGk9dFtyXTtpZihvKG4sciksay5oYXNPd25Qcm9wZXJ0eShyKSlrW3JdKGUsaSk7ZWxzZXt2YXIgYT1JLmhhc093blByb3BlcnR5KHIpLHM9bi5oYXNPd25Qcm9wZXJ0eShyKSx1PWkmJmkuX19yZWFjdERvbnRCaW5kLHA9XCJmdW5jdGlvblwiPT10eXBlb2YgaSxkPXAmJiFhJiYhcyYmIXU7aWYoZCluLl9fcmVhY3RBdXRvQmluZE1hcHx8KG4uX19yZWFjdEF1dG9CaW5kTWFwPXt9KSxuLl9fcmVhY3RBdXRvQmluZE1hcFtyXT1pLG5bcl09aTtlbHNlIGlmKHMpe3ZhciBmPUlbcl07RChhJiYoZj09PVMuREVGSU5FX01BTllfTUVSR0VEfHxmPT09Uy5ERUZJTkVfTUFOWSkpLGY9PT1TLkRFRklORV9NQU5ZX01FUkdFRD9uW3JdPWMobltyXSxpKTpmPT09Uy5ERUZJTkVfTUFOWSYmKG5bcl09bChuW3JdLGkpKX1lbHNlIG5bcl09aX19fX1mdW5jdGlvbiBzKGUsdCl7aWYodClmb3IodmFyIG4gaW4gdCl7dmFyIHI9dFtuXTtpZih0Lmhhc093blByb3BlcnR5KG4pKXt2YXIgbz1uIGluIGs7RCghbyk7dmFyIGk9biBpbiBlO0QoIWkpLGVbbl09cn19fWZ1bmN0aW9uIHUoZSx0KXtyZXR1cm4gRChlJiZ0JiZcIm9iamVjdFwiPT10eXBlb2YgZSYmXCJvYmplY3RcIj09dHlwZW9mIHQpLFQodCxmdW5jdGlvbih0LG4pe0Qodm9pZCAwPT09ZVtuXSksZVtuXT10fSksZX1mdW5jdGlvbiBjKGUsdCl7cmV0dXJuIGZ1bmN0aW9uKCl7dmFyIG49ZS5hcHBseSh0aGlzLGFyZ3VtZW50cykscj10LmFwcGx5KHRoaXMsYXJndW1lbnRzKTtyZXR1cm4gbnVsbD09bj9yOm51bGw9PXI/bjp1KG4scil9fWZ1bmN0aW9uIGwoZSx0KXtyZXR1cm4gZnVuY3Rpb24oKXtlLmFwcGx5KHRoaXMsYXJndW1lbnRzKSx0LmFwcGx5KHRoaXMsYXJndW1lbnRzKX19dmFyIHA9ZShcIi4vUmVhY3RDb21wb25lbnRcIiksZD1lKFwiLi9SZWFjdENvbnRleHRcIiksZj1lKFwiLi9SZWFjdEN1cnJlbnRPd25lclwiKSxoPWUoXCIuL1JlYWN0RWxlbWVudFwiKSxtPShlKFwiLi9SZWFjdEVsZW1lbnRWYWxpZGF0b3JcIiksZShcIi4vUmVhY3RFbXB0eUNvbXBvbmVudFwiKSksdj1lKFwiLi9SZWFjdEVycm9yVXRpbHNcIikseT1lKFwiLi9SZWFjdExlZ2FjeUVsZW1lbnRcIiksZz1lKFwiLi9SZWFjdE93bmVyXCIpLEU9ZShcIi4vUmVhY3RQZXJmXCIpLEM9ZShcIi4vUmVhY3RQcm9wVHJhbnNmZXJlclwiKSxSPWUoXCIuL1JlYWN0UHJvcFR5cGVMb2NhdGlvbnNcIiksTT0oZShcIi4vUmVhY3RQcm9wVHlwZUxvY2F0aW9uTmFtZXNcIiksZShcIi4vUmVhY3RVcGRhdGVzXCIpKSxiPWUoXCIuL09iamVjdC5hc3NpZ25cIiksTz1lKFwiLi9pbnN0YW50aWF0ZVJlYWN0Q29tcG9uZW50XCIpLEQ9ZShcIi4vaW52YXJpYW50XCIpLHg9ZShcIi4va2V5TWlycm9yXCIpLFA9ZShcIi4va2V5T2ZcIiksVD0oZShcIi4vbW9uaXRvckNvZGVVc2VcIiksZShcIi4vbWFwT2JqZWN0XCIpKSx3PWUoXCIuL3Nob3VsZFVwZGF0ZVJlYWN0Q29tcG9uZW50XCIpLF89KGUoXCIuL3dhcm5pbmdcIiksUCh7bWl4aW5zOm51bGx9KSksUz14KHtERUZJTkVfT05DRTpudWxsLERFRklORV9NQU5ZOm51bGwsT1ZFUlJJREVfQkFTRTpudWxsLERFRklORV9NQU5ZX01FUkdFRDpudWxsfSksTj1bXSxJPXttaXhpbnM6Uy5ERUZJTkVfTUFOWSxzdGF0aWNzOlMuREVGSU5FX01BTlkscHJvcFR5cGVzOlMuREVGSU5FX01BTlksY29udGV4dFR5cGVzOlMuREVGSU5FX01BTlksY2hpbGRDb250ZXh0VHlwZXM6Uy5ERUZJTkVfTUFOWSxnZXREZWZhdWx0UHJvcHM6Uy5ERUZJTkVfTUFOWV9NRVJHRUQsZ2V0SW5pdGlhbFN0YXRlOlMuREVGSU5FX01BTllfTUVSR0VELGdldENoaWxkQ29udGV4dDpTLkRFRklORV9NQU5ZX01FUkdFRCxyZW5kZXI6Uy5ERUZJTkVfT05DRSxjb21wb25lbnRXaWxsTW91bnQ6Uy5ERUZJTkVfTUFOWSxjb21wb25lbnREaWRNb3VudDpTLkRFRklORV9NQU5ZLGNvbXBvbmVudFdpbGxSZWNlaXZlUHJvcHM6Uy5ERUZJTkVfTUFOWSxzaG91bGRDb21wb25lbnRVcGRhdGU6Uy5ERUZJTkVfT05DRSxjb21wb25lbnRXaWxsVXBkYXRlOlMuREVGSU5FX01BTlksY29tcG9uZW50RGlkVXBkYXRlOlMuREVGSU5FX01BTlksY29tcG9uZW50V2lsbFVubW91bnQ6Uy5ERUZJTkVfTUFOWSx1cGRhdGVDb21wb25lbnQ6Uy5PVkVSUklERV9CQVNFfSxrPXtkaXNwbGF5TmFtZTpmdW5jdGlvbihlLHQpe2UuZGlzcGxheU5hbWU9dH0sbWl4aW5zOmZ1bmN0aW9uKGUsdCl7aWYodClmb3IodmFyIG49MDtuPHQubGVuZ3RoO24rKylhKGUsdFtuXSl9LGNoaWxkQ29udGV4dFR5cGVzOmZ1bmN0aW9uKGUsdCl7cihlLHQsUi5jaGlsZENvbnRleHQpLGUuY2hpbGRDb250ZXh0VHlwZXM9Yih7fSxlLmNoaWxkQ29udGV4dFR5cGVzLHQpfSxjb250ZXh0VHlwZXM6ZnVuY3Rpb24oZSx0KXtyKGUsdCxSLmNvbnRleHQpLGUuY29udGV4dFR5cGVzPWIoe30sZS5jb250ZXh0VHlwZXMsdCl9LGdldERlZmF1bHRQcm9wczpmdW5jdGlvbihlLHQpe2UuZ2V0RGVmYXVsdFByb3BzPWUuZ2V0RGVmYXVsdFByb3BzP2MoZS5nZXREZWZhdWx0UHJvcHMsdCk6dH0scHJvcFR5cGVzOmZ1bmN0aW9uKGUsdCl7cihlLHQsUi5wcm9wKSxlLnByb3BUeXBlcz1iKHt9LGUucHJvcFR5cGVzLHQpfSxzdGF0aWNzOmZ1bmN0aW9uKGUsdCl7cyhlLHQpfX0sQT14KHtNT1VOVElORzpudWxsLFVOTU9VTlRJTkc6bnVsbCxSRUNFSVZJTkdfUFJPUFM6bnVsbH0pLEw9e2NvbnN0cnVjdDpmdW5jdGlvbigpe3AuTWl4aW4uY29uc3RydWN0LmFwcGx5KHRoaXMsYXJndW1lbnRzKSxnLk1peGluLmNvbnN0cnVjdC5hcHBseSh0aGlzLGFyZ3VtZW50cyksdGhpcy5zdGF0ZT1udWxsLHRoaXMuX3BlbmRpbmdTdGF0ZT1udWxsLHRoaXMuY29udGV4dD1udWxsLHRoaXMuX2NvbXBvc2l0ZUxpZmVDeWNsZVN0YXRlPW51bGx9LGlzTW91bnRlZDpmdW5jdGlvbigpe3JldHVybiBwLk1peGluLmlzTW91bnRlZC5jYWxsKHRoaXMpJiZ0aGlzLl9jb21wb3NpdGVMaWZlQ3ljbGVTdGF0ZSE9PUEuTU9VTlRJTkd9LG1vdW50Q29tcG9uZW50OkUubWVhc3VyZShcIlJlYWN0Q29tcG9zaXRlQ29tcG9uZW50XCIsXCJtb3VudENvbXBvbmVudFwiLGZ1bmN0aW9uKGUsdCxuKXtwLk1peGluLm1vdW50Q29tcG9uZW50LmNhbGwodGhpcyxlLHQsbiksdGhpcy5fY29tcG9zaXRlTGlmZUN5Y2xlU3RhdGU9QS5NT1VOVElORyx0aGlzLl9fcmVhY3RBdXRvQmluZE1hcCYmdGhpcy5fYmluZEF1dG9CaW5kTWV0aG9kcygpLHRoaXMuY29udGV4dD10aGlzLl9wcm9jZXNzQ29udGV4dCh0aGlzLl9jdXJyZW50RWxlbWVudC5fY29udGV4dCksdGhpcy5wcm9wcz10aGlzLl9wcm9jZXNzUHJvcHModGhpcy5wcm9wcyksdGhpcy5zdGF0ZT10aGlzLmdldEluaXRpYWxTdGF0ZT90aGlzLmdldEluaXRpYWxTdGF0ZSgpOm51bGwsRChcIm9iamVjdFwiPT10eXBlb2YgdGhpcy5zdGF0ZSYmIUFycmF5LmlzQXJyYXkodGhpcy5zdGF0ZSkpLHRoaXMuX3BlbmRpbmdTdGF0ZT1udWxsLHRoaXMuX3BlbmRpbmdGb3JjZVVwZGF0ZT0hMSx0aGlzLmNvbXBvbmVudFdpbGxNb3VudCYmKHRoaXMuY29tcG9uZW50V2lsbE1vdW50KCksdGhpcy5fcGVuZGluZ1N0YXRlJiYodGhpcy5zdGF0ZT10aGlzLl9wZW5kaW5nU3RhdGUsdGhpcy5fcGVuZGluZ1N0YXRlPW51bGwpKSx0aGlzLl9yZW5kZXJlZENvbXBvbmVudD1PKHRoaXMuX3JlbmRlclZhbGlkYXRlZENvbXBvbmVudCgpLHRoaXMuX2N1cnJlbnRFbGVtZW50LnR5cGUpLHRoaXMuX2NvbXBvc2l0ZUxpZmVDeWNsZVN0YXRlPW51bGw7dmFyIHI9dGhpcy5fcmVuZGVyZWRDb21wb25lbnQubW91bnRDb21wb25lbnQoZSx0LG4rMSk7cmV0dXJuIHRoaXMuY29tcG9uZW50RGlkTW91bnQmJnQuZ2V0UmVhY3RNb3VudFJlYWR5KCkuZW5xdWV1ZSh0aGlzLmNvbXBvbmVudERpZE1vdW50LHRoaXMpLHJ9KSx1bm1vdW50Q29tcG9uZW50OmZ1bmN0aW9uKCl7dGhpcy5fY29tcG9zaXRlTGlmZUN5Y2xlU3RhdGU9QS5VTk1PVU5USU5HLHRoaXMuY29tcG9uZW50V2lsbFVubW91bnQmJnRoaXMuY29tcG9uZW50V2lsbFVubW91bnQoKSx0aGlzLl9jb21wb3NpdGVMaWZlQ3ljbGVTdGF0ZT1udWxsLHRoaXMuX3JlbmRlcmVkQ29tcG9uZW50LnVubW91bnRDb21wb25lbnQoKSx0aGlzLl9yZW5kZXJlZENvbXBvbmVudD1udWxsLHAuTWl4aW4udW5tb3VudENvbXBvbmVudC5jYWxsKHRoaXMpfSxzZXRTdGF0ZTpmdW5jdGlvbihlLHQpe0QoXCJvYmplY3RcIj09dHlwZW9mIGV8fG51bGw9PWUpLHRoaXMucmVwbGFjZVN0YXRlKGIoe30sdGhpcy5fcGVuZGluZ1N0YXRlfHx0aGlzLnN0YXRlLGUpLHQpfSxyZXBsYWNlU3RhdGU6ZnVuY3Rpb24oZSx0KXtpKHRoaXMpLHRoaXMuX3BlbmRpbmdTdGF0ZT1lLHRoaXMuX2NvbXBvc2l0ZUxpZmVDeWNsZVN0YXRlIT09QS5NT1VOVElORyYmTS5lbnF1ZXVlVXBkYXRlKHRoaXMsdCl9LF9wcm9jZXNzQ29udGV4dDpmdW5jdGlvbihlKXt2YXIgdD1udWxsLG49dGhpcy5jb25zdHJ1Y3Rvci5jb250ZXh0VHlwZXM7aWYobil7dD17fTtmb3IodmFyIHIgaW4gbil0W3JdPWVbcl19cmV0dXJuIHR9LF9wcm9jZXNzQ2hpbGRDb250ZXh0OmZ1bmN0aW9uKGUpe3ZhciB0PXRoaXMuZ2V0Q2hpbGRDb250ZXh0JiZ0aGlzLmdldENoaWxkQ29udGV4dCgpO2lmKHRoaXMuY29uc3RydWN0b3IuZGlzcGxheU5hbWV8fFwiUmVhY3RDb21wb3NpdGVDb21wb25lbnRcIix0KXtEKFwib2JqZWN0XCI9PXR5cGVvZiB0aGlzLmNvbnN0cnVjdG9yLmNoaWxkQ29udGV4dFR5cGVzKTtmb3IodmFyIG4gaW4gdClEKG4gaW4gdGhpcy5jb25zdHJ1Y3Rvci5jaGlsZENvbnRleHRUeXBlcyk7cmV0dXJuIGIoe30sZSx0KX1yZXR1cm4gZX0sX3Byb2Nlc3NQcm9wczpmdW5jdGlvbihlKXtyZXR1cm4gZX0sX2NoZWNrUHJvcFR5cGVzOmZ1bmN0aW9uKGUsdCxyKXt2YXIgbz10aGlzLmNvbnN0cnVjdG9yLmRpc3BsYXlOYW1lO2Zvcih2YXIgaSBpbiBlKWlmKGUuaGFzT3duUHJvcGVydHkoaSkpe3ZhciBhPWVbaV0odCxpLG8scik7YSBpbnN0YW5jZW9mIEVycm9yJiZuKHRoaXMpfX0scGVyZm9ybVVwZGF0ZUlmTmVjZXNzYXJ5OmZ1bmN0aW9uKGUpe3ZhciB0PXRoaXMuX2NvbXBvc2l0ZUxpZmVDeWNsZVN0YXRlO2lmKHQhPT1BLk1PVU5USU5HJiZ0IT09QS5SRUNFSVZJTkdfUFJPUFMmJihudWxsIT10aGlzLl9wZW5kaW5nRWxlbWVudHx8bnVsbCE9dGhpcy5fcGVuZGluZ1N0YXRlfHx0aGlzLl9wZW5kaW5nRm9yY2VVcGRhdGUpKXt2YXIgbj10aGlzLmNvbnRleHQscj10aGlzLnByb3BzLG89dGhpcy5fY3VycmVudEVsZW1lbnQ7bnVsbCE9dGhpcy5fcGVuZGluZ0VsZW1lbnQmJihvPXRoaXMuX3BlbmRpbmdFbGVtZW50LG49dGhpcy5fcHJvY2Vzc0NvbnRleHQoby5fY29udGV4dCkscj10aGlzLl9wcm9jZXNzUHJvcHMoby5wcm9wcyksdGhpcy5fcGVuZGluZ0VsZW1lbnQ9bnVsbCx0aGlzLl9jb21wb3NpdGVMaWZlQ3ljbGVTdGF0ZT1BLlJFQ0VJVklOR19QUk9QUyx0aGlzLmNvbXBvbmVudFdpbGxSZWNlaXZlUHJvcHMmJnRoaXMuY29tcG9uZW50V2lsbFJlY2VpdmVQcm9wcyhyLG4pKSx0aGlzLl9jb21wb3NpdGVMaWZlQ3ljbGVTdGF0ZT1udWxsO3ZhciBpPXRoaXMuX3BlbmRpbmdTdGF0ZXx8dGhpcy5zdGF0ZTt0aGlzLl9wZW5kaW5nU3RhdGU9bnVsbDt2YXIgYT10aGlzLl9wZW5kaW5nRm9yY2VVcGRhdGV8fCF0aGlzLnNob3VsZENvbXBvbmVudFVwZGF0ZXx8dGhpcy5zaG91bGRDb21wb25lbnRVcGRhdGUocixpLG4pO2E/KHRoaXMuX3BlbmRpbmdGb3JjZVVwZGF0ZT0hMSx0aGlzLl9wZXJmb3JtQ29tcG9uZW50VXBkYXRlKG8scixpLG4sZSkpOih0aGlzLl9jdXJyZW50RWxlbWVudD1vLHRoaXMucHJvcHM9cix0aGlzLnN0YXRlPWksdGhpcy5jb250ZXh0PW4sdGhpcy5fb3duZXI9by5fb3duZXIpfX0sX3BlcmZvcm1Db21wb25lbnRVcGRhdGU6ZnVuY3Rpb24oZSx0LG4scixvKXt2YXIgaT10aGlzLl9jdXJyZW50RWxlbWVudCxhPXRoaXMucHJvcHMscz10aGlzLnN0YXRlLHU9dGhpcy5jb250ZXh0O3RoaXMuY29tcG9uZW50V2lsbFVwZGF0ZSYmdGhpcy5jb21wb25lbnRXaWxsVXBkYXRlKHQsbixyKSx0aGlzLl9jdXJyZW50RWxlbWVudD1lLHRoaXMucHJvcHM9dCx0aGlzLnN0YXRlPW4sdGhpcy5jb250ZXh0PXIsdGhpcy5fb3duZXI9ZS5fb3duZXIsdGhpcy51cGRhdGVDb21wb25lbnQobyxpKSx0aGlzLmNvbXBvbmVudERpZFVwZGF0ZSYmby5nZXRSZWFjdE1vdW50UmVhZHkoKS5lbnF1ZXVlKHRoaXMuY29tcG9uZW50RGlkVXBkYXRlLmJpbmQodGhpcyxhLHMsdSksdGhpcyl9LHJlY2VpdmVDb21wb25lbnQ6ZnVuY3Rpb24oZSx0KXsoZSE9PXRoaXMuX2N1cnJlbnRFbGVtZW50fHxudWxsPT1lLl9vd25lcikmJnAuTWl4aW4ucmVjZWl2ZUNvbXBvbmVudC5jYWxsKHRoaXMsZSx0KX0sdXBkYXRlQ29tcG9uZW50OkUubWVhc3VyZShcIlJlYWN0Q29tcG9zaXRlQ29tcG9uZW50XCIsXCJ1cGRhdGVDb21wb25lbnRcIixmdW5jdGlvbihlLHQpe3AuTWl4aW4udXBkYXRlQ29tcG9uZW50LmNhbGwodGhpcyxlLHQpO3ZhciBuPXRoaXMuX3JlbmRlcmVkQ29tcG9uZW50LHI9bi5fY3VycmVudEVsZW1lbnQsbz10aGlzLl9yZW5kZXJWYWxpZGF0ZWRDb21wb25lbnQoKTtpZih3KHIsbykpbi5yZWNlaXZlQ29tcG9uZW50KG8sZSk7ZWxzZXt2YXIgaT10aGlzLl9yb290Tm9kZUlELGE9bi5fcm9vdE5vZGVJRDtuLnVubW91bnRDb21wb25lbnQoKSx0aGlzLl9yZW5kZXJlZENvbXBvbmVudD1PKG8sdGhpcy5fY3VycmVudEVsZW1lbnQudHlwZSk7dmFyIHM9dGhpcy5fcmVuZGVyZWRDb21wb25lbnQubW91bnRDb21wb25lbnQoaSxlLHRoaXMuX21vdW50RGVwdGgrMSk7cC5CYWNrZW5kSURPcGVyYXRpb25zLmRhbmdlcm91c2x5UmVwbGFjZU5vZGVXaXRoTWFya3VwQnlJRChhLHMpfX0pLGZvcmNlVXBkYXRlOmZ1bmN0aW9uKGUpe3ZhciB0PXRoaXMuX2NvbXBvc2l0ZUxpZmVDeWNsZVN0YXRlO0QodGhpcy5pc01vdW50ZWQoKXx8dD09PUEuTU9VTlRJTkcpLEQodCE9PUEuVU5NT1VOVElORyYmbnVsbD09Zi5jdXJyZW50KSx0aGlzLl9wZW5kaW5nRm9yY2VVcGRhdGU9ITAsTS5lbnF1ZXVlVXBkYXRlKHRoaXMsZSl9LF9yZW5kZXJWYWxpZGF0ZWRDb21wb25lbnQ6RS5tZWFzdXJlKFwiUmVhY3RDb21wb3NpdGVDb21wb25lbnRcIixcIl9yZW5kZXJWYWxpZGF0ZWRDb21wb25lbnRcIixmdW5jdGlvbigpe3ZhciBlLHQ9ZC5jdXJyZW50O2QuY3VycmVudD10aGlzLl9wcm9jZXNzQ2hpbGRDb250ZXh0KHRoaXMuX2N1cnJlbnRFbGVtZW50Ll9jb250ZXh0KSxmLmN1cnJlbnQ9dGhpczt0cnl7ZT10aGlzLnJlbmRlcigpLG51bGw9PT1lfHxlPT09ITE/KGU9bS5nZXRFbXB0eUNvbXBvbmVudCgpLG0ucmVnaXN0ZXJOdWxsQ29tcG9uZW50SUQodGhpcy5fcm9vdE5vZGVJRCkpOm0uZGVyZWdpc3Rlck51bGxDb21wb25lbnRJRCh0aGlzLl9yb290Tm9kZUlEKX1maW5hbGx5e2QuY3VycmVudD10LGYuY3VycmVudD1udWxsfXJldHVybiBEKGguaXNWYWxpZEVsZW1lbnQoZSkpLGV9KSxfYmluZEF1dG9CaW5kTWV0aG9kczpmdW5jdGlvbigpe2Zvcih2YXIgZSBpbiB0aGlzLl9fcmVhY3RBdXRvQmluZE1hcClpZih0aGlzLl9fcmVhY3RBdXRvQmluZE1hcC5oYXNPd25Qcm9wZXJ0eShlKSl7dmFyIHQ9dGhpcy5fX3JlYWN0QXV0b0JpbmRNYXBbZV07dGhpc1tlXT10aGlzLl9iaW5kQXV0b0JpbmRNZXRob2Qodi5ndWFyZCh0LHRoaXMuY29uc3RydWN0b3IuZGlzcGxheU5hbWUrXCIuXCIrZSkpfX0sX2JpbmRBdXRvQmluZE1ldGhvZDpmdW5jdGlvbihlKXt2YXIgdD10aGlzLG49ZS5iaW5kKHQpO3JldHVybiBufX0sVT1mdW5jdGlvbigpe307YihVLnByb3RvdHlwZSxwLk1peGluLGcuTWl4aW4sQy5NaXhpbixMKTt2YXIgRj17TGlmZUN5Y2xlOkEsQmFzZTpVLGNyZWF0ZUNsYXNzOmZ1bmN0aW9uKGUpe3ZhciB0PWZ1bmN0aW9uKCl7fTt0LnByb3RvdHlwZT1uZXcgVSx0LnByb3RvdHlwZS5jb25zdHJ1Y3Rvcj10LE4uZm9yRWFjaChhLmJpbmQobnVsbCx0KSksYSh0LGUpLHQuZ2V0RGVmYXVsdFByb3BzJiYodC5kZWZhdWx0UHJvcHM9dC5nZXREZWZhdWx0UHJvcHMoKSksRCh0LnByb3RvdHlwZS5yZW5kZXIpO2Zvcih2YXIgbiBpbiBJKXQucHJvdG90eXBlW25dfHwodC5wcm90b3R5cGVbbl09bnVsbCk7cmV0dXJuIHkud3JhcEZhY3RvcnkoaC5jcmVhdGVGYWN0b3J5KHQpKX0saW5qZWN0aW9uOntpbmplY3RNaXhpbjpmdW5jdGlvbihlKXtOLnB1c2goZSl9fX07dC5leHBvcnRzPUZ9LHtcIi4vT2JqZWN0LmFzc2lnblwiOjI5LFwiLi9SZWFjdENvbXBvbmVudFwiOjM3LFwiLi9SZWFjdENvbnRleHRcIjo0MSxcIi4vUmVhY3RDdXJyZW50T3duZXJcIjo0MixcIi4vUmVhY3RFbGVtZW50XCI6NTYsXCIuL1JlYWN0RWxlbWVudFZhbGlkYXRvclwiOjU3LFwiLi9SZWFjdEVtcHR5Q29tcG9uZW50XCI6NTgsXCIuL1JlYWN0RXJyb3JVdGlsc1wiOjU5LFwiLi9SZWFjdExlZ2FjeUVsZW1lbnRcIjo2NSxcIi4vUmVhY3RPd25lclwiOjcyLFwiLi9SZWFjdFBlcmZcIjo3MyxcIi4vUmVhY3RQcm9wVHJhbnNmZXJlclwiOjc0LFwiLi9SZWFjdFByb3BUeXBlTG9jYXRpb25OYW1lc1wiOjc1LFwiLi9SZWFjdFByb3BUeXBlTG9jYXRpb25zXCI6NzYsXCIuL1JlYWN0VXBkYXRlc1wiOjg4LFwiLi9pbnN0YW50aWF0ZVJlYWN0Q29tcG9uZW50XCI6MTM2LFwiLi9pbnZhcmlhbnRcIjoxMzcsXCIuL2tleU1pcnJvclwiOjE0MyxcIi4va2V5T2ZcIjoxNDQsXCIuL21hcE9iamVjdFwiOjE0NSxcIi4vbW9uaXRvckNvZGVVc2VcIjoxNDcsXCIuL3Nob3VsZFVwZGF0ZVJlYWN0Q29tcG9uZW50XCI6MTUxLFwiLi93YXJuaW5nXCI6MTU1fV0sNDE6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG49ZShcIi4vT2JqZWN0LmFzc2lnblwiKSxyPXtjdXJyZW50Ont9LHdpdGhDb250ZXh0OmZ1bmN0aW9uKGUsdCl7dmFyIG8saT1yLmN1cnJlbnQ7ci5jdXJyZW50PW4oe30saSxlKTt0cnl7bz10KCl9ZmluYWxseXtyLmN1cnJlbnQ9aX1yZXR1cm4gb319O3QuZXhwb3J0cz1yfSx7XCIuL09iamVjdC5hc3NpZ25cIjoyOX1dLDQyOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPXtjdXJyZW50Om51bGx9O3QuZXhwb3J0cz1ufSx7fV0sNDM6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlKXtyZXR1cm4gby5tYXJrTm9uTGVnYWN5RmFjdG9yeShyLmNyZWF0ZUZhY3RvcnkoZSkpfXZhciByPWUoXCIuL1JlYWN0RWxlbWVudFwiKSxvPShlKFwiLi9SZWFjdEVsZW1lbnRWYWxpZGF0b3JcIiksZShcIi4vUmVhY3RMZWdhY3lFbGVtZW50XCIpKSxpPWUoXCIuL21hcE9iamVjdFwiKSxhPWkoe2E6XCJhXCIsYWJicjpcImFiYnJcIixhZGRyZXNzOlwiYWRkcmVzc1wiLGFyZWE6XCJhcmVhXCIsYXJ0aWNsZTpcImFydGljbGVcIixhc2lkZTpcImFzaWRlXCIsYXVkaW86XCJhdWRpb1wiLGI6XCJiXCIsYmFzZTpcImJhc2VcIixiZGk6XCJiZGlcIixiZG86XCJiZG9cIixiaWc6XCJiaWdcIixibG9ja3F1b3RlOlwiYmxvY2txdW90ZVwiLGJvZHk6XCJib2R5XCIsYnI6XCJiclwiLGJ1dHRvbjpcImJ1dHRvblwiLGNhbnZhczpcImNhbnZhc1wiLGNhcHRpb246XCJjYXB0aW9uXCIsY2l0ZTpcImNpdGVcIixjb2RlOlwiY29kZVwiLGNvbDpcImNvbFwiLGNvbGdyb3VwOlwiY29sZ3JvdXBcIixkYXRhOlwiZGF0YVwiLGRhdGFsaXN0OlwiZGF0YWxpc3RcIixkZDpcImRkXCIsZGVsOlwiZGVsXCIsZGV0YWlsczpcImRldGFpbHNcIixkZm46XCJkZm5cIixkaWFsb2c6XCJkaWFsb2dcIixkaXY6XCJkaXZcIixkbDpcImRsXCIsZHQ6XCJkdFwiLGVtOlwiZW1cIixlbWJlZDpcImVtYmVkXCIsZmllbGRzZXQ6XCJmaWVsZHNldFwiLGZpZ2NhcHRpb246XCJmaWdjYXB0aW9uXCIsZmlndXJlOlwiZmlndXJlXCIsZm9vdGVyOlwiZm9vdGVyXCIsZm9ybTpcImZvcm1cIixoMTpcImgxXCIsaDI6XCJoMlwiLGgzOlwiaDNcIixoNDpcImg0XCIsaDU6XCJoNVwiLGg2OlwiaDZcIixoZWFkOlwiaGVhZFwiLGhlYWRlcjpcImhlYWRlclwiLGhyOlwiaHJcIixodG1sOlwiaHRtbFwiLGk6XCJpXCIsaWZyYW1lOlwiaWZyYW1lXCIsaW1nOlwiaW1nXCIsaW5wdXQ6XCJpbnB1dFwiLGluczpcImluc1wiLGtiZDpcImtiZFwiLGtleWdlbjpcImtleWdlblwiLGxhYmVsOlwibGFiZWxcIixsZWdlbmQ6XCJsZWdlbmRcIixsaTpcImxpXCIsbGluazpcImxpbmtcIixtYWluOlwibWFpblwiLG1hcDpcIm1hcFwiLG1hcms6XCJtYXJrXCIsbWVudTpcIm1lbnVcIixtZW51aXRlbTpcIm1lbnVpdGVtXCIsbWV0YTpcIm1ldGFcIixtZXRlcjpcIm1ldGVyXCIsbmF2OlwibmF2XCIsbm9zY3JpcHQ6XCJub3NjcmlwdFwiLG9iamVjdDpcIm9iamVjdFwiLG9sOlwib2xcIixvcHRncm91cDpcIm9wdGdyb3VwXCIsb3B0aW9uOlwib3B0aW9uXCIsb3V0cHV0Olwib3V0cHV0XCIscDpcInBcIixwYXJhbTpcInBhcmFtXCIscGljdHVyZTpcInBpY3R1cmVcIixwcmU6XCJwcmVcIixwcm9ncmVzczpcInByb2dyZXNzXCIscTpcInFcIixycDpcInJwXCIscnQ6XCJydFwiLHJ1Ynk6XCJydWJ5XCIsczpcInNcIixzYW1wOlwic2FtcFwiLHNjcmlwdDpcInNjcmlwdFwiLHNlY3Rpb246XCJzZWN0aW9uXCIsc2VsZWN0Olwic2VsZWN0XCIsc21hbGw6XCJzbWFsbFwiLHNvdXJjZTpcInNvdXJjZVwiLHNwYW46XCJzcGFuXCIsc3Ryb25nOlwic3Ryb25nXCIsc3R5bGU6XCJzdHlsZVwiLHN1YjpcInN1YlwiLHN1bW1hcnk6XCJzdW1tYXJ5XCIsc3VwOlwic3VwXCIsdGFibGU6XCJ0YWJsZVwiLHRib2R5OlwidGJvZHlcIix0ZDpcInRkXCIsdGV4dGFyZWE6XCJ0ZXh0YXJlYVwiLHRmb290OlwidGZvb3RcIix0aDpcInRoXCIsdGhlYWQ6XCJ0aGVhZFwiLHRpbWU6XCJ0aW1lXCIsdGl0bGU6XCJ0aXRsZVwiLHRyOlwidHJcIix0cmFjazpcInRyYWNrXCIsdTpcInVcIix1bDpcInVsXCIsXCJ2YXJcIjpcInZhclwiLHZpZGVvOlwidmlkZW9cIix3YnI6XCJ3YnJcIixjaXJjbGU6XCJjaXJjbGVcIixkZWZzOlwiZGVmc1wiLGVsbGlwc2U6XCJlbGxpcHNlXCIsZzpcImdcIixsaW5lOlwibGluZVwiLGxpbmVhckdyYWRpZW50OlwibGluZWFyR3JhZGllbnRcIixtYXNrOlwibWFza1wiLHBhdGg6XCJwYXRoXCIscGF0dGVybjpcInBhdHRlcm5cIixwb2x5Z29uOlwicG9seWdvblwiLHBvbHlsaW5lOlwicG9seWxpbmVcIixyYWRpYWxHcmFkaWVudDpcInJhZGlhbEdyYWRpZW50XCIscmVjdDpcInJlY3RcIixzdG9wOlwic3RvcFwiLHN2ZzpcInN2Z1wiLHRleHQ6XCJ0ZXh0XCIsdHNwYW46XCJ0c3BhblwifSxuKTt0LmV4cG9ydHM9YX0se1wiLi9SZWFjdEVsZW1lbnRcIjo1NixcIi4vUmVhY3RFbGVtZW50VmFsaWRhdG9yXCI6NTcsXCIuL1JlYWN0TGVnYWN5RWxlbWVudFwiOjY1LFwiLi9tYXBPYmplY3RcIjoxNDV9XSw0NDpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbj1lKFwiLi9BdXRvRm9jdXNNaXhpblwiKSxyPWUoXCIuL1JlYWN0QnJvd3NlckNvbXBvbmVudE1peGluXCIpLG89ZShcIi4vUmVhY3RDb21wb3NpdGVDb21wb25lbnRcIiksaT1lKFwiLi9SZWFjdEVsZW1lbnRcIiksYT1lKFwiLi9SZWFjdERPTVwiKSxzPWUoXCIuL2tleU1pcnJvclwiKSx1PWkuY3JlYXRlRmFjdG9yeShhLmJ1dHRvbi50eXBlKSxjPXMoe29uQ2xpY2s6ITAsb25Eb3VibGVDbGljazohMCxvbk1vdXNlRG93bjohMCxvbk1vdXNlTW92ZTohMCxvbk1vdXNlVXA6ITAsb25DbGlja0NhcHR1cmU6ITAsb25Eb3VibGVDbGlja0NhcHR1cmU6ITAsb25Nb3VzZURvd25DYXB0dXJlOiEwLG9uTW91c2VNb3ZlQ2FwdHVyZTohMCxvbk1vdXNlVXBDYXB0dXJlOiEwfSksbD1vLmNyZWF0ZUNsYXNzKHtkaXNwbGF5TmFtZTpcIlJlYWN0RE9NQnV0dG9uXCIsbWl4aW5zOltuLHJdLHJlbmRlcjpmdW5jdGlvbigpe3ZhciBlPXt9O2Zvcih2YXIgdCBpbiB0aGlzLnByb3BzKSF0aGlzLnByb3BzLmhhc093blByb3BlcnR5KHQpfHx0aGlzLnByb3BzLmRpc2FibGVkJiZjW3RdfHwoZVt0XT10aGlzLnByb3BzW3RdKTtyZXR1cm4gdShlLHRoaXMucHJvcHMuY2hpbGRyZW4pfX0pO3QuZXhwb3J0cz1sfSx7XCIuL0F1dG9Gb2N1c01peGluXCI6MixcIi4vUmVhY3RCcm93c2VyQ29tcG9uZW50TWl4aW5cIjozMixcIi4vUmVhY3RDb21wb3NpdGVDb21wb25lbnRcIjo0MCxcIi4vUmVhY3RET01cIjo0MyxcIi4vUmVhY3RFbGVtZW50XCI6NTYsXCIuL2tleU1pcnJvclwiOjE0M31dLDQ1OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSl7ZSYmKHkobnVsbD09ZS5jaGlsZHJlbnx8bnVsbD09ZS5kYW5nZXJvdXNseVNldElubmVySFRNTCkseShudWxsPT1lLnN0eWxlfHxcIm9iamVjdFwiPT10eXBlb2YgZS5zdHlsZSkpfWZ1bmN0aW9uIHIoZSx0LG4scil7dmFyIG89ZC5maW5kUmVhY3RDb250YWluZXJGb3JJRChlKTtpZihvKXt2YXIgaT1vLm5vZGVUeXBlPT09Tz9vLm93bmVyRG9jdW1lbnQ6bztDKHQsaSl9ci5nZXRQdXRMaXN0ZW5lclF1ZXVlKCkuZW5xdWV1ZVB1dExpc3RlbmVyKGUsdCxuKX1mdW5jdGlvbiBvKGUpe1QuY2FsbChQLGUpfHwoeSh4LnRlc3QoZSkpLFBbZV09ITApfWZ1bmN0aW9uIGkoZSl7byhlKSx0aGlzLl90YWc9ZSx0aGlzLnRhZ05hbWU9ZS50b1VwcGVyQ2FzZSgpfXZhciBhPWUoXCIuL0NTU1Byb3BlcnR5T3BlcmF0aW9uc1wiKSxzPWUoXCIuL0RPTVByb3BlcnR5XCIpLHU9ZShcIi4vRE9NUHJvcGVydHlPcGVyYXRpb25zXCIpLGM9ZShcIi4vUmVhY3RCcm93c2VyQ29tcG9uZW50TWl4aW5cIiksbD1lKFwiLi9SZWFjdENvbXBvbmVudFwiKSxwPWUoXCIuL1JlYWN0QnJvd3NlckV2ZW50RW1pdHRlclwiKSxkPWUoXCIuL1JlYWN0TW91bnRcIiksZj1lKFwiLi9SZWFjdE11bHRpQ2hpbGRcIiksaD1lKFwiLi9SZWFjdFBlcmZcIiksbT1lKFwiLi9PYmplY3QuYXNzaWduXCIpLHY9ZShcIi4vZXNjYXBlVGV4dEZvckJyb3dzZXJcIikseT1lKFwiLi9pbnZhcmlhbnRcIiksZz0oZShcIi4vaXNFdmVudFN1cHBvcnRlZFwiKSxlKFwiLi9rZXlPZlwiKSksRT0oZShcIi4vbW9uaXRvckNvZGVVc2VcIikscC5kZWxldGVMaXN0ZW5lciksQz1wLmxpc3RlblRvLFI9cC5yZWdpc3RyYXRpb25OYW1lTW9kdWxlcyxNPXtzdHJpbmc6ITAsbnVtYmVyOiEwfSxiPWcoe3N0eWxlOm51bGx9KSxPPTEsRD17YXJlYTohMCxiYXNlOiEwLGJyOiEwLGNvbDohMCxlbWJlZDohMCxocjohMCxpbWc6ITAsaW5wdXQ6ITAsa2V5Z2VuOiEwLGxpbms6ITAsbWV0YTohMCxwYXJhbTohMCxzb3VyY2U6ITAsdHJhY2s6ITAsd2JyOiEwfSx4PS9eW2EtekEtWl1bYS16QS1aOl9cXC5cXC1cXGRdKiQvLFA9e30sVD17fS5oYXNPd25Qcm9wZXJ0eTtpLmRpc3BsYXlOYW1lPVwiUmVhY3RET01Db21wb25lbnRcIixpLk1peGluPXttb3VudENvbXBvbmVudDpoLm1lYXN1cmUoXCJSZWFjdERPTUNvbXBvbmVudFwiLFwibW91bnRDb21wb25lbnRcIixmdW5jdGlvbihlLHQscil7bC5NaXhpbi5tb3VudENvbXBvbmVudC5jYWxsKHRoaXMsZSx0LHIpLG4odGhpcy5wcm9wcyk7dmFyIG89RFt0aGlzLl90YWddP1wiXCI6XCI8L1wiK3RoaXMuX3RhZytcIj5cIjtyZXR1cm4gdGhpcy5fY3JlYXRlT3BlblRhZ01hcmt1cEFuZFB1dExpc3RlbmVycyh0KSt0aGlzLl9jcmVhdGVDb250ZW50TWFya3VwKHQpK299KSxfY3JlYXRlT3BlblRhZ01hcmt1cEFuZFB1dExpc3RlbmVyczpmdW5jdGlvbihlKXt2YXIgdD10aGlzLnByb3BzLG49XCI8XCIrdGhpcy5fdGFnO2Zvcih2YXIgbyBpbiB0KWlmKHQuaGFzT3duUHJvcGVydHkobykpe3ZhciBpPXRbb107aWYobnVsbCE9aSlpZihSLmhhc093blByb3BlcnR5KG8pKXIodGhpcy5fcm9vdE5vZGVJRCxvLGksZSk7ZWxzZXtvPT09YiYmKGkmJihpPXQuc3R5bGU9bSh7fSx0LnN0eWxlKSksaT1hLmNyZWF0ZU1hcmt1cEZvclN0eWxlcyhpKSk7dmFyIHM9dS5jcmVhdGVNYXJrdXBGb3JQcm9wZXJ0eShvLGkpO3MmJihuKz1cIiBcIitzKX19aWYoZS5yZW5kZXJUb1N0YXRpY01hcmt1cClyZXR1cm4gbitcIj5cIjt2YXIgYz11LmNyZWF0ZU1hcmt1cEZvcklEKHRoaXMuX3Jvb3ROb2RlSUQpO3JldHVybiBuK1wiIFwiK2MrXCI+XCJ9LF9jcmVhdGVDb250ZW50TWFya3VwOmZ1bmN0aW9uKGUpe3ZhciB0PXRoaXMucHJvcHMuZGFuZ2Vyb3VzbHlTZXRJbm5lckhUTUw7aWYobnVsbCE9dCl7aWYobnVsbCE9dC5fX2h0bWwpcmV0dXJuIHQuX19odG1sfWVsc2V7dmFyIG49TVt0eXBlb2YgdGhpcy5wcm9wcy5jaGlsZHJlbl0/dGhpcy5wcm9wcy5jaGlsZHJlbjpudWxsLHI9bnVsbCE9bj9udWxsOnRoaXMucHJvcHMuY2hpbGRyZW47aWYobnVsbCE9bilyZXR1cm4gdihuKTtpZihudWxsIT1yKXt2YXIgbz10aGlzLm1vdW50Q2hpbGRyZW4ocixlKTtyZXR1cm4gby5qb2luKFwiXCIpfX1yZXR1cm5cIlwifSxyZWNlaXZlQ29tcG9uZW50OmZ1bmN0aW9uKGUsdCl7KGUhPT10aGlzLl9jdXJyZW50RWxlbWVudHx8bnVsbD09ZS5fb3duZXIpJiZsLk1peGluLnJlY2VpdmVDb21wb25lbnQuY2FsbCh0aGlzLGUsdCl9LHVwZGF0ZUNvbXBvbmVudDpoLm1lYXN1cmUoXCJSZWFjdERPTUNvbXBvbmVudFwiLFwidXBkYXRlQ29tcG9uZW50XCIsZnVuY3Rpb24oZSx0KXtuKHRoaXMuX2N1cnJlbnRFbGVtZW50LnByb3BzKSxsLk1peGluLnVwZGF0ZUNvbXBvbmVudC5jYWxsKHRoaXMsZSx0KSx0aGlzLl91cGRhdGVET01Qcm9wZXJ0aWVzKHQucHJvcHMsZSksdGhpcy5fdXBkYXRlRE9NQ2hpbGRyZW4odC5wcm9wcyxlKX0pLF91cGRhdGVET01Qcm9wZXJ0aWVzOmZ1bmN0aW9uKGUsdCl7dmFyIG4sbyxpLGE9dGhpcy5wcm9wcztmb3IobiBpbiBlKWlmKCFhLmhhc093blByb3BlcnR5KG4pJiZlLmhhc093blByb3BlcnR5KG4pKWlmKG49PT1iKXt2YXIgdT1lW25dO2ZvcihvIGluIHUpdS5oYXNPd25Qcm9wZXJ0eShvKSYmKGk9aXx8e30saVtvXT1cIlwiKX1lbHNlIFIuaGFzT3duUHJvcGVydHkobik/RSh0aGlzLl9yb290Tm9kZUlELG4pOihzLmlzU3RhbmRhcmROYW1lW25dfHxzLmlzQ3VzdG9tQXR0cmlidXRlKG4pKSYmbC5CYWNrZW5kSURPcGVyYXRpb25zLmRlbGV0ZVByb3BlcnR5QnlJRCh0aGlzLl9yb290Tm9kZUlELG4pO2ZvcihuIGluIGEpe3ZhciBjPWFbbl0scD1lW25dO2lmKGEuaGFzT3duUHJvcGVydHkobikmJmMhPT1wKWlmKG49PT1iKWlmKGMmJihjPWEuc3R5bGU9bSh7fSxjKSkscCl7Zm9yKG8gaW4gcCkhcC5oYXNPd25Qcm9wZXJ0eShvKXx8YyYmYy5oYXNPd25Qcm9wZXJ0eShvKXx8KGk9aXx8e30saVtvXT1cIlwiKTtmb3IobyBpbiBjKWMuaGFzT3duUHJvcGVydHkobykmJnBbb10hPT1jW29dJiYoaT1pfHx7fSxpW29dPWNbb10pfWVsc2UgaT1jO2Vsc2UgUi5oYXNPd25Qcm9wZXJ0eShuKT9yKHRoaXMuX3Jvb3ROb2RlSUQsbixjLHQpOihzLmlzU3RhbmRhcmROYW1lW25dfHxzLmlzQ3VzdG9tQXR0cmlidXRlKG4pKSYmbC5CYWNrZW5kSURPcGVyYXRpb25zLnVwZGF0ZVByb3BlcnR5QnlJRCh0aGlzLl9yb290Tm9kZUlELG4sYyl9aSYmbC5CYWNrZW5kSURPcGVyYXRpb25zLnVwZGF0ZVN0eWxlc0J5SUQodGhpcy5fcm9vdE5vZGVJRCxpKX0sX3VwZGF0ZURPTUNoaWxkcmVuOmZ1bmN0aW9uKGUsdCl7dmFyIG49dGhpcy5wcm9wcyxyPU1bdHlwZW9mIGUuY2hpbGRyZW5dP2UuY2hpbGRyZW46bnVsbCxvPU1bdHlwZW9mIG4uY2hpbGRyZW5dP24uY2hpbGRyZW46bnVsbCxpPWUuZGFuZ2Vyb3VzbHlTZXRJbm5lckhUTUwmJmUuZGFuZ2Vyb3VzbHlTZXRJbm5lckhUTUwuX19odG1sLGE9bi5kYW5nZXJvdXNseVNldElubmVySFRNTCYmbi5kYW5nZXJvdXNseVNldElubmVySFRNTC5fX2h0bWwscz1udWxsIT1yP251bGw6ZS5jaGlsZHJlbix1PW51bGwhPW8/bnVsbDpuLmNoaWxkcmVuLGM9bnVsbCE9cnx8bnVsbCE9aSxwPW51bGwhPW98fG51bGwhPWE7bnVsbCE9cyYmbnVsbD09dT90aGlzLnVwZGF0ZUNoaWxkcmVuKG51bGwsdCk6YyYmIXAmJnRoaXMudXBkYXRlVGV4dENvbnRlbnQoXCJcIiksbnVsbCE9bz9yIT09byYmdGhpcy51cGRhdGVUZXh0Q29udGVudChcIlwiK28pOm51bGwhPWE/aSE9PWEmJmwuQmFja2VuZElET3BlcmF0aW9ucy51cGRhdGVJbm5lckhUTUxCeUlEKHRoaXMuX3Jvb3ROb2RlSUQsYSk6bnVsbCE9dSYmdGhpcy51cGRhdGVDaGlsZHJlbih1LHQpfSx1bm1vdW50Q29tcG9uZW50OmZ1bmN0aW9uKCl7dGhpcy51bm1vdW50Q2hpbGRyZW4oKSxwLmRlbGV0ZUFsbExpc3RlbmVycyh0aGlzLl9yb290Tm9kZUlEKSxsLk1peGluLnVubW91bnRDb21wb25lbnQuY2FsbCh0aGlzKX19LG0oaS5wcm90b3R5cGUsbC5NaXhpbixpLk1peGluLGYuTWl4aW4sYyksdC5leHBvcnRzPWl9LHtcIi4vQ1NTUHJvcGVydHlPcGVyYXRpb25zXCI6NixcIi4vRE9NUHJvcGVydHlcIjoxMixcIi4vRE9NUHJvcGVydHlPcGVyYXRpb25zXCI6MTMsXCIuL09iamVjdC5hc3NpZ25cIjoyOSxcIi4vUmVhY3RCcm93c2VyQ29tcG9uZW50TWl4aW5cIjozMixcIi4vUmVhY3RCcm93c2VyRXZlbnRFbWl0dGVyXCI6MzMsXCIuL1JlYWN0Q29tcG9uZW50XCI6MzcsXCIuL1JlYWN0TW91bnRcIjo2OCxcIi4vUmVhY3RNdWx0aUNoaWxkXCI6NjksXCIuL1JlYWN0UGVyZlwiOjczLFwiLi9lc2NhcGVUZXh0Rm9yQnJvd3NlclwiOjEyMCxcIi4vaW52YXJpYW50XCI6MTM3LFwiLi9pc0V2ZW50U3VwcG9ydGVkXCI6MTM4LFwiLi9rZXlPZlwiOjE0NCxcIi4vbW9uaXRvckNvZGVVc2VcIjoxNDd9XSw0NjpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbj1lKFwiLi9FdmVudENvbnN0YW50c1wiKSxyPWUoXCIuL0xvY2FsRXZlbnRUcmFwTWl4aW5cIiksbz1lKFwiLi9SZWFjdEJyb3dzZXJDb21wb25lbnRNaXhpblwiKSxpPWUoXCIuL1JlYWN0Q29tcG9zaXRlQ29tcG9uZW50XCIpLGE9ZShcIi4vUmVhY3RFbGVtZW50XCIpLHM9ZShcIi4vUmVhY3RET01cIiksdT1hLmNyZWF0ZUZhY3Rvcnkocy5mb3JtLnR5cGUpLGM9aS5jcmVhdGVDbGFzcyh7ZGlzcGxheU5hbWU6XCJSZWFjdERPTUZvcm1cIixtaXhpbnM6W28scl0scmVuZGVyOmZ1bmN0aW9uKCl7cmV0dXJuIHUodGhpcy5wcm9wcyl9LGNvbXBvbmVudERpZE1vdW50OmZ1bmN0aW9uKCl7dGhpcy50cmFwQnViYmxlZEV2ZW50KG4udG9wTGV2ZWxUeXBlcy50b3BSZXNldCxcInJlc2V0XCIpLHRoaXMudHJhcEJ1YmJsZWRFdmVudChuLnRvcExldmVsVHlwZXMudG9wU3VibWl0LFwic3VibWl0XCIpfX0pO3QuZXhwb3J0cz1jfSx7XCIuL0V2ZW50Q29uc3RhbnRzXCI6MTcsXCIuL0xvY2FsRXZlbnRUcmFwTWl4aW5cIjoyNyxcIi4vUmVhY3RCcm93c2VyQ29tcG9uZW50TWl4aW5cIjozMixcIi4vUmVhY3RDb21wb3NpdGVDb21wb25lbnRcIjo0MCxcIi4vUmVhY3RET01cIjo0MyxcIi4vUmVhY3RFbGVtZW50XCI6NTZ9XSw0NzpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbj1lKFwiLi9DU1NQcm9wZXJ0eU9wZXJhdGlvbnNcIikscj1lKFwiLi9ET01DaGlsZHJlbk9wZXJhdGlvbnNcIiksbz1lKFwiLi9ET01Qcm9wZXJ0eU9wZXJhdGlvbnNcIiksaT1lKFwiLi9SZWFjdE1vdW50XCIpLGE9ZShcIi4vUmVhY3RQZXJmXCIpLHM9ZShcIi4vaW52YXJpYW50XCIpLHU9ZShcIi4vc2V0SW5uZXJIVE1MXCIpLGM9e2Rhbmdlcm91c2x5U2V0SW5uZXJIVE1MOlwiYGRhbmdlcm91c2x5U2V0SW5uZXJIVE1MYCBtdXN0IGJlIHNldCB1c2luZyBgdXBkYXRlSW5uZXJIVE1MQnlJRCgpYC5cIixzdHlsZTpcImBzdHlsZWAgbXVzdCBiZSBzZXQgdXNpbmcgYHVwZGF0ZVN0eWxlc0J5SUQoKWAuXCJ9LGw9e3VwZGF0ZVByb3BlcnR5QnlJRDphLm1lYXN1cmUoXCJSZWFjdERPTUlET3BlcmF0aW9uc1wiLFwidXBkYXRlUHJvcGVydHlCeUlEXCIsZnVuY3Rpb24oZSx0LG4pe3ZhciByPWkuZ2V0Tm9kZShlKTtzKCFjLmhhc093blByb3BlcnR5KHQpKSxudWxsIT1uP28uc2V0VmFsdWVGb3JQcm9wZXJ0eShyLHQsbik6by5kZWxldGVWYWx1ZUZvclByb3BlcnR5KHIsdCl9KSxkZWxldGVQcm9wZXJ0eUJ5SUQ6YS5tZWFzdXJlKFwiUmVhY3RET01JRE9wZXJhdGlvbnNcIixcImRlbGV0ZVByb3BlcnR5QnlJRFwiLGZ1bmN0aW9uKGUsdCxuKXt2YXIgcj1pLmdldE5vZGUoZSk7cyghYy5oYXNPd25Qcm9wZXJ0eSh0KSksby5kZWxldGVWYWx1ZUZvclByb3BlcnR5KHIsdCxuKX0pLHVwZGF0ZVN0eWxlc0J5SUQ6YS5tZWFzdXJlKFwiUmVhY3RET01JRE9wZXJhdGlvbnNcIixcInVwZGF0ZVN0eWxlc0J5SURcIixmdW5jdGlvbihlLHQpe3ZhciByPWkuZ2V0Tm9kZShlKTtuLnNldFZhbHVlRm9yU3R5bGVzKHIsdCl9KSx1cGRhdGVJbm5lckhUTUxCeUlEOmEubWVhc3VyZShcIlJlYWN0RE9NSURPcGVyYXRpb25zXCIsXCJ1cGRhdGVJbm5lckhUTUxCeUlEXCIsZnVuY3Rpb24oZSx0KXt2YXIgbj1pLmdldE5vZGUoZSk7dShuLHQpfSksdXBkYXRlVGV4dENvbnRlbnRCeUlEOmEubWVhc3VyZShcIlJlYWN0RE9NSURPcGVyYXRpb25zXCIsXCJ1cGRhdGVUZXh0Q29udGVudEJ5SURcIixmdW5jdGlvbihlLHQpe3ZhciBuPWkuZ2V0Tm9kZShlKTtyLnVwZGF0ZVRleHRDb250ZW50KG4sdCl9KSxkYW5nZXJvdXNseVJlcGxhY2VOb2RlV2l0aE1hcmt1cEJ5SUQ6YS5tZWFzdXJlKFwiUmVhY3RET01JRE9wZXJhdGlvbnNcIixcImRhbmdlcm91c2x5UmVwbGFjZU5vZGVXaXRoTWFya3VwQnlJRFwiLGZ1bmN0aW9uKGUsdCl7dmFyIG49aS5nZXROb2RlKGUpO3IuZGFuZ2Vyb3VzbHlSZXBsYWNlTm9kZVdpdGhNYXJrdXAobix0KX0pLGRhbmdlcm91c2x5UHJvY2Vzc0NoaWxkcmVuVXBkYXRlczphLm1lYXN1cmUoXCJSZWFjdERPTUlET3BlcmF0aW9uc1wiLFwiZGFuZ2Vyb3VzbHlQcm9jZXNzQ2hpbGRyZW5VcGRhdGVzXCIsZnVuY3Rpb24oZSx0KXtmb3IodmFyIG49MDtuPGUubGVuZ3RoO24rKyllW25dLnBhcmVudE5vZGU9aS5nZXROb2RlKGVbbl0ucGFyZW50SUQpO3IucHJvY2Vzc1VwZGF0ZXMoZSx0KX0pfTt0LmV4cG9ydHM9bH0se1wiLi9DU1NQcm9wZXJ0eU9wZXJhdGlvbnNcIjo2LFwiLi9ET01DaGlsZHJlbk9wZXJhdGlvbnNcIjoxMSxcIi4vRE9NUHJvcGVydHlPcGVyYXRpb25zXCI6MTMsXCIuL1JlYWN0TW91bnRcIjo2OCxcIi4vUmVhY3RQZXJmXCI6NzMsXCIuL2ludmFyaWFudFwiOjEzNyxcIi4vc2V0SW5uZXJIVE1MXCI6MTQ5fV0sNDg6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG49ZShcIi4vRXZlbnRDb25zdGFudHNcIikscj1lKFwiLi9Mb2NhbEV2ZW50VHJhcE1peGluXCIpLG89ZShcIi4vUmVhY3RCcm93c2VyQ29tcG9uZW50TWl4aW5cIiksaT1lKFwiLi9SZWFjdENvbXBvc2l0ZUNvbXBvbmVudFwiKSxhPWUoXCIuL1JlYWN0RWxlbWVudFwiKSxzPWUoXCIuL1JlYWN0RE9NXCIpLHU9YS5jcmVhdGVGYWN0b3J5KHMuaW1nLnR5cGUpLGM9aS5jcmVhdGVDbGFzcyh7ZGlzcGxheU5hbWU6XCJSZWFjdERPTUltZ1wiLHRhZ05hbWU6XCJJTUdcIixtaXhpbnM6W28scl0scmVuZGVyOmZ1bmN0aW9uKCl7cmV0dXJuIHUodGhpcy5wcm9wcyl9LGNvbXBvbmVudERpZE1vdW50OmZ1bmN0aW9uKCl7dGhpcy50cmFwQnViYmxlZEV2ZW50KG4udG9wTGV2ZWxUeXBlcy50b3BMb2FkLFwibG9hZFwiKSx0aGlzLnRyYXBCdWJibGVkRXZlbnQobi50b3BMZXZlbFR5cGVzLnRvcEVycm9yLFwiZXJyb3JcIil9fSk7dC5leHBvcnRzPWN9LHtcIi4vRXZlbnRDb25zdGFudHNcIjoxNyxcIi4vTG9jYWxFdmVudFRyYXBNaXhpblwiOjI3LFwiLi9SZWFjdEJyb3dzZXJDb21wb25lbnRNaXhpblwiOjMyLFwiLi9SZWFjdENvbXBvc2l0ZUNvbXBvbmVudFwiOjQwLFwiLi9SZWFjdERPTVwiOjQzLFwiLi9SZWFjdEVsZW1lbnRcIjo1Nn1dLDQ5OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oKXt0aGlzLmlzTW91bnRlZCgpJiZ0aGlzLmZvcmNlVXBkYXRlKCl9dmFyIHI9ZShcIi4vQXV0b0ZvY3VzTWl4aW5cIiksbz1lKFwiLi9ET01Qcm9wZXJ0eU9wZXJhdGlvbnNcIiksaT1lKFwiLi9MaW5rZWRWYWx1ZVV0aWxzXCIpLGE9ZShcIi4vUmVhY3RCcm93c2VyQ29tcG9uZW50TWl4aW5cIikscz1lKFwiLi9SZWFjdENvbXBvc2l0ZUNvbXBvbmVudFwiKSx1PWUoXCIuL1JlYWN0RWxlbWVudFwiKSxjPWUoXCIuL1JlYWN0RE9NXCIpLGw9ZShcIi4vUmVhY3RNb3VudFwiKSxwPWUoXCIuL1JlYWN0VXBkYXRlc1wiKSxkPWUoXCIuL09iamVjdC5hc3NpZ25cIiksZj1lKFwiLi9pbnZhcmlhbnRcIiksaD11LmNyZWF0ZUZhY3RvcnkoYy5pbnB1dC50eXBlKSxtPXt9LHY9cy5jcmVhdGVDbGFzcyh7ZGlzcGxheU5hbWU6XCJSZWFjdERPTUlucHV0XCIsbWl4aW5zOltyLGkuTWl4aW4sYV0sZ2V0SW5pdGlhbFN0YXRlOmZ1bmN0aW9uKCl7dmFyIGU9dGhpcy5wcm9wcy5kZWZhdWx0VmFsdWU7XG5yZXR1cm57aW5pdGlhbENoZWNrZWQ6dGhpcy5wcm9wcy5kZWZhdWx0Q2hlY2tlZHx8ITEsaW5pdGlhbFZhbHVlOm51bGwhPWU/ZTpudWxsfX0scmVuZGVyOmZ1bmN0aW9uKCl7dmFyIGU9ZCh7fSx0aGlzLnByb3BzKTtlLmRlZmF1bHRDaGVja2VkPW51bGwsZS5kZWZhdWx0VmFsdWU9bnVsbDt2YXIgdD1pLmdldFZhbHVlKHRoaXMpO2UudmFsdWU9bnVsbCE9dD90OnRoaXMuc3RhdGUuaW5pdGlhbFZhbHVlO3ZhciBuPWkuZ2V0Q2hlY2tlZCh0aGlzKTtyZXR1cm4gZS5jaGVja2VkPW51bGwhPW4/bjp0aGlzLnN0YXRlLmluaXRpYWxDaGVja2VkLGUub25DaGFuZ2U9dGhpcy5faGFuZGxlQ2hhbmdlLGgoZSx0aGlzLnByb3BzLmNoaWxkcmVuKX0sY29tcG9uZW50RGlkTW91bnQ6ZnVuY3Rpb24oKXt2YXIgZT1sLmdldElEKHRoaXMuZ2V0RE9NTm9kZSgpKTttW2VdPXRoaXN9LGNvbXBvbmVudFdpbGxVbm1vdW50OmZ1bmN0aW9uKCl7dmFyIGU9dGhpcy5nZXRET01Ob2RlKCksdD1sLmdldElEKGUpO2RlbGV0ZSBtW3RdfSxjb21wb25lbnREaWRVcGRhdGU6ZnVuY3Rpb24oKXt2YXIgZT10aGlzLmdldERPTU5vZGUoKTtudWxsIT10aGlzLnByb3BzLmNoZWNrZWQmJm8uc2V0VmFsdWVGb3JQcm9wZXJ0eShlLFwiY2hlY2tlZFwiLHRoaXMucHJvcHMuY2hlY2tlZHx8ITEpO3ZhciB0PWkuZ2V0VmFsdWUodGhpcyk7bnVsbCE9dCYmby5zZXRWYWx1ZUZvclByb3BlcnR5KGUsXCJ2YWx1ZVwiLFwiXCIrdCl9LF9oYW5kbGVDaGFuZ2U6ZnVuY3Rpb24oZSl7dmFyIHQscj1pLmdldE9uQ2hhbmdlKHRoaXMpO3ImJih0PXIuY2FsbCh0aGlzLGUpKSxwLmFzYXAobix0aGlzKTt2YXIgbz10aGlzLnByb3BzLm5hbWU7aWYoXCJyYWRpb1wiPT09dGhpcy5wcm9wcy50eXBlJiZudWxsIT1vKXtmb3IodmFyIGE9dGhpcy5nZXRET01Ob2RlKCkscz1hO3MucGFyZW50Tm9kZTspcz1zLnBhcmVudE5vZGU7Zm9yKHZhciB1PXMucXVlcnlTZWxlY3RvckFsbChcImlucHV0W25hbWU9XCIrSlNPTi5zdHJpbmdpZnkoXCJcIitvKSsnXVt0eXBlPVwicmFkaW9cIl0nKSxjPTAsZD11Lmxlbmd0aDtkPmM7YysrKXt2YXIgaD11W2NdO2lmKGghPT1hJiZoLmZvcm09PT1hLmZvcm0pe3ZhciB2PWwuZ2V0SUQoaCk7Zih2KTt2YXIgeT1tW3ZdO2YoeSkscC5hc2FwKG4seSl9fX1yZXR1cm4gdH19KTt0LmV4cG9ydHM9dn0se1wiLi9BdXRvRm9jdXNNaXhpblwiOjIsXCIuL0RPTVByb3BlcnR5T3BlcmF0aW9uc1wiOjEzLFwiLi9MaW5rZWRWYWx1ZVV0aWxzXCI6MjYsXCIuL09iamVjdC5hc3NpZ25cIjoyOSxcIi4vUmVhY3RCcm93c2VyQ29tcG9uZW50TWl4aW5cIjozMixcIi4vUmVhY3RDb21wb3NpdGVDb21wb25lbnRcIjo0MCxcIi4vUmVhY3RET01cIjo0MyxcIi4vUmVhY3RFbGVtZW50XCI6NTYsXCIuL1JlYWN0TW91bnRcIjo2OCxcIi4vUmVhY3RVcGRhdGVzXCI6ODgsXCIuL2ludmFyaWFudFwiOjEzN31dLDUwOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPWUoXCIuL1JlYWN0QnJvd3NlckNvbXBvbmVudE1peGluXCIpLHI9ZShcIi4vUmVhY3RDb21wb3NpdGVDb21wb25lbnRcIiksbz1lKFwiLi9SZWFjdEVsZW1lbnRcIiksaT1lKFwiLi9SZWFjdERPTVwiKSxhPShlKFwiLi93YXJuaW5nXCIpLG8uY3JlYXRlRmFjdG9yeShpLm9wdGlvbi50eXBlKSkscz1yLmNyZWF0ZUNsYXNzKHtkaXNwbGF5TmFtZTpcIlJlYWN0RE9NT3B0aW9uXCIsbWl4aW5zOltuXSxjb21wb25lbnRXaWxsTW91bnQ6ZnVuY3Rpb24oKXt9LHJlbmRlcjpmdW5jdGlvbigpe3JldHVybiBhKHRoaXMucHJvcHMsdGhpcy5wcm9wcy5jaGlsZHJlbil9fSk7dC5leHBvcnRzPXN9LHtcIi4vUmVhY3RCcm93c2VyQ29tcG9uZW50TWl4aW5cIjozMixcIi4vUmVhY3RDb21wb3NpdGVDb21wb25lbnRcIjo0MCxcIi4vUmVhY3RET01cIjo0MyxcIi4vUmVhY3RFbGVtZW50XCI6NTYsXCIuL3dhcm5pbmdcIjoxNTV9XSw1MTpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKCl7dGhpcy5pc01vdW50ZWQoKSYmKHRoaXMuc2V0U3RhdGUoe3ZhbHVlOnRoaXMuX3BlbmRpbmdWYWx1ZX0pLHRoaXMuX3BlbmRpbmdWYWx1ZT0wKX1mdW5jdGlvbiByKGUsdCl7aWYobnVsbCE9ZVt0XSlpZihlLm11bHRpcGxlKXtpZighQXJyYXkuaXNBcnJheShlW3RdKSlyZXR1cm4gbmV3IEVycm9yKFwiVGhlIGBcIit0K1wiYCBwcm9wIHN1cHBsaWVkIHRvIDxzZWxlY3Q+IG11c3QgYmUgYW4gYXJyYXkgaWYgYG11bHRpcGxlYCBpcyB0cnVlLlwiKX1lbHNlIGlmKEFycmF5LmlzQXJyYXkoZVt0XSkpcmV0dXJuIG5ldyBFcnJvcihcIlRoZSBgXCIrdCtcImAgcHJvcCBzdXBwbGllZCB0byA8c2VsZWN0PiBtdXN0IGJlIGEgc2NhbGFyIHZhbHVlIGlmIGBtdWx0aXBsZWAgaXMgZmFsc2UuXCIpfWZ1bmN0aW9uIG8oZSx0KXt2YXIgbixyLG8saT1lLnByb3BzLm11bHRpcGxlLGE9bnVsbCE9dD90OmUuc3RhdGUudmFsdWUscz1lLmdldERPTU5vZGUoKS5vcHRpb25zO2lmKGkpZm9yKG49e30scj0wLG89YS5sZW5ndGg7bz5yOysrciluW1wiXCIrYVtyXV09ITA7ZWxzZSBuPVwiXCIrYTtmb3Iocj0wLG89cy5sZW5ndGg7bz5yO3IrKyl7dmFyIHU9aT9uLmhhc093blByb3BlcnR5KHNbcl0udmFsdWUpOnNbcl0udmFsdWU9PT1uO3UhPT1zW3JdLnNlbGVjdGVkJiYoc1tyXS5zZWxlY3RlZD11KX19dmFyIGk9ZShcIi4vQXV0b0ZvY3VzTWl4aW5cIiksYT1lKFwiLi9MaW5rZWRWYWx1ZVV0aWxzXCIpLHM9ZShcIi4vUmVhY3RCcm93c2VyQ29tcG9uZW50TWl4aW5cIiksdT1lKFwiLi9SZWFjdENvbXBvc2l0ZUNvbXBvbmVudFwiKSxjPWUoXCIuL1JlYWN0RWxlbWVudFwiKSxsPWUoXCIuL1JlYWN0RE9NXCIpLHA9ZShcIi4vUmVhY3RVcGRhdGVzXCIpLGQ9ZShcIi4vT2JqZWN0LmFzc2lnblwiKSxmPWMuY3JlYXRlRmFjdG9yeShsLnNlbGVjdC50eXBlKSxoPXUuY3JlYXRlQ2xhc3Moe2Rpc3BsYXlOYW1lOlwiUmVhY3RET01TZWxlY3RcIixtaXhpbnM6W2ksYS5NaXhpbixzXSxwcm9wVHlwZXM6e2RlZmF1bHRWYWx1ZTpyLHZhbHVlOnJ9LGdldEluaXRpYWxTdGF0ZTpmdW5jdGlvbigpe3JldHVybnt2YWx1ZTp0aGlzLnByb3BzLmRlZmF1bHRWYWx1ZXx8KHRoaXMucHJvcHMubXVsdGlwbGU/W106XCJcIil9fSxjb21wb25lbnRXaWxsTW91bnQ6ZnVuY3Rpb24oKXt0aGlzLl9wZW5kaW5nVmFsdWU9bnVsbH0sY29tcG9uZW50V2lsbFJlY2VpdmVQcm9wczpmdW5jdGlvbihlKXshdGhpcy5wcm9wcy5tdWx0aXBsZSYmZS5tdWx0aXBsZT90aGlzLnNldFN0YXRlKHt2YWx1ZTpbdGhpcy5zdGF0ZS52YWx1ZV19KTp0aGlzLnByb3BzLm11bHRpcGxlJiYhZS5tdWx0aXBsZSYmdGhpcy5zZXRTdGF0ZSh7dmFsdWU6dGhpcy5zdGF0ZS52YWx1ZVswXX0pfSxyZW5kZXI6ZnVuY3Rpb24oKXt2YXIgZT1kKHt9LHRoaXMucHJvcHMpO3JldHVybiBlLm9uQ2hhbmdlPXRoaXMuX2hhbmRsZUNoYW5nZSxlLnZhbHVlPW51bGwsZihlLHRoaXMucHJvcHMuY2hpbGRyZW4pfSxjb21wb25lbnREaWRNb3VudDpmdW5jdGlvbigpe28odGhpcyxhLmdldFZhbHVlKHRoaXMpKX0sY29tcG9uZW50RGlkVXBkYXRlOmZ1bmN0aW9uKGUpe3ZhciB0PWEuZ2V0VmFsdWUodGhpcyksbj0hIWUubXVsdGlwbGUscj0hIXRoaXMucHJvcHMubXVsdGlwbGU7KG51bGwhPXR8fG4hPT1yKSYmbyh0aGlzLHQpfSxfaGFuZGxlQ2hhbmdlOmZ1bmN0aW9uKGUpe3ZhciB0LHI9YS5nZXRPbkNoYW5nZSh0aGlzKTtyJiYodD1yLmNhbGwodGhpcyxlKSk7dmFyIG87aWYodGhpcy5wcm9wcy5tdWx0aXBsZSl7bz1bXTtmb3IodmFyIGk9ZS50YXJnZXQub3B0aW9ucyxzPTAsdT1pLmxlbmd0aDt1PnM7cysrKWlbc10uc2VsZWN0ZWQmJm8ucHVzaChpW3NdLnZhbHVlKX1lbHNlIG89ZS50YXJnZXQudmFsdWU7cmV0dXJuIHRoaXMuX3BlbmRpbmdWYWx1ZT1vLHAuYXNhcChuLHRoaXMpLHR9fSk7dC5leHBvcnRzPWh9LHtcIi4vQXV0b0ZvY3VzTWl4aW5cIjoyLFwiLi9MaW5rZWRWYWx1ZVV0aWxzXCI6MjYsXCIuL09iamVjdC5hc3NpZ25cIjoyOSxcIi4vUmVhY3RCcm93c2VyQ29tcG9uZW50TWl4aW5cIjozMixcIi4vUmVhY3RDb21wb3NpdGVDb21wb25lbnRcIjo0MCxcIi4vUmVhY3RET01cIjo0MyxcIi4vUmVhY3RFbGVtZW50XCI6NTYsXCIuL1JlYWN0VXBkYXRlc1wiOjg4fV0sNTI6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlLHQsbixyKXtyZXR1cm4gZT09PW4mJnQ9PT1yfWZ1bmN0aW9uIHIoZSl7dmFyIHQ9ZG9jdW1lbnQuc2VsZWN0aW9uLG49dC5jcmVhdGVSYW5nZSgpLHI9bi50ZXh0Lmxlbmd0aCxvPW4uZHVwbGljYXRlKCk7by5tb3ZlVG9FbGVtZW50VGV4dChlKSxvLnNldEVuZFBvaW50KFwiRW5kVG9TdGFydFwiLG4pO3ZhciBpPW8udGV4dC5sZW5ndGgsYT1pK3I7cmV0dXJue3N0YXJ0OmksZW5kOmF9fWZ1bmN0aW9uIG8oZSl7dmFyIHQ9d2luZG93LmdldFNlbGVjdGlvbiYmd2luZG93LmdldFNlbGVjdGlvbigpO2lmKCF0fHwwPT09dC5yYW5nZUNvdW50KXJldHVybiBudWxsO3ZhciByPXQuYW5jaG9yTm9kZSxvPXQuYW5jaG9yT2Zmc2V0LGk9dC5mb2N1c05vZGUsYT10LmZvY3VzT2Zmc2V0LHM9dC5nZXRSYW5nZUF0KDApLHU9bih0LmFuY2hvck5vZGUsdC5hbmNob3JPZmZzZXQsdC5mb2N1c05vZGUsdC5mb2N1c09mZnNldCksYz11PzA6cy50b1N0cmluZygpLmxlbmd0aCxsPXMuY2xvbmVSYW5nZSgpO2wuc2VsZWN0Tm9kZUNvbnRlbnRzKGUpLGwuc2V0RW5kKHMuc3RhcnRDb250YWluZXIscy5zdGFydE9mZnNldCk7dmFyIHA9bihsLnN0YXJ0Q29udGFpbmVyLGwuc3RhcnRPZmZzZXQsbC5lbmRDb250YWluZXIsbC5lbmRPZmZzZXQpLGQ9cD8wOmwudG9TdHJpbmcoKS5sZW5ndGgsZj1kK2MsaD1kb2N1bWVudC5jcmVhdGVSYW5nZSgpO2guc2V0U3RhcnQocixvKSxoLnNldEVuZChpLGEpO3ZhciBtPWguY29sbGFwc2VkO3JldHVybntzdGFydDptP2Y6ZCxlbmQ6bT9kOmZ9fWZ1bmN0aW9uIGkoZSx0KXt2YXIgbixyLG89ZG9jdW1lbnQuc2VsZWN0aW9uLmNyZWF0ZVJhbmdlKCkuZHVwbGljYXRlKCk7XCJ1bmRlZmluZWRcIj09dHlwZW9mIHQuZW5kPyhuPXQuc3RhcnQscj1uKTp0LnN0YXJ0PnQuZW5kPyhuPXQuZW5kLHI9dC5zdGFydCk6KG49dC5zdGFydCxyPXQuZW5kKSxvLm1vdmVUb0VsZW1lbnRUZXh0KGUpLG8ubW92ZVN0YXJ0KFwiY2hhcmFjdGVyXCIsbiksby5zZXRFbmRQb2ludChcIkVuZFRvU3RhcnRcIixvKSxvLm1vdmVFbmQoXCJjaGFyYWN0ZXJcIixyLW4pLG8uc2VsZWN0KCl9ZnVuY3Rpb24gYShlLHQpe2lmKHdpbmRvdy5nZXRTZWxlY3Rpb24pe3ZhciBuPXdpbmRvdy5nZXRTZWxlY3Rpb24oKSxyPWVbYygpXS5sZW5ndGgsbz1NYXRoLm1pbih0LnN0YXJ0LHIpLGk9XCJ1bmRlZmluZWRcIj09dHlwZW9mIHQuZW5kP286TWF0aC5taW4odC5lbmQscik7aWYoIW4uZXh0ZW5kJiZvPmkpe3ZhciBhPWk7aT1vLG89YX12YXIgcz11KGUsbyksbD11KGUsaSk7aWYocyYmbCl7dmFyIHA9ZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtwLnNldFN0YXJ0KHMubm9kZSxzLm9mZnNldCksbi5yZW1vdmVBbGxSYW5nZXMoKSxvPmk/KG4uYWRkUmFuZ2UocCksbi5leHRlbmQobC5ub2RlLGwub2Zmc2V0KSk6KHAuc2V0RW5kKGwubm9kZSxsLm9mZnNldCksbi5hZGRSYW5nZShwKSl9fX12YXIgcz1lKFwiLi9FeGVjdXRpb25FbnZpcm9ubWVudFwiKSx1PWUoXCIuL2dldE5vZGVGb3JDaGFyYWN0ZXJPZmZzZXRcIiksYz1lKFwiLi9nZXRUZXh0Q29udGVudEFjY2Vzc29yXCIpLGw9cy5jYW5Vc2VET00mJmRvY3VtZW50LnNlbGVjdGlvbixwPXtnZXRPZmZzZXRzOmw/cjpvLHNldE9mZnNldHM6bD9pOmF9O3QuZXhwb3J0cz1wfSx7XCIuL0V4ZWN1dGlvbkVudmlyb25tZW50XCI6MjMsXCIuL2dldE5vZGVGb3JDaGFyYWN0ZXJPZmZzZXRcIjoxMzAsXCIuL2dldFRleHRDb250ZW50QWNjZXNzb3JcIjoxMzJ9XSw1MzpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKCl7dGhpcy5pc01vdW50ZWQoKSYmdGhpcy5mb3JjZVVwZGF0ZSgpfXZhciByPWUoXCIuL0F1dG9Gb2N1c01peGluXCIpLG89ZShcIi4vRE9NUHJvcGVydHlPcGVyYXRpb25zXCIpLGk9ZShcIi4vTGlua2VkVmFsdWVVdGlsc1wiKSxhPWUoXCIuL1JlYWN0QnJvd3NlckNvbXBvbmVudE1peGluXCIpLHM9ZShcIi4vUmVhY3RDb21wb3NpdGVDb21wb25lbnRcIiksdT1lKFwiLi9SZWFjdEVsZW1lbnRcIiksYz1lKFwiLi9SZWFjdERPTVwiKSxsPWUoXCIuL1JlYWN0VXBkYXRlc1wiKSxwPWUoXCIuL09iamVjdC5hc3NpZ25cIiksZD1lKFwiLi9pbnZhcmlhbnRcIiksZj0oZShcIi4vd2FybmluZ1wiKSx1LmNyZWF0ZUZhY3RvcnkoYy50ZXh0YXJlYS50eXBlKSksaD1zLmNyZWF0ZUNsYXNzKHtkaXNwbGF5TmFtZTpcIlJlYWN0RE9NVGV4dGFyZWFcIixtaXhpbnM6W3IsaS5NaXhpbixhXSxnZXRJbml0aWFsU3RhdGU6ZnVuY3Rpb24oKXt2YXIgZT10aGlzLnByb3BzLmRlZmF1bHRWYWx1ZSx0PXRoaXMucHJvcHMuY2hpbGRyZW47bnVsbCE9dCYmKGQobnVsbD09ZSksQXJyYXkuaXNBcnJheSh0KSYmKGQodC5sZW5ndGg8PTEpLHQ9dFswXSksZT1cIlwiK3QpLG51bGw9PWUmJihlPVwiXCIpO3ZhciBuPWkuZ2V0VmFsdWUodGhpcyk7cmV0dXJue2luaXRpYWxWYWx1ZTpcIlwiKyhudWxsIT1uP246ZSl9fSxyZW5kZXI6ZnVuY3Rpb24oKXt2YXIgZT1wKHt9LHRoaXMucHJvcHMpO3JldHVybiBkKG51bGw9PWUuZGFuZ2Vyb3VzbHlTZXRJbm5lckhUTUwpLGUuZGVmYXVsdFZhbHVlPW51bGwsZS52YWx1ZT1udWxsLGUub25DaGFuZ2U9dGhpcy5faGFuZGxlQ2hhbmdlLGYoZSx0aGlzLnN0YXRlLmluaXRpYWxWYWx1ZSl9LGNvbXBvbmVudERpZFVwZGF0ZTpmdW5jdGlvbigpe3ZhciBlPWkuZ2V0VmFsdWUodGhpcyk7aWYobnVsbCE9ZSl7dmFyIHQ9dGhpcy5nZXRET01Ob2RlKCk7by5zZXRWYWx1ZUZvclByb3BlcnR5KHQsXCJ2YWx1ZVwiLFwiXCIrZSl9fSxfaGFuZGxlQ2hhbmdlOmZ1bmN0aW9uKGUpe3ZhciB0LHI9aS5nZXRPbkNoYW5nZSh0aGlzKTtyZXR1cm4gciYmKHQ9ci5jYWxsKHRoaXMsZSkpLGwuYXNhcChuLHRoaXMpLHR9fSk7dC5leHBvcnRzPWh9LHtcIi4vQXV0b0ZvY3VzTWl4aW5cIjoyLFwiLi9ET01Qcm9wZXJ0eU9wZXJhdGlvbnNcIjoxMyxcIi4vTGlua2VkVmFsdWVVdGlsc1wiOjI2LFwiLi9PYmplY3QuYXNzaWduXCI6MjksXCIuL1JlYWN0QnJvd3NlckNvbXBvbmVudE1peGluXCI6MzIsXCIuL1JlYWN0Q29tcG9zaXRlQ29tcG9uZW50XCI6NDAsXCIuL1JlYWN0RE9NXCI6NDMsXCIuL1JlYWN0RWxlbWVudFwiOjU2LFwiLi9SZWFjdFVwZGF0ZXNcIjo4OCxcIi4vaW52YXJpYW50XCI6MTM3LFwiLi93YXJuaW5nXCI6MTU1fV0sNTQ6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbigpe3RoaXMucmVpbml0aWFsaXplVHJhbnNhY3Rpb24oKX12YXIgcj1lKFwiLi9SZWFjdFVwZGF0ZXNcIiksbz1lKFwiLi9UcmFuc2FjdGlvblwiKSxpPWUoXCIuL09iamVjdC5hc3NpZ25cIiksYT1lKFwiLi9lbXB0eUZ1bmN0aW9uXCIpLHM9e2luaXRpYWxpemU6YSxjbG9zZTpmdW5jdGlvbigpe3AuaXNCYXRjaGluZ1VwZGF0ZXM9ITF9fSx1PXtpbml0aWFsaXplOmEsY2xvc2U6ci5mbHVzaEJhdGNoZWRVcGRhdGVzLmJpbmQocil9LGM9W3Usc107aShuLnByb3RvdHlwZSxvLk1peGluLHtnZXRUcmFuc2FjdGlvbldyYXBwZXJzOmZ1bmN0aW9uKCl7cmV0dXJuIGN9fSk7dmFyIGw9bmV3IG4scD17aXNCYXRjaGluZ1VwZGF0ZXM6ITEsYmF0Y2hlZFVwZGF0ZXM6ZnVuY3Rpb24oZSx0LG4pe3ZhciByPXAuaXNCYXRjaGluZ1VwZGF0ZXM7cC5pc0JhdGNoaW5nVXBkYXRlcz0hMCxyP2UodCxuKTpsLnBlcmZvcm0oZSxudWxsLHQsbil9fTt0LmV4cG9ydHM9cH0se1wiLi9PYmplY3QuYXNzaWduXCI6MjksXCIuL1JlYWN0VXBkYXRlc1wiOjg4LFwiLi9UcmFuc2FjdGlvblwiOjEwNCxcIi4vZW1wdHlGdW5jdGlvblwiOjExOH1dLDU1OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oKXtPLkV2ZW50RW1pdHRlci5pbmplY3RSZWFjdEV2ZW50TGlzdGVuZXIoYiksTy5FdmVudFBsdWdpbkh1Yi5pbmplY3RFdmVudFBsdWdpbk9yZGVyKHMpLE8uRXZlbnRQbHVnaW5IdWIuaW5qZWN0SW5zdGFuY2VIYW5kbGUoRCksTy5FdmVudFBsdWdpbkh1Yi5pbmplY3RNb3VudCh4KSxPLkV2ZW50UGx1Z2luSHViLmluamVjdEV2ZW50UGx1Z2luc0J5TmFtZSh7U2ltcGxlRXZlbnRQbHVnaW46dyxFbnRlckxlYXZlRXZlbnRQbHVnaW46dSxDaGFuZ2VFdmVudFBsdWdpbjpvLENvbXBvc2l0aW9uRXZlbnRQbHVnaW46YSxNb2JpbGVTYWZhcmlDbGlja0V2ZW50UGx1Z2luOnAsU2VsZWN0RXZlbnRQbHVnaW46UCxCZWZvcmVJbnB1dEV2ZW50UGx1Z2luOnJ9KSxPLk5hdGl2ZUNvbXBvbmVudC5pbmplY3RHZW5lcmljQ29tcG9uZW50Q2xhc3MobSksTy5OYXRpdmVDb21wb25lbnQuaW5qZWN0Q29tcG9uZW50Q2xhc3Nlcyh7YnV0dG9uOnYsZm9ybTp5LGltZzpnLGlucHV0OkUsb3B0aW9uOkMsc2VsZWN0OlIsdGV4dGFyZWE6TSxodG1sOlMoXCJodG1sXCIpLGhlYWQ6UyhcImhlYWRcIiksYm9keTpTKFwiYm9keVwiKX0pLE8uQ29tcG9zaXRlQ29tcG9uZW50LmluamVjdE1peGluKGQpLE8uRE9NUHJvcGVydHkuaW5qZWN0RE9NUHJvcGVydHlDb25maWcobCksTy5ET01Qcm9wZXJ0eS5pbmplY3RET01Qcm9wZXJ0eUNvbmZpZyhfKSxPLkVtcHR5Q29tcG9uZW50LmluamVjdEVtcHR5Q29tcG9uZW50KFwibm9zY3JpcHRcIiksTy5VcGRhdGVzLmluamVjdFJlY29uY2lsZVRyYW5zYWN0aW9uKGYuUmVhY3RSZWNvbmNpbGVUcmFuc2FjdGlvbiksTy5VcGRhdGVzLmluamVjdEJhdGNoaW5nU3RyYXRlZ3koaCksTy5Sb290SW5kZXguaW5qZWN0Q3JlYXRlUmVhY3RSb290SW5kZXgoYy5jYW5Vc2VET00/aS5jcmVhdGVSZWFjdFJvb3RJbmRleDpULmNyZWF0ZVJlYWN0Um9vdEluZGV4KSxPLkNvbXBvbmVudC5pbmplY3RFbnZpcm9ubWVudChmKX12YXIgcj1lKFwiLi9CZWZvcmVJbnB1dEV2ZW50UGx1Z2luXCIpLG89ZShcIi4vQ2hhbmdlRXZlbnRQbHVnaW5cIiksaT1lKFwiLi9DbGllbnRSZWFjdFJvb3RJbmRleFwiKSxhPWUoXCIuL0NvbXBvc2l0aW9uRXZlbnRQbHVnaW5cIikscz1lKFwiLi9EZWZhdWx0RXZlbnRQbHVnaW5PcmRlclwiKSx1PWUoXCIuL0VudGVyTGVhdmVFdmVudFBsdWdpblwiKSxjPWUoXCIuL0V4ZWN1dGlvbkVudmlyb25tZW50XCIpLGw9ZShcIi4vSFRNTERPTVByb3BlcnR5Q29uZmlnXCIpLHA9ZShcIi4vTW9iaWxlU2FmYXJpQ2xpY2tFdmVudFBsdWdpblwiKSxkPWUoXCIuL1JlYWN0QnJvd3NlckNvbXBvbmVudE1peGluXCIpLGY9ZShcIi4vUmVhY3RDb21wb25lbnRCcm93c2VyRW52aXJvbm1lbnRcIiksaD1lKFwiLi9SZWFjdERlZmF1bHRCYXRjaGluZ1N0cmF0ZWd5XCIpLG09ZShcIi4vUmVhY3RET01Db21wb25lbnRcIiksdj1lKFwiLi9SZWFjdERPTUJ1dHRvblwiKSx5PWUoXCIuL1JlYWN0RE9NRm9ybVwiKSxnPWUoXCIuL1JlYWN0RE9NSW1nXCIpLEU9ZShcIi4vUmVhY3RET01JbnB1dFwiKSxDPWUoXCIuL1JlYWN0RE9NT3B0aW9uXCIpLFI9ZShcIi4vUmVhY3RET01TZWxlY3RcIiksTT1lKFwiLi9SZWFjdERPTVRleHRhcmVhXCIpLGI9ZShcIi4vUmVhY3RFdmVudExpc3RlbmVyXCIpLE89ZShcIi4vUmVhY3RJbmplY3Rpb25cIiksRD1lKFwiLi9SZWFjdEluc3RhbmNlSGFuZGxlc1wiKSx4PWUoXCIuL1JlYWN0TW91bnRcIiksUD1lKFwiLi9TZWxlY3RFdmVudFBsdWdpblwiKSxUPWUoXCIuL1NlcnZlclJlYWN0Um9vdEluZGV4XCIpLHc9ZShcIi4vU2ltcGxlRXZlbnRQbHVnaW5cIiksXz1lKFwiLi9TVkdET01Qcm9wZXJ0eUNvbmZpZ1wiKSxTPWUoXCIuL2NyZWF0ZUZ1bGxQYWdlQ29tcG9uZW50XCIpO3QuZXhwb3J0cz17aW5qZWN0Om59fSx7XCIuL0JlZm9yZUlucHV0RXZlbnRQbHVnaW5cIjozLFwiLi9DaGFuZ2VFdmVudFBsdWdpblwiOjgsXCIuL0NsaWVudFJlYWN0Um9vdEluZGV4XCI6OSxcIi4vQ29tcG9zaXRpb25FdmVudFBsdWdpblwiOjEwLFwiLi9EZWZhdWx0RXZlbnRQbHVnaW5PcmRlclwiOjE1LFwiLi9FbnRlckxlYXZlRXZlbnRQbHVnaW5cIjoxNixcIi4vRXhlY3V0aW9uRW52aXJvbm1lbnRcIjoyMyxcIi4vSFRNTERPTVByb3BlcnR5Q29uZmlnXCI6MjQsXCIuL01vYmlsZVNhZmFyaUNsaWNrRXZlbnRQbHVnaW5cIjoyOCxcIi4vUmVhY3RCcm93c2VyQ29tcG9uZW50TWl4aW5cIjozMixcIi4vUmVhY3RDb21wb25lbnRCcm93c2VyRW52aXJvbm1lbnRcIjozOCxcIi4vUmVhY3RET01CdXR0b25cIjo0NCxcIi4vUmVhY3RET01Db21wb25lbnRcIjo0NSxcIi4vUmVhY3RET01Gb3JtXCI6NDYsXCIuL1JlYWN0RE9NSW1nXCI6NDgsXCIuL1JlYWN0RE9NSW5wdXRcIjo0OSxcIi4vUmVhY3RET01PcHRpb25cIjo1MCxcIi4vUmVhY3RET01TZWxlY3RcIjo1MSxcIi4vUmVhY3RET01UZXh0YXJlYVwiOjUzLFwiLi9SZWFjdERlZmF1bHRCYXRjaGluZ1N0cmF0ZWd5XCI6NTQsXCIuL1JlYWN0RXZlbnRMaXN0ZW5lclwiOjYxLFwiLi9SZWFjdEluamVjdGlvblwiOjYyLFwiLi9SZWFjdEluc3RhbmNlSGFuZGxlc1wiOjY0LFwiLi9SZWFjdE1vdW50XCI6NjgsXCIuL1NWR0RPTVByb3BlcnR5Q29uZmlnXCI6ODksXCIuL1NlbGVjdEV2ZW50UGx1Z2luXCI6OTAsXCIuL1NlcnZlclJlYWN0Um9vdEluZGV4XCI6OTEsXCIuL1NpbXBsZUV2ZW50UGx1Z2luXCI6OTIsXCIuL2NyZWF0ZUZ1bGxQYWdlQ29tcG9uZW50XCI6MTEzfV0sNTY6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG49ZShcIi4vUmVhY3RDb250ZXh0XCIpLHI9ZShcIi4vUmVhY3RDdXJyZW50T3duZXJcIiksbz0oZShcIi4vd2FybmluZ1wiKSx7a2V5OiEwLHJlZjohMH0pLGk9ZnVuY3Rpb24oZSx0LG4scixvLGkpe3RoaXMudHlwZT1lLHRoaXMua2V5PXQsdGhpcy5yZWY9bix0aGlzLl9vd25lcj1yLHRoaXMuX2NvbnRleHQ9byx0aGlzLnByb3BzPWl9O2kucHJvdG90eXBlPXtfaXNSZWFjdEVsZW1lbnQ6ITB9LGkuY3JlYXRlRWxlbWVudD1mdW5jdGlvbihlLHQsYSl7dmFyIHMsdT17fSxjPW51bGwsbD1udWxsO2lmKG51bGwhPXQpe2w9dm9pZCAwPT09dC5yZWY/bnVsbDp0LnJlZixjPW51bGw9PXQua2V5P251bGw6XCJcIit0LmtleTtmb3IocyBpbiB0KXQuaGFzT3duUHJvcGVydHkocykmJiFvLmhhc093blByb3BlcnR5KHMpJiYodVtzXT10W3NdKX12YXIgcD1hcmd1bWVudHMubGVuZ3RoLTI7aWYoMT09PXApdS5jaGlsZHJlbj1hO2Vsc2UgaWYocD4xKXtmb3IodmFyIGQ9QXJyYXkocCksZj0wO3A+ZjtmKyspZFtmXT1hcmd1bWVudHNbZisyXTt1LmNoaWxkcmVuPWR9aWYoZSYmZS5kZWZhdWx0UHJvcHMpe3ZhciBoPWUuZGVmYXVsdFByb3BzO2ZvcihzIGluIGgpXCJ1bmRlZmluZWRcIj09dHlwZW9mIHVbc10mJih1W3NdPWhbc10pfXJldHVybiBuZXcgaShlLGMsbCxyLmN1cnJlbnQsbi5jdXJyZW50LHUpfSxpLmNyZWF0ZUZhY3Rvcnk9ZnVuY3Rpb24oZSl7dmFyIHQ9aS5jcmVhdGVFbGVtZW50LmJpbmQobnVsbCxlKTtyZXR1cm4gdC50eXBlPWUsdH0saS5jbG9uZUFuZFJlcGxhY2VQcm9wcz1mdW5jdGlvbihlLHQpe3ZhciBuPW5ldyBpKGUudHlwZSxlLmtleSxlLnJlZixlLl9vd25lcixlLl9jb250ZXh0LHQpO3JldHVybiBufSxpLmlzVmFsaWRFbGVtZW50PWZ1bmN0aW9uKGUpe3ZhciB0PSEoIWV8fCFlLl9pc1JlYWN0RWxlbWVudCk7cmV0dXJuIHR9LHQuZXhwb3J0cz1pfSx7XCIuL1JlYWN0Q29udGV4dFwiOjQxLFwiLi9SZWFjdEN1cnJlbnRPd25lclwiOjQyLFwiLi93YXJuaW5nXCI6MTU1fV0sNTc6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbigpe3ZhciBlPXAuY3VycmVudDtyZXR1cm4gZSYmZS5jb25zdHJ1Y3Rvci5kaXNwbGF5TmFtZXx8dm9pZCAwfWZ1bmN0aW9uIHIoZSx0KXtlLl9zdG9yZS52YWxpZGF0ZWR8fG51bGwhPWUua2V5fHwoZS5fc3RvcmUudmFsaWRhdGVkPSEwLGkoXCJyZWFjdF9rZXlfd2FybmluZ1wiLCdFYWNoIGNoaWxkIGluIGFuIGFycmF5IHNob3VsZCBoYXZlIGEgdW5pcXVlIFwia2V5XCIgcHJvcC4nLGUsdCkpfWZ1bmN0aW9uIG8oZSx0LG4pe3YudGVzdChlKSYmaShcInJlYWN0X251bWVyaWNfa2V5X3dhcm5pbmdcIixcIkNoaWxkIG9iamVjdHMgc2hvdWxkIGhhdmUgbm9uLW51bWVyaWMga2V5cyBzbyBvcmRlcmluZyBpcyBwcmVzZXJ2ZWQuXCIsdCxuKX1mdW5jdGlvbiBpKGUsdCxyLG8pe3ZhciBpPW4oKSxhPW8uZGlzcGxheU5hbWUscz1pfHxhLHU9ZltlXTtpZighdS5oYXNPd25Qcm9wZXJ0eShzKSl7dVtzXT0hMCx0Kz1pP1wiIENoZWNrIHRoZSByZW5kZXIgbWV0aG9kIG9mIFwiK2krXCIuXCI6XCIgQ2hlY2sgdGhlIHJlbmRlckNvbXBvbmVudCBjYWxsIHVzaW5nIDxcIithK1wiPi5cIjt2YXIgYz1udWxsO3IuX293bmVyJiZyLl9vd25lciE9PXAuY3VycmVudCYmKGM9ci5fb3duZXIuY29uc3RydWN0b3IuZGlzcGxheU5hbWUsdCs9XCIgSXQgd2FzIHBhc3NlZCBhIGNoaWxkIGZyb20gXCIrYytcIi5cIiksdCs9XCIgU2VlIGh0dHA6Ly9mYi5tZS9yZWFjdC13YXJuaW5nLWtleXMgZm9yIG1vcmUgaW5mb3JtYXRpb24uXCIsZChlLHtjb21wb25lbnQ6cyxjb21wb25lbnRPd25lcjpjfSksY29uc29sZS53YXJuKHQpfX1mdW5jdGlvbiBhKCl7dmFyIGU9bigpfHxcIlwiO2guaGFzT3duUHJvcGVydHkoZSl8fChoW2VdPSEwLGQoXCJyZWFjdF9vYmplY3RfbWFwX2NoaWxkcmVuXCIpKX1mdW5jdGlvbiBzKGUsdCl7aWYoQXJyYXkuaXNBcnJheShlKSlmb3IodmFyIG49MDtuPGUubGVuZ3RoO24rKyl7dmFyIGk9ZVtuXTtjLmlzVmFsaWRFbGVtZW50KGkpJiZyKGksdCl9ZWxzZSBpZihjLmlzVmFsaWRFbGVtZW50KGUpKWUuX3N0b3JlLnZhbGlkYXRlZD0hMDtlbHNlIGlmKGUmJlwib2JqZWN0XCI9PXR5cGVvZiBlKXthKCk7Zm9yKHZhciBzIGluIGUpbyhzLGVbc10sdCl9fWZ1bmN0aW9uIHUoZSx0LG4scil7Zm9yKHZhciBvIGluIHQpaWYodC5oYXNPd25Qcm9wZXJ0eShvKSl7dmFyIGk7dHJ5e2k9dFtvXShuLG8sZSxyKX1jYXRjaChhKXtpPWF9aSBpbnN0YW5jZW9mIEVycm9yJiYhKGkubWVzc2FnZSBpbiBtKSYmKG1baS5tZXNzYWdlXT0hMCxkKFwicmVhY3RfZmFpbGVkX2Rlc2NyaXB0b3JfdHlwZV9jaGVja1wiLHttZXNzYWdlOmkubWVzc2FnZX0pKX19dmFyIGM9ZShcIi4vUmVhY3RFbGVtZW50XCIpLGw9ZShcIi4vUmVhY3RQcm9wVHlwZUxvY2F0aW9uc1wiKSxwPWUoXCIuL1JlYWN0Q3VycmVudE93bmVyXCIpLGQ9ZShcIi4vbW9uaXRvckNvZGVVc2VcIiksZj0oZShcIi4vd2FybmluZ1wiKSx7cmVhY3Rfa2V5X3dhcm5pbmc6e30scmVhY3RfbnVtZXJpY19rZXlfd2FybmluZzp7fX0pLGg9e30sbT17fSx2PS9eXFxkKyQvLHk9e2NyZWF0ZUVsZW1lbnQ6ZnVuY3Rpb24oZSl7dmFyIHQ9Yy5jcmVhdGVFbGVtZW50LmFwcGx5KHRoaXMsYXJndW1lbnRzKTtpZihudWxsPT10KXJldHVybiB0O2Zvcih2YXIgbj0yO248YXJndW1lbnRzLmxlbmd0aDtuKyspcyhhcmd1bWVudHNbbl0sZSk7aWYoZSl7dmFyIHI9ZS5kaXNwbGF5TmFtZTtlLnByb3BUeXBlcyYmdShyLGUucHJvcFR5cGVzLHQucHJvcHMsbC5wcm9wKSxlLmNvbnRleHRUeXBlcyYmdShyLGUuY29udGV4dFR5cGVzLHQuX2NvbnRleHQsbC5jb250ZXh0KX1yZXR1cm4gdH0sY3JlYXRlRmFjdG9yeTpmdW5jdGlvbihlKXt2YXIgdD15LmNyZWF0ZUVsZW1lbnQuYmluZChudWxsLGUpO3JldHVybiB0LnR5cGU9ZSx0fX07dC5leHBvcnRzPXl9LHtcIi4vUmVhY3RDdXJyZW50T3duZXJcIjo0MixcIi4vUmVhY3RFbGVtZW50XCI6NTYsXCIuL1JlYWN0UHJvcFR5cGVMb2NhdGlvbnNcIjo3NixcIi4vbW9uaXRvckNvZGVVc2VcIjoxNDcsXCIuL3dhcm5pbmdcIjoxNTV9XSw1ODpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKCl7cmV0dXJuIHUoYSksYSgpfWZ1bmN0aW9uIHIoZSl7Y1tlXT0hMH1mdW5jdGlvbiBvKGUpe2RlbGV0ZSBjW2VdfWZ1bmN0aW9uIGkoZSl7cmV0dXJuIGNbZV19dmFyIGEscz1lKFwiLi9SZWFjdEVsZW1lbnRcIiksdT1lKFwiLi9pbnZhcmlhbnRcIiksYz17fSxsPXtpbmplY3RFbXB0eUNvbXBvbmVudDpmdW5jdGlvbihlKXthPXMuY3JlYXRlRmFjdG9yeShlKX19LHA9e2RlcmVnaXN0ZXJOdWxsQ29tcG9uZW50SUQ6byxnZXRFbXB0eUNvbXBvbmVudDpuLGluamVjdGlvbjpsLGlzTnVsbENvbXBvbmVudElEOmkscmVnaXN0ZXJOdWxsQ29tcG9uZW50SUQ6cn07dC5leHBvcnRzPXB9LHtcIi4vUmVhY3RFbGVtZW50XCI6NTYsXCIuL2ludmFyaWFudFwiOjEzN31dLDU5OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPXtndWFyZDpmdW5jdGlvbihlKXtyZXR1cm4gZX19O3QuZXhwb3J0cz1ufSx7fV0sNjA6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlKXtyLmVucXVldWVFdmVudHMoZSksci5wcm9jZXNzRXZlbnRRdWV1ZSgpfXZhciByPWUoXCIuL0V2ZW50UGx1Z2luSHViXCIpLG89e2hhbmRsZVRvcExldmVsOmZ1bmN0aW9uKGUsdCxvLGkpe3ZhciBhPXIuZXh0cmFjdEV2ZW50cyhlLHQsbyxpKTtuKGEpfX07dC5leHBvcnRzPW99LHtcIi4vRXZlbnRQbHVnaW5IdWJcIjoxOX1dLDYxOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSl7dmFyIHQ9bC5nZXRJRChlKSxuPWMuZ2V0UmVhY3RSb290SURGcm9tTm9kZUlEKHQpLHI9bC5maW5kUmVhY3RDb250YWluZXJGb3JJRChuKSxvPWwuZ2V0Rmlyc3RSZWFjdERPTShyKTtyZXR1cm4gb31mdW5jdGlvbiByKGUsdCl7dGhpcy50b3BMZXZlbFR5cGU9ZSx0aGlzLm5hdGl2ZUV2ZW50PXQsdGhpcy5hbmNlc3RvcnM9W119ZnVuY3Rpb24gbyhlKXtmb3IodmFyIHQ9bC5nZXRGaXJzdFJlYWN0RE9NKGYoZS5uYXRpdmVFdmVudCkpfHx3aW5kb3cscj10O3I7KWUuYW5jZXN0b3JzLnB1c2gocikscj1uKHIpO2Zvcih2YXIgbz0wLGk9ZS5hbmNlc3RvcnMubGVuZ3RoO2k+bztvKyspe3Q9ZS5hbmNlc3RvcnNbb107dmFyIGE9bC5nZXRJRCh0KXx8XCJcIjttLl9oYW5kbGVUb3BMZXZlbChlLnRvcExldmVsVHlwZSx0LGEsZS5uYXRpdmVFdmVudCl9fWZ1bmN0aW9uIGkoZSl7dmFyIHQ9aCh3aW5kb3cpO2UodCl9dmFyIGE9ZShcIi4vRXZlbnRMaXN0ZW5lclwiKSxzPWUoXCIuL0V4ZWN1dGlvbkVudmlyb25tZW50XCIpLHU9ZShcIi4vUG9vbGVkQ2xhc3NcIiksYz1lKFwiLi9SZWFjdEluc3RhbmNlSGFuZGxlc1wiKSxsPWUoXCIuL1JlYWN0TW91bnRcIikscD1lKFwiLi9SZWFjdFVwZGF0ZXNcIiksZD1lKFwiLi9PYmplY3QuYXNzaWduXCIpLGY9ZShcIi4vZ2V0RXZlbnRUYXJnZXRcIiksaD1lKFwiLi9nZXRVbmJvdW5kZWRTY3JvbGxQb3NpdGlvblwiKTtkKHIucHJvdG90eXBlLHtkZXN0cnVjdG9yOmZ1bmN0aW9uKCl7dGhpcy50b3BMZXZlbFR5cGU9bnVsbCx0aGlzLm5hdGl2ZUV2ZW50PW51bGwsdGhpcy5hbmNlc3RvcnMubGVuZ3RoPTB9fSksdS5hZGRQb29saW5nVG8ocix1LnR3b0FyZ3VtZW50UG9vbGVyKTt2YXIgbT17X2VuYWJsZWQ6ITAsX2hhbmRsZVRvcExldmVsOm51bGwsV0lORE9XX0hBTkRMRTpzLmNhblVzZURPTT93aW5kb3c6bnVsbCxzZXRIYW5kbGVUb3BMZXZlbDpmdW5jdGlvbihlKXttLl9oYW5kbGVUb3BMZXZlbD1lfSxzZXRFbmFibGVkOmZ1bmN0aW9uKGUpe20uX2VuYWJsZWQ9ISFlfSxpc0VuYWJsZWQ6ZnVuY3Rpb24oKXtyZXR1cm4gbS5fZW5hYmxlZH0sdHJhcEJ1YmJsZWRFdmVudDpmdW5jdGlvbihlLHQsbil7dmFyIHI9bjtyZXR1cm4gcj9hLmxpc3RlbihyLHQsbS5kaXNwYXRjaEV2ZW50LmJpbmQobnVsbCxlKSk6dm9pZCAwfSx0cmFwQ2FwdHVyZWRFdmVudDpmdW5jdGlvbihlLHQsbil7dmFyIHI9bjtyZXR1cm4gcj9hLmNhcHR1cmUocix0LG0uZGlzcGF0Y2hFdmVudC5iaW5kKG51bGwsZSkpOnZvaWQgMH0sbW9uaXRvclNjcm9sbFZhbHVlOmZ1bmN0aW9uKGUpe3ZhciB0PWkuYmluZChudWxsLGUpO2EubGlzdGVuKHdpbmRvdyxcInNjcm9sbFwiLHQpLGEubGlzdGVuKHdpbmRvdyxcInJlc2l6ZVwiLHQpfSxkaXNwYXRjaEV2ZW50OmZ1bmN0aW9uKGUsdCl7aWYobS5fZW5hYmxlZCl7dmFyIG49ci5nZXRQb29sZWQoZSx0KTt0cnl7cC5iYXRjaGVkVXBkYXRlcyhvLG4pfWZpbmFsbHl7ci5yZWxlYXNlKG4pfX19fTt0LmV4cG9ydHM9bX0se1wiLi9FdmVudExpc3RlbmVyXCI6MTgsXCIuL0V4ZWN1dGlvbkVudmlyb25tZW50XCI6MjMsXCIuL09iamVjdC5hc3NpZ25cIjoyOSxcIi4vUG9vbGVkQ2xhc3NcIjozMCxcIi4vUmVhY3RJbnN0YW5jZUhhbmRsZXNcIjo2NCxcIi4vUmVhY3RNb3VudFwiOjY4LFwiLi9SZWFjdFVwZGF0ZXNcIjo4OCxcIi4vZ2V0RXZlbnRUYXJnZXRcIjoxMjgsXCIuL2dldFVuYm91bmRlZFNjcm9sbFBvc2l0aW9uXCI6MTMzfV0sNjI6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG49ZShcIi4vRE9NUHJvcGVydHlcIikscj1lKFwiLi9FdmVudFBsdWdpbkh1YlwiKSxvPWUoXCIuL1JlYWN0Q29tcG9uZW50XCIpLGk9ZShcIi4vUmVhY3RDb21wb3NpdGVDb21wb25lbnRcIiksYT1lKFwiLi9SZWFjdEVtcHR5Q29tcG9uZW50XCIpLHM9ZShcIi4vUmVhY3RCcm93c2VyRXZlbnRFbWl0dGVyXCIpLHU9ZShcIi4vUmVhY3ROYXRpdmVDb21wb25lbnRcIiksYz1lKFwiLi9SZWFjdFBlcmZcIiksbD1lKFwiLi9SZWFjdFJvb3RJbmRleFwiKSxwPWUoXCIuL1JlYWN0VXBkYXRlc1wiKSxkPXtDb21wb25lbnQ6by5pbmplY3Rpb24sQ29tcG9zaXRlQ29tcG9uZW50OmkuaW5qZWN0aW9uLERPTVByb3BlcnR5Om4uaW5qZWN0aW9uLEVtcHR5Q29tcG9uZW50OmEuaW5qZWN0aW9uLEV2ZW50UGx1Z2luSHViOnIuaW5qZWN0aW9uLEV2ZW50RW1pdHRlcjpzLmluamVjdGlvbixOYXRpdmVDb21wb25lbnQ6dS5pbmplY3Rpb24sUGVyZjpjLmluamVjdGlvbixSb290SW5kZXg6bC5pbmplY3Rpb24sVXBkYXRlczpwLmluamVjdGlvbn07dC5leHBvcnRzPWR9LHtcIi4vRE9NUHJvcGVydHlcIjoxMixcIi4vRXZlbnRQbHVnaW5IdWJcIjoxOSxcIi4vUmVhY3RCcm93c2VyRXZlbnRFbWl0dGVyXCI6MzMsXCIuL1JlYWN0Q29tcG9uZW50XCI6MzcsXCIuL1JlYWN0Q29tcG9zaXRlQ29tcG9uZW50XCI6NDAsXCIuL1JlYWN0RW1wdHlDb21wb25lbnRcIjo1OCxcIi4vUmVhY3ROYXRpdmVDb21wb25lbnRcIjo3MSxcIi4vUmVhY3RQZXJmXCI6NzMsXCIuL1JlYWN0Um9vdEluZGV4XCI6ODAsXCIuL1JlYWN0VXBkYXRlc1wiOjg4fV0sNjM6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlKXtyZXR1cm4gbyhkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsZSl9dmFyIHI9ZShcIi4vUmVhY3RET01TZWxlY3Rpb25cIiksbz1lKFwiLi9jb250YWluc05vZGVcIiksaT1lKFwiLi9mb2N1c05vZGVcIiksYT1lKFwiLi9nZXRBY3RpdmVFbGVtZW50XCIpLHM9e2hhc1NlbGVjdGlvbkNhcGFiaWxpdGllczpmdW5jdGlvbihlKXtyZXR1cm4gZSYmKFwiSU5QVVRcIj09PWUubm9kZU5hbWUmJlwidGV4dFwiPT09ZS50eXBlfHxcIlRFWFRBUkVBXCI9PT1lLm5vZGVOYW1lfHxcInRydWVcIj09PWUuY29udGVudEVkaXRhYmxlKX0sZ2V0U2VsZWN0aW9uSW5mb3JtYXRpb246ZnVuY3Rpb24oKXt2YXIgZT1hKCk7cmV0dXJue2ZvY3VzZWRFbGVtOmUsc2VsZWN0aW9uUmFuZ2U6cy5oYXNTZWxlY3Rpb25DYXBhYmlsaXRpZXMoZSk/cy5nZXRTZWxlY3Rpb24oZSk6bnVsbH19LHJlc3RvcmVTZWxlY3Rpb246ZnVuY3Rpb24oZSl7dmFyIHQ9YSgpLHI9ZS5mb2N1c2VkRWxlbSxvPWUuc2VsZWN0aW9uUmFuZ2U7dCE9PXImJm4ocikmJihzLmhhc1NlbGVjdGlvbkNhcGFiaWxpdGllcyhyKSYmcy5zZXRTZWxlY3Rpb24ocixvKSxpKHIpKX0sZ2V0U2VsZWN0aW9uOmZ1bmN0aW9uKGUpe3ZhciB0O2lmKFwic2VsZWN0aW9uU3RhcnRcImluIGUpdD17c3RhcnQ6ZS5zZWxlY3Rpb25TdGFydCxlbmQ6ZS5zZWxlY3Rpb25FbmR9O2Vsc2UgaWYoZG9jdW1lbnQuc2VsZWN0aW9uJiZcIklOUFVUXCI9PT1lLm5vZGVOYW1lKXt2YXIgbj1kb2N1bWVudC5zZWxlY3Rpb24uY3JlYXRlUmFuZ2UoKTtuLnBhcmVudEVsZW1lbnQoKT09PWUmJih0PXtzdGFydDotbi5tb3ZlU3RhcnQoXCJjaGFyYWN0ZXJcIiwtZS52YWx1ZS5sZW5ndGgpLGVuZDotbi5tb3ZlRW5kKFwiY2hhcmFjdGVyXCIsLWUudmFsdWUubGVuZ3RoKX0pfWVsc2UgdD1yLmdldE9mZnNldHMoZSk7cmV0dXJuIHR8fHtzdGFydDowLGVuZDowfX0sc2V0U2VsZWN0aW9uOmZ1bmN0aW9uKGUsdCl7dmFyIG49dC5zdGFydCxvPXQuZW5kO2lmKFwidW5kZWZpbmVkXCI9PXR5cGVvZiBvJiYobz1uKSxcInNlbGVjdGlvblN0YXJ0XCJpbiBlKWUuc2VsZWN0aW9uU3RhcnQ9bixlLnNlbGVjdGlvbkVuZD1NYXRoLm1pbihvLGUudmFsdWUubGVuZ3RoKTtlbHNlIGlmKGRvY3VtZW50LnNlbGVjdGlvbiYmXCJJTlBVVFwiPT09ZS5ub2RlTmFtZSl7dmFyIGk9ZS5jcmVhdGVUZXh0UmFuZ2UoKTtpLmNvbGxhcHNlKCEwKSxpLm1vdmVTdGFydChcImNoYXJhY3RlclwiLG4pLGkubW92ZUVuZChcImNoYXJhY3RlclwiLG8tbiksaS5zZWxlY3QoKX1lbHNlIHIuc2V0T2Zmc2V0cyhlLHQpfX07dC5leHBvcnRzPXN9LHtcIi4vUmVhY3RET01TZWxlY3Rpb25cIjo1MixcIi4vY29udGFpbnNOb2RlXCI6MTExLFwiLi9mb2N1c05vZGVcIjoxMjIsXCIuL2dldEFjdGl2ZUVsZW1lbnRcIjoxMjR9XSw2NDpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUpe3JldHVybiBkK2UudG9TdHJpbmcoMzYpfWZ1bmN0aW9uIHIoZSx0KXtyZXR1cm4gZS5jaGFyQXQodCk9PT1kfHx0PT09ZS5sZW5ndGh9ZnVuY3Rpb24gbyhlKXtyZXR1cm5cIlwiPT09ZXx8ZS5jaGFyQXQoMCk9PT1kJiZlLmNoYXJBdChlLmxlbmd0aC0xKSE9PWR9ZnVuY3Rpb24gaShlLHQpe3JldHVybiAwPT09dC5pbmRleE9mKGUpJiZyKHQsZS5sZW5ndGgpfWZ1bmN0aW9uIGEoZSl7cmV0dXJuIGU/ZS5zdWJzdHIoMCxlLmxhc3RJbmRleE9mKGQpKTpcIlwifWZ1bmN0aW9uIHMoZSx0KXtpZihwKG8oZSkmJm8odCkpLHAoaShlLHQpKSxlPT09dClyZXR1cm4gZTtmb3IodmFyIG49ZS5sZW5ndGgrZixhPW47YTx0Lmxlbmd0aCYmIXIodCxhKTthKyspO3JldHVybiB0LnN1YnN0cigwLGEpfWZ1bmN0aW9uIHUoZSx0KXt2YXIgbj1NYXRoLm1pbihlLmxlbmd0aCx0Lmxlbmd0aCk7aWYoMD09PW4pcmV0dXJuXCJcIjtmb3IodmFyIGk9MCxhPTA7bj49YTthKyspaWYocihlLGEpJiZyKHQsYSkpaT1hO2Vsc2UgaWYoZS5jaGFyQXQoYSkhPT10LmNoYXJBdChhKSlicmVhazt2YXIgcz1lLnN1YnN0cigwLGkpO3JldHVybiBwKG8ocykpLHN9ZnVuY3Rpb24gYyhlLHQsbixyLG8sdSl7ZT1lfHxcIlwiLHQ9dHx8XCJcIixwKGUhPT10KTt2YXIgYz1pKHQsZSk7cChjfHxpKGUsdCkpO2Zvcih2YXIgbD0wLGQ9Yz9hOnMsZj1lOztmPWQoZix0KSl7dmFyIG07aWYobyYmZj09PWV8fHUmJmY9PT10fHwobT1uKGYsYyxyKSksbT09PSExfHxmPT09dClicmVhaztwKGwrKzxoKX19dmFyIGw9ZShcIi4vUmVhY3RSb290SW5kZXhcIikscD1lKFwiLi9pbnZhcmlhbnRcIiksZD1cIi5cIixmPWQubGVuZ3RoLGg9MTAwLG09e2NyZWF0ZVJlYWN0Um9vdElEOmZ1bmN0aW9uKCl7cmV0dXJuIG4obC5jcmVhdGVSZWFjdFJvb3RJbmRleCgpKX0sY3JlYXRlUmVhY3RJRDpmdW5jdGlvbihlLHQpe3JldHVybiBlK3R9LGdldFJlYWN0Um9vdElERnJvbU5vZGVJRDpmdW5jdGlvbihlKXtpZihlJiZlLmNoYXJBdCgwKT09PWQmJmUubGVuZ3RoPjEpe3ZhciB0PWUuaW5kZXhPZihkLDEpO3JldHVybiB0Pi0xP2Uuc3Vic3RyKDAsdCk6ZX1yZXR1cm4gbnVsbH0sdHJhdmVyc2VFbnRlckxlYXZlOmZ1bmN0aW9uKGUsdCxuLHIsbyl7dmFyIGk9dShlLHQpO2khPT1lJiZjKGUsaSxuLHIsITEsITApLGkhPT10JiZjKGksdCxuLG8sITAsITEpfSx0cmF2ZXJzZVR3b1BoYXNlOmZ1bmN0aW9uKGUsdCxuKXtlJiYoYyhcIlwiLGUsdCxuLCEwLCExKSxjKGUsXCJcIix0LG4sITEsITApKX0sdHJhdmVyc2VBbmNlc3RvcnM6ZnVuY3Rpb24oZSx0LG4pe2MoXCJcIixlLHQsbiwhMCwhMSl9LF9nZXRGaXJzdENvbW1vbkFuY2VzdG9ySUQ6dSxfZ2V0TmV4dERlc2NlbmRhbnRJRDpzLGlzQW5jZXN0b3JJRE9mOmksU0VQQVJBVE9SOmR9O3QuZXhwb3J0cz1tfSx7XCIuL1JlYWN0Um9vdEluZGV4XCI6ODAsXCIuL2ludmFyaWFudFwiOjEzN31dLDY1OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSx0KXtpZihcImZ1bmN0aW9uXCI9PXR5cGVvZiB0KWZvcih2YXIgbiBpbiB0KWlmKHQuaGFzT3duUHJvcGVydHkobikpe3ZhciByPXRbbl07aWYoXCJmdW5jdGlvblwiPT10eXBlb2Ygcil7dmFyIG89ci5iaW5kKHQpO2Zvcih2YXIgaSBpbiByKXIuaGFzT3duUHJvcGVydHkoaSkmJihvW2ldPXJbaV0pO2Vbbl09b31lbHNlIGVbbl09cn19dmFyIHI9KGUoXCIuL1JlYWN0Q3VycmVudE93bmVyXCIpLGUoXCIuL2ludmFyaWFudFwiKSksbz0oZShcIi4vbW9uaXRvckNvZGVVc2VcIiksZShcIi4vd2FybmluZ1wiKSx7fSksaT17fSxhPXt9O2Eud3JhcENyZWF0ZUZhY3Rvcnk9ZnVuY3Rpb24oZSl7dmFyIHQ9ZnVuY3Rpb24odCl7cmV0dXJuXCJmdW5jdGlvblwiIT10eXBlb2YgdD9lKHQpOnQuaXNSZWFjdE5vbkxlZ2FjeUZhY3Rvcnk/ZSh0LnR5cGUpOnQuaXNSZWFjdExlZ2FjeUZhY3Rvcnk/ZSh0LnR5cGUpOnR9O3JldHVybiB0fSxhLndyYXBDcmVhdGVFbGVtZW50PWZ1bmN0aW9uKGUpe3ZhciB0PWZ1bmN0aW9uKHQpe2lmKFwiZnVuY3Rpb25cIiE9dHlwZW9mIHQpcmV0dXJuIGUuYXBwbHkodGhpcyxhcmd1bWVudHMpO3ZhciBuO3JldHVybiB0LmlzUmVhY3ROb25MZWdhY3lGYWN0b3J5PyhuPUFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywwKSxuWzBdPXQudHlwZSxlLmFwcGx5KHRoaXMsbikpOnQuaXNSZWFjdExlZ2FjeUZhY3Rvcnk/KHQuX2lzTW9ja0Z1bmN0aW9uJiYodC50eXBlLl9tb2NrZWRSZWFjdENsYXNzQ29uc3RydWN0b3I9dCksbj1BcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsMCksblswXT10LnR5cGUsZS5hcHBseSh0aGlzLG4pKTp0LmFwcGx5KG51bGwsQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLDEpKX07cmV0dXJuIHR9LGEud3JhcEZhY3Rvcnk9ZnVuY3Rpb24oZSl7cihcImZ1bmN0aW9uXCI9PXR5cGVvZiBlKTt2YXIgdD1mdW5jdGlvbigpe3JldHVybiBlLmFwcGx5KHRoaXMsYXJndW1lbnRzKX07cmV0dXJuIG4odCxlLnR5cGUpLHQuaXNSZWFjdExlZ2FjeUZhY3Rvcnk9byx0LnR5cGU9ZS50eXBlLHR9LGEubWFya05vbkxlZ2FjeUZhY3Rvcnk9ZnVuY3Rpb24oZSl7cmV0dXJuIGUuaXNSZWFjdE5vbkxlZ2FjeUZhY3Rvcnk9aSxlfSxhLmlzVmFsaWRGYWN0b3J5PWZ1bmN0aW9uKGUpe3JldHVyblwiZnVuY3Rpb25cIj09dHlwZW9mIGUmJmUuaXNSZWFjdExlZ2FjeUZhY3Rvcnk9PT1vfSxhLmlzVmFsaWRDbGFzcz1mdW5jdGlvbihlKXtyZXR1cm4gYS5pc1ZhbGlkRmFjdG9yeShlKX0sYS5faXNMZWdhY3lDYWxsV2FybmluZ0VuYWJsZWQ9ITAsdC5leHBvcnRzPWF9LHtcIi4vUmVhY3RDdXJyZW50T3duZXJcIjo0MixcIi4vaW52YXJpYW50XCI6MTM3LFwiLi9tb25pdG9yQ29kZVVzZVwiOjE0NyxcIi4vd2FybmluZ1wiOjE1NX1dLDY2OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSx0KXt0aGlzLnZhbHVlPWUsdGhpcy5yZXF1ZXN0Q2hhbmdlPXR9ZnVuY3Rpb24gcihlKXt2YXIgdD17dmFsdWU6XCJ1bmRlZmluZWRcIj09dHlwZW9mIGU/by5Qcm9wVHlwZXMuYW55LmlzUmVxdWlyZWQ6ZS5pc1JlcXVpcmVkLHJlcXVlc3RDaGFuZ2U6by5Qcm9wVHlwZXMuZnVuYy5pc1JlcXVpcmVkfTtyZXR1cm4gby5Qcm9wVHlwZXMuc2hhcGUodCl9dmFyIG89ZShcIi4vUmVhY3RcIik7bi5Qcm9wVHlwZXM9e2xpbms6cn0sdC5leHBvcnRzPW59LHtcIi4vUmVhY3RcIjozMX1dLDY3OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPWUoXCIuL2FkbGVyMzJcIikscj17Q0hFQ0tTVU1fQVRUUl9OQU1FOlwiZGF0YS1yZWFjdC1jaGVja3N1bVwiLGFkZENoZWNrc3VtVG9NYXJrdXA6ZnVuY3Rpb24oZSl7dmFyIHQ9bihlKTtyZXR1cm4gZS5yZXBsYWNlKFwiPlwiLFwiIFwiK3IuQ0hFQ0tTVU1fQVRUUl9OQU1FKyc9XCInK3QrJ1wiPicpfSxjYW5SZXVzZU1hcmt1cDpmdW5jdGlvbihlLHQpe3ZhciBvPXQuZ2V0QXR0cmlidXRlKHIuQ0hFQ0tTVU1fQVRUUl9OQU1FKTtvPW8mJnBhcnNlSW50KG8sMTApO3ZhciBpPW4oZSk7cmV0dXJuIGk9PT1vfX07dC5leHBvcnRzPXJ9LHtcIi4vYWRsZXIzMlwiOjEwN31dLDY4OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSl7dmFyIHQ9RShlKTtyZXR1cm4gdCYmSS5nZXRJRCh0KX1mdW5jdGlvbiByKGUpe3ZhciB0PW8oZSk7aWYodClpZih4Lmhhc093blByb3BlcnR5KHQpKXt2YXIgbj14W3RdO24hPT1lJiYoUighcyhuLHQpKSx4W3RdPWUpfWVsc2UgeFt0XT1lO3JldHVybiB0fWZ1bmN0aW9uIG8oZSl7cmV0dXJuIGUmJmUuZ2V0QXR0cmlidXRlJiZlLmdldEF0dHJpYnV0ZShEKXx8XCJcIn1mdW5jdGlvbiBpKGUsdCl7dmFyIG49byhlKTtuIT09dCYmZGVsZXRlIHhbbl0sZS5zZXRBdHRyaWJ1dGUoRCx0KSx4W3RdPWV9ZnVuY3Rpb24gYShlKXtyZXR1cm4geC5oYXNPd25Qcm9wZXJ0eShlKSYmcyh4W2VdLGUpfHwoeFtlXT1JLmZpbmRSZWFjdE5vZGVCeUlEKGUpKSx4W2VdfWZ1bmN0aW9uIHMoZSx0KXtpZihlKXtSKG8oZSk9PT10KTt2YXIgbj1JLmZpbmRSZWFjdENvbnRhaW5lckZvcklEKHQpO2lmKG4mJnkobixlKSlyZXR1cm4hMH1yZXR1cm4hMX1mdW5jdGlvbiB1KGUpe2RlbGV0ZSB4W2VdfWZ1bmN0aW9uIGMoZSl7dmFyIHQ9eFtlXTtyZXR1cm4gdCYmcyh0LGUpP3ZvaWQoTj10KTohMX1mdW5jdGlvbiBsKGUpe049bnVsbCxtLnRyYXZlcnNlQW5jZXN0b3JzKGUsYyk7dmFyIHQ9TjtyZXR1cm4gTj1udWxsLHR9dmFyIHA9ZShcIi4vRE9NUHJvcGVydHlcIiksZD1lKFwiLi9SZWFjdEJyb3dzZXJFdmVudEVtaXR0ZXJcIiksZj0oZShcIi4vUmVhY3RDdXJyZW50T3duZXJcIiksZShcIi4vUmVhY3RFbGVtZW50XCIpKSxoPWUoXCIuL1JlYWN0TGVnYWN5RWxlbWVudFwiKSxtPWUoXCIuL1JlYWN0SW5zdGFuY2VIYW5kbGVzXCIpLHY9ZShcIi4vUmVhY3RQZXJmXCIpLHk9ZShcIi4vY29udGFpbnNOb2RlXCIpLGc9ZShcIi4vZGVwcmVjYXRlZFwiKSxFPWUoXCIuL2dldFJlYWN0Um9vdEVsZW1lbnRJbkNvbnRhaW5lclwiKSxDPWUoXCIuL2luc3RhbnRpYXRlUmVhY3RDb21wb25lbnRcIiksUj1lKFwiLi9pbnZhcmlhbnRcIiksTT1lKFwiLi9zaG91bGRVcGRhdGVSZWFjdENvbXBvbmVudFwiKSxiPShlKFwiLi93YXJuaW5nXCIpLGgud3JhcENyZWF0ZUVsZW1lbnQoZi5jcmVhdGVFbGVtZW50KSksTz1tLlNFUEFSQVRPUixEPXAuSURfQVRUUklCVVRFX05BTUUseD17fSxQPTEsVD05LHc9e30sXz17fSxTPVtdLE49bnVsbCxJPXtfaW5zdGFuY2VzQnlSZWFjdFJvb3RJRDp3LHNjcm9sbE1vbml0b3I6ZnVuY3Rpb24oZSx0KXt0KCl9LF91cGRhdGVSb290Q29tcG9uZW50OmZ1bmN0aW9uKGUsdCxuLHIpe3ZhciBvPXQucHJvcHM7cmV0dXJuIEkuc2Nyb2xsTW9uaXRvcihuLGZ1bmN0aW9uKCl7ZS5yZXBsYWNlUHJvcHMobyxyKX0pLGV9LF9yZWdpc3RlckNvbXBvbmVudDpmdW5jdGlvbihlLHQpe1IodCYmKHQubm9kZVR5cGU9PT1QfHx0Lm5vZGVUeXBlPT09VCkpLGQuZW5zdXJlU2Nyb2xsVmFsdWVNb25pdG9yaW5nKCk7dmFyIG49SS5yZWdpc3RlckNvbnRhaW5lcih0KTtyZXR1cm4gd1tuXT1lLG59LF9yZW5kZXJOZXdSb290Q29tcG9uZW50OnYubWVhc3VyZShcIlJlYWN0TW91bnRcIixcIl9yZW5kZXJOZXdSb290Q29tcG9uZW50XCIsZnVuY3Rpb24oZSx0LG4pe3ZhciByPUMoZSxudWxsKSxvPUkuX3JlZ2lzdGVyQ29tcG9uZW50KHIsdCk7cmV0dXJuIHIubW91bnRDb21wb25lbnRJbnRvTm9kZShvLHQsbikscn0pLHJlbmRlcjpmdW5jdGlvbihlLHQscil7UihmLmlzVmFsaWRFbGVtZW50KGUpKTt2YXIgbz13W24odCldO2lmKG8pe3ZhciBpPW8uX2N1cnJlbnRFbGVtZW50O2lmKE0oaSxlKSlyZXR1cm4gSS5fdXBkYXRlUm9vdENvbXBvbmVudChvLGUsdCxyKTtJLnVubW91bnRDb21wb25lbnRBdE5vZGUodCl9dmFyIGE9RSh0KSxzPWEmJkkuaXNSZW5kZXJlZEJ5UmVhY3QoYSksdT1zJiYhbyxjPUkuX3JlbmRlck5ld1Jvb3RDb21wb25lbnQoZSx0LHUpO3JldHVybiByJiZyLmNhbGwoYyksY30sY29uc3RydWN0QW5kUmVuZGVyQ29tcG9uZW50OmZ1bmN0aW9uKGUsdCxuKXt2YXIgcj1iKGUsdCk7cmV0dXJuIEkucmVuZGVyKHIsbil9LGNvbnN0cnVjdEFuZFJlbmRlckNvbXBvbmVudEJ5SUQ6ZnVuY3Rpb24oZSx0LG4pe3ZhciByPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKG4pO3JldHVybiBSKHIpLEkuY29uc3RydWN0QW5kUmVuZGVyQ29tcG9uZW50KGUsdCxyKX0scmVnaXN0ZXJDb250YWluZXI6ZnVuY3Rpb24oZSl7dmFyIHQ9bihlKTtyZXR1cm4gdCYmKHQ9bS5nZXRSZWFjdFJvb3RJREZyb21Ob2RlSUQodCkpLHR8fCh0PW0uY3JlYXRlUmVhY3RSb290SUQoKSksX1t0XT1lLHR9LHVubW91bnRDb21wb25lbnRBdE5vZGU6ZnVuY3Rpb24oZSl7dmFyIHQ9bihlKSxyPXdbdF07cmV0dXJuIHI/KEkudW5tb3VudENvbXBvbmVudEZyb21Ob2RlKHIsZSksZGVsZXRlIHdbdF0sZGVsZXRlIF9bdF0sITApOiExfSx1bm1vdW50Q29tcG9uZW50RnJvbU5vZGU6ZnVuY3Rpb24oZSx0KXtmb3IoZS51bm1vdW50Q29tcG9uZW50KCksdC5ub2RlVHlwZT09PVQmJih0PXQuZG9jdW1lbnRFbGVtZW50KTt0Lmxhc3RDaGlsZDspdC5yZW1vdmVDaGlsZCh0Lmxhc3RDaGlsZCl9LGZpbmRSZWFjdENvbnRhaW5lckZvcklEOmZ1bmN0aW9uKGUpe3ZhciB0PW0uZ2V0UmVhY3RSb290SURGcm9tTm9kZUlEKGUpLG49X1t0XTtyZXR1cm4gbn0sZmluZFJlYWN0Tm9kZUJ5SUQ6ZnVuY3Rpb24oZSl7dmFyIHQ9SS5maW5kUmVhY3RDb250YWluZXJGb3JJRChlKTtyZXR1cm4gSS5maW5kQ29tcG9uZW50Um9vdCh0LGUpfSxpc1JlbmRlcmVkQnlSZWFjdDpmdW5jdGlvbihlKXtpZigxIT09ZS5ub2RlVHlwZSlyZXR1cm4hMTt2YXIgdD1JLmdldElEKGUpO3JldHVybiB0P3QuY2hhckF0KDApPT09TzohMX0sZ2V0Rmlyc3RSZWFjdERPTTpmdW5jdGlvbihlKXtmb3IodmFyIHQ9ZTt0JiZ0LnBhcmVudE5vZGUhPT10Oyl7aWYoSS5pc1JlbmRlcmVkQnlSZWFjdCh0KSlyZXR1cm4gdDt0PXQucGFyZW50Tm9kZX1yZXR1cm4gbnVsbH0sZmluZENvbXBvbmVudFJvb3Q6ZnVuY3Rpb24oZSx0KXt2YXIgbj1TLHI9MCxvPWwodCl8fGU7Zm9yKG5bMF09by5maXJzdENoaWxkLG4ubGVuZ3RoPTE7cjxuLmxlbmd0aDspe2Zvcih2YXIgaSxhPW5bcisrXTthOyl7dmFyIHM9SS5nZXRJRChhKTtzP3Q9PT1zP2k9YTptLmlzQW5jZXN0b3JJRE9mKHMsdCkmJihuLmxlbmd0aD1yPTAsbi5wdXNoKGEuZmlyc3RDaGlsZCkpOm4ucHVzaChhLmZpcnN0Q2hpbGQpLGE9YS5uZXh0U2libGluZ31pZihpKXJldHVybiBuLmxlbmd0aD0wLGl9bi5sZW5ndGg9MCxSKCExKX0sZ2V0UmVhY3RSb290SUQ6bixnZXRJRDpyLHNldElEOmksZ2V0Tm9kZTphLHB1cmdlSUQ6dX07SS5yZW5kZXJDb21wb25lbnQ9ZyhcIlJlYWN0TW91bnRcIixcInJlbmRlckNvbXBvbmVudFwiLFwicmVuZGVyXCIsdGhpcyxJLnJlbmRlciksdC5leHBvcnRzPUl9LHtcIi4vRE9NUHJvcGVydHlcIjoxMixcIi4vUmVhY3RCcm93c2VyRXZlbnRFbWl0dGVyXCI6MzMsXCIuL1JlYWN0Q3VycmVudE93bmVyXCI6NDIsXCIuL1JlYWN0RWxlbWVudFwiOjU2LFwiLi9SZWFjdEluc3RhbmNlSGFuZGxlc1wiOjY0LFwiLi9SZWFjdExlZ2FjeUVsZW1lbnRcIjo2NSxcIi4vUmVhY3RQZXJmXCI6NzMsXCIuL2NvbnRhaW5zTm9kZVwiOjExMSxcIi4vZGVwcmVjYXRlZFwiOjExNyxcIi4vZ2V0UmVhY3RSb290RWxlbWVudEluQ29udGFpbmVyXCI6MTMxLFwiLi9pbnN0YW50aWF0ZVJlYWN0Q29tcG9uZW50XCI6MTM2LFwiLi9pbnZhcmlhbnRcIjoxMzcsXCIuL3Nob3VsZFVwZGF0ZVJlYWN0Q29tcG9uZW50XCI6MTUxLFwiLi93YXJuaW5nXCI6MTU1fV0sNjk6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlLHQsbil7aC5wdXNoKHtwYXJlbnRJRDplLHBhcmVudE5vZGU6bnVsbCx0eXBlOmMuSU5TRVJUX01BUktVUCxtYXJrdXBJbmRleDptLnB1c2godCktMSx0ZXh0Q29udGVudDpudWxsLGZyb21JbmRleDpudWxsLHRvSW5kZXg6bn0pfWZ1bmN0aW9uIHIoZSx0LG4pe2gucHVzaCh7cGFyZW50SUQ6ZSxwYXJlbnROb2RlOm51bGwsdHlwZTpjLk1PVkVfRVhJU1RJTkcsbWFya3VwSW5kZXg6bnVsbCx0ZXh0Q29udGVudDpudWxsLGZyb21JbmRleDp0LHRvSW5kZXg6bn0pfWZ1bmN0aW9uIG8oZSx0KXtoLnB1c2goe3BhcmVudElEOmUscGFyZW50Tm9kZTpudWxsLHR5cGU6Yy5SRU1PVkVfTk9ERSxtYXJrdXBJbmRleDpudWxsLHRleHRDb250ZW50Om51bGwsZnJvbUluZGV4OnQsdG9JbmRleDpudWxsfSl9ZnVuY3Rpb24gaShlLHQpe2gucHVzaCh7cGFyZW50SUQ6ZSxwYXJlbnROb2RlOm51bGwsdHlwZTpjLlRFWFRfQ09OVEVOVCxtYXJrdXBJbmRleDpudWxsLHRleHRDb250ZW50OnQsZnJvbUluZGV4Om51bGwsdG9JbmRleDpudWxsfSl9ZnVuY3Rpb24gYSgpe2gubGVuZ3RoJiYodS5CYWNrZW5kSURPcGVyYXRpb25zLmRhbmdlcm91c2x5UHJvY2Vzc0NoaWxkcmVuVXBkYXRlcyhoLG0pLHMoKSl9ZnVuY3Rpb24gcygpe2gubGVuZ3RoPTAsbS5sZW5ndGg9MH12YXIgdT1lKFwiLi9SZWFjdENvbXBvbmVudFwiKSxjPWUoXCIuL1JlYWN0TXVsdGlDaGlsZFVwZGF0ZVR5cGVzXCIpLGw9ZShcIi4vZmxhdHRlbkNoaWxkcmVuXCIpLHA9ZShcIi4vaW5zdGFudGlhdGVSZWFjdENvbXBvbmVudFwiKSxkPWUoXCIuL3Nob3VsZFVwZGF0ZVJlYWN0Q29tcG9uZW50XCIpLGY9MCxoPVtdLG09W10sdj17TWl4aW46e21vdW50Q2hpbGRyZW46ZnVuY3Rpb24oZSx0KXt2YXIgbj1sKGUpLHI9W10sbz0wO3RoaXMuX3JlbmRlcmVkQ2hpbGRyZW49bjtmb3IodmFyIGkgaW4gbil7dmFyIGE9bltpXTtpZihuLmhhc093blByb3BlcnR5KGkpKXt2YXIgcz1wKGEsbnVsbCk7bltpXT1zO3ZhciB1PXRoaXMuX3Jvb3ROb2RlSUQraSxjPXMubW91bnRDb21wb25lbnQodSx0LHRoaXMuX21vdW50RGVwdGgrMSk7cy5fbW91bnRJbmRleD1vLHIucHVzaChjKSxvKyt9fXJldHVybiByfSx1cGRhdGVUZXh0Q29udGVudDpmdW5jdGlvbihlKXtmKys7dmFyIHQ9ITA7dHJ5e3ZhciBuPXRoaXMuX3JlbmRlcmVkQ2hpbGRyZW47Zm9yKHZhciByIGluIG4pbi5oYXNPd25Qcm9wZXJ0eShyKSYmdGhpcy5fdW5tb3VudENoaWxkQnlOYW1lKG5bcl0scik7dGhpcy5zZXRUZXh0Q29udGVudChlKSx0PSExfWZpbmFsbHl7Zi0tLGZ8fCh0P3MoKTphKCkpfX0sdXBkYXRlQ2hpbGRyZW46ZnVuY3Rpb24oZSx0KXtmKys7dmFyIG49ITA7dHJ5e3RoaXMuX3VwZGF0ZUNoaWxkcmVuKGUsdCksbj0hMX1maW5hbGx5e2YtLSxmfHwobj9zKCk6YSgpKX19LF91cGRhdGVDaGlsZHJlbjpmdW5jdGlvbihlLHQpe3ZhciBuPWwoZSkscj10aGlzLl9yZW5kZXJlZENoaWxkcmVuO2lmKG58fHIpe3ZhciBvLGk9MCxhPTA7Zm9yKG8gaW4gbilpZihuLmhhc093blByb3BlcnR5KG8pKXt2YXIgcz1yJiZyW29dLHU9cyYmcy5fY3VycmVudEVsZW1lbnQsYz1uW29dO2lmKGQodSxjKSl0aGlzLm1vdmVDaGlsZChzLGEsaSksaT1NYXRoLm1heChzLl9tb3VudEluZGV4LGkpLHMucmVjZWl2ZUNvbXBvbmVudChjLHQpLHMuX21vdW50SW5kZXg9YTtlbHNle3MmJihpPU1hdGgubWF4KHMuX21vdW50SW5kZXgsaSksdGhpcy5fdW5tb3VudENoaWxkQnlOYW1lKHMsbykpO3ZhciBmPXAoYyxudWxsKTt0aGlzLl9tb3VudENoaWxkQnlOYW1lQXRJbmRleChmLG8sYSx0KX1hKyt9Zm9yKG8gaW4gcikhci5oYXNPd25Qcm9wZXJ0eShvKXx8biYmbltvXXx8dGhpcy5fdW5tb3VudENoaWxkQnlOYW1lKHJbb10sbyl9fSx1bm1vdW50Q2hpbGRyZW46ZnVuY3Rpb24oKXt2YXIgZT10aGlzLl9yZW5kZXJlZENoaWxkcmVuO2Zvcih2YXIgdCBpbiBlKXt2YXIgbj1lW3RdO24udW5tb3VudENvbXBvbmVudCYmbi51bm1vdW50Q29tcG9uZW50KCl9dGhpcy5fcmVuZGVyZWRDaGlsZHJlbj1udWxsfSxtb3ZlQ2hpbGQ6ZnVuY3Rpb24oZSx0LG4pe2UuX21vdW50SW5kZXg8biYmcih0aGlzLl9yb290Tm9kZUlELGUuX21vdW50SW5kZXgsdCl9LGNyZWF0ZUNoaWxkOmZ1bmN0aW9uKGUsdCl7bih0aGlzLl9yb290Tm9kZUlELHQsZS5fbW91bnRJbmRleCl9LHJlbW92ZUNoaWxkOmZ1bmN0aW9uKGUpe28odGhpcy5fcm9vdE5vZGVJRCxlLl9tb3VudEluZGV4KX0sc2V0VGV4dENvbnRlbnQ6ZnVuY3Rpb24oZSl7aSh0aGlzLl9yb290Tm9kZUlELGUpfSxfbW91bnRDaGlsZEJ5TmFtZUF0SW5kZXg6ZnVuY3Rpb24oZSx0LG4scil7dmFyIG89dGhpcy5fcm9vdE5vZGVJRCt0LGk9ZS5tb3VudENvbXBvbmVudChvLHIsdGhpcy5fbW91bnREZXB0aCsxKTtlLl9tb3VudEluZGV4PW4sdGhpcy5jcmVhdGVDaGlsZChlLGkpLHRoaXMuX3JlbmRlcmVkQ2hpbGRyZW49dGhpcy5fcmVuZGVyZWRDaGlsZHJlbnx8e30sdGhpcy5fcmVuZGVyZWRDaGlsZHJlblt0XT1lfSxfdW5tb3VudENoaWxkQnlOYW1lOmZ1bmN0aW9uKGUsdCl7dGhpcy5yZW1vdmVDaGlsZChlKSxlLl9tb3VudEluZGV4PW51bGwsZS51bm1vdW50Q29tcG9uZW50KCksZGVsZXRlIHRoaXMuX3JlbmRlcmVkQ2hpbGRyZW5bdF19fX07dC5leHBvcnRzPXZ9LHtcIi4vUmVhY3RDb21wb25lbnRcIjozNyxcIi4vUmVhY3RNdWx0aUNoaWxkVXBkYXRlVHlwZXNcIjo3MCxcIi4vZmxhdHRlbkNoaWxkcmVuXCI6MTIxLFwiLi9pbnN0YW50aWF0ZVJlYWN0Q29tcG9uZW50XCI6MTM2LFwiLi9zaG91bGRVcGRhdGVSZWFjdENvbXBvbmVudFwiOjE1MX1dLDcwOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPWUoXCIuL2tleU1pcnJvclwiKSxyPW4oe0lOU0VSVF9NQVJLVVA6bnVsbCxNT1ZFX0VYSVNUSU5HOm51bGwsUkVNT1ZFX05PREU6bnVsbCxURVhUX0NPTlRFTlQ6bnVsbH0pO3QuZXhwb3J0cz1yfSx7XCIuL2tleU1pcnJvclwiOjE0M31dLDcxOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSx0LG4pe3ZhciByPWFbZV07cmV0dXJuIG51bGw9PXI/KG8oaSksbmV3IGkoZSx0KSk6bj09PWU/KG8oaSksbmV3IGkoZSx0KSk6bmV3IHIudHlwZSh0KX12YXIgcj1lKFwiLi9PYmplY3QuYXNzaWduXCIpLG89ZShcIi4vaW52YXJpYW50XCIpLGk9bnVsbCxhPXt9LHM9e2luamVjdEdlbmVyaWNDb21wb25lbnRDbGFzczpmdW5jdGlvbihlKXtpPWV9LGluamVjdENvbXBvbmVudENsYXNzZXM6ZnVuY3Rpb24oZSl7cihhLGUpfX0sdT17Y3JlYXRlSW5zdGFuY2VGb3JUYWc6bixpbmplY3Rpb246c307dC5leHBvcnRzPXV9LHtcIi4vT2JqZWN0LmFzc2lnblwiOjI5LFwiLi9pbnZhcmlhbnRcIjoxMzd9XSw3MjpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbj1lKFwiLi9lbXB0eU9iamVjdFwiKSxyPWUoXCIuL2ludmFyaWFudFwiKSxvPXtpc1ZhbGlkT3duZXI6ZnVuY3Rpb24oZSl7cmV0dXJuISghZXx8XCJmdW5jdGlvblwiIT10eXBlb2YgZS5hdHRhY2hSZWZ8fFwiZnVuY3Rpb25cIiE9dHlwZW9mIGUuZGV0YWNoUmVmKX0sYWRkQ29tcG9uZW50QXNSZWZUbzpmdW5jdGlvbihlLHQsbil7cihvLmlzVmFsaWRPd25lcihuKSksbi5hdHRhY2hSZWYodCxlKX0scmVtb3ZlQ29tcG9uZW50QXNSZWZGcm9tOmZ1bmN0aW9uKGUsdCxuKXtyKG8uaXNWYWxpZE93bmVyKG4pKSxuLnJlZnNbdF09PT1lJiZuLmRldGFjaFJlZih0KX0sTWl4aW46e2NvbnN0cnVjdDpmdW5jdGlvbigpe3RoaXMucmVmcz1ufSxhdHRhY2hSZWY6ZnVuY3Rpb24oZSx0KXtyKHQuaXNPd25lZEJ5KHRoaXMpKTt2YXIgbz10aGlzLnJlZnM9PT1uP3RoaXMucmVmcz17fTp0aGlzLnJlZnM7b1tlXT10fSxkZXRhY2hSZWY6ZnVuY3Rpb24oZSl7ZGVsZXRlIHRoaXMucmVmc1tlXX19fTt0LmV4cG9ydHM9b30se1wiLi9lbXB0eU9iamVjdFwiOjExOSxcIi4vaW52YXJpYW50XCI6MTM3fV0sNzM6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlLHQsbil7cmV0dXJuIG59dmFyIHI9e2VuYWJsZU1lYXN1cmU6ITEsc3RvcmVkTWVhc3VyZTpuLG1lYXN1cmU6ZnVuY3Rpb24oZSx0LG4pe3JldHVybiBufSxpbmplY3Rpb246e2luamVjdE1lYXN1cmU6ZnVuY3Rpb24oZSl7ci5zdG9yZWRNZWFzdXJlPWV9fX07dC5leHBvcnRzPXJ9LHt9XSw3NDpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUpe3JldHVybiBmdW5jdGlvbih0LG4scil7dFtuXT10Lmhhc093blByb3BlcnR5KG4pP2UodFtuXSxyKTpyfX1mdW5jdGlvbiByKGUsdCl7Zm9yKHZhciBuIGluIHQpaWYodC5oYXNPd25Qcm9wZXJ0eShuKSl7dmFyIHI9Y1tuXTtyJiZjLmhhc093blByb3BlcnR5KG4pP3IoZSxuLHRbbl0pOmUuaGFzT3duUHJvcGVydHkobil8fChlW25dPXRbbl0pfXJldHVybiBlfXZhciBvPWUoXCIuL09iamVjdC5hc3NpZ25cIiksaT1lKFwiLi9lbXB0eUZ1bmN0aW9uXCIpLGE9ZShcIi4vaW52YXJpYW50XCIpLHM9ZShcIi4vam9pbkNsYXNzZXNcIiksdT0oZShcIi4vd2FybmluZ1wiKSxuKGZ1bmN0aW9uKGUsdCl7cmV0dXJuIG8oe30sdCxlKX0pKSxjPXtjaGlsZHJlbjppLGNsYXNzTmFtZTpuKHMpLHN0eWxlOnV9LGw9e1RyYW5zZmVyU3RyYXRlZ2llczpjLG1lcmdlUHJvcHM6ZnVuY3Rpb24oZSx0KXtyZXR1cm4gcihvKHt9LGUpLHQpfSxNaXhpbjp7dHJhbnNmZXJQcm9wc1RvOmZ1bmN0aW9uKGUpe3JldHVybiBhKGUuX293bmVyPT09dGhpcykscihlLnByb3BzLHRoaXMucHJvcHMpLGV9fX07dC5leHBvcnRzPWx9LHtcIi4vT2JqZWN0LmFzc2lnblwiOjI5LFwiLi9lbXB0eUZ1bmN0aW9uXCI6MTE4LFwiLi9pbnZhcmlhbnRcIjoxMzcsXCIuL2pvaW5DbGFzc2VzXCI6MTQyLFwiLi93YXJuaW5nXCI6MTU1fV0sNzU6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG49e307dC5leHBvcnRzPW59LHt9XSw3NjpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbj1lKFwiLi9rZXlNaXJyb3JcIikscj1uKHtwcm9wOm51bGwsY29udGV4dDpudWxsLGNoaWxkQ29udGV4dDpudWxsfSk7dC5leHBvcnRzPXJ9LHtcIi4va2V5TWlycm9yXCI6MTQzfV0sNzc6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlKXtmdW5jdGlvbiB0KHQsbixyLG8saSl7aWYobz1vfHxDLG51bGwhPW5bcl0pcmV0dXJuIGUobixyLG8saSk7dmFyIGE9eVtpXTtyZXR1cm4gdD9uZXcgRXJyb3IoXCJSZXF1aXJlZCBcIithK1wiIGBcIityK1wiYCB3YXMgbm90IHNwZWNpZmllZCBpbiBcIisoXCJgXCIrbytcImAuXCIpKTp2b2lkIDB9dmFyIG49dC5iaW5kKG51bGwsITEpO3JldHVybiBuLmlzUmVxdWlyZWQ9dC5iaW5kKG51bGwsITApLG59ZnVuY3Rpb24gcihlKXtmdW5jdGlvbiB0KHQsbixyLG8pe3ZhciBpPXRbbl0sYT1oKGkpO2lmKGEhPT1lKXt2YXIgcz15W29dLHU9bShpKTtyZXR1cm4gbmV3IEVycm9yKFwiSW52YWxpZCBcIitzK1wiIGBcIituK1wiYCBvZiB0eXBlIGBcIit1K1wiYCBcIisoXCJzdXBwbGllZCB0byBgXCIrcitcImAsIGV4cGVjdGVkIGBcIitlK1wiYC5cIikpfX1yZXR1cm4gbih0KX1mdW5jdGlvbiBvKCl7cmV0dXJuIG4oRS50aGF0UmV0dXJucygpKX1mdW5jdGlvbiBpKGUpe2Z1bmN0aW9uIHQodCxuLHIsbyl7dmFyIGk9dFtuXTtpZighQXJyYXkuaXNBcnJheShpKSl7dmFyIGE9eVtvXSxzPWgoaSk7cmV0dXJuIG5ldyBFcnJvcihcIkludmFsaWQgXCIrYStcIiBgXCIrbitcImAgb2YgdHlwZSBcIisoXCJgXCIrcytcImAgc3VwcGxpZWQgdG8gYFwiK3IrXCJgLCBleHBlY3RlZCBhbiBhcnJheS5cIikpfWZvcih2YXIgdT0wO3U8aS5sZW5ndGg7dSsrKXt2YXIgYz1lKGksdSxyLG8pO2lmKGMgaW5zdGFuY2VvZiBFcnJvcilyZXR1cm4gY319cmV0dXJuIG4odCl9ZnVuY3Rpb24gYSgpe2Z1bmN0aW9uIGUoZSx0LG4scil7aWYoIXYuaXNWYWxpZEVsZW1lbnQoZVt0XSkpe3ZhciBvPXlbcl07cmV0dXJuIG5ldyBFcnJvcihcIkludmFsaWQgXCIrbytcIiBgXCIrdCtcImAgc3VwcGxpZWQgdG8gXCIrKFwiYFwiK24rXCJgLCBleHBlY3RlZCBhIFJlYWN0RWxlbWVudC5cIikpfX1yZXR1cm4gbihlKX1mdW5jdGlvbiBzKGUpe2Z1bmN0aW9uIHQodCxuLHIsbyl7aWYoISh0W25daW5zdGFuY2VvZiBlKSl7dmFyIGk9eVtvXSxhPWUubmFtZXx8QztyZXR1cm4gbmV3IEVycm9yKFwiSW52YWxpZCBcIitpK1wiIGBcIituK1wiYCBzdXBwbGllZCB0byBcIisoXCJgXCIrcitcImAsIGV4cGVjdGVkIGluc3RhbmNlIG9mIGBcIithK1wiYC5cIikpfX1yZXR1cm4gbih0KX1mdW5jdGlvbiB1KGUpe2Z1bmN0aW9uIHQodCxuLHIsbyl7Zm9yKHZhciBpPXRbbl0sYT0wO2E8ZS5sZW5ndGg7YSsrKWlmKGk9PT1lW2FdKXJldHVybjt2YXIgcz15W29dLHU9SlNPTi5zdHJpbmdpZnkoZSk7cmV0dXJuIG5ldyBFcnJvcihcIkludmFsaWQgXCIrcytcIiBgXCIrbitcImAgb2YgdmFsdWUgYFwiK2krXCJgIFwiKyhcInN1cHBsaWVkIHRvIGBcIityK1wiYCwgZXhwZWN0ZWQgb25lIG9mIFwiK3UrXCIuXCIpKX1yZXR1cm4gbih0KX1mdW5jdGlvbiBjKGUpe2Z1bmN0aW9uIHQodCxuLHIsbyl7dmFyIGk9dFtuXSxhPWgoaSk7XG5pZihcIm9iamVjdFwiIT09YSl7dmFyIHM9eVtvXTtyZXR1cm4gbmV3IEVycm9yKFwiSW52YWxpZCBcIitzK1wiIGBcIituK1wiYCBvZiB0eXBlIFwiKyhcImBcIithK1wiYCBzdXBwbGllZCB0byBgXCIrcitcImAsIGV4cGVjdGVkIGFuIG9iamVjdC5cIikpfWZvcih2YXIgdSBpbiBpKWlmKGkuaGFzT3duUHJvcGVydHkodSkpe3ZhciBjPWUoaSx1LHIsbyk7aWYoYyBpbnN0YW5jZW9mIEVycm9yKXJldHVybiBjfX1yZXR1cm4gbih0KX1mdW5jdGlvbiBsKGUpe2Z1bmN0aW9uIHQodCxuLHIsbyl7Zm9yKHZhciBpPTA7aTxlLmxlbmd0aDtpKyspe3ZhciBhPWVbaV07aWYobnVsbD09YSh0LG4scixvKSlyZXR1cm59dmFyIHM9eVtvXTtyZXR1cm4gbmV3IEVycm9yKFwiSW52YWxpZCBcIitzK1wiIGBcIituK1wiYCBzdXBwbGllZCB0byBcIisoXCJgXCIrcitcImAuXCIpKX1yZXR1cm4gbih0KX1mdW5jdGlvbiBwKCl7ZnVuY3Rpb24gZShlLHQsbixyKXtpZighZihlW3RdKSl7dmFyIG89eVtyXTtyZXR1cm4gbmV3IEVycm9yKFwiSW52YWxpZCBcIitvK1wiIGBcIit0K1wiYCBzdXBwbGllZCB0byBcIisoXCJgXCIrbitcImAsIGV4cGVjdGVkIGEgUmVhY3ROb2RlLlwiKSl9fXJldHVybiBuKGUpfWZ1bmN0aW9uIGQoZSl7ZnVuY3Rpb24gdCh0LG4scixvKXt2YXIgaT10W25dLGE9aChpKTtpZihcIm9iamVjdFwiIT09YSl7dmFyIHM9eVtvXTtyZXR1cm4gbmV3IEVycm9yKFwiSW52YWxpZCBcIitzK1wiIGBcIituK1wiYCBvZiB0eXBlIGBcIithK1wiYCBcIisoXCJzdXBwbGllZCB0byBgXCIrcitcImAsIGV4cGVjdGVkIGBvYmplY3RgLlwiKSl9Zm9yKHZhciB1IGluIGUpe3ZhciBjPWVbdV07aWYoYyl7dmFyIGw9YyhpLHUscixvKTtpZihsKXJldHVybiBsfX19cmV0dXJuIG4odCxcImV4cGVjdGVkIGBvYmplY3RgXCIpfWZ1bmN0aW9uIGYoZSl7c3dpdGNoKHR5cGVvZiBlKXtjYXNlXCJudW1iZXJcIjpjYXNlXCJzdHJpbmdcIjpyZXR1cm4hMDtjYXNlXCJib29sZWFuXCI6cmV0dXJuIWU7Y2FzZVwib2JqZWN0XCI6aWYoQXJyYXkuaXNBcnJheShlKSlyZXR1cm4gZS5ldmVyeShmKTtpZih2LmlzVmFsaWRFbGVtZW50KGUpKXJldHVybiEwO2Zvcih2YXIgdCBpbiBlKWlmKCFmKGVbdF0pKXJldHVybiExO3JldHVybiEwO2RlZmF1bHQ6cmV0dXJuITF9fWZ1bmN0aW9uIGgoZSl7dmFyIHQ9dHlwZW9mIGU7cmV0dXJuIEFycmF5LmlzQXJyYXkoZSk/XCJhcnJheVwiOmUgaW5zdGFuY2VvZiBSZWdFeHA/XCJvYmplY3RcIjp0fWZ1bmN0aW9uIG0oZSl7dmFyIHQ9aChlKTtpZihcIm9iamVjdFwiPT09dCl7aWYoZSBpbnN0YW5jZW9mIERhdGUpcmV0dXJuXCJkYXRlXCI7aWYoZSBpbnN0YW5jZW9mIFJlZ0V4cClyZXR1cm5cInJlZ2V4cFwifXJldHVybiB0fXZhciB2PWUoXCIuL1JlYWN0RWxlbWVudFwiKSx5PWUoXCIuL1JlYWN0UHJvcFR5cGVMb2NhdGlvbk5hbWVzXCIpLGc9ZShcIi4vZGVwcmVjYXRlZFwiKSxFPWUoXCIuL2VtcHR5RnVuY3Rpb25cIiksQz1cIjw8YW5vbnltb3VzPj5cIixSPWEoKSxNPXAoKSxiPXthcnJheTpyKFwiYXJyYXlcIiksYm9vbDpyKFwiYm9vbGVhblwiKSxmdW5jOnIoXCJmdW5jdGlvblwiKSxudW1iZXI6cihcIm51bWJlclwiKSxvYmplY3Q6cihcIm9iamVjdFwiKSxzdHJpbmc6cihcInN0cmluZ1wiKSxhbnk6bygpLGFycmF5T2Y6aSxlbGVtZW50OlIsaW5zdGFuY2VPZjpzLG5vZGU6TSxvYmplY3RPZjpjLG9uZU9mOnUsb25lT2ZUeXBlOmwsc2hhcGU6ZCxjb21wb25lbnQ6ZyhcIlJlYWN0LlByb3BUeXBlc1wiLFwiY29tcG9uZW50XCIsXCJlbGVtZW50XCIsdGhpcyxSKSxyZW5kZXJhYmxlOmcoXCJSZWFjdC5Qcm9wVHlwZXNcIixcInJlbmRlcmFibGVcIixcIm5vZGVcIix0aGlzLE0pfTt0LmV4cG9ydHM9Yn0se1wiLi9SZWFjdEVsZW1lbnRcIjo1NixcIi4vUmVhY3RQcm9wVHlwZUxvY2F0aW9uTmFtZXNcIjo3NSxcIi4vZGVwcmVjYXRlZFwiOjExNyxcIi4vZW1wdHlGdW5jdGlvblwiOjExOH1dLDc4OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oKXt0aGlzLmxpc3RlbmVyc1RvUHV0PVtdfXZhciByPWUoXCIuL1Bvb2xlZENsYXNzXCIpLG89ZShcIi4vUmVhY3RCcm93c2VyRXZlbnRFbWl0dGVyXCIpLGk9ZShcIi4vT2JqZWN0LmFzc2lnblwiKTtpKG4ucHJvdG90eXBlLHtlbnF1ZXVlUHV0TGlzdGVuZXI6ZnVuY3Rpb24oZSx0LG4pe3RoaXMubGlzdGVuZXJzVG9QdXQucHVzaCh7cm9vdE5vZGVJRDplLHByb3BLZXk6dCxwcm9wVmFsdWU6bn0pfSxwdXRMaXN0ZW5lcnM6ZnVuY3Rpb24oKXtmb3IodmFyIGU9MDtlPHRoaXMubGlzdGVuZXJzVG9QdXQubGVuZ3RoO2UrKyl7dmFyIHQ9dGhpcy5saXN0ZW5lcnNUb1B1dFtlXTtvLnB1dExpc3RlbmVyKHQucm9vdE5vZGVJRCx0LnByb3BLZXksdC5wcm9wVmFsdWUpfX0scmVzZXQ6ZnVuY3Rpb24oKXt0aGlzLmxpc3RlbmVyc1RvUHV0Lmxlbmd0aD0wfSxkZXN0cnVjdG9yOmZ1bmN0aW9uKCl7dGhpcy5yZXNldCgpfX0pLHIuYWRkUG9vbGluZ1RvKG4pLHQuZXhwb3J0cz1ufSx7XCIuL09iamVjdC5hc3NpZ25cIjoyOSxcIi4vUG9vbGVkQ2xhc3NcIjozMCxcIi4vUmVhY3RCcm93c2VyRXZlbnRFbWl0dGVyXCI6MzN9XSw3OTpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKCl7dGhpcy5yZWluaXRpYWxpemVUcmFuc2FjdGlvbigpLHRoaXMucmVuZGVyVG9TdGF0aWNNYXJrdXA9ITEsdGhpcy5yZWFjdE1vdW50UmVhZHk9ci5nZXRQb29sZWQobnVsbCksdGhpcy5wdXRMaXN0ZW5lclF1ZXVlPXMuZ2V0UG9vbGVkKCl9dmFyIHI9ZShcIi4vQ2FsbGJhY2tRdWV1ZVwiKSxvPWUoXCIuL1Bvb2xlZENsYXNzXCIpLGk9ZShcIi4vUmVhY3RCcm93c2VyRXZlbnRFbWl0dGVyXCIpLGE9ZShcIi4vUmVhY3RJbnB1dFNlbGVjdGlvblwiKSxzPWUoXCIuL1JlYWN0UHV0TGlzdGVuZXJRdWV1ZVwiKSx1PWUoXCIuL1RyYW5zYWN0aW9uXCIpLGM9ZShcIi4vT2JqZWN0LmFzc2lnblwiKSxsPXtpbml0aWFsaXplOmEuZ2V0U2VsZWN0aW9uSW5mb3JtYXRpb24sY2xvc2U6YS5yZXN0b3JlU2VsZWN0aW9ufSxwPXtpbml0aWFsaXplOmZ1bmN0aW9uKCl7dmFyIGU9aS5pc0VuYWJsZWQoKTtyZXR1cm4gaS5zZXRFbmFibGVkKCExKSxlfSxjbG9zZTpmdW5jdGlvbihlKXtpLnNldEVuYWJsZWQoZSl9fSxkPXtpbml0aWFsaXplOmZ1bmN0aW9uKCl7dGhpcy5yZWFjdE1vdW50UmVhZHkucmVzZXQoKX0sY2xvc2U6ZnVuY3Rpb24oKXt0aGlzLnJlYWN0TW91bnRSZWFkeS5ub3RpZnlBbGwoKX19LGY9e2luaXRpYWxpemU6ZnVuY3Rpb24oKXt0aGlzLnB1dExpc3RlbmVyUXVldWUucmVzZXQoKX0sY2xvc2U6ZnVuY3Rpb24oKXt0aGlzLnB1dExpc3RlbmVyUXVldWUucHV0TGlzdGVuZXJzKCl9fSxoPVtmLGwscCxkXSxtPXtnZXRUcmFuc2FjdGlvbldyYXBwZXJzOmZ1bmN0aW9uKCl7cmV0dXJuIGh9LGdldFJlYWN0TW91bnRSZWFkeTpmdW5jdGlvbigpe3JldHVybiB0aGlzLnJlYWN0TW91bnRSZWFkeX0sZ2V0UHV0TGlzdGVuZXJRdWV1ZTpmdW5jdGlvbigpe3JldHVybiB0aGlzLnB1dExpc3RlbmVyUXVldWV9LGRlc3RydWN0b3I6ZnVuY3Rpb24oKXtyLnJlbGVhc2UodGhpcy5yZWFjdE1vdW50UmVhZHkpLHRoaXMucmVhY3RNb3VudFJlYWR5PW51bGwscy5yZWxlYXNlKHRoaXMucHV0TGlzdGVuZXJRdWV1ZSksdGhpcy5wdXRMaXN0ZW5lclF1ZXVlPW51bGx9fTtjKG4ucHJvdG90eXBlLHUuTWl4aW4sbSksby5hZGRQb29saW5nVG8obiksdC5leHBvcnRzPW59LHtcIi4vQ2FsbGJhY2tRdWV1ZVwiOjcsXCIuL09iamVjdC5hc3NpZ25cIjoyOSxcIi4vUG9vbGVkQ2xhc3NcIjozMCxcIi4vUmVhY3RCcm93c2VyRXZlbnRFbWl0dGVyXCI6MzMsXCIuL1JlYWN0SW5wdXRTZWxlY3Rpb25cIjo2MyxcIi4vUmVhY3RQdXRMaXN0ZW5lclF1ZXVlXCI6NzgsXCIuL1RyYW5zYWN0aW9uXCI6MTA0fV0sODA6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG49e2luamVjdENyZWF0ZVJlYWN0Um9vdEluZGV4OmZ1bmN0aW9uKGUpe3IuY3JlYXRlUmVhY3RSb290SW5kZXg9ZX19LHI9e2NyZWF0ZVJlYWN0Um9vdEluZGV4Om51bGwsaW5qZWN0aW9uOm59O3QuZXhwb3J0cz1yfSx7fV0sODE6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlKXtjKG8uaXNWYWxpZEVsZW1lbnQoZSkpO3ZhciB0O3RyeXt2YXIgbj1pLmNyZWF0ZVJlYWN0Um9vdElEKCk7cmV0dXJuIHQ9cy5nZXRQb29sZWQoITEpLHQucGVyZm9ybShmdW5jdGlvbigpe3ZhciByPXUoZSxudWxsKSxvPXIubW91bnRDb21wb25lbnQobix0LDApO3JldHVybiBhLmFkZENoZWNrc3VtVG9NYXJrdXAobyl9LG51bGwpfWZpbmFsbHl7cy5yZWxlYXNlKHQpfX1mdW5jdGlvbiByKGUpe2Moby5pc1ZhbGlkRWxlbWVudChlKSk7dmFyIHQ7dHJ5e3ZhciBuPWkuY3JlYXRlUmVhY3RSb290SUQoKTtyZXR1cm4gdD1zLmdldFBvb2xlZCghMCksdC5wZXJmb3JtKGZ1bmN0aW9uKCl7dmFyIHI9dShlLG51bGwpO3JldHVybiByLm1vdW50Q29tcG9uZW50KG4sdCwwKX0sbnVsbCl9ZmluYWxseXtzLnJlbGVhc2UodCl9fXZhciBvPWUoXCIuL1JlYWN0RWxlbWVudFwiKSxpPWUoXCIuL1JlYWN0SW5zdGFuY2VIYW5kbGVzXCIpLGE9ZShcIi4vUmVhY3RNYXJrdXBDaGVja3N1bVwiKSxzPWUoXCIuL1JlYWN0U2VydmVyUmVuZGVyaW5nVHJhbnNhY3Rpb25cIiksdT1lKFwiLi9pbnN0YW50aWF0ZVJlYWN0Q29tcG9uZW50XCIpLGM9ZShcIi4vaW52YXJpYW50XCIpO3QuZXhwb3J0cz17cmVuZGVyVG9TdHJpbmc6bixyZW5kZXJUb1N0YXRpY01hcmt1cDpyfX0se1wiLi9SZWFjdEVsZW1lbnRcIjo1NixcIi4vUmVhY3RJbnN0YW5jZUhhbmRsZXNcIjo2NCxcIi4vUmVhY3RNYXJrdXBDaGVja3N1bVwiOjY3LFwiLi9SZWFjdFNlcnZlclJlbmRlcmluZ1RyYW5zYWN0aW9uXCI6ODIsXCIuL2luc3RhbnRpYXRlUmVhY3RDb21wb25lbnRcIjoxMzYsXCIuL2ludmFyaWFudFwiOjEzN31dLDgyOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSl7dGhpcy5yZWluaXRpYWxpemVUcmFuc2FjdGlvbigpLHRoaXMucmVuZGVyVG9TdGF0aWNNYXJrdXA9ZSx0aGlzLnJlYWN0TW91bnRSZWFkeT1vLmdldFBvb2xlZChudWxsKSx0aGlzLnB1dExpc3RlbmVyUXVldWU9aS5nZXRQb29sZWQoKX12YXIgcj1lKFwiLi9Qb29sZWRDbGFzc1wiKSxvPWUoXCIuL0NhbGxiYWNrUXVldWVcIiksaT1lKFwiLi9SZWFjdFB1dExpc3RlbmVyUXVldWVcIiksYT1lKFwiLi9UcmFuc2FjdGlvblwiKSxzPWUoXCIuL09iamVjdC5hc3NpZ25cIiksdT1lKFwiLi9lbXB0eUZ1bmN0aW9uXCIpLGM9e2luaXRpYWxpemU6ZnVuY3Rpb24oKXt0aGlzLnJlYWN0TW91bnRSZWFkeS5yZXNldCgpfSxjbG9zZTp1fSxsPXtpbml0aWFsaXplOmZ1bmN0aW9uKCl7dGhpcy5wdXRMaXN0ZW5lclF1ZXVlLnJlc2V0KCl9LGNsb3NlOnV9LHA9W2wsY10sZD17Z2V0VHJhbnNhY3Rpb25XcmFwcGVyczpmdW5jdGlvbigpe3JldHVybiBwfSxnZXRSZWFjdE1vdW50UmVhZHk6ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5yZWFjdE1vdW50UmVhZHl9LGdldFB1dExpc3RlbmVyUXVldWU6ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5wdXRMaXN0ZW5lclF1ZXVlfSxkZXN0cnVjdG9yOmZ1bmN0aW9uKCl7by5yZWxlYXNlKHRoaXMucmVhY3RNb3VudFJlYWR5KSx0aGlzLnJlYWN0TW91bnRSZWFkeT1udWxsLGkucmVsZWFzZSh0aGlzLnB1dExpc3RlbmVyUXVldWUpLHRoaXMucHV0TGlzdGVuZXJRdWV1ZT1udWxsfX07cyhuLnByb3RvdHlwZSxhLk1peGluLGQpLHIuYWRkUG9vbGluZ1RvKG4pLHQuZXhwb3J0cz1ufSx7XCIuL0NhbGxiYWNrUXVldWVcIjo3LFwiLi9PYmplY3QuYXNzaWduXCI6MjksXCIuL1Bvb2xlZENsYXNzXCI6MzAsXCIuL1JlYWN0UHV0TGlzdGVuZXJRdWV1ZVwiOjc4LFwiLi9UcmFuc2FjdGlvblwiOjEwNCxcIi4vZW1wdHlGdW5jdGlvblwiOjExOH1dLDgzOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSx0KXt2YXIgbj17fTtyZXR1cm4gZnVuY3Rpb24ocil7blt0XT1yLGUuc2V0U3RhdGUobil9fXZhciByPXtjcmVhdGVTdGF0ZVNldHRlcjpmdW5jdGlvbihlLHQpe3JldHVybiBmdW5jdGlvbihuLHIsbyxpLGEscyl7dmFyIHU9dC5jYWxsKGUsbixyLG8saSxhLHMpO3UmJmUuc2V0U3RhdGUodSl9fSxjcmVhdGVTdGF0ZUtleVNldHRlcjpmdW5jdGlvbihlLHQpe3ZhciByPWUuX19rZXlTZXR0ZXJzfHwoZS5fX2tleVNldHRlcnM9e30pO3JldHVybiByW3RdfHwoclt0XT1uKGUsdCkpfX07ci5NaXhpbj17Y3JlYXRlU3RhdGVTZXR0ZXI6ZnVuY3Rpb24oZSl7cmV0dXJuIHIuY3JlYXRlU3RhdGVTZXR0ZXIodGhpcyxlKX0sY3JlYXRlU3RhdGVLZXlTZXR0ZXI6ZnVuY3Rpb24oZSl7cmV0dXJuIHIuY3JlYXRlU3RhdGVLZXlTZXR0ZXIodGhpcyxlKX19LHQuZXhwb3J0cz1yfSx7fV0sODQ6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG49ZShcIi4vRE9NUHJvcGVydHlPcGVyYXRpb25zXCIpLHI9ZShcIi4vUmVhY3RDb21wb25lbnRcIiksbz1lKFwiLi9SZWFjdEVsZW1lbnRcIiksaT1lKFwiLi9PYmplY3QuYXNzaWduXCIpLGE9ZShcIi4vZXNjYXBlVGV4dEZvckJyb3dzZXJcIikscz1mdW5jdGlvbigpe307aShzLnByb3RvdHlwZSxyLk1peGluLHttb3VudENvbXBvbmVudDpmdW5jdGlvbihlLHQsbyl7ci5NaXhpbi5tb3VudENvbXBvbmVudC5jYWxsKHRoaXMsZSx0LG8pO3ZhciBpPWEodGhpcy5wcm9wcyk7cmV0dXJuIHQucmVuZGVyVG9TdGF0aWNNYXJrdXA/aTpcIjxzcGFuIFwiK24uY3JlYXRlTWFya3VwRm9ySUQoZSkrXCI+XCIraStcIjwvc3Bhbj5cIn0scmVjZWl2ZUNvbXBvbmVudDpmdW5jdGlvbihlKXt2YXIgdD1lLnByb3BzO3QhPT10aGlzLnByb3BzJiYodGhpcy5wcm9wcz10LHIuQmFja2VuZElET3BlcmF0aW9ucy51cGRhdGVUZXh0Q29udGVudEJ5SUQodGhpcy5fcm9vdE5vZGVJRCx0KSl9fSk7dmFyIHU9ZnVuY3Rpb24oZSl7cmV0dXJuIG5ldyBvKHMsbnVsbCxudWxsLG51bGwsbnVsbCxlKX07dS50eXBlPXMsdC5leHBvcnRzPXV9LHtcIi4vRE9NUHJvcGVydHlPcGVyYXRpb25zXCI6MTMsXCIuL09iamVjdC5hc3NpZ25cIjoyOSxcIi4vUmVhY3RDb21wb25lbnRcIjozNyxcIi4vUmVhY3RFbGVtZW50XCI6NTYsXCIuL2VzY2FwZVRleHRGb3JCcm93c2VyXCI6MTIwfV0sODU6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG49ZShcIi4vUmVhY3RDaGlsZHJlblwiKSxyPXtnZXRDaGlsZE1hcHBpbmc6ZnVuY3Rpb24oZSl7cmV0dXJuIG4ubWFwKGUsZnVuY3Rpb24oZSl7cmV0dXJuIGV9KX0sbWVyZ2VDaGlsZE1hcHBpbmdzOmZ1bmN0aW9uKGUsdCl7ZnVuY3Rpb24gbihuKXtyZXR1cm4gdC5oYXNPd25Qcm9wZXJ0eShuKT90W25dOmVbbl19ZT1lfHx7fSx0PXR8fHt9O3ZhciByPXt9LG89W107Zm9yKHZhciBpIGluIGUpdC5oYXNPd25Qcm9wZXJ0eShpKT9vLmxlbmd0aCYmKHJbaV09byxvPVtdKTpvLnB1c2goaSk7dmFyIGEscz17fTtmb3IodmFyIHUgaW4gdCl7aWYoci5oYXNPd25Qcm9wZXJ0eSh1KSlmb3IoYT0wO2E8clt1XS5sZW5ndGg7YSsrKXt2YXIgYz1yW3VdW2FdO3Nbclt1XVthXV09bihjKX1zW3VdPW4odSl9Zm9yKGE9MDthPG8ubGVuZ3RoO2ErKylzW29bYV1dPW4ob1thXSk7cmV0dXJuIHN9fTt0LmV4cG9ydHM9cn0se1wiLi9SZWFjdENoaWxkcmVuXCI6MzZ9XSw4NjpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKCl7dmFyIGU9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSx0PWUuc3R5bGU7XCJBbmltYXRpb25FdmVudFwiaW4gd2luZG93fHxkZWxldGUgYS5hbmltYXRpb25lbmQuYW5pbWF0aW9uLFwiVHJhbnNpdGlvbkV2ZW50XCJpbiB3aW5kb3d8fGRlbGV0ZSBhLnRyYW5zaXRpb25lbmQudHJhbnNpdGlvbjtmb3IodmFyIG4gaW4gYSl7dmFyIHI9YVtuXTtmb3IodmFyIG8gaW4gcilpZihvIGluIHQpe3MucHVzaChyW29dKTticmVha319fWZ1bmN0aW9uIHIoZSx0LG4pe2UuYWRkRXZlbnRMaXN0ZW5lcih0LG4sITEpfWZ1bmN0aW9uIG8oZSx0LG4pe2UucmVtb3ZlRXZlbnRMaXN0ZW5lcih0LG4sITEpfXZhciBpPWUoXCIuL0V4ZWN1dGlvbkVudmlyb25tZW50XCIpLGE9e3RyYW5zaXRpb25lbmQ6e3RyYW5zaXRpb246XCJ0cmFuc2l0aW9uZW5kXCIsV2Via2l0VHJhbnNpdGlvbjpcIndlYmtpdFRyYW5zaXRpb25FbmRcIixNb3pUcmFuc2l0aW9uOlwibW96VHJhbnNpdGlvbkVuZFwiLE9UcmFuc2l0aW9uOlwib1RyYW5zaXRpb25FbmRcIixtc1RyYW5zaXRpb246XCJNU1RyYW5zaXRpb25FbmRcIn0sYW5pbWF0aW9uZW5kOnthbmltYXRpb246XCJhbmltYXRpb25lbmRcIixXZWJraXRBbmltYXRpb246XCJ3ZWJraXRBbmltYXRpb25FbmRcIixNb3pBbmltYXRpb246XCJtb3pBbmltYXRpb25FbmRcIixPQW5pbWF0aW9uOlwib0FuaW1hdGlvbkVuZFwiLG1zQW5pbWF0aW9uOlwiTVNBbmltYXRpb25FbmRcIn19LHM9W107aS5jYW5Vc2VET00mJm4oKTt2YXIgdT17YWRkRW5kRXZlbnRMaXN0ZW5lcjpmdW5jdGlvbihlLHQpe3JldHVybiAwPT09cy5sZW5ndGg/dm9pZCB3aW5kb3cuc2V0VGltZW91dCh0LDApOnZvaWQgcy5mb3JFYWNoKGZ1bmN0aW9uKG4pe3IoZSxuLHQpfSl9LHJlbW92ZUVuZEV2ZW50TGlzdGVuZXI6ZnVuY3Rpb24oZSx0KXswIT09cy5sZW5ndGgmJnMuZm9yRWFjaChmdW5jdGlvbihuKXtvKGUsbix0KX0pfX07dC5leHBvcnRzPXV9LHtcIi4vRXhlY3V0aW9uRW52aXJvbm1lbnRcIjoyM31dLDg3OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPWUoXCIuL1JlYWN0XCIpLHI9ZShcIi4vUmVhY3RUcmFuc2l0aW9uQ2hpbGRNYXBwaW5nXCIpLG89ZShcIi4vT2JqZWN0LmFzc2lnblwiKSxpPWUoXCIuL2Nsb25lV2l0aFByb3BzXCIpLGE9ZShcIi4vZW1wdHlGdW5jdGlvblwiKSxzPW4uY3JlYXRlQ2xhc3Moe2Rpc3BsYXlOYW1lOlwiUmVhY3RUcmFuc2l0aW9uR3JvdXBcIixwcm9wVHlwZXM6e2NvbXBvbmVudDpuLlByb3BUeXBlcy5hbnksY2hpbGRGYWN0b3J5Om4uUHJvcFR5cGVzLmZ1bmN9LGdldERlZmF1bHRQcm9wczpmdW5jdGlvbigpe3JldHVybntjb21wb25lbnQ6XCJzcGFuXCIsY2hpbGRGYWN0b3J5OmEudGhhdFJldHVybnNBcmd1bWVudH19LGdldEluaXRpYWxTdGF0ZTpmdW5jdGlvbigpe3JldHVybntjaGlsZHJlbjpyLmdldENoaWxkTWFwcGluZyh0aGlzLnByb3BzLmNoaWxkcmVuKX19LGNvbXBvbmVudFdpbGxSZWNlaXZlUHJvcHM6ZnVuY3Rpb24oZSl7dmFyIHQ9ci5nZXRDaGlsZE1hcHBpbmcoZS5jaGlsZHJlbiksbj10aGlzLnN0YXRlLmNoaWxkcmVuO3RoaXMuc2V0U3RhdGUoe2NoaWxkcmVuOnIubWVyZ2VDaGlsZE1hcHBpbmdzKG4sdCl9KTt2YXIgbztmb3IobyBpbiB0KXt2YXIgaT1uJiZuLmhhc093blByb3BlcnR5KG8pOyF0W29dfHxpfHx0aGlzLmN1cnJlbnRseVRyYW5zaXRpb25pbmdLZXlzW29dfHx0aGlzLmtleXNUb0VudGVyLnB1c2gobyl9Zm9yKG8gaW4gbil7dmFyIGE9dCYmdC5oYXNPd25Qcm9wZXJ0eShvKTshbltvXXx8YXx8dGhpcy5jdXJyZW50bHlUcmFuc2l0aW9uaW5nS2V5c1tvXXx8dGhpcy5rZXlzVG9MZWF2ZS5wdXNoKG8pfX0sY29tcG9uZW50V2lsbE1vdW50OmZ1bmN0aW9uKCl7dGhpcy5jdXJyZW50bHlUcmFuc2l0aW9uaW5nS2V5cz17fSx0aGlzLmtleXNUb0VudGVyPVtdLHRoaXMua2V5c1RvTGVhdmU9W119LGNvbXBvbmVudERpZFVwZGF0ZTpmdW5jdGlvbigpe3ZhciBlPXRoaXMua2V5c1RvRW50ZXI7dGhpcy5rZXlzVG9FbnRlcj1bXSxlLmZvckVhY2godGhpcy5wZXJmb3JtRW50ZXIpO3ZhciB0PXRoaXMua2V5c1RvTGVhdmU7dGhpcy5rZXlzVG9MZWF2ZT1bXSx0LmZvckVhY2godGhpcy5wZXJmb3JtTGVhdmUpfSxwZXJmb3JtRW50ZXI6ZnVuY3Rpb24oZSl7dGhpcy5jdXJyZW50bHlUcmFuc2l0aW9uaW5nS2V5c1tlXT0hMDt2YXIgdD10aGlzLnJlZnNbZV07dC5jb21wb25lbnRXaWxsRW50ZXI/dC5jb21wb25lbnRXaWxsRW50ZXIodGhpcy5faGFuZGxlRG9uZUVudGVyaW5nLmJpbmQodGhpcyxlKSk6dGhpcy5faGFuZGxlRG9uZUVudGVyaW5nKGUpfSxfaGFuZGxlRG9uZUVudGVyaW5nOmZ1bmN0aW9uKGUpe3ZhciB0PXRoaXMucmVmc1tlXTt0LmNvbXBvbmVudERpZEVudGVyJiZ0LmNvbXBvbmVudERpZEVudGVyKCksZGVsZXRlIHRoaXMuY3VycmVudGx5VHJhbnNpdGlvbmluZ0tleXNbZV07dmFyIG49ci5nZXRDaGlsZE1hcHBpbmcodGhpcy5wcm9wcy5jaGlsZHJlbik7biYmbi5oYXNPd25Qcm9wZXJ0eShlKXx8dGhpcy5wZXJmb3JtTGVhdmUoZSl9LHBlcmZvcm1MZWF2ZTpmdW5jdGlvbihlKXt0aGlzLmN1cnJlbnRseVRyYW5zaXRpb25pbmdLZXlzW2VdPSEwO3ZhciB0PXRoaXMucmVmc1tlXTt0LmNvbXBvbmVudFdpbGxMZWF2ZT90LmNvbXBvbmVudFdpbGxMZWF2ZSh0aGlzLl9oYW5kbGVEb25lTGVhdmluZy5iaW5kKHRoaXMsZSkpOnRoaXMuX2hhbmRsZURvbmVMZWF2aW5nKGUpfSxfaGFuZGxlRG9uZUxlYXZpbmc6ZnVuY3Rpb24oZSl7dmFyIHQ9dGhpcy5yZWZzW2VdO3QuY29tcG9uZW50RGlkTGVhdmUmJnQuY29tcG9uZW50RGlkTGVhdmUoKSxkZWxldGUgdGhpcy5jdXJyZW50bHlUcmFuc2l0aW9uaW5nS2V5c1tlXTt2YXIgbj1yLmdldENoaWxkTWFwcGluZyh0aGlzLnByb3BzLmNoaWxkcmVuKTtpZihuJiZuLmhhc093blByb3BlcnR5KGUpKXRoaXMucGVyZm9ybUVudGVyKGUpO2Vsc2V7dmFyIGk9byh7fSx0aGlzLnN0YXRlLmNoaWxkcmVuKTtkZWxldGUgaVtlXSx0aGlzLnNldFN0YXRlKHtjaGlsZHJlbjppfSl9fSxyZW5kZXI6ZnVuY3Rpb24oKXt2YXIgZT17fTtmb3IodmFyIHQgaW4gdGhpcy5zdGF0ZS5jaGlsZHJlbil7dmFyIHI9dGhpcy5zdGF0ZS5jaGlsZHJlblt0XTtyJiYoZVt0XT1pKHRoaXMucHJvcHMuY2hpbGRGYWN0b3J5KHIpLHtyZWY6dH0pKX1yZXR1cm4gbi5jcmVhdGVFbGVtZW50KHRoaXMucHJvcHMuY29tcG9uZW50LHRoaXMucHJvcHMsZSl9fSk7dC5leHBvcnRzPXN9LHtcIi4vT2JqZWN0LmFzc2lnblwiOjI5LFwiLi9SZWFjdFwiOjMxLFwiLi9SZWFjdFRyYW5zaXRpb25DaGlsZE1hcHBpbmdcIjo4NSxcIi4vY2xvbmVXaXRoUHJvcHNcIjoxMTAsXCIuL2VtcHR5RnVuY3Rpb25cIjoxMTh9XSw4ODpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKCl7aChPLlJlYWN0UmVjb25jaWxlVHJhbnNhY3Rpb24mJmcpfWZ1bmN0aW9uIHIoKXt0aGlzLnJlaW5pdGlhbGl6ZVRyYW5zYWN0aW9uKCksdGhpcy5kaXJ0eUNvbXBvbmVudHNMZW5ndGg9bnVsbCx0aGlzLmNhbGxiYWNrUXVldWU9Yy5nZXRQb29sZWQoKSx0aGlzLnJlY29uY2lsZVRyYW5zYWN0aW9uPU8uUmVhY3RSZWNvbmNpbGVUcmFuc2FjdGlvbi5nZXRQb29sZWQoKX1mdW5jdGlvbiBvKGUsdCxyKXtuKCksZy5iYXRjaGVkVXBkYXRlcyhlLHQscil9ZnVuY3Rpb24gaShlLHQpe3JldHVybiBlLl9tb3VudERlcHRoLXQuX21vdW50RGVwdGh9ZnVuY3Rpb24gYShlKXt2YXIgdD1lLmRpcnR5Q29tcG9uZW50c0xlbmd0aDtoKHQ9PT1tLmxlbmd0aCksbS5zb3J0KGkpO2Zvcih2YXIgbj0wO3Q+bjtuKyspe3ZhciByPW1bbl07aWYoci5pc01vdW50ZWQoKSl7dmFyIG89ci5fcGVuZGluZ0NhbGxiYWNrcztpZihyLl9wZW5kaW5nQ2FsbGJhY2tzPW51bGwsci5wZXJmb3JtVXBkYXRlSWZOZWNlc3NhcnkoZS5yZWNvbmNpbGVUcmFuc2FjdGlvbiksbylmb3IodmFyIGE9MDthPG8ubGVuZ3RoO2ErKyllLmNhbGxiYWNrUXVldWUuZW5xdWV1ZShvW2FdLHIpfX19ZnVuY3Rpb24gcyhlLHQpe3JldHVybiBoKCF0fHxcImZ1bmN0aW9uXCI9PXR5cGVvZiB0KSxuKCksZy5pc0JhdGNoaW5nVXBkYXRlcz8obS5wdXNoKGUpLHZvaWQodCYmKGUuX3BlbmRpbmdDYWxsYmFja3M/ZS5fcGVuZGluZ0NhbGxiYWNrcy5wdXNoKHQpOmUuX3BlbmRpbmdDYWxsYmFja3M9W3RdKSkpOnZvaWQgZy5iYXRjaGVkVXBkYXRlcyhzLGUsdCl9ZnVuY3Rpb24gdShlLHQpe2goZy5pc0JhdGNoaW5nVXBkYXRlcyksdi5lbnF1ZXVlKGUsdCkseT0hMH12YXIgYz1lKFwiLi9DYWxsYmFja1F1ZXVlXCIpLGw9ZShcIi4vUG9vbGVkQ2xhc3NcIikscD0oZShcIi4vUmVhY3RDdXJyZW50T3duZXJcIiksZShcIi4vUmVhY3RQZXJmXCIpKSxkPWUoXCIuL1RyYW5zYWN0aW9uXCIpLGY9ZShcIi4vT2JqZWN0LmFzc2lnblwiKSxoPWUoXCIuL2ludmFyaWFudFwiKSxtPShlKFwiLi93YXJuaW5nXCIpLFtdKSx2PWMuZ2V0UG9vbGVkKCkseT0hMSxnPW51bGwsRT17aW5pdGlhbGl6ZTpmdW5jdGlvbigpe3RoaXMuZGlydHlDb21wb25lbnRzTGVuZ3RoPW0ubGVuZ3RofSxjbG9zZTpmdW5jdGlvbigpe3RoaXMuZGlydHlDb21wb25lbnRzTGVuZ3RoIT09bS5sZW5ndGg/KG0uc3BsaWNlKDAsdGhpcy5kaXJ0eUNvbXBvbmVudHNMZW5ndGgpLE0oKSk6bS5sZW5ndGg9MH19LEM9e2luaXRpYWxpemU6ZnVuY3Rpb24oKXt0aGlzLmNhbGxiYWNrUXVldWUucmVzZXQoKX0sY2xvc2U6ZnVuY3Rpb24oKXt0aGlzLmNhbGxiYWNrUXVldWUubm90aWZ5QWxsKCl9fSxSPVtFLENdO2Yoci5wcm90b3R5cGUsZC5NaXhpbix7Z2V0VHJhbnNhY3Rpb25XcmFwcGVyczpmdW5jdGlvbigpe3JldHVybiBSfSxkZXN0cnVjdG9yOmZ1bmN0aW9uKCl7dGhpcy5kaXJ0eUNvbXBvbmVudHNMZW5ndGg9bnVsbCxjLnJlbGVhc2UodGhpcy5jYWxsYmFja1F1ZXVlKSx0aGlzLmNhbGxiYWNrUXVldWU9bnVsbCxPLlJlYWN0UmVjb25jaWxlVHJhbnNhY3Rpb24ucmVsZWFzZSh0aGlzLnJlY29uY2lsZVRyYW5zYWN0aW9uKSx0aGlzLnJlY29uY2lsZVRyYW5zYWN0aW9uPW51bGx9LHBlcmZvcm06ZnVuY3Rpb24oZSx0LG4pe3JldHVybiBkLk1peGluLnBlcmZvcm0uY2FsbCh0aGlzLHRoaXMucmVjb25jaWxlVHJhbnNhY3Rpb24ucGVyZm9ybSx0aGlzLnJlY29uY2lsZVRyYW5zYWN0aW9uLGUsdCxuKX19KSxsLmFkZFBvb2xpbmdUbyhyKTt2YXIgTT1wLm1lYXN1cmUoXCJSZWFjdFVwZGF0ZXNcIixcImZsdXNoQmF0Y2hlZFVwZGF0ZXNcIixmdW5jdGlvbigpe2Zvcig7bS5sZW5ndGh8fHk7KXtpZihtLmxlbmd0aCl7dmFyIGU9ci5nZXRQb29sZWQoKTtlLnBlcmZvcm0oYSxudWxsLGUpLHIucmVsZWFzZShlKX1pZih5KXt5PSExO3ZhciB0PXY7dj1jLmdldFBvb2xlZCgpLHQubm90aWZ5QWxsKCksYy5yZWxlYXNlKHQpfX19KSxiPXtpbmplY3RSZWNvbmNpbGVUcmFuc2FjdGlvbjpmdW5jdGlvbihlKXtoKGUpLE8uUmVhY3RSZWNvbmNpbGVUcmFuc2FjdGlvbj1lfSxpbmplY3RCYXRjaGluZ1N0cmF0ZWd5OmZ1bmN0aW9uKGUpe2goZSksaChcImZ1bmN0aW9uXCI9PXR5cGVvZiBlLmJhdGNoZWRVcGRhdGVzKSxoKFwiYm9vbGVhblwiPT10eXBlb2YgZS5pc0JhdGNoaW5nVXBkYXRlcyksZz1lfX0sTz17UmVhY3RSZWNvbmNpbGVUcmFuc2FjdGlvbjpudWxsLGJhdGNoZWRVcGRhdGVzOm8sZW5xdWV1ZVVwZGF0ZTpzLGZsdXNoQmF0Y2hlZFVwZGF0ZXM6TSxpbmplY3Rpb246Yixhc2FwOnV9O3QuZXhwb3J0cz1PfSx7XCIuL0NhbGxiYWNrUXVldWVcIjo3LFwiLi9PYmplY3QuYXNzaWduXCI6MjksXCIuL1Bvb2xlZENsYXNzXCI6MzAsXCIuL1JlYWN0Q3VycmVudE93bmVyXCI6NDIsXCIuL1JlYWN0UGVyZlwiOjczLFwiLi9UcmFuc2FjdGlvblwiOjEwNCxcIi4vaW52YXJpYW50XCI6MTM3LFwiLi93YXJuaW5nXCI6MTU1fV0sODk6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG49ZShcIi4vRE9NUHJvcGVydHlcIikscj1uLmluamVjdGlvbi5NVVNUX1VTRV9BVFRSSUJVVEUsbz17UHJvcGVydGllczp7Y3g6cixjeTpyLGQ6cixkeDpyLGR5OnIsZmlsbDpyLGZpbGxPcGFjaXR5OnIsZm9udEZhbWlseTpyLGZvbnRTaXplOnIsZng6cixmeTpyLGdyYWRpZW50VHJhbnNmb3JtOnIsZ3JhZGllbnRVbml0czpyLG1hcmtlckVuZDpyLG1hcmtlck1pZDpyLG1hcmtlclN0YXJ0OnIsb2Zmc2V0OnIsb3BhY2l0eTpyLHBhdHRlcm5Db250ZW50VW5pdHM6cixwYXR0ZXJuVW5pdHM6cixwb2ludHM6cixwcmVzZXJ2ZUFzcGVjdFJhdGlvOnIscjpyLHJ4OnIscnk6cixzcHJlYWRNZXRob2Q6cixzdG9wQ29sb3I6cixzdG9wT3BhY2l0eTpyLHN0cm9rZTpyLHN0cm9rZURhc2hhcnJheTpyLHN0cm9rZUxpbmVjYXA6cixzdHJva2VPcGFjaXR5OnIsc3Ryb2tlV2lkdGg6cix0ZXh0QW5jaG9yOnIsdHJhbnNmb3JtOnIsdmVyc2lvbjpyLHZpZXdCb3g6cix4MTpyLHgyOnIseDpyLHkxOnIseTI6cix5OnJ9LERPTUF0dHJpYnV0ZU5hbWVzOntmaWxsT3BhY2l0eTpcImZpbGwtb3BhY2l0eVwiLGZvbnRGYW1pbHk6XCJmb250LWZhbWlseVwiLGZvbnRTaXplOlwiZm9udC1zaXplXCIsZ3JhZGllbnRUcmFuc2Zvcm06XCJncmFkaWVudFRyYW5zZm9ybVwiLGdyYWRpZW50VW5pdHM6XCJncmFkaWVudFVuaXRzXCIsbWFya2VyRW5kOlwibWFya2VyLWVuZFwiLG1hcmtlck1pZDpcIm1hcmtlci1taWRcIixtYXJrZXJTdGFydDpcIm1hcmtlci1zdGFydFwiLHBhdHRlcm5Db250ZW50VW5pdHM6XCJwYXR0ZXJuQ29udGVudFVuaXRzXCIscGF0dGVyblVuaXRzOlwicGF0dGVyblVuaXRzXCIscHJlc2VydmVBc3BlY3RSYXRpbzpcInByZXNlcnZlQXNwZWN0UmF0aW9cIixzcHJlYWRNZXRob2Q6XCJzcHJlYWRNZXRob2RcIixzdG9wQ29sb3I6XCJzdG9wLWNvbG9yXCIsc3RvcE9wYWNpdHk6XCJzdG9wLW9wYWNpdHlcIixzdHJva2VEYXNoYXJyYXk6XCJzdHJva2UtZGFzaGFycmF5XCIsc3Ryb2tlTGluZWNhcDpcInN0cm9rZS1saW5lY2FwXCIsc3Ryb2tlT3BhY2l0eTpcInN0cm9rZS1vcGFjaXR5XCIsc3Ryb2tlV2lkdGg6XCJzdHJva2Utd2lkdGhcIix0ZXh0QW5jaG9yOlwidGV4dC1hbmNob3JcIix2aWV3Qm94Olwidmlld0JveFwifX07dC5leHBvcnRzPW99LHtcIi4vRE9NUHJvcGVydHlcIjoxMn1dLDkwOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSl7aWYoXCJzZWxlY3Rpb25TdGFydFwiaW4gZSYmYS5oYXNTZWxlY3Rpb25DYXBhYmlsaXRpZXMoZSkpcmV0dXJue3N0YXJ0OmUuc2VsZWN0aW9uU3RhcnQsZW5kOmUuc2VsZWN0aW9uRW5kfTtpZih3aW5kb3cuZ2V0U2VsZWN0aW9uKXt2YXIgdD13aW5kb3cuZ2V0U2VsZWN0aW9uKCk7cmV0dXJue2FuY2hvck5vZGU6dC5hbmNob3JOb2RlLGFuY2hvck9mZnNldDp0LmFuY2hvck9mZnNldCxmb2N1c05vZGU6dC5mb2N1c05vZGUsZm9jdXNPZmZzZXQ6dC5mb2N1c09mZnNldH19aWYoZG9jdW1lbnQuc2VsZWN0aW9uKXt2YXIgbj1kb2N1bWVudC5zZWxlY3Rpb24uY3JlYXRlUmFuZ2UoKTtyZXR1cm57cGFyZW50RWxlbWVudDpuLnBhcmVudEVsZW1lbnQoKSx0ZXh0Om4udGV4dCx0b3A6bi5ib3VuZGluZ1RvcCxsZWZ0Om4uYm91bmRpbmdMZWZ0fX19ZnVuY3Rpb24gcihlKXtpZigheSYmbnVsbCE9aCYmaD09dSgpKXt2YXIgdD1uKGgpO2lmKCF2fHwhcCh2LHQpKXt2PXQ7dmFyIHI9cy5nZXRQb29sZWQoZi5zZWxlY3QsbSxlKTtyZXR1cm4gci50eXBlPVwic2VsZWN0XCIsci50YXJnZXQ9aCxpLmFjY3VtdWxhdGVUd29QaGFzZURpc3BhdGNoZXMocikscn19fXZhciBvPWUoXCIuL0V2ZW50Q29uc3RhbnRzXCIpLGk9ZShcIi4vRXZlbnRQcm9wYWdhdG9yc1wiKSxhPWUoXCIuL1JlYWN0SW5wdXRTZWxlY3Rpb25cIikscz1lKFwiLi9TeW50aGV0aWNFdmVudFwiKSx1PWUoXCIuL2dldEFjdGl2ZUVsZW1lbnRcIiksYz1lKFwiLi9pc1RleHRJbnB1dEVsZW1lbnRcIiksbD1lKFwiLi9rZXlPZlwiKSxwPWUoXCIuL3NoYWxsb3dFcXVhbFwiKSxkPW8udG9wTGV2ZWxUeXBlcyxmPXtzZWxlY3Q6e3BoYXNlZFJlZ2lzdHJhdGlvbk5hbWVzOntidWJibGVkOmwoe29uU2VsZWN0Om51bGx9KSxjYXB0dXJlZDpsKHtvblNlbGVjdENhcHR1cmU6bnVsbH0pfSxkZXBlbmRlbmNpZXM6W2QudG9wQmx1cixkLnRvcENvbnRleHRNZW51LGQudG9wRm9jdXMsZC50b3BLZXlEb3duLGQudG9wTW91c2VEb3duLGQudG9wTW91c2VVcCxkLnRvcFNlbGVjdGlvbkNoYW5nZV19fSxoPW51bGwsbT1udWxsLHY9bnVsbCx5PSExLGc9e2V2ZW50VHlwZXM6ZixleHRyYWN0RXZlbnRzOmZ1bmN0aW9uKGUsdCxuLG8pe3N3aXRjaChlKXtjYXNlIGQudG9wRm9jdXM6KGModCl8fFwidHJ1ZVwiPT09dC5jb250ZW50RWRpdGFibGUpJiYoaD10LG09bix2PW51bGwpO2JyZWFrO2Nhc2UgZC50b3BCbHVyOmg9bnVsbCxtPW51bGwsdj1udWxsO2JyZWFrO2Nhc2UgZC50b3BNb3VzZURvd246eT0hMDticmVhaztjYXNlIGQudG9wQ29udGV4dE1lbnU6Y2FzZSBkLnRvcE1vdXNlVXA6cmV0dXJuIHk9ITEscihvKTtjYXNlIGQudG9wU2VsZWN0aW9uQ2hhbmdlOmNhc2UgZC50b3BLZXlEb3duOmNhc2UgZC50b3BLZXlVcDpyZXR1cm4gcihvKX19fTt0LmV4cG9ydHM9Z30se1wiLi9FdmVudENvbnN0YW50c1wiOjE3LFwiLi9FdmVudFByb3BhZ2F0b3JzXCI6MjIsXCIuL1JlYWN0SW5wdXRTZWxlY3Rpb25cIjo2MyxcIi4vU3ludGhldGljRXZlbnRcIjo5NixcIi4vZ2V0QWN0aXZlRWxlbWVudFwiOjEyNCxcIi4vaXNUZXh0SW5wdXRFbGVtZW50XCI6MTQwLFwiLi9rZXlPZlwiOjE0NCxcIi4vc2hhbGxvd0VxdWFsXCI6MTUwfV0sOTE6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG49TWF0aC5wb3coMiw1Mykscj17Y3JlYXRlUmVhY3RSb290SW5kZXg6ZnVuY3Rpb24oKXtyZXR1cm4gTWF0aC5jZWlsKE1hdGgucmFuZG9tKCkqbil9fTt0LmV4cG9ydHM9cn0se31dLDkyOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPWUoXCIuL0V2ZW50Q29uc3RhbnRzXCIpLHI9ZShcIi4vRXZlbnRQbHVnaW5VdGlsc1wiKSxvPWUoXCIuL0V2ZW50UHJvcGFnYXRvcnNcIiksaT1lKFwiLi9TeW50aGV0aWNDbGlwYm9hcmRFdmVudFwiKSxhPWUoXCIuL1N5bnRoZXRpY0V2ZW50XCIpLHM9ZShcIi4vU3ludGhldGljRm9jdXNFdmVudFwiKSx1PWUoXCIuL1N5bnRoZXRpY0tleWJvYXJkRXZlbnRcIiksYz1lKFwiLi9TeW50aGV0aWNNb3VzZUV2ZW50XCIpLGw9ZShcIi4vU3ludGhldGljRHJhZ0V2ZW50XCIpLHA9ZShcIi4vU3ludGhldGljVG91Y2hFdmVudFwiKSxkPWUoXCIuL1N5bnRoZXRpY1VJRXZlbnRcIiksZj1lKFwiLi9TeW50aGV0aWNXaGVlbEV2ZW50XCIpLGg9ZShcIi4vZ2V0RXZlbnRDaGFyQ29kZVwiKSxtPWUoXCIuL2ludmFyaWFudFwiKSx2PWUoXCIuL2tleU9mXCIpLHk9KGUoXCIuL3dhcm5pbmdcIiksbi50b3BMZXZlbFR5cGVzKSxnPXtibHVyOntwaGFzZWRSZWdpc3RyYXRpb25OYW1lczp7YnViYmxlZDp2KHtvbkJsdXI6ITB9KSxjYXB0dXJlZDp2KHtvbkJsdXJDYXB0dXJlOiEwfSl9fSxjbGljazp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dih7b25DbGljazohMH0pLGNhcHR1cmVkOnYoe29uQ2xpY2tDYXB0dXJlOiEwfSl9fSxjb250ZXh0TWVudTp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dih7b25Db250ZXh0TWVudTohMH0pLGNhcHR1cmVkOnYoe29uQ29udGV4dE1lbnVDYXB0dXJlOiEwfSl9fSxjb3B5OntwaGFzZWRSZWdpc3RyYXRpb25OYW1lczp7YnViYmxlZDp2KHtvbkNvcHk6ITB9KSxjYXB0dXJlZDp2KHtvbkNvcHlDYXB0dXJlOiEwfSl9fSxjdXQ6e3BoYXNlZFJlZ2lzdHJhdGlvbk5hbWVzOntidWJibGVkOnYoe29uQ3V0OiEwfSksY2FwdHVyZWQ6dih7b25DdXRDYXB0dXJlOiEwfSl9fSxkb3VibGVDbGljazp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dih7b25Eb3VibGVDbGljazohMH0pLGNhcHR1cmVkOnYoe29uRG91YmxlQ2xpY2tDYXB0dXJlOiEwfSl9fSxkcmFnOntwaGFzZWRSZWdpc3RyYXRpb25OYW1lczp7YnViYmxlZDp2KHtvbkRyYWc6ITB9KSxjYXB0dXJlZDp2KHtvbkRyYWdDYXB0dXJlOiEwfSl9fSxkcmFnRW5kOntwaGFzZWRSZWdpc3RyYXRpb25OYW1lczp7YnViYmxlZDp2KHtvbkRyYWdFbmQ6ITB9KSxjYXB0dXJlZDp2KHtvbkRyYWdFbmRDYXB0dXJlOiEwfSl9fSxkcmFnRW50ZXI6e3BoYXNlZFJlZ2lzdHJhdGlvbk5hbWVzOntidWJibGVkOnYoe29uRHJhZ0VudGVyOiEwfSksY2FwdHVyZWQ6dih7b25EcmFnRW50ZXJDYXB0dXJlOiEwfSl9fSxkcmFnRXhpdDp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dih7b25EcmFnRXhpdDohMH0pLGNhcHR1cmVkOnYoe29uRHJhZ0V4aXRDYXB0dXJlOiEwfSl9fSxkcmFnTGVhdmU6e3BoYXNlZFJlZ2lzdHJhdGlvbk5hbWVzOntidWJibGVkOnYoe29uRHJhZ0xlYXZlOiEwfSksY2FwdHVyZWQ6dih7b25EcmFnTGVhdmVDYXB0dXJlOiEwfSl9fSxkcmFnT3Zlcjp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dih7b25EcmFnT3ZlcjohMH0pLGNhcHR1cmVkOnYoe29uRHJhZ092ZXJDYXB0dXJlOiEwfSl9fSxkcmFnU3RhcnQ6e3BoYXNlZFJlZ2lzdHJhdGlvbk5hbWVzOntidWJibGVkOnYoe29uRHJhZ1N0YXJ0OiEwfSksY2FwdHVyZWQ6dih7b25EcmFnU3RhcnRDYXB0dXJlOiEwfSl9fSxkcm9wOntwaGFzZWRSZWdpc3RyYXRpb25OYW1lczp7YnViYmxlZDp2KHtvbkRyb3A6ITB9KSxjYXB0dXJlZDp2KHtvbkRyb3BDYXB0dXJlOiEwfSl9fSxmb2N1czp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dih7b25Gb2N1czohMH0pLGNhcHR1cmVkOnYoe29uRm9jdXNDYXB0dXJlOiEwfSl9fSxpbnB1dDp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dih7b25JbnB1dDohMH0pLGNhcHR1cmVkOnYoe29uSW5wdXRDYXB0dXJlOiEwfSl9fSxrZXlEb3duOntwaGFzZWRSZWdpc3RyYXRpb25OYW1lczp7YnViYmxlZDp2KHtvbktleURvd246ITB9KSxjYXB0dXJlZDp2KHtvbktleURvd25DYXB0dXJlOiEwfSl9fSxrZXlQcmVzczp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dih7b25LZXlQcmVzczohMH0pLGNhcHR1cmVkOnYoe29uS2V5UHJlc3NDYXB0dXJlOiEwfSl9fSxrZXlVcDp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dih7b25LZXlVcDohMH0pLGNhcHR1cmVkOnYoe29uS2V5VXBDYXB0dXJlOiEwfSl9fSxsb2FkOntwaGFzZWRSZWdpc3RyYXRpb25OYW1lczp7YnViYmxlZDp2KHtvbkxvYWQ6ITB9KSxjYXB0dXJlZDp2KHtvbkxvYWRDYXB0dXJlOiEwfSl9fSxlcnJvcjp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dih7b25FcnJvcjohMH0pLGNhcHR1cmVkOnYoe29uRXJyb3JDYXB0dXJlOiEwfSl9fSxtb3VzZURvd246e3BoYXNlZFJlZ2lzdHJhdGlvbk5hbWVzOntidWJibGVkOnYoe29uTW91c2VEb3duOiEwfSksY2FwdHVyZWQ6dih7b25Nb3VzZURvd25DYXB0dXJlOiEwfSl9fSxtb3VzZU1vdmU6e3BoYXNlZFJlZ2lzdHJhdGlvbk5hbWVzOntidWJibGVkOnYoe29uTW91c2VNb3ZlOiEwfSksY2FwdHVyZWQ6dih7b25Nb3VzZU1vdmVDYXB0dXJlOiEwfSl9fSxtb3VzZU91dDp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dih7b25Nb3VzZU91dDohMH0pLGNhcHR1cmVkOnYoe29uTW91c2VPdXRDYXB0dXJlOiEwfSl9fSxtb3VzZU92ZXI6e3BoYXNlZFJlZ2lzdHJhdGlvbk5hbWVzOntidWJibGVkOnYoe29uTW91c2VPdmVyOiEwfSksY2FwdHVyZWQ6dih7b25Nb3VzZU92ZXJDYXB0dXJlOiEwfSl9fSxtb3VzZVVwOntwaGFzZWRSZWdpc3RyYXRpb25OYW1lczp7YnViYmxlZDp2KHtvbk1vdXNlVXA6ITB9KSxjYXB0dXJlZDp2KHtvbk1vdXNlVXBDYXB0dXJlOiEwfSl9fSxwYXN0ZTp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dih7b25QYXN0ZTohMH0pLGNhcHR1cmVkOnYoe29uUGFzdGVDYXB0dXJlOiEwfSl9fSxyZXNldDp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dih7b25SZXNldDohMH0pLGNhcHR1cmVkOnYoe29uUmVzZXRDYXB0dXJlOiEwfSl9fSxzY3JvbGw6e3BoYXNlZFJlZ2lzdHJhdGlvbk5hbWVzOntidWJibGVkOnYoe29uU2Nyb2xsOiEwfSksY2FwdHVyZWQ6dih7b25TY3JvbGxDYXB0dXJlOiEwfSl9fSxzdWJtaXQ6e3BoYXNlZFJlZ2lzdHJhdGlvbk5hbWVzOntidWJibGVkOnYoe29uU3VibWl0OiEwfSksY2FwdHVyZWQ6dih7b25TdWJtaXRDYXB0dXJlOiEwfSl9fSx0b3VjaENhbmNlbDp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dih7b25Ub3VjaENhbmNlbDohMH0pLGNhcHR1cmVkOnYoe29uVG91Y2hDYW5jZWxDYXB0dXJlOiEwfSl9fSx0b3VjaEVuZDp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dih7b25Ub3VjaEVuZDohMH0pLGNhcHR1cmVkOnYoe29uVG91Y2hFbmRDYXB0dXJlOiEwfSl9fSx0b3VjaE1vdmU6e3BoYXNlZFJlZ2lzdHJhdGlvbk5hbWVzOntidWJibGVkOnYoe29uVG91Y2hNb3ZlOiEwfSksY2FwdHVyZWQ6dih7b25Ub3VjaE1vdmVDYXB0dXJlOiEwfSl9fSx0b3VjaFN0YXJ0OntwaGFzZWRSZWdpc3RyYXRpb25OYW1lczp7YnViYmxlZDp2KHtvblRvdWNoU3RhcnQ6ITB9KSxjYXB0dXJlZDp2KHtvblRvdWNoU3RhcnRDYXB0dXJlOiEwfSl9fSx3aGVlbDp7cGhhc2VkUmVnaXN0cmF0aW9uTmFtZXM6e2J1YmJsZWQ6dih7b25XaGVlbDohMH0pLGNhcHR1cmVkOnYoe29uV2hlZWxDYXB0dXJlOiEwfSl9fX0sRT17dG9wQmx1cjpnLmJsdXIsdG9wQ2xpY2s6Zy5jbGljayx0b3BDb250ZXh0TWVudTpnLmNvbnRleHRNZW51LHRvcENvcHk6Zy5jb3B5LHRvcEN1dDpnLmN1dCx0b3BEb3VibGVDbGljazpnLmRvdWJsZUNsaWNrLHRvcERyYWc6Zy5kcmFnLHRvcERyYWdFbmQ6Zy5kcmFnRW5kLHRvcERyYWdFbnRlcjpnLmRyYWdFbnRlcix0b3BEcmFnRXhpdDpnLmRyYWdFeGl0LHRvcERyYWdMZWF2ZTpnLmRyYWdMZWF2ZSx0b3BEcmFnT3ZlcjpnLmRyYWdPdmVyLHRvcERyYWdTdGFydDpnLmRyYWdTdGFydCx0b3BEcm9wOmcuZHJvcCx0b3BFcnJvcjpnLmVycm9yLHRvcEZvY3VzOmcuZm9jdXMsdG9wSW5wdXQ6Zy5pbnB1dCx0b3BLZXlEb3duOmcua2V5RG93bix0b3BLZXlQcmVzczpnLmtleVByZXNzLHRvcEtleVVwOmcua2V5VXAsdG9wTG9hZDpnLmxvYWQsdG9wTW91c2VEb3duOmcubW91c2VEb3duLHRvcE1vdXNlTW92ZTpnLm1vdXNlTW92ZSx0b3BNb3VzZU91dDpnLm1vdXNlT3V0LHRvcE1vdXNlT3ZlcjpnLm1vdXNlT3Zlcix0b3BNb3VzZVVwOmcubW91c2VVcCx0b3BQYXN0ZTpnLnBhc3RlLHRvcFJlc2V0OmcucmVzZXQsdG9wU2Nyb2xsOmcuc2Nyb2xsLHRvcFN1Ym1pdDpnLnN1Ym1pdCx0b3BUb3VjaENhbmNlbDpnLnRvdWNoQ2FuY2VsLHRvcFRvdWNoRW5kOmcudG91Y2hFbmQsdG9wVG91Y2hNb3ZlOmcudG91Y2hNb3ZlLHRvcFRvdWNoU3RhcnQ6Zy50b3VjaFN0YXJ0LHRvcFdoZWVsOmcud2hlZWx9O2Zvcih2YXIgQyBpbiBFKUVbQ10uZGVwZW5kZW5jaWVzPVtDXTt2YXIgUj17ZXZlbnRUeXBlczpnLGV4ZWN1dGVEaXNwYXRjaDpmdW5jdGlvbihlLHQsbil7dmFyIG89ci5leGVjdXRlRGlzcGF0Y2goZSx0LG4pO289PT0hMSYmKGUuc3RvcFByb3BhZ2F0aW9uKCksZS5wcmV2ZW50RGVmYXVsdCgpKX0sZXh0cmFjdEV2ZW50czpmdW5jdGlvbihlLHQsbixyKXt2YXIgdj1FW2VdO2lmKCF2KXJldHVybiBudWxsO3ZhciBnO3N3aXRjaChlKXtjYXNlIHkudG9wSW5wdXQ6Y2FzZSB5LnRvcExvYWQ6Y2FzZSB5LnRvcEVycm9yOmNhc2UgeS50b3BSZXNldDpjYXNlIHkudG9wU3VibWl0Omc9YTticmVhaztjYXNlIHkudG9wS2V5UHJlc3M6aWYoMD09PWgocikpcmV0dXJuIG51bGw7Y2FzZSB5LnRvcEtleURvd246Y2FzZSB5LnRvcEtleVVwOmc9dTticmVhaztjYXNlIHkudG9wQmx1cjpjYXNlIHkudG9wRm9jdXM6Zz1zO2JyZWFrO2Nhc2UgeS50b3BDbGljazppZigyPT09ci5idXR0b24pcmV0dXJuIG51bGw7Y2FzZSB5LnRvcENvbnRleHRNZW51OmNhc2UgeS50b3BEb3VibGVDbGljazpjYXNlIHkudG9wTW91c2VEb3duOmNhc2UgeS50b3BNb3VzZU1vdmU6Y2FzZSB5LnRvcE1vdXNlT3V0OmNhc2UgeS50b3BNb3VzZU92ZXI6Y2FzZSB5LnRvcE1vdXNlVXA6Zz1jO2JyZWFrO2Nhc2UgeS50b3BEcmFnOmNhc2UgeS50b3BEcmFnRW5kOmNhc2UgeS50b3BEcmFnRW50ZXI6Y2FzZSB5LnRvcERyYWdFeGl0OmNhc2UgeS50b3BEcmFnTGVhdmU6Y2FzZSB5LnRvcERyYWdPdmVyOmNhc2UgeS50b3BEcmFnU3RhcnQ6Y2FzZSB5LnRvcERyb3A6Zz1sO2JyZWFrO2Nhc2UgeS50b3BUb3VjaENhbmNlbDpjYXNlIHkudG9wVG91Y2hFbmQ6Y2FzZSB5LnRvcFRvdWNoTW92ZTpjYXNlIHkudG9wVG91Y2hTdGFydDpnPXA7YnJlYWs7Y2FzZSB5LnRvcFNjcm9sbDpnPWQ7YnJlYWs7Y2FzZSB5LnRvcFdoZWVsOmc9ZjticmVhaztjYXNlIHkudG9wQ29weTpjYXNlIHkudG9wQ3V0OmNhc2UgeS50b3BQYXN0ZTpnPWl9bShnKTt2YXIgQz1nLmdldFBvb2xlZCh2LG4scik7cmV0dXJuIG8uYWNjdW11bGF0ZVR3b1BoYXNlRGlzcGF0Y2hlcyhDKSxDfX07dC5leHBvcnRzPVJ9LHtcIi4vRXZlbnRDb25zdGFudHNcIjoxNyxcIi4vRXZlbnRQbHVnaW5VdGlsc1wiOjIxLFwiLi9FdmVudFByb3BhZ2F0b3JzXCI6MjIsXCIuL1N5bnRoZXRpY0NsaXBib2FyZEV2ZW50XCI6OTMsXCIuL1N5bnRoZXRpY0RyYWdFdmVudFwiOjk1LFwiLi9TeW50aGV0aWNFdmVudFwiOjk2LFwiLi9TeW50aGV0aWNGb2N1c0V2ZW50XCI6OTcsXCIuL1N5bnRoZXRpY0tleWJvYXJkRXZlbnRcIjo5OSxcIi4vU3ludGhldGljTW91c2VFdmVudFwiOjEwMCxcIi4vU3ludGhldGljVG91Y2hFdmVudFwiOjEwMSxcIi4vU3ludGhldGljVUlFdmVudFwiOjEwMixcIi4vU3ludGhldGljV2hlZWxFdmVudFwiOjEwMyxcIi4vZ2V0RXZlbnRDaGFyQ29kZVwiOjEyNSxcIi4vaW52YXJpYW50XCI6MTM3LFwiLi9rZXlPZlwiOjE0NCxcIi4vd2FybmluZ1wiOjE1NX1dLDkzOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSx0LG4pe3IuY2FsbCh0aGlzLGUsdCxuKX12YXIgcj1lKFwiLi9TeW50aGV0aWNFdmVudFwiKSxvPXtjbGlwYm9hcmREYXRhOmZ1bmN0aW9uKGUpe3JldHVyblwiY2xpcGJvYXJkRGF0YVwiaW4gZT9lLmNsaXBib2FyZERhdGE6d2luZG93LmNsaXBib2FyZERhdGF9fTtyLmF1Z21lbnRDbGFzcyhuLG8pLHQuZXhwb3J0cz1ufSx7XCIuL1N5bnRoZXRpY0V2ZW50XCI6OTZ9XSw5NDpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUsdCxuKXtyLmNhbGwodGhpcyxlLHQsbil9dmFyIHI9ZShcIi4vU3ludGhldGljRXZlbnRcIiksbz17ZGF0YTpudWxsfTtyLmF1Z21lbnRDbGFzcyhuLG8pLHQuZXhwb3J0cz1ufSx7XCIuL1N5bnRoZXRpY0V2ZW50XCI6OTZ9XSw5NTpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUsdCxuKXtyLmNhbGwodGhpcyxlLHQsbil9dmFyIHI9ZShcIi4vU3ludGhldGljTW91c2VFdmVudFwiKSxvPXtkYXRhVHJhbnNmZXI6bnVsbH07ci5hdWdtZW50Q2xhc3MobixvKSx0LmV4cG9ydHM9bn0se1wiLi9TeW50aGV0aWNNb3VzZUV2ZW50XCI6MTAwfV0sOTY6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlLHQsbil7dGhpcy5kaXNwYXRjaENvbmZpZz1lLHRoaXMuZGlzcGF0Y2hNYXJrZXI9dCx0aGlzLm5hdGl2ZUV2ZW50PW47dmFyIHI9dGhpcy5jb25zdHJ1Y3Rvci5JbnRlcmZhY2U7Zm9yKHZhciBvIGluIHIpaWYoci5oYXNPd25Qcm9wZXJ0eShvKSl7dmFyIGE9cltvXTt0aGlzW29dPWE/YShuKTpuW29dfXZhciBzPW51bGwhPW4uZGVmYXVsdFByZXZlbnRlZD9uLmRlZmF1bHRQcmV2ZW50ZWQ6bi5yZXR1cm5WYWx1ZT09PSExO3RoaXMuaXNEZWZhdWx0UHJldmVudGVkPXM/aS50aGF0UmV0dXJuc1RydWU6aS50aGF0UmV0dXJuc0ZhbHNlLHRoaXMuaXNQcm9wYWdhdGlvblN0b3BwZWQ9aS50aGF0UmV0dXJuc0ZhbHNlfXZhciByPWUoXCIuL1Bvb2xlZENsYXNzXCIpLG89ZShcIi4vT2JqZWN0LmFzc2lnblwiKSxpPWUoXCIuL2VtcHR5RnVuY3Rpb25cIiksYT1lKFwiLi9nZXRFdmVudFRhcmdldFwiKSxzPXt0eXBlOm51bGwsdGFyZ2V0OmEsY3VycmVudFRhcmdldDppLnRoYXRSZXR1cm5zTnVsbCxldmVudFBoYXNlOm51bGwsYnViYmxlczpudWxsLGNhbmNlbGFibGU6bnVsbCx0aW1lU3RhbXA6ZnVuY3Rpb24oZSl7cmV0dXJuIGUudGltZVN0YW1wfHxEYXRlLm5vdygpfSxkZWZhdWx0UHJldmVudGVkOm51bGwsaXNUcnVzdGVkOm51bGx9O28obi5wcm90b3R5cGUse3ByZXZlbnREZWZhdWx0OmZ1bmN0aW9uKCl7dGhpcy5kZWZhdWx0UHJldmVudGVkPSEwO3ZhciBlPXRoaXMubmF0aXZlRXZlbnQ7ZS5wcmV2ZW50RGVmYXVsdD9lLnByZXZlbnREZWZhdWx0KCk6ZS5yZXR1cm5WYWx1ZT0hMSx0aGlzLmlzRGVmYXVsdFByZXZlbnRlZD1pLnRoYXRSZXR1cm5zVHJ1ZX0sc3RvcFByb3BhZ2F0aW9uOmZ1bmN0aW9uKCl7dmFyIGU9dGhpcy5uYXRpdmVFdmVudDtlLnN0b3BQcm9wYWdhdGlvbj9lLnN0b3BQcm9wYWdhdGlvbigpOmUuY2FuY2VsQnViYmxlPSEwLHRoaXMuaXNQcm9wYWdhdGlvblN0b3BwZWQ9aS50aGF0UmV0dXJuc1RydWV9LHBlcnNpc3Q6ZnVuY3Rpb24oKXt0aGlzLmlzUGVyc2lzdGVudD1pLnRoYXRSZXR1cm5zVHJ1ZX0saXNQZXJzaXN0ZW50OmkudGhhdFJldHVybnNGYWxzZSxkZXN0cnVjdG9yOmZ1bmN0aW9uKCl7dmFyIGU9dGhpcy5jb25zdHJ1Y3Rvci5JbnRlcmZhY2U7Zm9yKHZhciB0IGluIGUpdGhpc1t0XT1udWxsO3RoaXMuZGlzcGF0Y2hDb25maWc9bnVsbCx0aGlzLmRpc3BhdGNoTWFya2VyPW51bGwsdGhpcy5uYXRpdmVFdmVudD1udWxsfX0pLG4uSW50ZXJmYWNlPXMsbi5hdWdtZW50Q2xhc3M9ZnVuY3Rpb24oZSx0KXt2YXIgbj10aGlzLGk9T2JqZWN0LmNyZWF0ZShuLnByb3RvdHlwZSk7byhpLGUucHJvdG90eXBlKSxlLnByb3RvdHlwZT1pLGUucHJvdG90eXBlLmNvbnN0cnVjdG9yPWUsZS5JbnRlcmZhY2U9byh7fSxuLkludGVyZmFjZSx0KSxlLmF1Z21lbnRDbGFzcz1uLmF1Z21lbnRDbGFzcyxyLmFkZFBvb2xpbmdUbyhlLHIudGhyZWVBcmd1bWVudFBvb2xlcil9LHIuYWRkUG9vbGluZ1RvKG4sci50aHJlZUFyZ3VtZW50UG9vbGVyKSx0LmV4cG9ydHM9bn0se1wiLi9PYmplY3QuYXNzaWduXCI6MjksXCIuL1Bvb2xlZENsYXNzXCI6MzAsXCIuL2VtcHR5RnVuY3Rpb25cIjoxMTgsXCIuL2dldEV2ZW50VGFyZ2V0XCI6MTI4fV0sOTc6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlLHQsbil7ci5jYWxsKHRoaXMsZSx0LG4pfXZhciByPWUoXCIuL1N5bnRoZXRpY1VJRXZlbnRcIiksbz17cmVsYXRlZFRhcmdldDpudWxsfTtyLmF1Z21lbnRDbGFzcyhuLG8pLHQuZXhwb3J0cz1ufSx7XCIuL1N5bnRoZXRpY1VJRXZlbnRcIjoxMDJ9XSw5ODpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUsdCxuKXtyLmNhbGwodGhpcyxlLHQsbil9dmFyIHI9ZShcIi4vU3ludGhldGljRXZlbnRcIiksbz17ZGF0YTpudWxsfTtyLmF1Z21lbnRDbGFzcyhuLG8pLHQuZXhwb3J0cz1ufSx7XCIuL1N5bnRoZXRpY0V2ZW50XCI6OTZ9XSw5OTpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUsdCxuKXtyLmNhbGwodGhpcyxlLHQsbil9dmFyIHI9ZShcIi4vU3ludGhldGljVUlFdmVudFwiKSxvPWUoXCIuL2dldEV2ZW50Q2hhckNvZGVcIiksaT1lKFwiLi9nZXRFdmVudEtleVwiKSxhPWUoXCIuL2dldEV2ZW50TW9kaWZpZXJTdGF0ZVwiKSxzPXtrZXk6aSxsb2NhdGlvbjpudWxsLGN0cmxLZXk6bnVsbCxzaGlmdEtleTpudWxsLGFsdEtleTpudWxsLG1ldGFLZXk6bnVsbCxyZXBlYXQ6bnVsbCxsb2NhbGU6bnVsbCxnZXRNb2RpZmllclN0YXRlOmEsY2hhckNvZGU6ZnVuY3Rpb24oZSl7cmV0dXJuXCJrZXlwcmVzc1wiPT09ZS50eXBlP28oZSk6MH0sa2V5Q29kZTpmdW5jdGlvbihlKXtyZXR1cm5cImtleWRvd25cIj09PWUudHlwZXx8XCJrZXl1cFwiPT09ZS50eXBlP2Uua2V5Q29kZTowfSx3aGljaDpmdW5jdGlvbihlKXtyZXR1cm5cImtleXByZXNzXCI9PT1lLnR5cGU/byhlKTpcImtleWRvd25cIj09PWUudHlwZXx8XCJrZXl1cFwiPT09ZS50eXBlP2Uua2V5Q29kZTowfX07ci5hdWdtZW50Q2xhc3MobixzKSx0LmV4cG9ydHM9bn0se1wiLi9TeW50aGV0aWNVSUV2ZW50XCI6MTAyLFwiLi9nZXRFdmVudENoYXJDb2RlXCI6MTI1LFwiLi9nZXRFdmVudEtleVwiOjEyNixcIi4vZ2V0RXZlbnRNb2RpZmllclN0YXRlXCI6MTI3fV0sMTAwOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSx0LG4pe3IuY2FsbCh0aGlzLGUsdCxuKX12YXIgcj1lKFwiLi9TeW50aGV0aWNVSUV2ZW50XCIpLG89ZShcIi4vVmlld3BvcnRNZXRyaWNzXCIpLGk9ZShcIi4vZ2V0RXZlbnRNb2RpZmllclN0YXRlXCIpLGE9e3NjcmVlblg6bnVsbCxzY3JlZW5ZOm51bGwsY2xpZW50WDpudWxsLGNsaWVudFk6bnVsbCxjdHJsS2V5Om51bGwsc2hpZnRLZXk6bnVsbCxhbHRLZXk6bnVsbCxtZXRhS2V5Om51bGwsZ2V0TW9kaWZpZXJTdGF0ZTppLGJ1dHRvbjpmdW5jdGlvbihlKXt2YXIgdD1lLmJ1dHRvbjtyZXR1cm5cIndoaWNoXCJpbiBlP3Q6Mj09PXQ/Mjo0PT09dD8xOjB9LGJ1dHRvbnM6bnVsbCxyZWxhdGVkVGFyZ2V0OmZ1bmN0aW9uKGUpe3JldHVybiBlLnJlbGF0ZWRUYXJnZXR8fChlLmZyb21FbGVtZW50PT09ZS5zcmNFbGVtZW50P2UudG9FbGVtZW50OmUuZnJvbUVsZW1lbnQpfSxwYWdlWDpmdW5jdGlvbihlKXtyZXR1cm5cInBhZ2VYXCJpbiBlP2UucGFnZVg6ZS5jbGllbnRYK28uY3VycmVudFNjcm9sbExlZnR9LHBhZ2VZOmZ1bmN0aW9uKGUpe3JldHVyblwicGFnZVlcImluIGU/ZS5wYWdlWTplLmNsaWVudFkrby5jdXJyZW50U2Nyb2xsVG9wfX07ci5hdWdtZW50Q2xhc3MobixhKSx0LmV4cG9ydHM9bn0se1wiLi9TeW50aGV0aWNVSUV2ZW50XCI6MTAyLFwiLi9WaWV3cG9ydE1ldHJpY3NcIjoxMDUsXCIuL2dldEV2ZW50TW9kaWZpZXJTdGF0ZVwiOjEyN31dLDEwMTpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUsdCxuKXtyLmNhbGwodGhpcyxlLHQsbil9dmFyIHI9ZShcIi4vU3ludGhldGljVUlFdmVudFwiKSxvPWUoXCIuL2dldEV2ZW50TW9kaWZpZXJTdGF0ZVwiKSxpPXt0b3VjaGVzOm51bGwsdGFyZ2V0VG91Y2hlczpudWxsLGNoYW5nZWRUb3VjaGVzOm51bGwsYWx0S2V5Om51bGwsbWV0YUtleTpudWxsLGN0cmxLZXk6bnVsbCxzaGlmdEtleTpudWxsLGdldE1vZGlmaWVyU3RhdGU6b307ci5hdWdtZW50Q2xhc3MobixpKSx0LmV4cG9ydHM9bn0se1wiLi9TeW50aGV0aWNVSUV2ZW50XCI6MTAyLFwiLi9nZXRFdmVudE1vZGlmaWVyU3RhdGVcIjoxMjd9XSwxMDI6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlLHQsbil7ci5jYWxsKHRoaXMsZSx0LG4pfXZhciByPWUoXCIuL1N5bnRoZXRpY0V2ZW50XCIpLG89ZShcIi4vZ2V0RXZlbnRUYXJnZXRcIiksaT17dmlldzpmdW5jdGlvbihlKXtpZihlLnZpZXcpcmV0dXJuIGUudmlldzt2YXIgdD1vKGUpO2lmKG51bGwhPXQmJnQud2luZG93PT09dClyZXR1cm4gdDt2YXIgbj10Lm93bmVyRG9jdW1lbnQ7cmV0dXJuIG4/bi5kZWZhdWx0Vmlld3x8bi5wYXJlbnRXaW5kb3c6d2luZG93fSxkZXRhaWw6ZnVuY3Rpb24oZSl7cmV0dXJuIGUuZGV0YWlsfHwwfX07ci5hdWdtZW50Q2xhc3MobixpKSx0LmV4cG9ydHM9bn0se1wiLi9TeW50aGV0aWNFdmVudFwiOjk2LFwiLi9nZXRFdmVudFRhcmdldFwiOjEyOH1dLDEwMzpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUsdCxuKXtyLmNhbGwodGhpcyxlLHQsbil9dmFyIHI9ZShcIi4vU3ludGhldGljTW91c2VFdmVudFwiKSxvPXtkZWx0YVg6ZnVuY3Rpb24oZSl7cmV0dXJuXCJkZWx0YVhcImluIGU/ZS5kZWx0YVg6XCJ3aGVlbERlbHRhWFwiaW4gZT8tZS53aGVlbERlbHRhWDowfSxkZWx0YVk6ZnVuY3Rpb24oZSl7cmV0dXJuXCJkZWx0YVlcImluIGU/ZS5kZWx0YVk6XCJ3aGVlbERlbHRhWVwiaW4gZT8tZS53aGVlbERlbHRhWTpcIndoZWVsRGVsdGFcImluIGU/LWUud2hlZWxEZWx0YTowfSxkZWx0YVo6bnVsbCxkZWx0YU1vZGU6bnVsbH07ci5hdWdtZW50Q2xhc3MobixvKSx0LmV4cG9ydHM9bn0se1wiLi9TeW50aGV0aWNNb3VzZUV2ZW50XCI6MTAwfV0sMTA0OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPWUoXCIuL2ludmFyaWFudFwiKSxyPXtyZWluaXRpYWxpemVUcmFuc2FjdGlvbjpmdW5jdGlvbigpe3RoaXMudHJhbnNhY3Rpb25XcmFwcGVycz10aGlzLmdldFRyYW5zYWN0aW9uV3JhcHBlcnMoKSx0aGlzLndyYXBwZXJJbml0RGF0YT90aGlzLndyYXBwZXJJbml0RGF0YS5sZW5ndGg9MDp0aGlzLndyYXBwZXJJbml0RGF0YT1bXSx0aGlzLl9pc0luVHJhbnNhY3Rpb249ITF9LF9pc0luVHJhbnNhY3Rpb246ITEsZ2V0VHJhbnNhY3Rpb25XcmFwcGVyczpudWxsLGlzSW5UcmFuc2FjdGlvbjpmdW5jdGlvbigpe3JldHVybiEhdGhpcy5faXNJblRyYW5zYWN0aW9ufSxwZXJmb3JtOmZ1bmN0aW9uKGUsdCxyLG8saSxhLHMsdSl7bighdGhpcy5pc0luVHJhbnNhY3Rpb24oKSk7dmFyIGMsbDt0cnl7dGhpcy5faXNJblRyYW5zYWN0aW9uPSEwLGM9ITAsdGhpcy5pbml0aWFsaXplQWxsKDApLGw9ZS5jYWxsKHQscixvLGksYSxzLHUpLGM9ITF9ZmluYWxseXt0cnl7aWYoYyl0cnl7dGhpcy5jbG9zZUFsbCgwKX1jYXRjaChwKXt9ZWxzZSB0aGlzLmNsb3NlQWxsKDApfWZpbmFsbHl7dGhpcy5faXNJblRyYW5zYWN0aW9uPSExfX1yZXR1cm4gbH0saW5pdGlhbGl6ZUFsbDpmdW5jdGlvbihlKXtmb3IodmFyIHQ9dGhpcy50cmFuc2FjdGlvbldyYXBwZXJzLG49ZTtuPHQubGVuZ3RoO24rKyl7dmFyIHI9dFtuXTt0cnl7dGhpcy53cmFwcGVySW5pdERhdGFbbl09by5PQlNFUlZFRF9FUlJPUix0aGlzLndyYXBwZXJJbml0RGF0YVtuXT1yLmluaXRpYWxpemU/ci5pbml0aWFsaXplLmNhbGwodGhpcyk6bnVsbH1maW5hbGx5e2lmKHRoaXMud3JhcHBlckluaXREYXRhW25dPT09by5PQlNFUlZFRF9FUlJPUil0cnl7dGhpcy5pbml0aWFsaXplQWxsKG4rMSl9Y2F0Y2goaSl7fX19fSxjbG9zZUFsbDpmdW5jdGlvbihlKXtuKHRoaXMuaXNJblRyYW5zYWN0aW9uKCkpO2Zvcih2YXIgdD10aGlzLnRyYW5zYWN0aW9uV3JhcHBlcnMscj1lO3I8dC5sZW5ndGg7cisrKXt2YXIgaSxhPXRbcl0scz10aGlzLndyYXBwZXJJbml0RGF0YVtyXTt0cnl7aT0hMCxzIT09by5PQlNFUlZFRF9FUlJPUiYmYS5jbG9zZSYmYS5jbG9zZS5jYWxsKHRoaXMscyksaT0hMX1maW5hbGx5e2lmKGkpdHJ5e3RoaXMuY2xvc2VBbGwocisxKX1jYXRjaCh1KXt9fX10aGlzLndyYXBwZXJJbml0RGF0YS5sZW5ndGg9MH19LG89e01peGluOnIsT0JTRVJWRURfRVJST1I6e319O3QuZXhwb3J0cz1vfSx7XCIuL2ludmFyaWFudFwiOjEzN31dLDEwNTpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbj1lKFwiLi9nZXRVbmJvdW5kZWRTY3JvbGxQb3NpdGlvblwiKSxyPXtjdXJyZW50U2Nyb2xsTGVmdDowLGN1cnJlbnRTY3JvbGxUb3A6MCxyZWZyZXNoU2Nyb2xsVmFsdWVzOmZ1bmN0aW9uKCl7dmFyIGU9bih3aW5kb3cpO3IuY3VycmVudFNjcm9sbExlZnQ9ZS54LHIuY3VycmVudFNjcm9sbFRvcD1lLnl9fTt0LmV4cG9ydHM9cn0se1wiLi9nZXRVbmJvdW5kZWRTY3JvbGxQb3NpdGlvblwiOjEzM31dLDEwNjpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUsdCl7aWYocihudWxsIT10KSxudWxsPT1lKXJldHVybiB0O3ZhciBuPUFycmF5LmlzQXJyYXkoZSksbz1BcnJheS5pc0FycmF5KHQpO3JldHVybiBuJiZvPyhlLnB1c2guYXBwbHkoZSx0KSxlKTpuPyhlLnB1c2godCksZSk6bz9bZV0uY29uY2F0KHQpOltlLHRdfXZhciByPWUoXCIuL2ludmFyaWFudFwiKTt0LmV4cG9ydHM9bn0se1wiLi9pbnZhcmlhbnRcIjoxMzd9XSwxMDc6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlKXtmb3IodmFyIHQ9MSxuPTAsbz0wO288ZS5sZW5ndGg7bysrKXQ9KHQrZS5jaGFyQ29kZUF0KG8pKSVyLG49KG4rdCklcjtyZXR1cm4gdHxuPDwxNn12YXIgcj02NTUyMTt0LmV4cG9ydHM9bn0se31dLDEwODpbZnVuY3Rpb24oZSx0KXtmdW5jdGlvbiBuKGUpe3JldHVybiBlLnJlcGxhY2UocixmdW5jdGlvbihlLHQpe3JldHVybiB0LnRvVXBwZXJDYXNlKCl9KX12YXIgcj0vLSguKS9nO3QuZXhwb3J0cz1ufSx7fV0sMTA5OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSl7cmV0dXJuIHIoZS5yZXBsYWNlKG8sXCJtcy1cIikpfXZhciByPWUoXCIuL2NhbWVsaXplXCIpLG89L14tbXMtLzt0LmV4cG9ydHM9bn0se1wiLi9jYW1lbGl6ZVwiOjEwOH1dLDExMDpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUsdCl7dmFyIG49by5tZXJnZVByb3BzKHQsZS5wcm9wcyk7cmV0dXJuIW4uaGFzT3duUHJvcGVydHkoYSkmJmUucHJvcHMuaGFzT3duUHJvcGVydHkoYSkmJihuLmNoaWxkcmVuPWUucHJvcHMuY2hpbGRyZW4pLHIuY3JlYXRlRWxlbWVudChlLnR5cGUsbil9dmFyIHI9ZShcIi4vUmVhY3RFbGVtZW50XCIpLG89ZShcIi4vUmVhY3RQcm9wVHJhbnNmZXJlclwiKSxpPWUoXCIuL2tleU9mXCIpLGE9KGUoXCIuL3dhcm5pbmdcIiksaSh7Y2hpbGRyZW46bnVsbH0pKTt0LmV4cG9ydHM9bn0se1wiLi9SZWFjdEVsZW1lbnRcIjo1NixcIi4vUmVhY3RQcm9wVHJhbnNmZXJlclwiOjc0LFwiLi9rZXlPZlwiOjE0NCxcIi4vd2FybmluZ1wiOjE1NX1dLDExMTpbZnVuY3Rpb24oZSx0KXtmdW5jdGlvbiBuKGUsdCl7cmV0dXJuIGUmJnQ/ZT09PXQ/ITA6cihlKT8hMTpyKHQpP24oZSx0LnBhcmVudE5vZGUpOmUuY29udGFpbnM/ZS5jb250YWlucyh0KTplLmNvbXBhcmVEb2N1bWVudFBvc2l0aW9uPyEhKDE2JmUuY29tcGFyZURvY3VtZW50UG9zaXRpb24odCkpOiExOiExfXZhciByPWUoXCIuL2lzVGV4dE5vZGVcIik7dC5leHBvcnRzPW59LHtcIi4vaXNUZXh0Tm9kZVwiOjE0MX1dLDExMjpbZnVuY3Rpb24oZSx0KXtmdW5jdGlvbiBuKGUpe3JldHVybiEhZSYmKFwib2JqZWN0XCI9PXR5cGVvZiBlfHxcImZ1bmN0aW9uXCI9PXR5cGVvZiBlKSYmXCJsZW5ndGhcImluIGUmJiEoXCJzZXRJbnRlcnZhbFwiaW4gZSkmJlwibnVtYmVyXCIhPXR5cGVvZiBlLm5vZGVUeXBlJiYoQXJyYXkuaXNBcnJheShlKXx8XCJjYWxsZWVcImluIGV8fFwiaXRlbVwiaW4gZSl9ZnVuY3Rpb24gcihlKXtyZXR1cm4gbihlKT9BcnJheS5pc0FycmF5KGUpP2Uuc2xpY2UoKTpvKGUpOltlXX12YXIgbz1lKFwiLi90b0FycmF5XCIpO3QuZXhwb3J0cz1yfSx7XCIuL3RvQXJyYXlcIjoxNTJ9XSwxMTM6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlKXt2YXIgdD1vLmNyZWF0ZUZhY3RvcnkoZSksbj1yLmNyZWF0ZUNsYXNzKHtkaXNwbGF5TmFtZTpcIlJlYWN0RnVsbFBhZ2VDb21wb25lbnRcIitlLGNvbXBvbmVudFdpbGxVbm1vdW50OmZ1bmN0aW9uKCl7aSghMSl9LHJlbmRlcjpmdW5jdGlvbigpe3JldHVybiB0KHRoaXMucHJvcHMpfX0pO3JldHVybiBufXZhciByPWUoXCIuL1JlYWN0Q29tcG9zaXRlQ29tcG9uZW50XCIpLG89ZShcIi4vUmVhY3RFbGVtZW50XCIpLGk9ZShcIi4vaW52YXJpYW50XCIpO3QuZXhwb3J0cz1ufSx7XCIuL1JlYWN0Q29tcG9zaXRlQ29tcG9uZW50XCI6NDAsXCIuL1JlYWN0RWxlbWVudFwiOjU2LFwiLi9pbnZhcmlhbnRcIjoxMzd9XSwxMTQ6W2Z1bmN0aW9uKGUsdCl7ZnVuY3Rpb24gbihlKXt2YXIgdD1lLm1hdGNoKGMpO3JldHVybiB0JiZ0WzFdLnRvTG93ZXJDYXNlKCl9ZnVuY3Rpb24gcihlLHQpe3ZhciByPXU7cyghIXUpO3ZhciBvPW4oZSksYz1vJiZhKG8pO2lmKGMpe3IuaW5uZXJIVE1MPWNbMV0rZStjWzJdO2Zvcih2YXIgbD1jWzBdO2wtLTspcj1yLmxhc3RDaGlsZH1lbHNlIHIuaW5uZXJIVE1MPWU7dmFyIHA9ci5nZXRFbGVtZW50c0J5VGFnTmFtZShcInNjcmlwdFwiKTtwLmxlbmd0aCYmKHModCksaShwKS5mb3JFYWNoKHQpKTtmb3IodmFyIGQ9aShyLmNoaWxkTm9kZXMpO3IubGFzdENoaWxkOylyLnJlbW92ZUNoaWxkKHIubGFzdENoaWxkKTtyZXR1cm4gZH12YXIgbz1lKFwiLi9FeGVjdXRpb25FbnZpcm9ubWVudFwiKSxpPWUoXCIuL2NyZWF0ZUFycmF5RnJvbVwiKSxhPWUoXCIuL2dldE1hcmt1cFdyYXBcIikscz1lKFwiLi9pbnZhcmlhbnRcIiksdT1vLmNhblVzZURPTT9kb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpOm51bGwsYz0vXlxccyo8KFxcdyspLzt0LmV4cG9ydHM9cn0se1wiLi9FeGVjdXRpb25FbnZpcm9ubWVudFwiOjIzLFwiLi9jcmVhdGVBcnJheUZyb21cIjoxMTIsXCIuL2dldE1hcmt1cFdyYXBcIjoxMjksXCIuL2ludmFyaWFudFwiOjEzN31dLDExNTpbZnVuY3Rpb24oZSx0KXtmdW5jdGlvbiBuKGUpe3JldHVyblwib2JqZWN0XCI9PXR5cGVvZiBlP09iamVjdC5rZXlzKGUpLmZpbHRlcihmdW5jdGlvbih0KXtyZXR1cm4gZVt0XX0pLmpvaW4oXCIgXCIpOkFycmF5LnByb3RvdHlwZS5qb2luLmNhbGwoYXJndW1lbnRzLFwiIFwiKX10LmV4cG9ydHM9bn0se31dLDExNjpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUsdCl7dmFyIG49bnVsbD09dHx8XCJib29sZWFuXCI9PXR5cGVvZiB0fHxcIlwiPT09dDtpZihuKXJldHVyblwiXCI7dmFyIHI9aXNOYU4odCk7cmV0dXJuIHJ8fDA9PT10fHxvLmhhc093blByb3BlcnR5KGUpJiZvW2VdP1wiXCIrdDooXCJzdHJpbmdcIj09dHlwZW9mIHQmJih0PXQudHJpbSgpKSx0K1wicHhcIilcbn12YXIgcj1lKFwiLi9DU1NQcm9wZXJ0eVwiKSxvPXIuaXNVbml0bGVzc051bWJlcjt0LmV4cG9ydHM9bn0se1wiLi9DU1NQcm9wZXJ0eVwiOjV9XSwxMTc6W2Z1bmN0aW9uKGUsdCl7ZnVuY3Rpb24gbihlLHQsbixyLG8pe3JldHVybiBvfWUoXCIuL09iamVjdC5hc3NpZ25cIiksZShcIi4vd2FybmluZ1wiKTt0LmV4cG9ydHM9bn0se1wiLi9PYmplY3QuYXNzaWduXCI6MjksXCIuL3dhcm5pbmdcIjoxNTV9XSwxMTg6W2Z1bmN0aW9uKGUsdCl7ZnVuY3Rpb24gbihlKXtyZXR1cm4gZnVuY3Rpb24oKXtyZXR1cm4gZX19ZnVuY3Rpb24gcigpe31yLnRoYXRSZXR1cm5zPW4sci50aGF0UmV0dXJuc0ZhbHNlPW4oITEpLHIudGhhdFJldHVybnNUcnVlPW4oITApLHIudGhhdFJldHVybnNOdWxsPW4obnVsbCksci50aGF0UmV0dXJuc1RoaXM9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpc30sci50aGF0UmV0dXJuc0FyZ3VtZW50PWZ1bmN0aW9uKGUpe3JldHVybiBlfSx0LmV4cG9ydHM9cn0se31dLDExOTpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbj17fTt0LmV4cG9ydHM9bn0se31dLDEyMDpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUpe3JldHVybiBvW2VdfWZ1bmN0aW9uIHIoZSl7cmV0dXJuKFwiXCIrZSkucmVwbGFjZShpLG4pfXZhciBvPXtcIiZcIjpcIiZhbXA7XCIsXCI+XCI6XCImZ3Q7XCIsXCI8XCI6XCImbHQ7XCIsJ1wiJzpcIiZxdW90O1wiLFwiJ1wiOlwiJiN4Mjc7XCJ9LGk9L1smPjxcIiddL2c7dC5leHBvcnRzPXJ9LHt9XSwxMjE6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlLHQsbil7dmFyIHI9ZSxpPSFyLmhhc093blByb3BlcnR5KG4pO2lmKGkmJm51bGwhPXQpe3ZhciBhLHM9dHlwZW9mIHQ7YT1cInN0cmluZ1wiPT09cz9vKHQpOlwibnVtYmVyXCI9PT1zP28oXCJcIit0KTp0LHJbbl09YX19ZnVuY3Rpb24gcihlKXtpZihudWxsPT1lKXJldHVybiBlO3ZhciB0PXt9O3JldHVybiBpKGUsbix0KSx0fXt2YXIgbz1lKFwiLi9SZWFjdFRleHRDb21wb25lbnRcIiksaT1lKFwiLi90cmF2ZXJzZUFsbENoaWxkcmVuXCIpO2UoXCIuL3dhcm5pbmdcIil9dC5leHBvcnRzPXJ9LHtcIi4vUmVhY3RUZXh0Q29tcG9uZW50XCI6ODQsXCIuL3RyYXZlcnNlQWxsQ2hpbGRyZW5cIjoxNTMsXCIuL3dhcm5pbmdcIjoxNTV9XSwxMjI6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlKXt0cnl7ZS5mb2N1cygpfWNhdGNoKHQpe319dC5leHBvcnRzPW59LHt9XSwxMjM6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG49ZnVuY3Rpb24oZSx0LG4pe0FycmF5LmlzQXJyYXkoZSk/ZS5mb3JFYWNoKHQsbik6ZSYmdC5jYWxsKG4sZSl9O3QuZXhwb3J0cz1ufSx7fV0sMTI0OltmdW5jdGlvbihlLHQpe2Z1bmN0aW9uIG4oKXt0cnl7cmV0dXJuIGRvY3VtZW50LmFjdGl2ZUVsZW1lbnR8fGRvY3VtZW50LmJvZHl9Y2F0Y2goZSl7cmV0dXJuIGRvY3VtZW50LmJvZHl9fXQuZXhwb3J0cz1ufSx7fV0sMTI1OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSl7dmFyIHQsbj1lLmtleUNvZGU7cmV0dXJuXCJjaGFyQ29kZVwiaW4gZT8odD1lLmNoYXJDb2RlLDA9PT10JiYxMz09PW4mJih0PTEzKSk6dD1uLHQ+PTMyfHwxMz09PXQ/dDowfXQuZXhwb3J0cz1ufSx7fV0sMTI2OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSl7aWYoZS5rZXkpe3ZhciB0PW9bZS5rZXldfHxlLmtleTtpZihcIlVuaWRlbnRpZmllZFwiIT09dClyZXR1cm4gdH1pZihcImtleXByZXNzXCI9PT1lLnR5cGUpe3ZhciBuPXIoZSk7cmV0dXJuIDEzPT09bj9cIkVudGVyXCI6U3RyaW5nLmZyb21DaGFyQ29kZShuKX1yZXR1cm5cImtleWRvd25cIj09PWUudHlwZXx8XCJrZXl1cFwiPT09ZS50eXBlP2lbZS5rZXlDb2RlXXx8XCJVbmlkZW50aWZpZWRcIjpcIlwifXZhciByPWUoXCIuL2dldEV2ZW50Q2hhckNvZGVcIiksbz17RXNjOlwiRXNjYXBlXCIsU3BhY2ViYXI6XCIgXCIsTGVmdDpcIkFycm93TGVmdFwiLFVwOlwiQXJyb3dVcFwiLFJpZ2h0OlwiQXJyb3dSaWdodFwiLERvd246XCJBcnJvd0Rvd25cIixEZWw6XCJEZWxldGVcIixXaW46XCJPU1wiLE1lbnU6XCJDb250ZXh0TWVudVwiLEFwcHM6XCJDb250ZXh0TWVudVwiLFNjcm9sbDpcIlNjcm9sbExvY2tcIixNb3pQcmludGFibGVLZXk6XCJVbmlkZW50aWZpZWRcIn0saT17ODpcIkJhY2tzcGFjZVwiLDk6XCJUYWJcIiwxMjpcIkNsZWFyXCIsMTM6XCJFbnRlclwiLDE2OlwiU2hpZnRcIiwxNzpcIkNvbnRyb2xcIiwxODpcIkFsdFwiLDE5OlwiUGF1c2VcIiwyMDpcIkNhcHNMb2NrXCIsMjc6XCJFc2NhcGVcIiwzMjpcIiBcIiwzMzpcIlBhZ2VVcFwiLDM0OlwiUGFnZURvd25cIiwzNTpcIkVuZFwiLDM2OlwiSG9tZVwiLDM3OlwiQXJyb3dMZWZ0XCIsMzg6XCJBcnJvd1VwXCIsMzk6XCJBcnJvd1JpZ2h0XCIsNDA6XCJBcnJvd0Rvd25cIiw0NTpcIkluc2VydFwiLDQ2OlwiRGVsZXRlXCIsMTEyOlwiRjFcIiwxMTM6XCJGMlwiLDExNDpcIkYzXCIsMTE1OlwiRjRcIiwxMTY6XCJGNVwiLDExNzpcIkY2XCIsMTE4OlwiRjdcIiwxMTk6XCJGOFwiLDEyMDpcIkY5XCIsMTIxOlwiRjEwXCIsMTIyOlwiRjExXCIsMTIzOlwiRjEyXCIsMTQ0OlwiTnVtTG9ja1wiLDE0NTpcIlNjcm9sbExvY2tcIiwyMjQ6XCJNZXRhXCJ9O3QuZXhwb3J0cz1ufSx7XCIuL2dldEV2ZW50Q2hhckNvZGVcIjoxMjV9XSwxMjc6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlKXt2YXIgdD10aGlzLG49dC5uYXRpdmVFdmVudDtpZihuLmdldE1vZGlmaWVyU3RhdGUpcmV0dXJuIG4uZ2V0TW9kaWZpZXJTdGF0ZShlKTt2YXIgcj1vW2VdO3JldHVybiByPyEhbltyXTohMX1mdW5jdGlvbiByKCl7cmV0dXJuIG59dmFyIG89e0FsdDpcImFsdEtleVwiLENvbnRyb2w6XCJjdHJsS2V5XCIsTWV0YTpcIm1ldGFLZXlcIixTaGlmdDpcInNoaWZ0S2V5XCJ9O3QuZXhwb3J0cz1yfSx7fV0sMTI4OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSl7dmFyIHQ9ZS50YXJnZXR8fGUuc3JjRWxlbWVudHx8d2luZG93O3JldHVybiAzPT09dC5ub2RlVHlwZT90LnBhcmVudE5vZGU6dH10LmV4cG9ydHM9bn0se31dLDEyOTpbZnVuY3Rpb24oZSx0KXtmdW5jdGlvbiBuKGUpe3JldHVybiBvKCEhaSkscC5oYXNPd25Qcm9wZXJ0eShlKXx8KGU9XCIqXCIpLGEuaGFzT3duUHJvcGVydHkoZSl8fChpLmlubmVySFRNTD1cIipcIj09PWU/XCI8bGluayAvPlwiOlwiPFwiK2UrXCI+PC9cIitlK1wiPlwiLGFbZV09IWkuZmlyc3RDaGlsZCksYVtlXT9wW2VdOm51bGx9dmFyIHI9ZShcIi4vRXhlY3V0aW9uRW52aXJvbm1lbnRcIiksbz1lKFwiLi9pbnZhcmlhbnRcIiksaT1yLmNhblVzZURPTT9kb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpOm51bGwsYT17Y2lyY2xlOiEwLGRlZnM6ITAsZWxsaXBzZTohMCxnOiEwLGxpbmU6ITAsbGluZWFyR3JhZGllbnQ6ITAscGF0aDohMCxwb2x5Z29uOiEwLHBvbHlsaW5lOiEwLHJhZGlhbEdyYWRpZW50OiEwLHJlY3Q6ITAsc3RvcDohMCx0ZXh0OiEwfSxzPVsxLCc8c2VsZWN0IG11bHRpcGxlPVwidHJ1ZVwiPicsXCI8L3NlbGVjdD5cIl0sdT1bMSxcIjx0YWJsZT5cIixcIjwvdGFibGU+XCJdLGM9WzMsXCI8dGFibGU+PHRib2R5Pjx0cj5cIixcIjwvdHI+PC90Ym9keT48L3RhYmxlPlwiXSxsPVsxLFwiPHN2Zz5cIixcIjwvc3ZnPlwiXSxwPXtcIipcIjpbMSxcIj88ZGl2PlwiLFwiPC9kaXY+XCJdLGFyZWE6WzEsXCI8bWFwPlwiLFwiPC9tYXA+XCJdLGNvbDpbMixcIjx0YWJsZT48dGJvZHk+PC90Ym9keT48Y29sZ3JvdXA+XCIsXCI8L2NvbGdyb3VwPjwvdGFibGU+XCJdLGxlZ2VuZDpbMSxcIjxmaWVsZHNldD5cIixcIjwvZmllbGRzZXQ+XCJdLHBhcmFtOlsxLFwiPG9iamVjdD5cIixcIjwvb2JqZWN0PlwiXSx0cjpbMixcIjx0YWJsZT48dGJvZHk+XCIsXCI8L3Rib2R5PjwvdGFibGU+XCJdLG9wdGdyb3VwOnMsb3B0aW9uOnMsY2FwdGlvbjp1LGNvbGdyb3VwOnUsdGJvZHk6dSx0Zm9vdDp1LHRoZWFkOnUsdGQ6Yyx0aDpjLGNpcmNsZTpsLGRlZnM6bCxlbGxpcHNlOmwsZzpsLGxpbmU6bCxsaW5lYXJHcmFkaWVudDpsLHBhdGg6bCxwb2x5Z29uOmwscG9seWxpbmU6bCxyYWRpYWxHcmFkaWVudDpsLHJlY3Q6bCxzdG9wOmwsdGV4dDpsfTt0LmV4cG9ydHM9bn0se1wiLi9FeGVjdXRpb25FbnZpcm9ubWVudFwiOjIzLFwiLi9pbnZhcmlhbnRcIjoxMzd9XSwxMzA6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlKXtmb3IoO2UmJmUuZmlyc3RDaGlsZDspZT1lLmZpcnN0Q2hpbGQ7cmV0dXJuIGV9ZnVuY3Rpb24gcihlKXtmb3IoO2U7KXtpZihlLm5leHRTaWJsaW5nKXJldHVybiBlLm5leHRTaWJsaW5nO2U9ZS5wYXJlbnROb2RlfX1mdW5jdGlvbiBvKGUsdCl7Zm9yKHZhciBvPW4oZSksaT0wLGE9MDtvOyl7aWYoMz09by5ub2RlVHlwZSl7aWYoYT1pK28udGV4dENvbnRlbnQubGVuZ3RoLHQ+PWkmJmE+PXQpcmV0dXJue25vZGU6byxvZmZzZXQ6dC1pfTtpPWF9bz1uKHIobykpfX10LmV4cG9ydHM9b30se31dLDEzMTpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUpe3JldHVybiBlP2Uubm9kZVR5cGU9PT1yP2UuZG9jdW1lbnRFbGVtZW50OmUuZmlyc3RDaGlsZDpudWxsfXZhciByPTk7dC5leHBvcnRzPW59LHt9XSwxMzI6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbigpe3JldHVybiFvJiZyLmNhblVzZURPTSYmKG89XCJ0ZXh0Q29udGVudFwiaW4gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50P1widGV4dENvbnRlbnRcIjpcImlubmVyVGV4dFwiKSxvfXZhciByPWUoXCIuL0V4ZWN1dGlvbkVudmlyb25tZW50XCIpLG89bnVsbDt0LmV4cG9ydHM9bn0se1wiLi9FeGVjdXRpb25FbnZpcm9ubWVudFwiOjIzfV0sMTMzOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSl7cmV0dXJuIGU9PT13aW5kb3c/e3g6d2luZG93LnBhZ2VYT2Zmc2V0fHxkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsTGVmdCx5OndpbmRvdy5wYWdlWU9mZnNldHx8ZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNjcm9sbFRvcH06e3g6ZS5zY3JvbGxMZWZ0LHk6ZS5zY3JvbGxUb3B9fXQuZXhwb3J0cz1ufSx7fV0sMTM0OltmdW5jdGlvbihlLHQpe2Z1bmN0aW9uIG4oZSl7cmV0dXJuIGUucmVwbGFjZShyLFwiLSQxXCIpLnRvTG93ZXJDYXNlKCl9dmFyIHI9LyhbQS1aXSkvZzt0LmV4cG9ydHM9bn0se31dLDEzNTpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUpe3JldHVybiByKGUpLnJlcGxhY2UobyxcIi1tcy1cIil9dmFyIHI9ZShcIi4vaHlwaGVuYXRlXCIpLG89L15tcy0vO3QuZXhwb3J0cz1ufSx7XCIuL2h5cGhlbmF0ZVwiOjEzNH1dLDEzNjpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUsdCl7dmFyIG47cmV0dXJuIG49XCJzdHJpbmdcIj09dHlwZW9mIGUudHlwZT9yLmNyZWF0ZUluc3RhbmNlRm9yVGFnKGUudHlwZSxlLnByb3BzLHQpOm5ldyBlLnR5cGUoZS5wcm9wcyksbi5jb25zdHJ1Y3QoZSksbn17dmFyIHI9KGUoXCIuL3dhcm5pbmdcIiksZShcIi4vUmVhY3RFbGVtZW50XCIpLGUoXCIuL1JlYWN0TGVnYWN5RWxlbWVudFwiKSxlKFwiLi9SZWFjdE5hdGl2ZUNvbXBvbmVudFwiKSk7ZShcIi4vUmVhY3RFbXB0eUNvbXBvbmVudFwiKX10LmV4cG9ydHM9bn0se1wiLi9SZWFjdEVsZW1lbnRcIjo1NixcIi4vUmVhY3RFbXB0eUNvbXBvbmVudFwiOjU4LFwiLi9SZWFjdExlZ2FjeUVsZW1lbnRcIjo2NSxcIi4vUmVhY3ROYXRpdmVDb21wb25lbnRcIjo3MSxcIi4vd2FybmluZ1wiOjE1NX1dLDEzNzpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjt2YXIgbj1mdW5jdGlvbihlLHQsbixyLG8saSxhLHMpe2lmKCFlKXt2YXIgdTtpZih2b2lkIDA9PT10KXU9bmV3IEVycm9yKFwiTWluaWZpZWQgZXhjZXB0aW9uIG9jY3VycmVkOyB1c2UgdGhlIG5vbi1taW5pZmllZCBkZXYgZW52aXJvbm1lbnQgZm9yIHRoZSBmdWxsIGVycm9yIG1lc3NhZ2UgYW5kIGFkZGl0aW9uYWwgaGVscGZ1bCB3YXJuaW5ncy5cIik7ZWxzZXt2YXIgYz1bbixyLG8saSxhLHNdLGw9MDt1PW5ldyBFcnJvcihcIkludmFyaWFudCBWaW9sYXRpb246IFwiK3QucmVwbGFjZSgvJXMvZyxmdW5jdGlvbigpe3JldHVybiBjW2wrK119KSl9dGhyb3cgdS5mcmFtZXNUb1BvcD0xLHV9fTt0LmV4cG9ydHM9bn0se31dLDEzODpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUsdCl7aWYoIW8uY2FuVXNlRE9NfHx0JiYhKFwiYWRkRXZlbnRMaXN0ZW5lclwiaW4gZG9jdW1lbnQpKXJldHVybiExO3ZhciBuPVwib25cIitlLGk9biBpbiBkb2N1bWVudDtpZighaSl7dmFyIGE9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTthLnNldEF0dHJpYnV0ZShuLFwicmV0dXJuO1wiKSxpPVwiZnVuY3Rpb25cIj09dHlwZW9mIGFbbl19cmV0dXJuIWkmJnImJlwid2hlZWxcIj09PWUmJihpPWRvY3VtZW50LmltcGxlbWVudGF0aW9uLmhhc0ZlYXR1cmUoXCJFdmVudHMud2hlZWxcIixcIjMuMFwiKSksaX12YXIgcixvPWUoXCIuL0V4ZWN1dGlvbkVudmlyb25tZW50XCIpO28uY2FuVXNlRE9NJiYocj1kb2N1bWVudC5pbXBsZW1lbnRhdGlvbiYmZG9jdW1lbnQuaW1wbGVtZW50YXRpb24uaGFzRmVhdHVyZSYmZG9jdW1lbnQuaW1wbGVtZW50YXRpb24uaGFzRmVhdHVyZShcIlwiLFwiXCIpIT09ITApLHQuZXhwb3J0cz1ufSx7XCIuL0V4ZWN1dGlvbkVudmlyb25tZW50XCI6MjN9XSwxMzk6W2Z1bmN0aW9uKGUsdCl7ZnVuY3Rpb24gbihlKXtyZXR1cm4hKCFlfHwhKFwiZnVuY3Rpb25cIj09dHlwZW9mIE5vZGU/ZSBpbnN0YW5jZW9mIE5vZGU6XCJvYmplY3RcIj09dHlwZW9mIGUmJlwibnVtYmVyXCI9PXR5cGVvZiBlLm5vZGVUeXBlJiZcInN0cmluZ1wiPT10eXBlb2YgZS5ub2RlTmFtZSkpfXQuZXhwb3J0cz1ufSx7fV0sMTQwOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSl7cmV0dXJuIGUmJihcIklOUFVUXCI9PT1lLm5vZGVOYW1lJiZyW2UudHlwZV18fFwiVEVYVEFSRUFcIj09PWUubm9kZU5hbWUpfXZhciByPXtjb2xvcjohMCxkYXRlOiEwLGRhdGV0aW1lOiEwLFwiZGF0ZXRpbWUtbG9jYWxcIjohMCxlbWFpbDohMCxtb250aDohMCxudW1iZXI6ITAscGFzc3dvcmQ6ITAscmFuZ2U6ITAsc2VhcmNoOiEwLHRlbDohMCx0ZXh0OiEwLHRpbWU6ITAsdXJsOiEwLHdlZWs6ITB9O3QuZXhwb3J0cz1ufSx7fV0sMTQxOltmdW5jdGlvbihlLHQpe2Z1bmN0aW9uIG4oZSl7cmV0dXJuIHIoZSkmJjM9PWUubm9kZVR5cGV9dmFyIHI9ZShcIi4vaXNOb2RlXCIpO3QuZXhwb3J0cz1ufSx7XCIuL2lzTm9kZVwiOjEzOX1dLDE0MjpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUpe2V8fChlPVwiXCIpO3ZhciB0LG49YXJndW1lbnRzLmxlbmd0aDtpZihuPjEpZm9yKHZhciByPTE7bj5yO3IrKyl0PWFyZ3VtZW50c1tyXSx0JiYoZT0oZT9lK1wiIFwiOlwiXCIpK3QpO3JldHVybiBlfXQuZXhwb3J0cz1ufSx7fV0sMTQzOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPWUoXCIuL2ludmFyaWFudFwiKSxyPWZ1bmN0aW9uKGUpe3ZhciB0LHI9e307bihlIGluc3RhbmNlb2YgT2JqZWN0JiYhQXJyYXkuaXNBcnJheShlKSk7Zm9yKHQgaW4gZSllLmhhc093blByb3BlcnR5KHQpJiYoclt0XT10KTtyZXR1cm4gcn07dC5leHBvcnRzPXJ9LHtcIi4vaW52YXJpYW50XCI6MTM3fV0sMTQ0OltmdW5jdGlvbihlLHQpe3ZhciBuPWZ1bmN0aW9uKGUpe3ZhciB0O2Zvcih0IGluIGUpaWYoZS5oYXNPd25Qcm9wZXJ0eSh0KSlyZXR1cm4gdDtyZXR1cm4gbnVsbH07dC5leHBvcnRzPW59LHt9XSwxNDU6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlLHQsbil7aWYoIWUpcmV0dXJuIG51bGw7dmFyIG89e307Zm9yKHZhciBpIGluIGUpci5jYWxsKGUsaSkmJihvW2ldPXQuY2FsbChuLGVbaV0saSxlKSk7cmV0dXJuIG99dmFyIHI9T2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTt0LmV4cG9ydHM9bn0se31dLDE0NjpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUpe3ZhciB0PXt9O3JldHVybiBmdW5jdGlvbihuKXtyZXR1cm4gdC5oYXNPd25Qcm9wZXJ0eShuKT90W25dOnRbbl09ZS5jYWxsKHRoaXMsbil9fXQuZXhwb3J0cz1ufSx7fV0sMTQ3OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSl7cihlJiYhL1teYS16MC05X10vLnRlc3QoZSkpfXZhciByPWUoXCIuL2ludmFyaWFudFwiKTt0LmV4cG9ydHM9bn0se1wiLi9pbnZhcmlhbnRcIjoxMzd9XSwxNDg6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlKXtyZXR1cm4gbyhyLmlzVmFsaWRFbGVtZW50KGUpKSxlfXZhciByPWUoXCIuL1JlYWN0RWxlbWVudFwiKSxvPWUoXCIuL2ludmFyaWFudFwiKTt0LmV4cG9ydHM9bn0se1wiLi9SZWFjdEVsZW1lbnRcIjo1NixcIi4vaW52YXJpYW50XCI6MTM3fV0sMTQ5OltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO3ZhciBuPWUoXCIuL0V4ZWN1dGlvbkVudmlyb25tZW50XCIpLHI9L15bIFxcclxcblxcdFxcZl0vLG89LzwoIS0tfGxpbmt8bm9zY3JpcHR8bWV0YXxzY3JpcHR8c3R5bGUpWyBcXHJcXG5cXHRcXGZcXC8+XS8saT1mdW5jdGlvbihlLHQpe2UuaW5uZXJIVE1MPXR9O2lmKG4uY2FuVXNlRE9NKXt2YXIgYT1kb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO2EuaW5uZXJIVE1MPVwiIFwiLFwiXCI9PT1hLmlubmVySFRNTCYmKGk9ZnVuY3Rpb24oZSx0KXtpZihlLnBhcmVudE5vZGUmJmUucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQoZSxlKSxyLnRlc3QodCl8fFwiPFwiPT09dFswXSYmby50ZXN0KHQpKXtlLmlubmVySFRNTD1cIlwiK3Q7dmFyIG49ZS5maXJzdENoaWxkOzE9PT1uLmRhdGEubGVuZ3RoP2UucmVtb3ZlQ2hpbGQobik6bi5kZWxldGVEYXRhKDAsMSl9ZWxzZSBlLmlubmVySFRNTD10fSl9dC5leHBvcnRzPWl9LHtcIi4vRXhlY3V0aW9uRW52aXJvbm1lbnRcIjoyM31dLDE1MDpbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBuKGUsdCl7aWYoZT09PXQpcmV0dXJuITA7dmFyIG47Zm9yKG4gaW4gZSlpZihlLmhhc093blByb3BlcnR5KG4pJiYoIXQuaGFzT3duUHJvcGVydHkobil8fGVbbl0hPT10W25dKSlyZXR1cm4hMTtmb3IobiBpbiB0KWlmKHQuaGFzT3duUHJvcGVydHkobikmJiFlLmhhc093blByb3BlcnR5KG4pKXJldHVybiExO3JldHVybiEwfXQuZXhwb3J0cz1ufSx7fV0sMTUxOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSx0KXtyZXR1cm4gZSYmdCYmZS50eXBlPT09dC50eXBlJiZlLmtleT09PXQua2V5JiZlLl9vd25lcj09PXQuX293bmVyPyEwOiExfXQuZXhwb3J0cz1ufSx7fV0sMTUyOltmdW5jdGlvbihlLHQpe2Z1bmN0aW9uIG4oZSl7dmFyIHQ9ZS5sZW5ndGg7aWYocighQXJyYXkuaXNBcnJheShlKSYmKFwib2JqZWN0XCI9PXR5cGVvZiBlfHxcImZ1bmN0aW9uXCI9PXR5cGVvZiBlKSkscihcIm51bWJlclwiPT10eXBlb2YgdCkscigwPT09dHx8dC0xIGluIGUpLGUuaGFzT3duUHJvcGVydHkpdHJ5e3JldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChlKX1jYXRjaChuKXt9Zm9yKHZhciBvPUFycmF5KHQpLGk9MDt0Pmk7aSsrKW9baV09ZVtpXTtyZXR1cm4gb312YXIgcj1lKFwiLi9pbnZhcmlhbnRcIik7dC5leHBvcnRzPW59LHtcIi4vaW52YXJpYW50XCI6MTM3fV0sMTUzOltmdW5jdGlvbihlLHQpe1widXNlIHN0cmljdFwiO2Z1bmN0aW9uIG4oZSl7cmV0dXJuIGRbZV19ZnVuY3Rpb24gcihlLHQpe3JldHVybiBlJiZudWxsIT1lLmtleT9pKGUua2V5KTp0LnRvU3RyaW5nKDM2KX1mdW5jdGlvbiBvKGUpe3JldHVybihcIlwiK2UpLnJlcGxhY2UoZixuKX1mdW5jdGlvbiBpKGUpe3JldHVyblwiJFwiK28oZSl9ZnVuY3Rpb24gYShlLHQsbil7cmV0dXJuIG51bGw9PWU/MDpoKGUsXCJcIiwwLHQsbil9dmFyIHM9ZShcIi4vUmVhY3RFbGVtZW50XCIpLHU9ZShcIi4vUmVhY3RJbnN0YW5jZUhhbmRsZXNcIiksYz1lKFwiLi9pbnZhcmlhbnRcIiksbD11LlNFUEFSQVRPUixwPVwiOlwiLGQ9e1wiPVwiOlwiPTBcIixcIi5cIjpcIj0xXCIsXCI6XCI6XCI9MlwifSxmPS9bPS46XS9nLGg9ZnVuY3Rpb24oZSx0LG4sbyxhKXt2YXIgdSxkLGY9MDtpZihBcnJheS5pc0FycmF5KGUpKWZvcih2YXIgbT0wO208ZS5sZW5ndGg7bSsrKXt2YXIgdj1lW21dO3U9dCsodD9wOmwpK3IodixtKSxkPW4rZixmKz1oKHYsdSxkLG8sYSl9ZWxzZXt2YXIgeT10eXBlb2YgZSxnPVwiXCI9PT10LEU9Zz9sK3IoZSwwKTp0O2lmKG51bGw9PWV8fFwiYm9vbGVhblwiPT09eSlvKGEsbnVsbCxFLG4pLGY9MTtlbHNlIGlmKFwic3RyaW5nXCI9PT15fHxcIm51bWJlclwiPT09eXx8cy5pc1ZhbGlkRWxlbWVudChlKSlvKGEsZSxFLG4pLGY9MTtlbHNlIGlmKFwib2JqZWN0XCI9PT15KXtjKCFlfHwxIT09ZS5ub2RlVHlwZSk7Zm9yKHZhciBDIGluIGUpZS5oYXNPd25Qcm9wZXJ0eShDKSYmKHU9dCsodD9wOmwpK2koQykrcCtyKGVbQ10sMCksZD1uK2YsZis9aChlW0NdLHUsZCxvLGEpKX19cmV0dXJuIGZ9O3QuZXhwb3J0cz1hfSx7XCIuL1JlYWN0RWxlbWVudFwiOjU2LFwiLi9SZWFjdEluc3RhbmNlSGFuZGxlc1wiOjY0LFwiLi9pbnZhcmlhbnRcIjoxMzd9XSwxNTQ6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gbihlKXtyZXR1cm4gQXJyYXkuaXNBcnJheShlKT9lLmNvbmNhdCgpOmUmJlwib2JqZWN0XCI9PXR5cGVvZiBlP2kobmV3IGUuY29uc3RydWN0b3IsZSk6ZX1mdW5jdGlvbiByKGUsdCxuKXtzKEFycmF5LmlzQXJyYXkoZSkpO3ZhciByPXRbbl07cyhBcnJheS5pc0FycmF5KHIpKX1mdW5jdGlvbiBvKGUsdCl7aWYocyhcIm9iamVjdFwiPT10eXBlb2YgdCksdC5oYXNPd25Qcm9wZXJ0eShwKSlyZXR1cm4gcygxPT09T2JqZWN0LmtleXModCkubGVuZ3RoKSx0W3BdO3ZhciBhPW4oZSk7aWYodC5oYXNPd25Qcm9wZXJ0eShkKSl7dmFyIGg9dFtkXTtzKGgmJlwib2JqZWN0XCI9PXR5cGVvZiBoKSxzKGEmJlwib2JqZWN0XCI9PXR5cGVvZiBhKSxpKGEsdFtkXSl9dC5oYXNPd25Qcm9wZXJ0eSh1KSYmKHIoZSx0LHUpLHRbdV0uZm9yRWFjaChmdW5jdGlvbihlKXthLnB1c2goZSl9KSksdC5oYXNPd25Qcm9wZXJ0eShjKSYmKHIoZSx0LGMpLHRbY10uZm9yRWFjaChmdW5jdGlvbihlKXthLnVuc2hpZnQoZSl9KSksdC5oYXNPd25Qcm9wZXJ0eShsKSYmKHMoQXJyYXkuaXNBcnJheShlKSkscyhBcnJheS5pc0FycmF5KHRbbF0pKSx0W2xdLmZvckVhY2goZnVuY3Rpb24oZSl7cyhBcnJheS5pc0FycmF5KGUpKSxhLnNwbGljZS5hcHBseShhLGUpfSkpLHQuaGFzT3duUHJvcGVydHkoZikmJihzKFwiZnVuY3Rpb25cIj09dHlwZW9mIHRbZl0pLGE9dFtmXShhKSk7Zm9yKHZhciB2IGluIHQpbS5oYXNPd25Qcm9wZXJ0eSh2KSYmbVt2XXx8KGFbdl09byhlW3ZdLHRbdl0pKTtyZXR1cm4gYX12YXIgaT1lKFwiLi9PYmplY3QuYXNzaWduXCIpLGE9ZShcIi4va2V5T2ZcIikscz1lKFwiLi9pbnZhcmlhbnRcIiksdT1hKHskcHVzaDpudWxsfSksYz1hKHskdW5zaGlmdDpudWxsfSksbD1hKHskc3BsaWNlOm51bGx9KSxwPWEoeyRzZXQ6bnVsbH0pLGQ9YSh7JG1lcmdlOm51bGx9KSxmPWEoeyRhcHBseTpudWxsfSksaD1bdSxjLGwscCxkLGZdLG09e307aC5mb3JFYWNoKGZ1bmN0aW9uKGUpe21bZV09ITB9KSx0LmV4cG9ydHM9b30se1wiLi9PYmplY3QuYXNzaWduXCI6MjksXCIuL2ludmFyaWFudFwiOjEzNyxcIi4va2V5T2ZcIjoxNDR9XSwxNTU6W2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG49ZShcIi4vZW1wdHlGdW5jdGlvblwiKSxyPW47dC5leHBvcnRzPXJ9LHtcIi4vZW1wdHlGdW5jdGlvblwiOjExOH1dfSx7fSxbMV0pKDEpfSk7XG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsInZhciBSZWFjdCA9IHJlcXVpcmUoJ3JlYWN0L2Rpc3QvcmVhY3Qtd2l0aC1hZGRvbnMubWluLmpzJyk7XG5cbi8vdmFyIFJJQkJPTkJBUiA9IHJlcXVpcmUoJy4vcmliYm9uYmFyLmpzJyk7XG52YXIgVEFCTEUgPSByZXF1aXJlKCcuL3RhYmxlJyk7XG5cbnZhciBBUFAgPSBSZWFjdC5jcmVhdGVDbGFzcyh7XG4gIHJlbmRlcjogZnVuY3Rpb24oKXtcbiAgICByZXR1cm4gKFxuICAgICAgPGRpdj5cbiAgICAgICAgPFRBQkxFIC8+XG4gICAgICA8L2Rpdj5cbiAgICApXG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEFQUDtcbiIsInZhciBSZWFjdCA9IHJlcXVpcmUoJ3JlYWN0L2Rpc3QvcmVhY3Qtd2l0aC1hZGRvbnMubWluLmpzJyk7XG52YXIgY2xhc3NTZXQgPSBSZWFjdC5hZGRvbnMuY2xhc3NTZXQ7XG5cbnZhciBDRUxMID0gUmVhY3QuY3JlYXRlQ2xhc3Moe1xuICBnZXRJbml0aWFsU3RhdGU6IGZ1bmN0aW9uKCl7XG4gICAgcmV0dXJuIHtcbiAgICAgIGVkaXRpbmc6IGZhbHNlLFxuICAgICAgc2VsZWN0ZWQ6IGZhbHNlXG4gICAgfTtcbiAgfSxcbiAgcmVuZGVyOiBmdW5jdGlvbigpe1xuICAgIHZhciBjZWxsVmFsdWUgPSB0aGlzLnByb3BzLmNlbGxEYXRhLnZhbHVlO1xuICAgIC8vdmFyIGNlbGxFZGl0ID0gPGlucHV0IGF1dG9Gb2N1cyBvbktleURvd249e3RoaXMuY2hlY2tDZWxsfSBjbGFzc05hbWU9eydjZWxsLWVkaXQnfSB0eXBlPSd0ZXh0JyBkZWZhdWx0VmFsdWU9e2NlbGxWYWx1ZX0gLz47XG4gICAgdmFyIGNlbGxWaWV3ID0gdGhpcy5zdGF0ZS5lZGl0aW5nID8gY2VsbEVkaXQgOiBjZWxsVmFsdWU7XG4gICAgXG4gICAgLyogc2V0IGRvbSBldmVudCBoYW5kbGVycyBiYXNlZCBvbiBzdGF0ZSAqL1xuICAgIC8vIHZhciBjZWxsQ2xpY2ssIGNlbGxNZW51O1xuICAgIC8vIGlmICh0aGlzLnN0YXRlLnNlbGVjdGVkKXtcbiAgICAvLyAgIGNlbGxDbGljayA9IHRoaXMuZW50ZXJFZGl0TW9kZTtcbiAgICAvLyB9IGVsc2Uge1xuICAgIC8vICAgY2VsbENsaWNrID0gdGhpcy5zZWxlY3RDZWxsO1xuICAgIC8vIH1cblxuICAgIC8qIGEgY3NzIGNsYXNzIHRvZ2dsZSBvYmplY3QgYmFzZWQgb24gc3RhdGUgKi9cbiAgICB2YXIgY2xhc3NlcyA9IGNsYXNzU2V0KHtcbiAgICAgICdzZWxlY3RlZC1jZWxsJzogdGhpcy5zdGF0ZS5zZWxlY3RlZCxcbiAgICAgICdjZWxsLXZpZXcnOiB0cnVlXG4gICAgfSk7XG5cbiAgICByZXR1cm4gKFxuICAgICAgPHRkIGNsYXNzTmFtZT17Y2xhc3Nlc30+XG4gICAgICAgIHtjZWxsVmlld31cbiAgICAgIDwvdGQ+XG4gICAgKVxuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBDRUxMOyIsInZhciBSZWFjdCA9IHJlcXVpcmUoJ3JlYWN0L2Rpc3QvcmVhY3Qtd2l0aC1hZGRvbnMubWluLmpzJyk7XG5cbnZhciBDRUxMID0gcmVxdWlyZSgnLi9jZWxsJyk7XG5cbnZhciBST1cgPSBSZWFjdC5jcmVhdGVDbGFzcyh7XG4gIHJlbmRlcjogZnVuY3Rpb24oKXtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIGNlbGxzID0gIHRoaXMucHJvcHMucm93Lm1hcChmdW5jdGlvbihjZWxsRGF0YSxpbmRleCl7XG4gICAgICByZXR1cm4gKFxuICAgICAgICA8Q0VMTCBrZXk9e2luZGV4fSBjb2xJbmRleD17aW5kZXh9IHJvd0luZGV4PXtzZWxmLnByb3BzLmluZGV4fSBjZWxsRGF0YT17Y2VsbERhdGF9IC8+XG4gICAgICApXG4gICAgfSk7XG4gICAgcmV0dXJuIChcbiAgICAgIDx0cj5cbiAgICAgICAgPHRoIGNsYXNzTmFtZT17XCJyLXNwcmVhZHNoZWV0XCJ9Pnt0aGlzLnByb3BzLmluZGV4ICsgMSB9PC90aD4ge2NlbGxzfVxuICAgICAgPC90cj5cbiAgICApXG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFJPVztcbiIsInZhciBSZWFjdCA9IHJlcXVpcmUoJ3JlYWN0L2Rpc3QvcmVhY3Qtd2l0aC1hZGRvbnMubWluLmpzJyk7XG5cbnZhciBBcHBTdG9yZSA9IHJlcXVpcmUoJy4uL3N0b3Jlcy9hcHAtc3RvcmUnKTtcbnZhciBST1cgPSByZXF1aXJlKCcuL3JvdycpO1xuXG52YXIgZ2V0QWxwaGFIZWFkZXIgPSBmdW5jdGlvbihudW0pe1xuICBpZiAobnVtID4gMjUpIHJldHVybiBudWxsO1xuICB2YXIgYWxwaGEgPSAnIEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaJy5zcGxpdCgnJyk7XG4gIHJldHVybiBhbHBoYVtudW1dO1xufVxuXG5mdW5jdGlvbiBnZXRUYWJsZURhdGEoKXtcbiAgcmV0dXJuIEFwcFN0b3JlLmdldFJvd3MoKTtcbn1cblxudmFyIFRBQkxFID0gUmVhY3QuY3JlYXRlQ2xhc3Moe1xuICBnZXRJbml0aWFsU3RhdGU6IGZ1bmN0aW9uKCl7XG4gICAgcmV0dXJuIHtcbiAgICAgIGNlbGxJbkVkaXRNb2RlOiBmYWxzZSxcbiAgICAgIHJvd3M6IGdldFRhYmxlRGF0YSgpXG4gICAgfTtcbiAgfSxcbiAgcmVuZGVyOiBmdW5jdGlvbigpe1xuICAgIHZhciByb3dzID0gdGhpcy5zdGF0ZS5yb3dzLm1hcChmdW5jdGlvbihyb3dEYXRhLHJvd0luZGV4KXtcbiAgICAgIHJldHVybiAoXG4gICAgICAgIDxST1cga2V5PXtyb3dJbmRleH0gcm93PXtyb3dEYXRhfSBpbmRleD17cm93SW5kZXh9IC8+XG4gICAgICApXG4gICAgfSk7XG5cbiAgICB2YXIgcm93c0hlYWRlcnMgPSB0aGlzLnN0YXRlLnJvd3NbMF1cbiAgICAgIC5zbGljZSgpXG4gICAgICAuY29uY2F0KFwiXCIpXG4gICAgICAubWFwKGZ1bmN0aW9uKHJvdyxjb2xJbmRleCl7XG4gICAgICAgIHJldHVybiA8dGgga2V5PXtjb2xJbmRleH0gY2xhc3NOYW1lPXtcInItc3ByZWFkc2hlZXRcIn0+IHtnZXRBbHBoYUhlYWRlcihjb2xJbmRleCl9IDwvdGg+XG4gICAgfSk7XG5cbiAgICByZXR1cm4gKFxuICAgICAgPHRhYmxlIGNsYXNzTmFtZT17XCJyLXNwcmVhZHNoZWV0XCJ9PlxuICAgICAgICA8dGhlYWQ+XG4gICAgICAgICAgPHRyPlxuXG4gICAgICAgICAgICB7cm93c0hlYWRlcnN9XG5cbiAgICAgICAgICA8L3RyPlxuICAgICAgICA8L3RoZWFkPlxuICAgICAgICA8dGJvZHk+XG5cbiAgICAgICAgICB7cm93c31cblxuICAgICAgICA8L3Rib2R5PlxuICAgICAgPC90YWJsZT5cbiAgICApXG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFRBQkxFOyIsIm1vZHVsZS5leHBvcnRzID0ge1xuICBBY3Rpb25UeXBlczoge1xuICAgIEFDVElPTl9BQ1RJT046ICdBQ1RJT05fQUNUSU9OJ1xuICB9ICBcbn07IiwidmFyIERpc3BhdGNoZXIgPSByZXF1aXJlKCdmbHV4JykuRGlzcGF0Y2hlcjtcbnZhciBleHRlbmQgPSBmdW5jdGlvbihvbnRvT2JqLGZyb21PYmope1xuICBmb3IgKHZhciBrZXkgaW4gZnJvbU9iail7XG4gICAgb250b09ialtrZXldID0gZnJvbU9ialtrZXldO1xuICB9XG4gIHJldHVybiBvbnRvT2JqXG59XG5cbnZhciBBcHBEaXNwYXRjaGVyID0gZXh0ZW5kKG5ldyBEaXNwYXRjaGVyKCksIHtcblxuICBoYW5kbGVWaWV3QWN0aW9uOiBmdW5jdGlvbihhY3Rpb24pIHtcbiAgICB2YXIgcGF5bG9hZCA9IHtcbiAgICAgIHNvdXJjZTogJ1ZJRVdfQUNUSU9OJyxcbiAgICAgIGFjdGlvbjogYWN0aW9uXG4gICAgfTtcbiAgICB0aGlzLmRpc3BhdGNoKHBheWxvYWQpO1xuICB9XG5cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEFwcERpc3BhdGNoZXI7XG4iLCJcbnZhciBSWFNTID0gcmVxdWlyZSgnLi9jb21wb25lbnRzL2FwcCcpO1xudmFyIFJlYWN0ID0gcmVxdWlyZSgncmVhY3QvZGlzdC9yZWFjdC13aXRoLWFkZG9ucy5taW4uanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBSWFNTO1xuXG4iLCJ2YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyO1xudmFyIF8gPSB7XG4gIG1hcDogcmVxdWlyZSgnbG9kYXNoL2NvbGxlY3Rpb24vbWFwJyksXG4gIHJhbmdlOiByZXF1aXJlKCdsb2Rhc2gvdXRpbGl0eS9yYW5nZScpXG59O1xuXG52YXIgQXBwRGlzcGF0Y2hlciA9IHJlcXVpcmUoJy4uL2Rpc3BhdGNoZXJzL2FwcC1kaXNwYXRjaGVyJyk7XG52YXIgQXBwQ29uc3RhbnRzID0gcmVxdWlyZSgnLi4vY29uc3RhbnRzL2FwcC1jb25zdGFudHMnKTtcblxuXG52YXIgZXh0ZW5kID0gZnVuY3Rpb24ob250b09iaixmcm9tT2JqKXtcbiAgZm9yICh2YXIga2V5IGluIGZyb21PYmope1xuICAgIG9udG9PYmpba2V5XSA9IGZyb21PYmpba2V5XTtcbiAgfVxuICByZXR1cm4gb250b09ialxufVxuXG52YXIgQ0hBTkdFX0VWRU5UID0gJ2NoYW5nZSc7XG5cbnZhciB0YWJsZVJvd3MgPSBfLnJhbmdlKDAsMzApLm1hcChmdW5jdGlvbihudW0pe1xuICByZXR1cm4gXy5yYW5nZSgwLDEwKS5tYXAoZnVuY3Rpb24oKXtcbiAgICByZXR1cm4ge3ZhbHVlOidib2InfTtcbiAgfSk7XG59KTtcblxudmFyIEFwcFN0b3JlID0gZXh0ZW5kKEV2ZW50RW1pdHRlci5wcm90b3R5cGUsIHtcbiAgZ2V0Um93czogZnVuY3Rpb24oKXtcbiAgICByZXR1cm4gdGFibGVSb3dzO1xuICB9XG59KTtcblxuLy8gdmFyIEFjdGlvblR5cGVzID0gQXBwQ29uc3RhbnRzLkFjdGlvblR5cGVzO1xuXG4vLyBBcHBTdG9yZS5kaXNwYXRjaFRva2VuID0gQXBwRGlzcGF0Y2hlci5yZWdpc3RlcihmdW5jdGlvbihwYXlsb2FkKXtcbi8vICAgdmFyIGFjdGlvbiA9IHBheWxvYWQuYWN0aW9uO1xuXG4vLyAgIHN3aXRjaChhY3Rpb24udHlwZSkge1xuICAgIFxuLy8gICAgIGNhc2UgQWN0aW9uVHlwZXMuQkxBQkxBOlxuLy8gICAgICAgYnJlYWs7XG4gICAgXG4vLyAgICAgY2FzZSBBY3Rpb25UeXBlcy5CTEFCTEE6XG4vLyAgICAgICBicmVhaztcbiAgICBcbi8vICAgICBkZWZhdWx0OlxuLy8gICAgICAgLy8gZG8gbm90aGluZ1xuLy8gICB9XG4vLyB9KTtcblxubW9kdWxlLmV4cG9ydHMgPSBBcHBTdG9yZTsiXX0=
