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
    value: val,
    iDepOn: Immutable.List(),
    depOnMe: Immutable.List(),
    formula: undefined,
    fn: undefined
    needsReCalc: false
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
    rows: Immutable.List(_.range(0,rows).map(function(){ return defaultRow(cols); }))
  });
};

var table = defaultTable();


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
    var tmpTable = this._changeCellUser.apply(this,arguments);
    return tmpTable;
    //return this._updateFormulas(tmpTable, arguments[1],arguments[2],arguments[3],arguments[4]);
  },

  _unchangeCell: function(table, row, col, newValue, oldValue){
    var tmpTable = this._changeCellUser(arguments[0],arguments[1],arguments[2],arguments[4],arguments[3]);
    return tmpTable;
    //return this._updateFormulas(tmpTable, arguments[1],arguments[2],arguments[4],arguments[3]);
  },

  _changeCellUser: function(table, row, col, newValue, oldValue){
    // if a formula
    if (newValue.length && newValue[0] === '='){
      var tmpTable;
      var depOnMe = table.getIn(['rows',row,'cells',col,'depOnMe']);
      
      depOnMe.forEach(function(depObj,key){
        var row = depObj.get('row');
        var col = depObj.get('col');
        tmpTable = tmpTable.updateIn(['rows',row,'cells',col],function(cell){
          return cell.set('needsReCalc', true);
        });
      });

      table = tmpTable || table;
      return table.updateIn(['rows',row,'cells',col],function(cell){
        return cell.set('formula', newValue)
        .set('value', null)
        .set('iDepOn', Immutable.List())
        .set('fn', null)
        .set('needsReCalc', true);
      });

    //if a value
    } else {
      return table.updateIn(['rows',row,'cells',col],function(cell){
        return cell.set('value', newValue)
        .set('formula', null)
        .set('iDepOn', Immutable.List())
        .set('fn', null)
        .set('needsReCalc',false);
      });
    }
  },


  _parseFormula: function(table, row, col, formula){
    // validate (get rid of bad characters)
    // load up iDepOn, for each of those, add me to depOnMe
    // build a fn, eval it to a real fn, load it to row.cell.fn

    // regex out all of the bad things

    // loop formula and parse out list of iDepOn cell Obj
    // cell.row,col,name

    // build string fn, while replacing each iDepOn with its iDepOn cell.name
    // build arguments names to match
    // eval into a ready javascript function

  },
  _getValues: function(table, row, col){
    // build arg array of values from iDepOn
    // return arg array
    return table.getIn(['row',row,'col',col,'iDepOn'])
    .map(function(cell,key){
      var rowDep = cell.get('row');
      var colDep = cell.get('col');
      return {
        value: table.getIn(['row',rowDep,'col',colDep,value]),
        name: rowDep.toString() + "_" + colDep.toString() 
      }
    });
  },
  _eval: function(table, row, col, args){
    // set all dependent cells as needing reCalc
    var tmpTable;
    var depOnMe = table.getIn(['rows',row,'cells',col,'depOnMe']);
      depOnMe.forEach(function(depObj,key){
        var row = depObj.get('row');
        var col = depObj.get('col');
        tmpTable = tmpTable.updateIn(['rows',row,'cells',col],function(cell){
          return cell.set('needsReCalc', true);
        });
      });
    table = tmpTable || table;

    // take args and 
    // return evalued results
    var fn = table.getIn(['row',row,'col',col,'fn']);
    return table.updateIn(['row',row,'col',col],function(cell){
      return cell
      .set('value', fn.apply(null,args))
      .set('needsReCalc', false);
    });
  },


  _updateFormulas: function(table, row, col, newValue, oldValue){

    var tmpTable = table; 
    recurse.apply(this,arguments);
    return tmpTable;

    function recurse(table, row, col, newValue, oldValue){
      // if newValue === a formula
      if (newValue.length && newValue[0] === '='){
        tmpTable = this._parseFormula(tmpTable, row, col, newValue);
        tmpTable = reCalc(tmpTable, row, col);
        newValue = tmpTable.getIn(['rows'],row,'cells',col,'value']);

      // if newValue === a value (even after the above code transforms it)
      if (newValue){

        // for each depOnMe cell
        // if all of depOnMe cell's iDepOn's 'needsReCalc' === false
        //    reCalc(depOnMe cell)
        depOnMe = tmpTable.getIn(['rows',row,'cols',col,'depOnMe']);
        updatedDepOnMe = depOnMe.slice();

        while (depOnMe.size) {

          var depCell = depOnMe.findEntry(function(depCell,key){
            // depCells ALL iDepOns 'needsReCalc' === false
            return depCell.get('iDepOn').every(function(iDepCell,key){
              return tmpTable.getIn(['rows',iDepCell.get('row'),'cells',iDepCell.get('col'),'needsReCalc']) === false;
            });
          });

          if (depCell.length){
            depOnMe = depOnMe.splice(depCell[0],1);
            tmpTable = reCalc(tmpTable, depCell[1].get('row'), depCell[1].get('col'));
          } else {
            throw "dependents for " + row.toString() + " " + col.toString() + " cannot resolve";
          }
        }

        updatedDepOnMe.forEach(function(depCell){
          var row = depCell.get('row');
          var col = depCell.get('col');
          var val = tmpTable.getIn(['rows', row, 'cells', col, 'value']);
          recurse(tmpTable, row, col, val);
        });

      }

      function reCalc(table, row, col){
        var args = this._getValues(row,col);
         return this._eval(row,col,args);
      }
    }

  }
};

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
  };
});

module.exports = {
  storeMethods: storeMethods,
  table: table
};