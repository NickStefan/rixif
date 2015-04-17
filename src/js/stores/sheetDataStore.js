var Immutable = require('immutable');
var _ = {
  range: require('lodash/utility/range'),
  isUndefined: require('lodash/lang/isUndefined'),
  isBoolean: require('lodash/lang/isBoolean'),
  mapValues: require('lodash/object/mapValues'),
  uniq: require('lodash/array/uniq'),
  has: require('lodash/object/has'),
  flatten: require('lodash/array/flatten'),
  every: require('lodash/collection/every'),
  forEach: require('lodash/collection/forEach')
};
var colHelpers = require('../stores/col-num-helpers');
var alpha = colHelpers.alpha;
var alphaArrFull = colHelpers.alphaArrFull;
var numberToLetter = colHelpers.numberToLetter;
var letterToNumber = colHelpers.letterToNumber;

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
    rows: Immutable.List(_.range(0,rows).map(function(){ return defaultRow(cols); })),
    formulas: Immutable.Set()
  });
};

var table = defaultTable();


/////////////////////////////
// Private Store Methods
var storeMethods = {
  _addCol: function(table, index) {
    var self = this;
    len = table.get('rows').first().get('cells').size;
    index = index !== undefined ? index : len;
    table = table.set('rows', table.get('rows').map(function(row,rowIndex){
      return row.set('cells', row.get('cells').splice( index,0,cell() ));
    }));

    table.get('formulas').forEach(function(formulaCell){
      var row = formulaCell.get('row');
      var col = formulaCell.get('col');
      var addedCol = index;
      // col will have shifted up by 1
      if (col >= addedCol){
        col = col + 1;
      }
      table = self._rewriteFormula(table, row, col, addedCol, 'col', 'add');
    });

    // recalc all the cells in formulas ???

    return table;
  },

  _rmCol: function(table, index) {
    var self = this;
    len = table.get('rows').first().get('cells').size - 1;
    index = index !== undefined ? index : len;
    table = table.set('rows', table.get('rows').map(function(row,rowIndex){
      return row.set('cells', row.get('cells').splice( index,1 ));
    }));

    table.get('formulas').forEach(function(formulaCell){
      var row = formulaCell.get('row');
      var col = formulaCell.get('col');
      var removedCol = index;
      if (col >= removedCol){
        col = col - 1;
      }
      table = self._rewriteFormula(table, row, col, removedCol, 'col', 'remove');
    });

    // recalc all the cells in formulas ???

    return table;
  },

  _addRow: function(table, index) {
    var self = this;
    len = table.get('rows').size - 1;
    index = index !== undefined ? index : len;
    var newRow = _.isUndefined(table.get('rows').first()) ?
      defaultRow() : 
      defaultRow(table.get('rows').first().get('cells').size);
    table = table.set('rows', table.get('rows').splice( index,0,newRow ));

    table.get('formulas').forEach(function(formulaCell){
      var row = formulaCell.get('row');
      var col = formulaCell.get('col');
      var addedRow = index;
      if (row >= addedRow){
        row = row + 1;
      }
      table = self._rewriteFormula(table, row, col, addedRow, 'row', 'add');
    });

    // recalc all the cells in formulas ???

    return table;
  },

  _rmRow: function(table, index) {
    var self = this;
    len = table.get('rows').size - 1;
    index = index !== undefined ? index : len;
    table = table.set('rows', table.get('rows').splice( index,1 ));

    table.get('formulas').forEach(function(formulaCell){
      var row = formulaCell.get('row');
      var col = formulaCell.get('col');
      var removedRow = index;
      if (row >= removedRow){
        row = row - 1;
      }
      table = self._rewriteFormula(table, row, col, removedRow, 'row', 'remove');
    });

    // recalc all the cells in formulas ???

    return table;
  },

  _rewriteFormula: function(table, row, col, changedIndex, rowOrCol, action){
    // mark any cells depending on me as needing to update
    // does this go here???
    var depOnMe = table.getIn(['rows',row,'cells',col,'depOnMe'],[]);
    depOnMe.forEach(function(depObj,key){
      table = table.updateIn(['rows',depObj.row,'cells',depObj.col],function(cell){
        return cell.set('needsReCalc', true);
      });
    });

    var formulaStr = table.getIn(['rows', row , 'cells', col, 'formula']);
    var usedInputs = _.uniq(formulaStr.match(/([a-zA-Z]\d+\:[a-zA-Z]+\d+)|[a-zA-Z]+[0-9]+/g));

    _.forEach(usedInputs, changeArgs);

    table = table.updateIn(['rows', row, 'cells', col], function(cell){
      return cell.set('formula', formulaStr);
    });

    // get old coords of our cell being edited
    var oldCoord = {
      add: function (num) { return parseInt(num) - 1},
      remove: function(num) { return parseInt(num) + 1}
    };
    var oldRow = rowOrCol === 'row' && row >= changedIndex ? oldCoord[action](row) : row;
    var oldCol = rowOrCol === 'col' && col >= changedIndex ? oldCoord[action](col) : col;

    // remove old iDepOn dependencies after moving the row or col
    table = fixiDepOn(table, oldRow, oldCol);

    // recalc the iDepOn and depOnMe
    table = this._parseFormula(table, row, col, formulaStr, {skipCircleChecks: false});

    // update table formulas set
    table = table.updateIn(['formulas'], function(formulas){
      return formulas
      .delete(Immutable.Map({row: oldRow, col: oldCol}))
      .add(Immutable.Map({row: row, col: col}));
    });

    return table;

    function fixiDepOn(table, oldRow, oldCol){
      // forEach iDepOn, remove myself (as my old coordinates) from their depOnMe
      var iDepOn = table.getIn(['rows',row,'cells',col,'iDepOn'],[]);
      iDepOn.forEach(function(iDepObj, key){
        var newCoord = {
          add: function (num) { return parseInt(num) + 1},
          remove: function(num) { return parseInt(num) - 1}
        };
        // get new coords for the depObj that we need to update
        var newDepRow = rowOrCol === 'row' && row >= changedIndex ? newCoord[action](iDepObj.row) : iDepObj.row;
        var newDepCol = rowOrCol === 'col' && col >= changedIndex ? newCoord[action](iDepObj.col) : iDepObj.col;
        
        // filter out the old coords in the depOnMe of the now moved dependent cells
        table = table.updateIn(['rows', newDepRow, 'cells', newDepCol],function(cell){
          return cell
          .set('depOnMe', cell.get('depOnMe')
            .filter(function(dep,key){
              return dep.row !== oldRow && dep.col !== oldCol;
            })
          );
        });
      });
      return table;
    }

    // TODO make this function work for arrays and tables
    function changeArgs (arg){
      var newArg;
      var regex;
      if (isArrayOrTable(arg) && arrayOrTableContains(rowOrCol, changedIndex) ){
        if (action === 'add'){
          newArg = lengthen(arg, rowOrCol);
        }
        if (action === 'remove'){
          newArg = shorten(arg, rowOrCol);
        }
      
      } else if (isSingle(arg) && getFromSingle(arg, rowOrCol) >= changedIndex) {
        if (action === 'add'){
          newArg = increment(arg, rowOrCol);
        }
        if (action === 'remove'){
          newArg = decrement(arg, rowOrCol);
        }

      } else if (isSingle(arg) && getFromSingle(arg, rowOrCol) < changedIndex){
        if (action === 'add'){
          // do nothing, added a rowOrCol after this rowOrCol index
        }
        if (action === 'remove'){
          // do nothing, added a rowOrCol after this rowOrCol index
        }

      }
      // if any changes to be made, make them on the formula string
      if (newArg){
        regex = new RegExp(arg,'g');
        formulaStr = formulaStr.replace(regex, newArg);
      }
    }

    function lengthen(arg, rowOrCol){
      // increase array or table, rowOrCol length by 1;
    }
    function shorten(arg, rowOrCol){
      // decrease array or table, rowOrCol length by 1;
    }
    function increment(arg, rowOrCol){
      // increase row or col by 1
      if (rowOrCol === 'row'){
        var row = arg.match(/(\d+)/g)[0];
        return arg.replace(/(\d+)/g, (parseInt(row) + 1).toString() );
      }
      if (rowOrCol === 'col'){
        var col = arg.match(/([a-zA-Z]+)/g)[0];
        var newCol = numberToLetter( letterToNumber(col) + 1);
        return arg.replace(/([a-zA-Z]+)/g, newCol);
      }
    }
    function decrement(arg, rowOrCol){
      // decrease row or col by 1
      if (rowOrCol === 'row'){
        var row = arg.match(/(\d+)/g)[0];
        return arg.replace(/(\d+)/g, (parseInt(row) - 1).toString() );
      }
      if (rowOrCol === 'col'){
        var col = arg.match(/([a-zA-Z]+)/g)[0];
        var newCol = numberToLetter( letterToNumber(col) - 1);
        return arg.replace(/([a-zA-Z]+)/g, newCol);
      }
    }

    function isSingle(arg){
      if (/^[a-zA-Z]+[\d]+$/g.test(arg)){
        return true
      }
      return false;
    }
    function isArrayOrTable(arg){
      if (/([a-zA-Z]\d+\:[a-zA-Z]+\d+)/g.test(arg)){
        return true;
      }
      return false;
    }

    function getFromSingle(arg, rowOrCol){
      var argRegexed
      if (rowOrCol === 'row'){
        argRegexed = arg.match(/(\d+)/g);
        argRegexed = argRegexed.length > 0 ? argRegexed[0] : "";
        return argRegexed;
      }
      if (rowOrCol === 'col'){
        argRegexed = arg.match(/([a-zA-Z]+)/g);
        argRegexed = argRegexed.length > 0 ? argRegexed[0] : "";
        return letterToNumber(argRegexed);
      }
    }
    function arrayOrTableContains(rowOrCol, changedIndex){
      var letters = arg.match(/[a-zA-Z]+/g);
      var nums = arg.match(/[0-9]+/g);
      var row1 = nums[0];
      var row2 = nums[1];
      var col1 = letters[0];
      var col2 = letters[1];
      if (rowOrCol === 'row' && changedIndex >= row1 && changedIndex <= row2){
        return true;
      }
      if (rowOrCol === 'col' && changedIndex >= col1 && changedIndex <= col2){
        return true;
      }
      return false;
    }
  },

  _changeCell: function(table, row, col, newValue, oldValue) {
    var tmpTable = this._changeCellUser.apply(this,arguments);
    return this._updateFormulas(tmpTable, arguments[1],arguments[2],arguments[3],arguments[4]);
  },

  _unchangeCell: function(table, row, col, newValue, oldValue){
    var tmpTable = this._changeCellUser(arguments[0],arguments[1],arguments[2],arguments[4],arguments[3]);
    return this._updateFormulas(tmpTable, arguments[1],arguments[2],arguments[4],arguments[3]);
  },

  _changeCellUser: function(table, row, col, newValue, oldValue){
    // for all the cells iDepOn, remove me from their depOnMe
    // as cells iDepOn may change: i might have a different formula or no longer be a formula
    var iDepOn = table.getIn(['rows',row,'cells',col,'iDepOn'],[]);
    iDepOn.forEach(function(depObj,key){
        if (depObj.type === 'single'){
          table = filterOutSingle(table, depObj);
        } else if (depObj.type === 'array'|| depObj.type === 'table'){
          table = filterOutArrayOrTable(table, depObj);
        }
    });

    // mark any cells depending on me as needing to update
    var depOnMe = table.getIn(['rows',row,'cells',col,'depOnMe'],[]);
    depOnMe.forEach(function(depObj,key){
      table = table.updateIn(['rows',depObj.row,'cells',depObj.col],function(cell){
        return cell.set('needsReCalc', true);
      });
    });

    // if a formula
    if (newValue && newValue.length && newValue[0] === '='){
      // add to formula Set
      table = table.updateIn(['formulas'], function(formulas){
        return formulas.add(Immutable.Map({row:row, col:col}));
      });
      // actually parse formula
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
      // remove cell from formula set
      table = table.updateIn(['formulas'], function(formulas){
        return formulas.delete(Immutable.Map({row:row, col:col}));
      });
      // actually update this cell
      return table.updateIn(['rows',row,'cells',col],function(cell){
        return cell.set('value', newValue)
        .set('formula', null)
        .set('iDepOn', Immutable.List())
        .set('fn', null)
        .set('needsReCalc',false);
      });
    }

    function filterOut(table, depRow, depCol){
      return table.updateIn(['rows',depRow,'cells',depCol],function(cell){
        var newDepOnMe = cell.get('depOnMe')
        .filter(function(depOnMeObj){
          return depOnMeObj.row !== row && depOnMeObj.col !== col;
        });
        return cell.set('depOnMe', newDepOnMe);
      });
    }
    function filterOutSingle(table, depObj){
      return filterOut(table, depObj.row, depObj.col);
    }
    function filterOutArrayOrTable(table, depObj){
      _.range(depObj.col1, parseInt(depObj.col2) + 1)
      .forEach(function(colVal){
        _.range(depObj.row1, parseInt(depObj.row2) + 1)
        .forEach(function(rowVal){
          table = filterOut(table, rowVal, colVal);
        });
      });
      return table;
    }
  },


  _parseFormula: function(table, row, col, formula, options){
    options = options || {};
    // regex out escaping characters and special characters
    formula = formula.replace(/[\\\;\#\^]/g,"");
    var error;

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

    // cell cant depend on itself
    function checkCircleSingle(rowDep,colDep){
      if (parseInt(rowDep) === row && parseInt(colDep) === col){
        return true;
      }
      return false;
    }

    function checkCircleArrayTable(rowDep1,colDep1,rowDep2,colDep2){
      if (col <= parseInt(colDep2) && col >= parseInt(colDep1)
      && row <= parseInt(rowDep2) && row >= parseInt(rowDep1)){
        return true;
      }
      return false;
    }
    
    // add used inputs to iDepOn, convert v0_1 to 0,1
    if (args.length){
      var iDepOn = [];
      args.split(",").forEach(function(cellDep){
        var cellInfo = cellDep.split("_");

        // if single cell
        if (cellInfo && cellInfo.length <= 2){
          var rowDep = cellInfo[0].slice(1);
          var colDep = cellInfo[1];
          if (!options.skipCircleChecks && checkCircleSingle(rowDep,colDep)){
            error = function() { return 'ERR: circle';};
            return;
          }
          iDepOn.push({ type:'single', row: rowDep, col: colDep });

        // if array or table
        } else if (cellInfo && cellInfo.length > 2 &&
         (cellInfo[0][0] === 'a' || cellInfo[0][0] === 't') ){
          var type = cellInfo[0][0] === 'a' ? 'array' : 'table';
          var rowDep1 = cellInfo[0].slice(1);
          var colDep1 = cellInfo[1];
          var rowDep2 = cellInfo[2];
          var colDep2 = cellInfo[3];
          if (!options.skipCircleChecks && checkCircleArrayTable(rowDep1,colDep1,rowDep2,colDep2)){
            error = function() { return 'ERR: circle';};
            return;
          }
          iDepOn.push({ 
            type: type, 
            row1: rowDep1, col1: colDep1,
            row2: rowDep2, col2: colDep2
          });
        }
      });

      table = table.updateIn(['rows',row,'cells',col], function(cell){
        var newDeps = Immutable.List();
        return cell.set('iDepOn', newDeps.concat(iDepOn) );
      });

      // add me to the depOnMe for every cell in my iDepOn
      iDepOn.forEach(function(depVar){
        if (depVar.type === 'single'){
          var tmpTable = addMeToSingle(table, depVar);
          if (tmpTable !== undefined) table = tmpTable;

        } else if (depVar.type === 'array') {
          var tmpTable = addMeToArray(table, depVar);
          if (tmpTable !== undefined) table = tmpTable;

        } else if (depVar.type === 'table') {
          var tmpTable = addMeToTable(table, depVar);
          if (tmpTable !== undefined) table = tmpTable;
        }
      });

      function addMeToSingle(table,depCell){
        if (!table.hasIn(['rows',depCell.row,'cells',depCell.col])){
          //abort: the row or col doesnt exist
          // ie a formula with B10000 + A1000000
          return;
        }
        return table.updateIn(['rows',depCell.row,'cells',depCell.col],function(cell){
          return cell.updateIn(['depOnMe'],function(depOnMe){ 
            return depOnMe.push({ row:row, col:col });
          });
        });  
      }

      function addMeToArray(table, depArray){
        // vertical
        if (depArray.col1 === depArray.col2){
          _.range(depArray.row1, parseInt(depArray.row2) + 1).map(function(rowVal){
            return {row: rowVal, col: depArray.col1 };
          })
          .forEach(function(depVar){
            var tmpTable = addMeToSingle(table, depVar);
            if (tmpTable !== undefined) table = tmpTable;
          });
          return table;

        // horizontal
        } else if (depArray.row1 === depArray.row2){
          _.range(depArray.col1, parseInt(depArray.col2) + 1).map(function(colVal){
            return {row: depArray.row1, col: colVal};
          })
          .forEach(function(depVar){
            var tmpTable = addMeToSingle(table, depVar);
            if (tmpTable !== undefined) table = tmpTable;
          });
          return table;
        }
      }

      function addMeToTable(table, depTable){
        // create vertical arrays of each col
        _.range(depTable.col1, parseInt(depTable.col2) + 1)
        .map(function(colVal){
          return _.range(depTable.row1, parseInt(depTable.row2) + 1)
          .map(function(rowVal){
            return {row: rowVal, col: colVal };
          });
        }).forEach(function(depArr){
          depArr.forEach(function(depCell){
            var tmpTable = addMeToSingle(table, depCell);
            if (tmpTable !== undefined) table = tmpTable;
          });
        });
        return table;
      }

    // if no arguments, set iDepOn to empty List
    } else {
      table = table.updateIn(['rows',row,'cells',col],function(cell){
        return cell.set('iDepOn', Immutable.List());
      });
    }

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
          var regex = new RegExp('(' + fn + ')','g');
          formula = formula.replace(regex, 'this.' + fn.toLowerCase());
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
    .map(function(depObj,key){
      if (depObj.type === 'single'){
        return getSingle(depObj);

      } else if (depObj.type === 'array'){
        return getArray(depObj);

      } else if (depObj.type === 'table'){
        return getTable(depObj);
      }
    })
    .sort(function(a,b){
      return a.name < b.name ? -1 : 1;
    })
    .map(function(depVar,key){
      return depVar.value;
    });


    function getValue(rowDep,colDep){
      var value = table.getIn(['rows',rowDep,'cells',colDep,'value'], null);
      
      if (isNaN(value) || value === null || _.isBoolean(value)){
        return value;
      } else {
        return parseFloat(value);
      }
    }

    function getSingle(depCell){
      return {
        value: getValue(depCell.row, depCell.col),
        name: 'v' + depCell.row.toString() + '_' + depCell.col.toString() 
      };
    }

    function getArray(depArray){
      var arr;
      // if vertical
      if (depArray.col1 === depArray.col2){
        arr = _.range(depArray.row1, parseInt(depArray.row2) + 1)
        .map(function(rowVal){
          return getValue(rowVal, depArray.col1);
        });
      // if horizontal
      } else if (depArray.row1 === depArray.row2){
        arr = _.range(depArray.col1, parseInt(depArray.col2) + 1)
        .map(function(colVal){
          return getValue(depArray.row1, colVal);
        });
      }
      var name = [
        'a',
        depArray.row1.toString(), '_', depArray.col1.toString(),
        '_',
        depArray.row2.toString(), '_', depArray.col2.toString()
      ].join("");
      return {
        value: arr,
        name: name
      };
    }

    function getTable(depTable){
      // create horizontal arrays of each row
      var table = _.range(depTable.row1, parseInt(depTable.row2) + 1)
      .map(function(rowVal){
        return _.range(depTable.col1, parseInt(depTable.col2) + 1)
        .map(function(colVal){
          return getValue(rowVal, colVal);
        });
      });
      var name = [
        't',
        depTable.row1.toString(), '_', depTable.col1.toString(),
        '_',
        depTable.row2.toString(), '_', depTable.col2.toString()
      ].join("");
      return {
        value: table,
        name: name 
      };
    }

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
            // do all of the cells in this one's iDepOn have 'needsReCalc' === false?
            return tmpTable.getIn(['rows',depCell.row,'cells',depCell.col,'iDepOn'])
            .every(function(iDepObj,key){
              // does this cell not need a reCalc?
              if (iDepObj.type === 'single'){
                return isCurrent(tmpTable, iDepObj.row, iDepObj.col);
              // do all of the cells in this array not need a reCalc?
              } else if (iDepObj.type === 'array'){
                return isCurrentArray(tmpTable, iDepObj);
              // do all of the cells in this table not need a reCalc?
              } else if (iDepObj.type === 'table'){
                return isCurrentArray(tmpTable, iDepObj);
              }
            });
          });

          // reCalc cell if all of its iDepOn tree is up to date
          if (depCell && depCell.length){
            depOnMe = depOnMe.splice(depCell[0],1);
            tmpTable = reCalc.call(self, tmpTable, depCell[1].row, depCell[1].col);
          // dont recalculate cell if it still has unresolved dependencies
          } else {
            // skip reCalc, will be arrived at later in the dependency tree
            depOnMe = depOnMe.pop();
          }
        }

        // recurse through the dependency tree
        updatedDepOnMe.forEach(function(depCell){
          var row = depCell.row;
          var col = depCell.col;
          var val = tmpTable.getIn(['rows', row, 'cells', col, 'value'],null);
          recurse.call(self, tmpTable, row, col, val);
        });
      }
    }

    function isCurrent(table,depRow,depCol){
      return table.getIn(['rows',depRow,'cells',depCol,'needsReCalc']) === false;
    }
    function isCurrentArray(table,depArray){
      var arr;
      // if vertical
      if (depArray.col1 === depArray.col2){
        arr = _.range(depArray.row1, parseInt(depArray.row2) + 1)
        .map(function(rowVal){
          return isCurrent(table, rowVal, depArray.col1);
        });
      // if horizontal
      } else if (depArray.row1 === depArray.row2){
        arr = _.range(depArray.col1, parseInt(depArray.col2) + 1)
        .map(function(colVal){
          return isCurrent(table, depArray.row1, colVal);
        });
      }
      return _.every(arr, Boolean);
    }
    function isCurrentTable(table,depTable){
      // create vertical arrays of each col
      var table = _.range(depTable.col1, parseInt(depTable.col2) + 1)
      .map(function(colVal){
        return _.range(depTable.row1, parseInt(depTable.row2) + 1)
        .map(function(rowVal){
          return isCurrent(table, rowVal, colVal);
        });
      });
      return _.every( _.flatten(table), Boolean);
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