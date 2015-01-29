var Dispatcher = require('flux').Dispatcher;
var extend = function(ontoObj,fromObj){
  for (var key in fromObj){
    ontoObj[key] = fromObj[key];
  }
  return ontoObj
}

var AppDispatcher = extend(new Dispatcher(), {

  addCol: function(action) {
    var payload = {
      source: 'ADD_COL',
      action: action
    };
    this.dispatch(payload);
  },
  rmCol: function(action) {
    var payload = {
      source: 'RM_COL',
      action: action
    };
    this.dispatch(payload);
  },

  addRow: function(action) {
    var payload = {
      source: 'ADD_ROW',
      action: action
    };
    this.dispatch(payload);
  },
  rmRow: function(action) {
    var payload = {
      source: 'RM_ROW',
      action: action
    };
    this.dispatch(payload);
  },

});

module.exports = AppDispatcher;
