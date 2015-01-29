var React = require('react/dist/react-with-addons.js');

var CELL = require('./cell');

var ROW = React.createClass({
  render: function(){
    var self = this;
    var cells =  this.props.row.map(function(cellData,index){
      if (index === 0){
        return (<th key={index} className={"r-spreadsheet"}>{self.props.index + 1 }</th>);
      } else {
        return (<CELL key={index} colIndex={index} rowIndex={self.props.index} cellData={cellData} />); 
      }
    });
    return (
      <tr>
        {cells}
      </tr>
    )
  }
});

module.exports = ROW;
