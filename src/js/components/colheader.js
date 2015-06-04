var React = require('react/dist/react-with-addons.js');
var AppActions = require('../actions/app-actions');
var colHelpers = require('../stores/col-num-helpers');

var COLHEADER = React.createClass({
  render: function(){
    var colName = colHelpers.getAlphaHeader(this.props.colIndex);
    return <th className={"r-spreadsheet"}>{colName}</th>;
  }
});

module.exports = COLHEADER;