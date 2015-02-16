var _ = {
  toArray: require('lodash/lang/toArray'),
  isNumber: require('lodash/lang/isNumber'),
  flatten: require('lodash/array/flatten'),
  forEach: require('lodash/collection/forEach'),
  every: require('lodash/collection/every'),
  some: require('lodash/collection/some')
};

var formulas = {

  and: function(){
    var args = _.toArray(arguments);
    if (_.every(args)){
      return true;
    }
    return false;
  },

  average: function(){
    var args = _.flatten( _.toArray(arguments));
    var count = args.length;
    return count ? (this.sum(args) / count) : null;
  },

  averageif: function(testArr,testBool,trueArr){
    testArr = Array.isArray(testArr) ? testArr : [testArr];
    var resultArr = testArr
    .map(function(v,k,c){ 
      if (testBool === v){
        return trueArr[k];
      } else {
        return false;
      }
    })
    .filter(function(bool){ return bool;})
    return resultArr && resultArr.length ? this.average(resultArr) : null;
  },

  concatenate: function(){
    var args = _.toArray(arguments);
    return _.flatten(args).reduce(function(accum,v,k,c){
      return accum + v;
    });
  },

  count: function(){
    var args = _.toArray(arguments);
    return _.flatten(args).reduce(function(accum,v,k,c){
      return accum + (_.isNumber(v) ? 1 : 0);
    },0);
  },

  counta: function(){
    var args = _.toArray(arguments);
    return _.flatten(args).reduce(function(accum,v,k,c){
      return accum + (v !== null ? 1 : 0);
    },0);
  },
  
  countif: function(testArr,testBool){
    testArr = Array.isArray(testArr) ? testArr : [testArr];
    var resultArr = testArr
    .map(function(v,k,c){ 
      if (testBool === v){
        return true;
      } else {
        return false;
      }
    })
    .filter(function(bool){ return bool;})
    return resultArr && resultArr.length ? resultArr.length : null;
  },

  if: function(testBool,actionTrue,actionFalse){
    if (testBool){
      return actionTrue;
    } else {
      return actionFalse;
    }
  },

  left: function(text,numChars){
    return text.slice(0,numChars - 1);
  },

  len: function(text){
    return text.length;
  },

  mid: function(text,index,numChars){
    return text.substr(index -1, numChars);
  },

  or: function(){
    var args = _.toArray(arguments);
    if (_.some(args)){
      return true;
    }
    return false;
  },

  right: function(text,numChars){
    return text.slice(-numChars);
  },

  square: function(x){ 
    return x * x;
  },

  sum: function(){
    var args = _.toArray(arguments);
    return _.flatten(args).reduce(function(accum,v,k,c){
      return accum + (_.isNumber(v) ? v : 0);
    },0);
  },

  sumif: function(testArr,testBool,trueArr){
    testArr = Array.isArray(testArr) ? testArr : [testArr];
    var resultArr = testArr
    .map(function(v,k,c){ 
      if (testBool === v){
        return trueArr[k];
      } else {
        return false;
      }
    })
    .filter(function(bool){ return bool;})
    return resultArr && resultArr.length ? this.sum(resultArr) : null;
  },

  trim: function(text){
    return text.replace(/\s+$|^\s+/g,"").replace(/\s{2,}/g," ");
  },

  vlookup: function(value,tableMatrix,col,notExact){
    notExact = notExact === false || notExact === true ? notExact : true; 
    var found;
    _.forEach(tableMatrix, function(row,k,c){
      if (!notExact && row[0] === value){
        found = row[col - 1];
        return false;
      } else if (notExact && row[0] <= value) {
        found = row[col - 1];
        return false;
      }
    });
    return found || null;
  }

};

module.exports = formulas;