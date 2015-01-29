var React = require('react/dist/react-with-addons.js');

var AppStore = require('../stores/app-store');
var ROW = require('./row');

var getAlphaHeader = function(num){
  if (num > 25) return null;
  var alpha = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return alpha[num];
}

function getTableData(){
  return AppStore.getRows();
}

var TABLE = React.createClass({
  getInitialState: function(){
    return {
      cellInEditMode: false,
      rows: getTableData()
    };
  },
  componentWillMount: function(){
    AppStore.addChangeListener(this._onChange);
  },
  _onChange: function(){
    this.setState({rows: getTableData() });
  },
  render: function(){
    var rows = this.state.rows.map(function(rowData,rowIndex){
      return (
        <ROW key={rowIndex} row={rowData} index={rowIndex} />
      )
    });

    var rowsHeaders = this.state.rows[0]
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
