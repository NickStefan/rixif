var AppDispatcher = require('../dispatchers/app-dispatcher');
var AppConstants = require('../constants/app-constants');

var ActionTypes = AppConstants.ActionTypes;

var AppActions = {

  addCol: function(index) {
    AppDispatcher.addCol({
      type: ActionTypes.ADD_COL,
      index: index
    });
  },
  rmCol: function(index) {
    AppDispatcher.rmCol({
      type: ActionTypes.RM_COL,
      index: index
    });
  },

  addRow: function(index) {
    AppDispatcher.addRow({
      type: ActionTypes.ADD_ROW,
      index: index
    });
  },
  rmRow: function(index) {
    AppDispatcher.rmRow({
      type: ActionTypes.RM_ROW,
      index: index
    });
  }
  
};

module.exports = AppActions;
