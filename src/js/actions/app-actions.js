var AppDispatcher = require('../dispatcher/ChatAppDispatcher');
var Constants = require('../constants/ChatConstants');

var ActionTypes = AppConstants.ActionTypes;

module.exports = {

  actionAction: function(data) {
    AppDispatcher.handleViewAction({
      type: ActionTypes.ACTION_ACTION,
      data: data
    });
  }
  
};
