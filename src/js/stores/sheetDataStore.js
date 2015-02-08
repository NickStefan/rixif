var Immutable = require('immutable');
var _ = {
  range: require('lodash/utility/range'),
  isUndefined: require('lodash/lang/isUndefined'),
  mapValues: require('lodash/object/mapValues'),
  uniq: require('lodash/array/uniq'),
  has: require('lodash/object/has')
};
var colHelpers = require('../stores/col-num-helpers');
var alpha = colHelpers.alpha;
var alphaArrFull = colHelpers.alphaArrFull;

var formulaClass = require('../stores/formulas');

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
      table = this._parseFormula(table, row, col, newValue)
      return table.updateIn(['rows',row,'cells',col],function(cell){
        return cell.set('formula', newValue)
        .set('value', null)
        .set('iDepOn', Immutable.List())
        .set('fn', fn)
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
    
    // regex out escaping characters and special characters
    formula = formula.replace(/[\\\/\'\"\;\!\%\@\#\$\&\*\^]/g,"");

    // build function arguments and function variables
    formula = formula.slice(1);
    var usedInputs = _.uniq(formula.match(/[a-zA-Z]+[0-9]+/g));
    var args = usedInputs.map(function(input){
      var letter = input.match(/[a-zA-Z]+/)[0];
      var num = input.match(/[0-9]+/)[0];
      var regex = new RegExp('('+ letter + num + ')','g');
      // reformat A1 to v0_0
      var varName = "v" + alpha[ letter.toUpperCase() ] + "_" + (parseInt(num) - 1).toString();
      formula = formula.replace(regex, varName);
      return varName;
    })
    .sort(function(a,b){
      return a.name < b.name ? -1 : 1;
    })
    .join(",");

    // add used inputs to iDepOn, convert v0_1 to 0,1
    var iDepOn = [];
    args.split(",").forEach(function(cellDep){
      var cellInfo = cellDep.split("_");
      var rowDep = cellInfo[0].slice(1);
      var colDep = cellInfo[1];
      iDepOn.push({ row: row, col: col });
    });

    table = table.updateIn(['rows',row,'cells',col], function(cell){
      return cell.set('iDepOn', cell.get('iDepOn').concat(iDepOn) );
    });

    // add me to the depOnMe for every cell in my iDepOn
    iDepOn.forEach(function(depCell){
      table = table.updateIn(['rows',depCell.row,'cells',depCell.col],function(cell){
        return cell.push(depCell);
      });
    });

    // get supported built in formulas, ie SQUARE()
    // regex out all of the bad things (ie alert() etc)
    usedFormulas = formula.match(/[^\(\)\s\.][a-zA-Z]+[^_0-9\(\)\s\.]/g);
    var error;
    usedFormulas.forEach(function(fn){
      if (_.has(formulaClass, fn.toUpperCase())){
        var regex = new RegExp("[^\(\)\s\.][" + fn + "]+[^_0-9\(\)\s\.]","g");
        formula = formula.replace(regex, "this." + fn.toUpperCase());
      } else {
        error = function() { return "Error: is not a supported function";};
      }
    });

    // build formula string and eval it to JS
    var fnStr = 'function(' + args + '){ return ' + formula + ';}';

    if (error !== undefined) {
      return table.updateIn(['rows',row,'cells',col], function(cell){
        return cell.set('fn', error);
      });
    }

    try {
      return table.updateIn(['rows',row,'cells',col], function(cell){
        return cell.set('fn', eval("(" + fnStr + ")") );
      });
    } catch {
      return table.updateIn(['rows',row,'cells',col], function(){
        return cell.set('fn', function(){ return "ERROR";} );
      });
    }
  },

  _getValues: function(table, row, col){
    // build arg array of values from iDepOn
    // return arg array sorted by row and col
    return table.getIn(['row',row,'col',col,'iDepOn'], Immutable.List())
    .map(function(cell,key){
      var rowDep = cell.get('row');
      var colDep = cell.get('col');
      return {
        value: table.getIn(['row',rowDep,'col',colDep,value], null),
        name: "v" + rowDep.toString() + "_" + colDep.toString() 
      }
    })
    .sort(function(a,b){
      return a.name < b.name ? -1 : 1;
    })
    .map(function(cell,key){
      return cell.value;
    });
  },

  _eval: function(table, row, col, args){
    // set all dependent cells as needing reCalc
    var tmpTable;
    var depOnMe = table.getIn(['rows',row,'cells',col,'depOnMe']);
    // how to make this more defensive against row/cols that dont exist?!
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
      .set('value', fn.apply(formulaClass, args))
      .set('needsReCalc', false);
    });
  },


  _updateFormulas: function(table, row, col, newValue, oldValue){

    var tmpTable = table; 
    recurse.apply(this,arguments);
    return tmpTable;

    function reCalc(table, row, col){
      var args = this._getValues(row,col);
       return this._eval(row,col,args);
    }

    function recurse(table, row, col, newValue, oldValue){
      // if newValue === a formula
      if (newValue.length && newValue[0] === '='){
        // use formula to calculate this cell's value
        tmpTable = reCalc(tmpTable, row, col);
        // get cell value
        newValue = tmpTable.getIn(['rows',row,'cells',col,'value']);

      // if newValue === a value (even after the above code transforms it)
      if (newValue){

        // for each depOnMe cell
        // if all of depOnMe cell's iDepOn's 'needsReCalc' === false
        //    reCalc(depOnMe cell)
        depOnMe = tmpTable.getIn(['rows',row,'cols',col,'depOnMe'], Immutable.List());
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
          var val = tmpTable.getIn(['rows', row, 'cells', col, 'value'],null);
          recurse(tmpTable, row, col, val);
        });

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