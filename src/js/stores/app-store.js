var EventEmitter = require('events').EventEmitter;
var _ = {
  range: require('lodash/utility/range'),
  isUndefined: require('lodash/lang/isUndefined'),
  extend: require('lodash/object/extend')
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
  _addCol: function(tableRows, args) {
    var index = args[0];
    if (index === undefined){
      return tableRows = tableRows.map(function(row,rowIndex){
        return row.concat(cell);
      });
    }
  },
  _rmCol: function(tableRows, args) {
    var index = args[0];
    if (index === undefined){
      return tableRows = tableRows.map(function(row,rowIndex){
        var row = row.slice();
        row.pop();
        return row;
      });
    }
  },

  _addRow: function(tableRows, args) {
    var index = args[0];
    if (index === undefined){
      var newRow = _.isUndefined(tableRows[0]) ? defaultRow : tableRows[0];
      tableRows.push(newRow);
      return tableRows;
    }
  },
  _rmRow: function(tableRows, args) {
    var index = args[0];
    if (index === undefined){
      tableRows.pop();
      return tableRows;
    }
  }
}

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
// map from dispatcher to store methods
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