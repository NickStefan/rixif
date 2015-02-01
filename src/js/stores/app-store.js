var EventEmitter = require('events').EventEmitter;
var _ = {
  range: require('lodash/utility/range'),
  isUndefined: require('lodash/lang/isUndefined'),
  extend: require('lodash/object/extend'),
  mapValues: require('lodash/object/mapValues'),
  toArray: require('lodash/lang/toArray')
};

var AppDispatcher = require('../dispatchers/app-dispatcher');
var AppConstants = require('../constants/app-constants');
var ActionTypes = AppConstants.ActionTypes;
var CHANGE_EVENT = 'change';


/////////////////////////////
// Store Model

var cell = {value:''};
var defaultRow = _.range(0,10).map(function(){ return cell;});
var tableRows = _.range(0,30).map(function(num){
  return defaultRow;
});

/////////////////////////////
// Private Store Methods
var storeMethods = {
  _addCol: function(tableRows, index) {
    if (index === undefined){
      return tableRows = tableRows.map(function(row,rowIndex){
        return row.concat(cell);
      });
    }
  },
  _rmCol: function(tableRows, index) {
    if (index === undefined){
      return tableRows = tableRows.map(function(row,rowIndex){
        var row = row.slice();
        row.pop();
        return row;
      });
    }
  },

  _addRow: function(tableRows, index) {
    if (index === undefined){
      var newRow = _.isUndefined(tableRows[0]) ? defaultRow : tableRows[0];
      tableRows.push(newRow);
      return tableRows;
    }
  },
  _rmRow: function(tableRows, index) {
    if (index === undefined){
      tableRows.pop();
      return tableRows;
    }
  }
}

// map the invoked arguments to the expected arguments defined above.
// this is a convenience to keep actions, dispatchers, etc generic
// up until actually invoking the store methods above
// example: 
// invoked in the dispatcher as:
//   store.Method(store1, args); 
// invokes the methods defined above as
//   store.Method(store1, args[0], args[1] ... etc )
storeMethods = _.mapValues(storeMethods, function(fn) {
  return function(){
    var store = arguments[0];
    var dispatchedArgs = arguments[1].length ? arguments[1] : undefined;
    var args = [ store ].concat(dispatchedArgs);
    return fn.apply(null, args);
  }
});

/////////////////////////////
// Store Public Methods
var AppStore = _.extend(EventEmitter.prototype, {
  emitChange: function(){
    this.emit(CHANGE_EVENT);
  },
  addChangeListener: function(callback){
    this.on(CHANGE_EVENT, callback);
  },
  removeEventListener: function(callback){
    this.removeEventListener(CHANGE_EVENT, callback);
  },
  getRows: function(){
    return tableRows;
  }
});

/////////////////////////////
// from dispatcher to store methods
AppStore.dispatchToken = AppDispatcher.register(function(payload){
  var action = payload.action;
  switch(action.type) {

    case ActionTypes.addCol:
      tableRows = storeMethods._addCol(tableRows, payload.action.args);
      break;
    case ActionTypes.rmCol:
      tableRows = storeMethods._rmCol(tableRows, payload.action.args);
      break;
    
    case ActionTypes.addRow:
      tableRows = storeMethods._addRow(tableRows, payload.action.args);
      break;
    case ActionTypes.rmRow:
      tableRows = storeMethods._rmRow(tableRows, payload.action.args);
      break;

    default:
      // do nothing
  }
  AppStore.emitChange();
  return true;
});

module.exports = AppStore;