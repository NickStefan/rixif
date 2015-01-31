var Dispatcher = require('flux').Dispatcher;
var AppConstants = require('../constants/app-constants');
var ActionTypes = AppConstants.ActionTypes;
var _ = {
  extend: require('lodash/object/extend'),
  mapValues: require('lodash/object/mapValues')
};

var AppDispatcher = _.mapValues(ActionTypes,function(fnName){
  return function (action){
    var payload = {
      source: fnName,
      action: action
    };
    this.dispatch(payload);
  };
});

module.exports = _.extend(new Dispatcher, AppDispatcher);
