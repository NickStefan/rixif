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

    // this has to live here because Delete is a keyDown event rather than keyPress
    } else if (e.key === 'Delete'){
      e.preventDefault();
      e.stopPropagation();
      // clear cell without entering edit mode
      var lastSelected = this.props.tableState.get('lastSelected');
      var value = this.props.table.getIn(['rows',lastSelected.get('row'),'cells',lastSelected.get('col'),'value'], null);
      var formula = this.props.table.getIn(['rows',lastSelected.get('row'),'cells',lastSelected.get('col'),'formula'], null);
      var newValue = "";
      var oldValue = formula ? formula : value;
      AppActions.changeCell(lastSelected.get('row'), lastSelected.get('col'), newValue, oldValue);
    }
  },

  edit: function(e){
    if (this.props.tableState.get('cellInEditMode')){
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    AppActions.enterEditMode(e.key);
  },

  componentDidMount: function(){
    window.addEventListener('keydown', this.preventBrowserBackspace );
  },

  preventBrowserBackspace: function(e){
    // this swallows backspace keys on any non-input element.
    // prevent browser's backspace from popping browser history stack
    var regex = /INPUT|SELECT|TEXTAREA/i;
    if( e.which == 8 ){ // 8 == backspace
      if(!regex.test(e.target.tagName) || e.target.disabled || e.target.readOnly ){
          e.preventDefault();
          e.stopPropagation();
          AppActions.enterEditMode("",'clearValue');
      }
    }
  },

  componentDidUpdate: function(){
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
        <ROW key={i} row={rowData} 
         state={ self.props.tableState.get('rows').get(i) }
         index={i} />
      )
    });
      
    var rowsHeaders = this.props.table.get('rows').first().get('cells')
      .toArray()
      // mutable array of immutables
      .concat(null)
      .slice()
      .map(function(row,colIndex){
        return (
          <th key={colIndex} 
           className={"r-spreadsheet"}>{getAlphaHeader(colIndex)}</th>
        )
    });

    return (
      <table tabIndex={-1} onKeyPress={this.edit}
       onKeyDown={this.navigate} className={"r-spreadsheet"}>
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
  },

  componentWillUnmount: function(){
    window.removeEventListener('keydown',this.preventBrowserBackspace);
  },

  shouldComponentUpdate: function(nextProps,nextState){
    if (this.props.tableState === nextProps.tableState &&
        this.props.table === nextProps.table) {
      return false;
    }
    return true;
  }
});

module.exports = TABLE;
