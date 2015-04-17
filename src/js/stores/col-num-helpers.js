/////////////////////////////
// Header and Col Letter to Number Calculations 

var alpha = {};
var alphaArrFull = [];
var alphaArr = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split("");
var alphaArr2 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split("");

alphaArr.forEach(function(v1){
  alphaArr2.forEach(function(v2){
    var letter;
    if (v1 === " "){
      letter = v2;
    } else {
      letter = v1 + v2;
    }
    alphaArrFull.push(letter);
  });
});

var spaceAlphaArrFull = alphaArrFull.slice();
spaceAlphaArrFull.unshift(" ");

alphaArrFull.forEach(function(v,k){
  alpha[v] = k;
});

var alphaHashFull = alphaArrFull.reduce(function(hash,value,key){
  hash[value] = key;
  return hash;
},{});

var getAlphaHeader = function(num){
  if (num > 701) return null;
  return spaceAlphaArrFull[num];
}

var letterToNumber = function(letter){
  return alphaHashFull[letter];
}

var numberToLetter = function(num){
  if (num > 701) return ;
  return alphaArrFull[num];
}

module.exports = {
  alpha: alpha,
  alphaArrFull: alphaArrFull,
  spaceAlphaArrFull: spaceAlphaArrFull,
  getAlphaHeader: getAlphaHeader,
  letterToNumber: letterToNumber,
  numberToLetter: numberToLetter
}
