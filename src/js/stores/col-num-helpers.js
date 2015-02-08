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

module.exports = {
  alpha: alpha,
  alphaArrFull: alphaArrFull,
  spaceAlphaArrFull: spaceAlphaArrFull
}
