var _ = {
  mapValues: require('lodash/object/mapValues'),
  toArray: require('lodash/lang/toArray'),
  extend: require('lodash/object/extend')
};
var io = window.io && window.io() || null;

var AppDispatcher = require('../dispatchers/app-dispatcher');
var AppConstants = require('../constants/app-constants');
var ActionTypes = AppConstants.ActionTypes;
var LocalCommandManager = require('../actions/command-manager');

/////////////////////////////
// local command manager to track local redo / undo.
// syncs all Actions (commands) with the server and other clients
// server connection is optional and will not affect the build
var commandManager = new LocalCommandManager(AppDispatcher, io);

/////////////////////////////
// Build server actions from AppConstants.ActionTypes

var FromServerActions = _.mapValues(ActionTypes, function(fnName){
  if (fnName === 'undo' || 'redo'){
    return function(){};
  } else {
    return function(){
      AppDispatcher[fnName]({
        type: fnName,
        args: _.toArray(arguments)
      });
    }; 
  }
});

/////////////////////////////
// Build client actions from AppConstants.ActionTypes

var AppActions = _.mapValues(ActionTypes, function(fnName){
  if (fnName === 'undo'){
    return function(){ commandManager.undo() };
  } else if (fnName === 'redo'){
    return function(){ commandManager.redo() };
  } else {
    return function(){
      AppDispatcher[fnName]({
        type: fnName,
        args: _.toArray(arguments)
      });
      commandManager.add(fnName, AppConstants.reverse[fnName], _.toArray(arguments));
    };
  }
});

module.exports = AppActions;
