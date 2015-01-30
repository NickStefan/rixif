var EventEmitter = require('events').EventEmitter;
var _ = {
  range: require('lodash/utility/range'),
  isUndefined: require('lodash/lang/isUndefined'),
  extend: require('lodash/object/extend')
};

var CommandManager = require('../dispatchers/command-manager');
var AppDispatcher = require('../dispatchers/app-dispatcher');
var AppConstants = require('../constants/app-constants');
var ActionTypes = AppConstants.ActionTypes;
var CHANGE_EVENT = 'change';

/////////////////////////////
// Store Command Manager
var commandManager = new CommandManager();

/////////////////////////////
// Store Model

var cell = {value:''};
var defaultRow = _.range(0,10).map(function(){ return cell;});
var tableRows = _.range(0,30).map(function(num){
  return defaultRow;
});

/////////////////////////////
// Store Methods

var _addCol = function(tableRows, index) {
  if (index === undefined){
    return tableRows = tableRows.map(function(row,rowIndex){
      return row.concat(cell);
    });
  }
};
var _rmCol = function(tableRows, index) {
  if (index === undefined){
    return tableRows = tableRows.map(function(row,rowIndex){
      var row = row.slice();
      row.pop();
      return row;
    });
  }
};

var _addRow = function(tableRows, index) {
  if (index === undefined){
    var newRow = _.isUndefined(tableRows[0]) ? defaultRow : tableRows[0];
    tableRows.push(newRow);
    return tableRows;
  }
};
var _rmRow = function(tableRows, index) {
  if (index === undefined){
    tableRows.pop();
    return tableRows;
  }
};


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


AppStore.dispatchToken = AppDispatcher.register(function(payload){
  var action = payload.action;
  switch(action.type) {
    
    case ActionTypes.ADD_COL:
      tableRows = _addCol(tableRows, payload.action.index);
      commandManager.add(_addCol, _rmCol, payload.action.index);
      break;
    case ActionTypes.RM_COL:
      tableRows = _rmCol(tableRows, payload.action.index);
      commandManager.add(_rmCol, _addCol, payload.action.index);
      break;
    
    case ActionTypes.ADD_ROW:
      tableRows = _addRow(tableRows, payload.action.index);
      commandManager.add(_addRow, _rmRow, payload.action.index);
      break;
    case ActionTypes.RM_ROW:
      tableRows = _rmRow(tableRows, payload.action.index);
      commandManager.add(_rmRow, _addRow, payload.action.index);
      break;

    case ActionTypes.UNDO:
      tableRows = commandManager.undo(tableRows);
      break;
    case ActionTypes.REDO:
      tableRows = commandManager.redo(tableRows);
      break;
    
    default:
      // do nothing
  }
  AppStore.emitChange();
  return true;
});

module.exports = AppStore;