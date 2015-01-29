var React = require('react/dist/react-with-addons.js');

var CELL = require('./cell');

var ROW = React.createClass({
  render: function(){
    var self = this;
    var cells =  this.props.row.map(function(cellData,index){
      return (
        <CELL key={index} colIndex={index} rowIndex={self.props.index} cellData={cellData} />
      )
    });
    return (
      <tr>
        <th className={"r-spreadsheet"}>{this.props.index + 1 }</th> {cells}
      </tr>
    )
  }
});

module.exports = ROW;
