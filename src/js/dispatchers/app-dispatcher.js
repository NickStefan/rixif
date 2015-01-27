var Dispatcher = require('flux').Dispatcher;
var extend = function(ontoObj,fromObj){
  for (var key in fromObj){
    ontoObj[key] = fromObj[key];
  }
  return ontoObj
}

var AppDispatcher = extend(new Dispatcher(), {

  handleViewAction: function(action) {
    var payload = {
      source: 'VIEW_ACTION',
      action: action
    };
    this.dispatch(payload);
  }

});

module.exports = AppDispatcher;
