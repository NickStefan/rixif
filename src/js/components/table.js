var React = require('react/dist/react-with-addons.js');
var AppActions = require('../actions/app-actions');
var ROW = require('./row');

var colHelpers = require('../stores/col-num-helpers');
var spaceAlphaArrFull = colHelpers.spaceAlphaArrFull;

var getAlphaHeader = function(num){
  if (num > 701) return null;
  return spaceAlphaArrFull[num];
}

var TABLE = React.createClass({
  navigate: function(e) {
  if (this.props.tableState.get('cellInEditMode')){
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'Tab' && e.shiftKey){
      e.stopPropagation();
      e.preventDefault();
      AppActions.move('left');
    } else if (e.key === 'ArrowRight' || e.key === 'Tab'){
      e.stopPropagation();
      e.preventDefault();
      AppActions.move('right');
    } else if (e.key === 'ArrowUp' || e.key === 'Enter' && e.shiftKey){
      e.stopPropagation();
      e.preventDefault();
      AppActions.move('up');
    } else if (e.key === 'ArrowDown' || e.key === 'Enter'){
      e.stopPropagation();
      e.preventDefault();
      AppActions.move('down');
    } else if (e.key !== 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey){
      e.stopPropagation();
      e.preventDefault();
      AppActions.enterEditMode();
    }
  },
  componentDidUpdate: function() {
    if (!this.props.tableState.get('cellInEditMode')){
      var x = window.scrollX;
      var y = window.scrollY;
      this.getDOMNode().focus();
      window.scrollTo(x, y);
    }
  },
  render: function(){
    var self = this;
    var rows = this.props.table.get('rows')
      .toArray()
      // mutable array of immutables
      .map(function(rowData,i){
      return (
        <ROW key={i} row={rowData} state={ self.props.tableState.get('rows').get(i) } index={i} />
      )
    });
      
    var rowsHeaders = this.props.table.get('rows').first().get('cells')
      .toArray()
      // mutable array of immutables
      .concat(null)
      .slice()
      .map(function(row,colIndex){
        return <th key={colIndex} className={"r-spreadsheet"}>{getAlphaHeader(colIndex)}</th>
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
