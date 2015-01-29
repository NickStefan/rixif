var EventEmitter = require('events').EventEmitter;
var _ = {
  range: require('lodash/utility/range'),
  isUndefined: require('lodash/lang/isUndefined')
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
/////////////////////////////

var cell = {value:''};
var defaultRow = _.range(0,10).map(function(){ return cell;});
var tableRows = _.range(0,30).map(function(num){
  return defaultRow;
});

var _addCol = function(index) {
  if (index === undefined){
    console.log(tableRows)
    tableRows = tableRows.map(function(row,rowIndex){
      console.log(cell)
      console.log(row)
      //row.push(cell);
      return row.concat(cell);
    });
    console.log(tableRows)
  }
};
var _rmCol = function(index) {
  if (index === undefined){
    tableRows = tableRows.map(function(row,rowIndex){
      row.pop();
      return row;
    });
  }
};

var _addRow = function(index) {
  if (index === undefined){
    var newRow = _.isUndefined(tableRows[0]) ? defaultRow : tableRows[0];
    tableRows.push(newRow);
  }
};
var _rmRow = function(index) {
  if (index === undefined){
    tableRows.pop();
  }
};

var AppStore = extend(EventEmitter.prototype, {
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

var ActionTypes = AppConstants.ActionTypes;

AppStore.dispatchToken = AppDispatcher.register(function(payload){
  var action = payload.action;
  switch(action.type) {
    
    case ActionTypes.ADD_COL:
      _addCol(payload.action.index);
      break;
    case ActionTypes.RM_COL:
      _rmCol(payload.action.index);
      break;
    
    case ActionTypes.ADD_ROW:
      _addRow(payload.action.index);
      break;
    case ActionTypes.RM_ROW:
      _rmRow(payload.action.index);
      break;
    
    default:
      // do nothing
  }
  AppStore.emitChange();
  return true;
});

module.exports = AppStore;