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
    cellInEditMode: false,
    lastSelected: Immutable.Map({
      row: 1,
      col: 1
    }),
    lastEditing: Immutable.Map({
      row: 1,
      col: 1
    })
  });
};

var table = defaultTable();

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
    var lastSelected = table.get('lastSelected');
    var lastEditing = table.get('lastEditing');
    
    // close any editing cells that may still exist (add remove col)
    if (table.get('rows').size > lastEditing.get('row')
    && table.getIn(['rows',0,'cells']).size > lastEditing.get('col')){
      table = table.updateIn(['rows',lastEditing.get('row'),'cells',lastEditing.get('col')], function(cell) {
        return cell.set('editing', false);
      });
    }
    table = table.set('cellInEditMode', false);

    // unselect previously selected cell that may still exist (add remove col)
    if (table.get('rows').size > lastEditing.get('row')
    && table.getIn(['rows',0,'cells']).size > lastEditing.get('col')){
      table = table.updateIn(['rows',lastSelected.get('row'),'cells',lastSelected.get('col')], function(cell) {
        return cell.set('selected', false);
      });
    }

    // select cells
    table = table.updateIn(['rows',row,'cells',col], function(cell) {
      return cell.set('selected', true);
    });
    table = table.updateIn(['lastSelected'],function(lastSelected){
      return lastSelected
      .set('row',row)
      .set('col',col);
    });
    return table;
  },
  _editing: function(table, row, col, lastKey, displayAction) {
    var lastEditing = table.get('lastEditing');
    if (row === undefined) {
      return this._selected(table, lastEditing.get('row'), lastEditing.get('col'));
    }
    // update last editing cells that may still exist (add remove col)
    if (table.get('rows').size > lastEditing.get('row')
    && table.getIn(['rows',0,'cells']).size > lastEditing.get('col')){
      table = table.updateIn(['rows',lastEditing.get('row'),'cells',lastEditing.get('col')], function(cell) {
        return cell.set('editing', false)
        .set('lastKey',"")
        .set('displayAction', "");
      });
    }
    table = table.updateIn(['rows',row,'cells',col], function(cell) {
      return cell.set('editing', true)
      .set('lastKey',lastKey)
      .set('displayAction', displayAction);
    });
    table = table.set('cellInEditMode', true);
    table = table.updateIn(['lastEditing'],function(lastEditing){
      return lastEditing
      .set('row',row)
      .set('col',col);
    });
    return table;
  },
  _enterEditMode: function(table, lastKey, displayAction) {
    var lastSelected = table.get('lastSelected');
    return this._editing(table,lastSelected.get('row'), lastSelected.get('col'), lastKey, displayAction);
  },

  _move: function(table,move) {
    var lastSelected = table.get('lastSelected');
    if (table.get('cellInEditMode')){
      return table;
    }
    if (move === 'right' && lastSelected.get('col') < table.get('rows').first().get('cells').size - 1){
      return this._selected(table, lastSelected.get('row'), lastSelected.get('col') + 1);

    } else if (move === 'left' && lastSelected.get('col') > 0){
      return this._selected(table, lastSelected.get('row'), lastSelected.get('col') - 1);

    } else  if (move === 'up' && lastSelected.get('row') > 0){
      return this._selected(table, lastSelected.get('row') - 1, lastSelected.get('col'));

    } else if (move === 'down' && lastSelected.get('row') < table.get('rows').size - 1){
      return this._selected(table, lastSelected.get('row') + 1, lastSelected.get('col'));
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