var Immutable = require('immutable');
var _ = {
  range: require('lodash/utility/range'),
  isUndefined: require('lodash/lang/isUndefined'),
  isBoolean: require('lodash/lang/isBoolean'),
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
  val = val || null;
  return Immutable.Map({
    value: val,
    iDepOn: Immutable.List(),
    depOnMe: Immutable.List(),
    formula: undefined,
    fn: undefined,
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
    //return tmpTable;
    return this._updateFormulas(tmpTable, arguments[1],arguments[2],arguments[3],arguments[4]);
  },

  _unchangeCell: function(table, row, col, newValue, oldValue){
    var tmpTable = this._changeCellUser(arguments[0],arguments[1],arguments[2],arguments[4],arguments[3]);
    //return tmpTable;
    return this._updateFormulas(tmpTable, arguments[1],arguments[2],arguments[4],arguments[3]);
  },

  _changeCellUser: function(table, row, col, newValue, oldValue){
    // if a formula
    if (newValue && newValue.length && newValue[0] === '='){
      var depOnMe = table.getIn(['rows',row,'cells',col,'depOnMe']);
      depOnMe.forEach(function(depObj,key){
        table = table.updateIn(['rows',depObj.row,'cells',depObj.col],function(cell){
          // filter me out of my dependent cells "iDepOn" as that might
          // change when i parse this new formula
          var newDepOnMe = cell.get('depOnMe').filter(function(depOnMeObj){
            return depOnMeObj.row !== row && depOnMeObj.col !== col;
          });
          return cell.set('needsReCalc', true)
          .set('depOnMe', newDepOnMe);
        });
      });

      table = this._parseFormula(table, row, col, newValue)
      return table.updateIn(['rows',row,'cells',col],function(cell){
        return cell.set('formula', newValue)
        .set('value', null)
        .set('needsReCalc', true);
      });

    //if a value
    } else {
      if (newValue === ""){
        newValue = null;
      }
      var depOnMe = table.getIn(['rows',row,'cells',col,'depOnMe']);
      depOnMe.forEach(function(depObj,key){
        var row = depObj.row;
        var col = depObj.col;
        table = table.updateIn(['rows',row,'cells',col],function(cell){
          return cell.set('needsReCalc', true);
        });
      });
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
    formula = formula.replace(/[\\\;\#\^]/g,"");


    // values: /[a-zA-Z]+[0-9]+/g
    // arrays & tables: /([a-zA-Z]\d+\:[a-zA-Z]+\d+)/g
    // build function arguments and function variables
    formula = formula.slice(1);
    var usedInputs = _.uniq(formula.match(/([a-zA-Z]\d+\:[a-zA-Z]+\d+)|[a-zA-Z]+[0-9]+/g));
    var args = usedInputs.map(function(input){
      // if table or array
      if (/([a-zA-Z]\d+\:[a-zA-Z]+\d+)/g.test(input)){
        var letters = input.match(/[a-zA-Z]+/g);
        var nums = input.match(/[0-9]+/g);
        var regex = new RegExp('(' + letters[0] + nums[0] + ':' + letters[1] + nums[1] + ')');
        var prefix = nums[0] !== nums[1] && letters[0] !== letters[1] ? 't' : 'a';
        var varName = [
          prefix,
          (parseInt(nums[0]) - 1).toString(),
          "_",
          alpha[ letters[0].toUpperCase() ],
          "_",
          (parseInt(nums[1]) - 1).toString(),
          "_",
          alpha[ letters[1].toUpperCase() ]
        ].join("");
      // if value
      } else {
        var letter = input.match(/[a-zA-Z]+/)[0];
        var num = input.match(/[0-9]+/)[0];
        var regex = new RegExp('('+ letter + num + ')','g');
        var varName = "v" + (parseInt(num) - 1).toString() + "_" + alpha[ letter.toUpperCase() ]; 
      }
      // reformat A1 to v0_0 and B1:B4 to a0_1_4_1 and B1:C2 to t1_1_2_2
      formula = formula.replace(regex, varName);
      return varName;
    })
    .sort(function(a,b){
      return a < b ? -1 : 1;
    })
    .join(",");

    
    // add used inputs to iDepOn, convert v0_1 to 0,1
    if (args.length){
      var iDepOn = [];
      args.split(",").forEach(function(cellDep){
        var cellInfo = cellDep.split("_");
        var rowDep = cellInfo[0].slice(1);
        var colDep = cellInfo[1];
        iDepOn.push({ row: rowDep, col: colDep });
      });
      // TODO ADD NEW a3_0_7_0 and t3_0_7_1 TO iDepOn and depOnMe

      table = table.updateIn(['rows',row,'cells',col], function(cell){
        var newDeps = Immutable.List();
        return cell.set('iDepOn', newDeps.concat(iDepOn) );
      });

      // add me to the depOnMe for every cell in my iDepOn
      iDepOn.forEach(function(depCell){
        if (!table.hasIn(['rows',depCell.row,'cells',depCell.col])){
        //abort the loop the row or col doesnt exist
        // ie a formula with B10000 + A1000000
        return false;
      }
        table = table.updateIn(['rows',depCell.row,'cells',depCell.col],function(cell){
          return cell.updateIn(['depOnMe'],function(depOnMe){ 
            return depOnMe.push({ row:row, col:col });
          });
        });
      });

    // if no arguments, set iDepOn to empty List
    } else {
      table = table.updateIn(['rows',row,'cells',col],function(cell){
        return cell.set('iDepOn', Immutable.List());
      });
    }

    var error;

    // get supported built in formulas, ie SQUARE()
    // regex out all of the bad things (ie alert() etc)
    // match all letters except those followed by NUMBERS_NUMBERS example is v3_3
    var usedFormulas = formula.match(/([a-zA-Z]+)(?!\d+_\d+)|(\')|(\")/g);
    var handled = {};
    var quoteOpenSingle = false;
    var quoteOpenDouble = false;
    if (usedFormulas && usedFormulas.length){
      usedFormulas.forEach(function(fn){
        if (fn.toLowerCase() === 'true' || fn.toLowerCase() === 'false' ){
          // pass - type Boolean
        } else if (fn === '"') {
          quoteOpenDouble = quoteOpenDouble ? false : true;
        } else if (fn === "'") {
          quoteOpenSingle = quoteOpenSingle ? false : true;
        } else if (_.has(handled, fn)) {
          // pass already handled
        } else if (_.has(formulaClass, fn.toLowerCase())){
          // have to double escape when string building regex
          var regex = new RegExp('(' + fn + ')','g');
          formula = formula.replace(regex, 'this.' + fn);
          handled[fn] = fn;
        } else if (quoteOpenDouble || quoteOpenSingle) {
          // pass - type String
        } else {
          error = function() { return 'ERR: notFn';};
        }
      });
    }

    // build formula string and eval it to JS
    var fnStr = 'function(' + args + '){ return ' + formula + ';}';

    if (error !== undefined) {
      return table.updateIn(['rows',row,'cells',col], function(cell){
        return cell.set('fn', error);
      });
    }

    try {
      return table.updateIn(['rows',row,'cells',col], function(cell){
        return cell.set('fn', eval('(' + fnStr + ')') );
      });
    } 
    catch (e) {
      return table.updateIn(['rows',row,'cells',col], function(cell){
        return cell.set('fn', function(){ return 'ERROR: evalFn';} );
      });
    }
  },

  _getValues: function(table, row, col){
    // build arg array of values from iDepOn
    // return arg array sorted by row and col
    return table.getIn(['rows',row,'cells',col,'iDepOn'], Immutable.List())
    .map(function(cell,key){
      var rowDep = cell.row;
      var colDep = cell.col;
      return {
        value: table.getIn(['rows',rowDep,'cells',colDep,'value'], null),
        name: 'v' + rowDep.toString() + '_' + colDep.toString() 
      }
    })
    .sort(function(a,b){
      return a.name < b.name ? -1 : 1;
    })
    .map(function(cell,key){
      return isNaN(cell.value) || cell.value === null || _.isBoolean(cell.value) ? cell.value : parseFloat(cell.value);
    });
  },

  _eval: function(table, row, col, args){
    // set all dependent cells as needing reCalc
    var depOnMe = table.getIn(['rows',row,'cells',col,'depOnMe']);
    depOnMe.forEach(function(depObj,key){
      var row = depObj.row;
      var col = depObj.col;
      if (!table.hasIn(['rows',row,'cells',col])){
        // if row or col doesnt exist
        // ie a formula with B10000 + A1000000
        return;
      }
      table = table.updateIn(['rows',row,'cells',col],function(cell){
        return cell.set('needsReCalc', true);
      });
    });

    // take args and 
    // return evalued results
    var fn = table.getIn(['rows',row,'cells',col,'fn']);
    return table.updateIn(['rows',row,'cells',col],function(cell){
      return cell
      .set('value', fn.apply(formulaClass, args.toJS() ))
      .set('needsReCalc', false);
    });
  },


  _updateFormulas: function(table, row, col, newValue, oldValue){
    var self = this;
    var tmpTable = table; 
    recurse.apply(this,arguments);
    return tmpTable;

    function reCalc(table, row, col){
      var args = this._getValues(table,row,col);
       return this._eval(table, row,col,args);
    }

    function recurse(table, row, col, newValue, oldValue){
      // if newValue === a formula
      if (newValue && newValue.length && newValue[0] === '='){
        // use formula to calculate this cell's value
        tmpTable = reCalc.call(self, tmpTable, row, col);
        // get cell value
        newValue = tmpTable.getIn(['rows',row,'cells',col,'value']);
      }

      // if newValue === a value (even after the above code transforms it)
      if (newValue || newValue === null || newValue === ""){

        // for each depOnMe cell
        // if all of depOnMe cell's iDepOn's 'needsReCalc' === false
        //    reCalc(depOnMe cell)
        var depOnMe = tmpTable.getIn(['rows',row,'cells',col,'depOnMe'], Immutable.List());
        var updatedDepOnMe = depOnMe.slice();

        while (depOnMe.size) {

          var depCell = depOnMe.findEntry(function(depCell,key){
            // depCells ALL iDepOns 'needsReCalc' === false
            return tmpTable.getIn(['rows',depCell.row,'cells',depCell.col,'iDepOn']).every(function(iDepCell,key){
              return tmpTable.getIn(['rows',iDepCell.row,'cells',iDepCell.col,'needsReCalc']) === false;
            });
          });

          if (depCell && depCell.length){
            depOnMe = depOnMe.splice(depCell[0],1);
            tmpTable = reCalc.call(self, tmpTable, depCell[1].row, depCell[1].col);
          } else {
            console.log("skipping ", depOnMe.first().row, depOnMe.first().col);
            depOnMe = depOnMe.pop();
          }
        }

        updatedDepOnMe.forEach(function(depCell){
          var row = depCell.row;
          var col = depCell.col;
          var val = tmpTable.getIn(['rows', row, 'cells', col, 'value'],null);
          recurse.call(self, tmpTable, row, col, val);
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