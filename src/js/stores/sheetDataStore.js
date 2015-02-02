var Immutable = require('immutable');
var _ = {
  range: require('lodash/utility/range'),
  isUndefined: require('lodash/lang/isUndefined'),
  mapValues: require('lodash/object/mapValues')
};

/////////////////////////////
// Store Model

var cell = function(val) {
  val = val || "";
  return Immutable.Map({
    value: val
  });
};
var defaultRow = function(length) {
  length = length || 10;
  return Immutable.Map({
    cells: Immutable.List(_.range(0,length).map(function(){ return cell(); }))
  });
};
var defaultTable = function() {
  return Immutable.Map({
    rows: Immutable.List(_.range(0,3000).map(function(){ return defaultRow(); }))
  });
};

var table = new defaultTable();

/////////////////////////////
// Private Store Methods
var storeMethods = {
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

  _changeCell: function(table, row, col, newValue, oldValue) {
    if (newValue.length && newValue[0] === '='){
      return table.updateIn(['rows',row,'cells',col],function(cell){
        return cell.set('formula', newValue);
      });
    } else {
      return table.updateIn(['rows',row,'cells',col],function(cell){
        return cell.set('value', newValue);
      });
    }
    // this._updateFormulas();
  },
  _unchangeCell: function(table, row, col, newValue, oldValue){
    return this._changeCell(arguments[0],arguments[1],arguments[2],arguments[4],arguments[3]);
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
storeMethods = _.mapValues(storeMethods, function(fn,fnName,classObj) {
  return function(){
    var store = arguments[0];
    arguments[1] = arguments[1] || [];
    var dispatchedArgs = arguments[1].length ? arguments[1] : undefined;
    var args = [ store ].concat(dispatchedArgs);
    return fn.apply(classObj, args);
  }
});

module.exports = {
  storeMethods: storeMethods,
  table: table
}