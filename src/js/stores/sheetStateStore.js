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
var defaultTable = function() {
  this.rows = _.range(0,300).map(function(num){
    return new defaultRow();
  });
  this.cellInEditMode = false;
};

var table = new defaultTable();

// to avoid iterating the entire table to set and unset these
var lastSelected = {row:1, col: 1};
var lastEditing = {row:1, col: 1};

/////////////////////////////
// Private State Methods
var stateMethods = {
  _addCol: function(table, index) {
    if (index === undefined){
      table.rows = table.rows.map(function(row,rowIndex){
        row.cells = row.cells.concat(new cell());
        return row;
      });
      return table;
    }
  },
  _rmCol: function(table, index) {
    if (index === undefined){
      table.rows = table.rows.map(function(row,rowIndex){
        row.cells.pop();
        return row;
      });
      return table;
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

  _selected: function(table, row, col) {
    // close any editing cells
    table.rows[lastEditing.row].cells[lastEditing.col].editing = false;
    table.cellInEditMode = false;
    // select cells and unselect previously selected cell
    table.rows[lastSelected.row].cells[lastSelected.col].selected = false;
    table.rows[row].cells[col].selected = true;
    lastSelected = {row: row, col: col};
    return table;
  },
  _editing: function(table, row, col) {
    if (row === undefined) {
      return this._selected(table, lastEditing.row, lastEditing.col);
    }
    table.rows[lastEditing.row].cells[lastEditing.col].editing = false;
    table.rows[row].cells[col].editing = true;
    table.cellInEditMode = true;
    lastEditing = {row: row, col: col};
    return table;
  },
  _enterEditMode: function(table) {
    return this._editing(table,lastSelected.row, lastSelected.col);
  },

  _move: function(table,move) {
    if (table.cellInEditMode){
      return table;
    }
    if (move === 'right' && lastSelected.col < table.rows[0].cells.length - 1){
      return this._selected(table, lastSelected.row, lastSelected.col + 1);

    } else if (move === 'left' && lastSelected.col > 0){
      return this._selected(table, lastSelected.row, lastSelected.col - 1);

    } else  if (move === 'up' && lastSelected.row > 0){
      return this._selected(table, lastSelected.row - 1, lastSelected.col);

    } else if (move === 'down' && lastSelected.row < table.rows.length - 1){
      return this._selected(table, lastSelected.row + 1, lastSelected.col)
    } else {
      return table;
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
stateMethods = _.mapValues(stateMethods, function(fn,fnName,classObj) {
  return function(){
    var store = arguments[0];
    arguments[1] = arguments[1] || [];
    var dispatchedArgs = arguments[1].length ? arguments[1] : undefined;
    var args = [ store ].concat(dispatchedArgs);
    return fn.apply(classObj, args);
  }
});

module.exports = {
  stateMethods: stateMethods,
  table: table
}