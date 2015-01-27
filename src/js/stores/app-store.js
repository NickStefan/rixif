var AppDispatcher = require('../dispatcher/app-dispatcher');
var AppConstants = require('../constants/app-constants');
var EventEmitter = require('events').EventEmitter;

var extend = function(ontoObj,fromObj){
  for (var key in fromObj){
    ontoObj[key] = fromObj[key];
  }
  return ontoObj
}

var ActionTypes = AppConstants.ActionTypes;
var CHANGE_EVENT = 'change';

AppStore.dispatchToken = AppDispatcher.register(function(payload){
  var action = payload.action;

  switch(action.type) {
    
    case ActionTypes.BLABLA:
      break;
    
    case ActionTypes.BLABLA:
      break;
    
    default:
      // do nothing
  }
});

module.exports = AppStore;