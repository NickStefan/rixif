var React = require('react/dist/react-with-addons.js');

var CELL = require('./cell');

var ROW = React.createClass({
  render: function(){
    var self = this;
    var cells =  [null].concat(this.props.row.cells).map(function(cellData,i){
      if (i === 0){
        return (<th className={"r-spreadsheet"} key={i}>{self.props.index + 1 }</th>);
      } else {
        return (<CELL cellData={cellData} state={self.props.state.cells[i-1]} colIndex={i-1} rowIndex={self.props.index} key={i} />); 
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
