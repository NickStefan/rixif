var _ = {
  mapValues: require('lodash/object/mapValues'),
  toArray: require('lodash/lang/toArray'),
  extend: require('lodash/object/extend')
};

var AppDispatcher = require('../dispatchers/app-dispatcher');
var AppConstants = require('../constants/app-constants');
var ActionTypes = AppConstants.ActionTypes;
var LocalCommandManager = require('../actions/command-manager');

/////////////////////////////
// Actions can come from the server

var FromServerActions = {

  addCol: function(index) {
    AppDispatcher.addCol({
      type: ActionTypes.addCol,
      index: index
    });
  },
  rmCol: function(index) {
    AppDispatcher.rmCol({
      type: ActionTypes.rmCol,
      index: index
    });
  },

  addRow: function(index) {
    AppDispatcher.addRow({
      type: ActionTypes.addRow,
      index: index
    });
  },
  rmRow: function(index) {
    AppDispatcher.rmRow({
      type: ActionTypes.rmRow,
      index: index
    });
  }

};

// RemoteCommandManager(FromServerActions,io);

/////////////////////////////
// actions can also come from the client
// add client actions to the command manager

// optional socket.io connection to command manager on the server
var io = window.io && window.io() || null;
var commandManager = new LocalCommandManager(AppDispatcher, io);

var AppActions = _.mapValues(FromServerActions, function(fn,fnName){
  return function(){
    fn.apply(null,arguments);
    commandManager.add(fnName, AppConstants.reverse[fnName], _.toArray(arguments));
  };
});

// client can undo and redo using the command manager
AppActions = _.extend(AppActions,{
  undo: function() {
    commandManager.undo();
  },
  redo: function() {
    commandManager.redo();
  }
});

module.exports = AppActions;
