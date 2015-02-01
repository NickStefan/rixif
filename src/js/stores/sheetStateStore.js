var _ = {
  range: require('lodash/utility/range'),
  isUndefined: require('lodash/lang/isUndefined'),
  mapValues: require('lodash/object/mapValues')
};

/////////////////////////////
// State Model

var cell = function() {
  this.selected = false;
  this.editing = false;
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

// to avoid iterating the entire table to set and unset these
var lastSelected = {row:1, col: 1};
var lastEditing = {row:1, col: 1};

/////////////////////////////
// Private State Methods
var stateMethods = {
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
  },

  _selected: function(tableRows, row, col) {
    // close any editing cells
    tableRows[lastEditing.row].cells[lastEditing.col].editing = false;
    // select cells and unselect previously selected cell
    tableRows[lastSelected.row].cells[lastSelected.col].selected = false;
    tableRows[row].cells[col].selected = true;
    lastSelected = {row: row, col: col};
    return tableRows;
  },
  _editing: function(tableRows, row, col) {
    tableRows[lastEditing.row].cells[lastEditing.col].editing = false;
    tableRows[row].cells[col].editing = true;
    lastEditing = {row: row, col: col};
    return tableRows;
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
stateMethods = _.mapValues(stateMethods, function(fn) {
  return function(){
    var store = arguments[0];
    var dispatchedArgs = arguments[1].length ? arguments[1] : undefined;
    var args = [ store ].concat(dispatchedArgs);
    return fn.apply(null, args);
  }
});

module.exports = {
  stateMethods: stateMethods,
  tableRows: tableRows
}