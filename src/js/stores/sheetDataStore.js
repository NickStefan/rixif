var _ = {
  range: require('lodash/utility/range'),
  isUndefined: require('lodash/lang/isUndefined'),
  mapValues: require('lodash/object/mapValues')
};

/////////////////////////////
// Store Model

var cell = function(val) {
  this.value = val || "";
};
var defaultRow = function(length) {
  length = length || 10;
  this.cells = _.range(0,length).map(function(v,k){
    return new cell();
  });
};
var defaultTable = function() {
  this.rows = _.range(0,30).map(function(num){
    return new defaultRow();
  });
  this.cellInEditMode = false;
};

var table = new defaultTable();

/////////////////////////////
// Private Store Methods
var storeMethods = {
  _addCol: function(table, index) {
    if (index === undefined){
      return table = table.rows.map(function(row,rowIndex){
        return row.cells.concat(new cell());
      });
    }
  },
  _rmCol: function(table, index) {
    if (index === undefined){
      return table = table.rows.map(function(row,rowIndex){
        var row = row.slice();
        row.cells.pop();
        return row;
      });
    }
  },

  _addRow: function(table, index) {
    if (index === undefined){
      var newRow = _.isUndefined(table.rows[0]) ? new defaultRow() : new defaultRow(table.rows[0].length);
      table.rows.push(newRow);
      return table;
    }
  },
  _rmRow: function(table, index) {
    if (index === undefined){
      table.rows.pop();
      return table;
    }
  },

  _changeCell: function(table, row, col, newValue, oldValue) {
    if (newValue.length && newValue[0] === '='){
      table.rows[row].cells[col].formula = newValue;
    } else {
      table.rows[row].cells[col].value = newValue;
    }
    // this._updateFormulas();
    return table;
  },
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
    arguments[1] = arguments[1] || [];
    var dispatchedArgs = arguments[1].length ? arguments[1] : undefined;
    var args = [ store ].concat(dispatchedArgs);
    return fn.apply(null, args);
  }
});

module.exports = {
  storeMethods: storeMethods,
  table: table
}