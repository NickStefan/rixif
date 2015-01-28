var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');

var AppDispatcher = require('../dispatchers/app-dispatcher');
var AppConstants = require('../constants/app-constants');


var extend = function(ontoObj,fromObj){
  for (var key in fromObj){
    ontoObj[key] = fromObj[key];
  }
  return ontoObj
}

var CHANGE_EVENT = 'change';

var tableRows = _.map(_.range(0,30),function(num){
  return _.map(_.range(0,10),function(){
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