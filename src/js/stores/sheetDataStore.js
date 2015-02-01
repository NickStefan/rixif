var _ = {
  range: require('lodash/utility/range'),
  isUndefined: require('lodash/lang/isUndefined'),
  mapValues: require('lodash/object/mapValues')
};

/////////////////////////////
// Store Model

var cell = function() {
  this.value = "";
};
var defaultRow = function(length) {
  length = length || 10;
  this.cells = _.range(0,length).map(function(){ 
    return new cell();
  });
};
var tableRows = _.range(0,30).map(function(num){
  return new defaultRow();
});

/////////////////////////////
// Private Store Methods
var storeMethods = {
  _addCol: function(tableRows, index) {
    if (index === undefined){
      return tableRows = tableRows.map(function(row,rowIndex){
        return row.cells.concat(new cell());
      });
    }
  },
  _rmCol: function(tableRows, index) {
    if (index === undefined){
      return tableRows = tableRows.map(function(row,rowIndex){
        var row = row.slice();
        row.cells.pop();
        return row;
      });
    }
  },

  _addRow: function(tableRows, index) {
    if (index === undefined){
      var newRow = _.isUndefined(tableRows[0]) ? new defaultRow() : new defaultRow(tableRows[0].length);
      tableRows.push(newRow);
      return tableRows;
    }
  },
  _rmRow: function(tableRows, index) {
    if (index === undefined){
      tableRows.pop();
      return tableRows;
    }
  }
}

// map the invoked arguments to the expected arguments defined above.
// this is a convenience to keep actions, dispatchers, etc generic
// up until actually invoking the store methods above
// example: 
// invoked in the dispatcher as:
//   store.Method(store1, args); 
// invokes the methods defined above as
//   store.Method(store1, args[0], args[1] ... etc )
storeMethods = _.mapValues(storeMethods, function(fn) {
  return function(){
    var store = arguments[0];
    var dispatchedArgs = arguments[1].length ? arguments[1] : undefined;
    var args = [ store ].concat(dispatchedArgs);
    return fn.apply(null, args);
  }
});

module.exports = {
  storeMethods: storeMethods,
  tableRows: tableRows
}