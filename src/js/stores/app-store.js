var EventEmitter = require('events').EventEmitter;
var _ = {
  extend: require('lodash/object/extend')
};

var AppDispatcher = require('../dispatchers/app-dispatcher');
var AppConstants = require('../constants/app-constants');
var ActionTypes = AppConstants.ActionTypes;
var CHANGE_EVENT = 'change';

var sheetDataStore = require('../stores/sheetDataStore');
var sheetDataMethods = sheetDataStore.storeMethods;
var sheetData = sheetDataStore.table;

var sheetStateStore = require('../stores/sheetStateStore');
var sheetStateMethods = sheetStateStore.stateMethods;
var sheetState = sheetStateStore.table;

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
  getTable: function(){
    return sheetData;
  },
  getTableState: function(){
    return sheetState;
  }
});

/////////////////////////////
// from dispatcher to store methods
AppStore.dispatchToken = AppDispatcher.register(function(payload){
  var action = payload.action;

  switch(action.type) {

    // state and data changes
    case ActionTypes.addCol:
      sheetData = sheetDataMethods._addCol(sheetData, payload.action.args);
      sheetState = sheetStateMethods._addCol(sheetState, payload.action.args);
      break;
    case ActionTypes.rmCol:
      sheetData = sheetDataMethods._rmCol(sheetData, payload.action.args);
      sheetState = sheetStateMethods._rmCol(sheetState, payload.action.args);
      break;
    
    case ActionTypes.addRow:
      sheetData = sheetDataMethods._addRow(sheetData, payload.action.args);
      sheetState = sheetStateMethods._addRow(sheetState, payload.action.args);
      break;
    case ActionTypes.rmRow:
      sheetData = sheetDataMethods._rmRow(sheetData, payload.action.args);
      sheetState = sheetStateMethods._rmRow(sheetState, payload.action.args);
      break;

    case ActionTypes.changeCell:
      sheetData = sheetDataMethods._changeCell(sheetData, payload.action.args);
      sheetState = sheetStateMethods._editing(sheetState, undefined);
      break;

    case ActionTypes.unchangeCell:
      sheetData = sheetDataMethods._unchangeCell(sheetData, payload.action.args);
      sheetState = sheetStateMethods._editing(sheetState, undefined);
      break;


    // purely state changes
    case ActionTypes.selected:
      sheetState = sheetStateMethods._selected(sheetState, payload.action.args);
      break;
    case ActionTypes.editing:
      sheetState = sheetStateMethods._editing(sheetState, payload.action.args);
      break;
    case ActionTypes.enterEditMode:
      sheetState = sheetStateMethods._enterEditMode(sheetState, payload.action.args);
      break;

    case ActionTypes.move:
      sheetState = sheetStateMethods._move(sheetState, payload.action.args);
      break;

    case ActionTypes.renderMenu:
      sheetState = sheetStateMethods._renderMenu(sheetState, payload.action.args);
      break;

    default:
      // do nothing
  }
  AppStore.emitChange();
  return true;
});

module.exports = AppStore;