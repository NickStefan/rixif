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

var sheetFormulas = sheetData.tableFormulas;
var sheetFormulaMethods = sheetData.formulaMethods;

var sheetStateStore = require('../stores/sheetStateStore');
var sheetStateMethods = sheetStateStore.stateMethods;
var sheetState = sheetStateStore.table;

/////////////////////////////
// Private Multi Store Communications

var updateFormulas = function(row, col, newValue, oldValue){
  
  // if newValue === formula
  if (newValue.length && newValue[0] === '='){
    sheetData = sheetData.updateIn(['rows',row,'cells',col],function(cell){
      return cell.set('formula', newValue);
    });
    sheetFormulaMethods._parseFormula(sheetFormulas, row, col, newValue);
    reCalc(row,col);

  // if newValue === value
  } else {

    sheetData = sheetData.updateIn(['rows',row,'cells',col],function(cell){
      return cell.set('value', newValue);
    });
    sheetFormulas[row][col].value = newValue;
    //   loop depOnMe RECURSIVE BASE CASE ENDS HERE ON NO DEPENDENCIES
    sheetFormulas[row][col].depOnMe.forEach(function(cell){
      reCalc(cell.row, cell.col);
    });
  }

  function reCalc(row,col){
    var args = sheetFormulas._getValues(row,col);
    var value = sheetFormulas._eval(row,col,args);
    updateFormulas(row, col, value);
  }
};

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
      sheetFormulas = sheetFormulaMethods._addCol(sheetFormulas, payload.action.args);
      break;
    case ActionTypes.rmCol:
      sheetData = sheetDataMethods._rmCol(sheetData, payload.action.args);
      sheetState = sheetStateMethods._rmCol(sheetState, payload.action.args);
      sheetFormulas = sheetFormulaMethods._rmCol(sheetFormulas, payload.action.args);
      break;
    
    case ActionTypes.addRow:
      sheetData = sheetDataMethods._addRow(sheetData, payload.action.args);
      sheetState = sheetStateMethods._addRow(sheetState, payload.action.args);
      sheetFormulas = sheetFormulaMethods._addRow(sheetFormulas, payload.action.args);
      break;
    case ActionTypes.rmRow:
      sheetData = sheetDataMethods._rmRow(sheetData, payload.action.args);
      sheetState = sheetStateMethods._rmRow(sheetState, payload.action.args);
      sheetFormulas = sheetFormulaMethods._rmRow(sheetFormulas, payload.action.args);
      break;

    case ActionTypes.changeCell:
      sheetData = sheetDataMethods._changeCell(sheetData, payload.action.args);
      sheetState = sheetStateMethods._editing(sheetState, undefined);
      updateFormulas(payload.action.args);
      break;

    case ActionTypes.unchangeCell:
      sheetData = sheetDataMethods._unchangeCell(sheetData, payload.action.args);
      sheetState = sheetStateMethods._editing(sheetState, undefined);
      var args = payload.action.args;
      updateFormulas(args[0],args[1],args[3],args[2]);
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

    default:
      // do nothing
  }
  AppStore.emitChange();
  return true;
});

module.exports = AppStore;