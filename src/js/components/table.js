var React = require('react/dist/react-with-addons.js');
var AppActions = require('../actions/app-actions');
var AppStore = require('../stores/app-store');
var ROW = require('./row');

var getAlphaHeader = function(num){
  if (num > 25) return null;
  var alpha = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return alpha[num];
}

function getTableData(){
  return AppStore.getTable();
}

function getTableState(){
  return AppStore.getTableState();
}

var TABLE = React.createClass({
  getInitialState: function(){
    return {
      table: getTableData(),
      tableState: getTableState()
    };
  },
  componentWillMount: function(){
    AppStore.addChangeListener(this._onChange);
  },
  _onChange: function(){
    this.setState({
      table: getTableData(),
      tableState: getTableState()
    });
  },
  navigate: function(e) {
    if (this.state.tableState.cellInEditMode) {
      return;
    }
    if (e.key === 'ArrowLeft'){
        e.stopPropagation();
        e.preventDefault();
        AppActions.move('left');
      } else if (e.key === 'ArrowRight'){
        e.stopPropagation();
        e.preventDefault();
        AppActions.move('right');
      } else if (e.key === 'ArrowUp'){
        e.stopPropagation();
        e.preventDefault();
        AppActions.move('up');
      } else if (e.key === 'ArrowDown'){
        e.stopPropagation();
        e.preventDefault();
        AppActions.move('down');
      } else if (e.key === 'Enter'){
        e.stopPropagation();
        e.preventDefault();
        AppActions.enterEditMode();
      }
  },
  render: function(){
    var self = this;
    var rows = this.state.table.rows.map(function(rowData,i){
      return (
        <ROW key={i} row={rowData} state={self.state.tableState.rows[i]} index={i} />
      )
    });

    var rowsHeaders = this.state.table.rows[0].cells
      .slice()
      .map(function(row,colIndex){
        return <th key={colIndex} className={"r-spreadsheet"}> {getAlphaHeader(colIndex)} </th>
    });

    return (
      <table tabIndex={-1} onKeyDown={this.navigate} className={"r-spreadsheet"}>
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
