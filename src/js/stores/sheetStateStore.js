var Immutable = require('immutable');
var _ = {
  range: require('lodash/utility/range'),
  isUndefined: require('lodash/lang/isUndefined'),
  mapValues: require('lodash/object/mapValues')
};

/////////////////////////////
// State Model

var cell = function() {
  return Immutable.Map({
    selected: false,
    editing: false,
    lastKey: ""
  });
};
var defaultRow = function(length) {
  length = length || 10;
  return Immutable.Map({
    cells: Immutable.List(_.range(0,length).map(function(){ return cell(); }))
  });
};
var defaultTable = function(rows,cols) {
  rows = rows || 30;
  cols = cols || 10;
  return Immutable.Map({
    rows: Immutable.List(_.range(0,rows).map(function(){ return defaultRow(cols); })),
    cellInEditMode: false
  });
};

var table = defaultTable();

// to avoid iterating the entire table to set and unset these
var lastSelected = {row:1, col: 1};
var lastEditing = {row:1, col: 1};

/////////////////////////////
// Private State Methods
var stateMethods = {
  _addCol: function(table, index) {
    len = table.get('rows').first().get('cells').size;
    index = index !== undefined ? index : len;
    return table.set('rows', table.get('rows').map(function(row,rowIndex){
      return row.set('cells', row.get('cells').splice( index,0,cell() ));
    }));
  },
  _rmCol: function(table, index) {
    len = table.get('rows').first().get('cells').size - 1;
    index = index !== undefined ? index : len;
    return table.set('rows', table.get('rows').map(function(row,rowIndex){
      return row.set('cells', row.get('cells').splice( index,1 ));
    }));
  },

  _addRow: function(table, index) {
    len = table.get('rows').size - 1;
    index = index !== undefined ? index : len;
    var newRow = _.isUndefined(table.get('rows').first()) ?
      defaultRow() : 
      defaultRow(table.get('rows').first().size);
    return table.set('rows', table.get('rows').splice( index,0,newRow ));
  },
  _rmRow: function(table, index) {
    len = table.get('rows').size - 1;
    index = index !== undefined ? index : len;
    return table.set('rows', table.get('rows').splice( index,1 ));
  },

  _selected: function(table, row, col) {
    // close any editing cells
    table = table.updateIn(['rows',lastEditing.row,'cells',lastEditing.col], function(cell) {
      return cell.set('editing', false);
    });
    table = table.set('cellInEditMode', false);
    // select cells and unselect previously selected cell
    table = table.updateIn(['rows',lastSelected.row,'cells',lastSelected.col], function(cell) {
      return cell.set('selected', false);
    });
    table = table.updateIn(['rows',row,'cells',col], function(cell) {
      return cell.set('selected', true);
    });
    lastSelected = {row: row, col: col};
    return table;
  },
  _editing: function(table, row, col, lastKey) {
    if (row === undefined) {
      return this._selected(table, lastEditing.row, lastEditing.col);
    }
    table = table.updateIn(['rows',lastEditing.row,'cells',lastEditing.col], function(cell) {
      return cell.set('editing', false)
      .set('lastKey',"");
    });
    table = table.updateIn(['rows',row,'cells',col], function(cell) {
      return cell.set('editing', true)
      .set('lastKey',lastKey);
    });
    table = table.set('cellInEditMode', true);
    lastEditing = {row: row, col: col};
    return table;
  },
  _enterEditMode: function(table, lastKey) {
    return this._editing(table,lastSelected.row, lastSelected.col, lastKey);
  },

  _move: function(table,move) {
    if (table.get('cellInEditMode')){
      return table;
    }
    if (move === 'right' && lastSelected.col < table.get('rows').first().get('cells').size - 1){
      return this._selected(table, lastSelected.row, lastSelected.col + 1);

    } else if (move === 'left' && lastSelected.col > 0){
      return this._selected(table, lastSelected.row, lastSelected.col - 1);

    } else  if (move === 'up' && lastSelected.row > 0){
      return this._selected(table, lastSelected.row - 1, lastSelected.col);

    } else if (move === 'down' && lastSelected.row < table.get('rows').size - 1){
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