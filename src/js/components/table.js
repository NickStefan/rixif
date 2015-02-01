var React = require('react/dist/react-with-addons.js');

var AppStore = require('../stores/app-store');
var ROW = require('./row');

var getAlphaHeader = function(num){
  if (num > 25) return null;
  var alpha = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return alpha[num];
}

function getRowsData(){
  return AppStore.getRows();
}

function getRowsState(){
  return AppStore.getRowsState();
}

var TABLE = React.createClass({
  getInitialState: function(){
    return {
      rows: getRowsData(),
      rowsState: getRowsState()
    };
  },
  componentWillMount: function(){
    AppStore.addChangeListener(this._onChange);
  },
  _onChange: function(){
    this.setState({
      rows: getRowsData(),
      rowsState: getRowsState()
    });
  },
  render: function(){
    var self = this;
    var rows = this.state.rows.map(function(rowData,i){
      return (
        <ROW key={i} row={rowData} state={self.state.rowsState[i]} index={i} />
      )
    });

    var rowsHeaders = this.state.rows[0].cells
      .slice()
      .map(function(row,colIndex){
        return <th key={colIndex} className={"r-spreadsheet"}> {getAlphaHeader(colIndex)} </th>
    });

    return (
      <table className={"r-spreadsheet"}>
        <thead>
          <tr>

            {rowsHeaders}

          </tr>
        </thead>
        <tbody>

          {rows}

        </tbody>
      </table>
    )
  }
});

module.exports = TABLE;
