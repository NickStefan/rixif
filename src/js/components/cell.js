var React = require('react/dist/react-with-addons.js');
var classSet = React.addons.classSet;
var AppActions = require('../actions/app-actions');

var CELL = React.createClass({
  handleClick: function(e) {
    if (!this.props.state.selected){
      AppActions.selected(this.props.rowIndex, this.props.colIndex);
    } else if (this.props.state.selected && !this.props.state.editing){
      AppActions.editing(this.props.rowIndex, this.props.colIndex);
    } else if (this.props.state.selected && this.props.state.editing){
      // do nothing
    }
  },
  checkCell: function(e){
    if (e.key === 'Enter'){
      e.stopPropagation();
      e.preventDefault();

      var newValue = e.target.value;
      var formula = newValue.length && newValue[0] === '=' ? true : false;
      var oldValue = formula ? this.props.cellData.formula : this.props.cellData.value;

      if (formula && newValue !== this.props.cellData.formula){
        AppActions.changeCell(this.props.rowIndex, this.props.colIndex, newValue, oldValue);

      } else if (!formula && newValue !== this.props.cellData.value){
        AppActions.changeCell(this.props.rowIndex, this.props.colIndex, newValue, oldValue);
        
      } else {
        AppActions.editing();
      }
    } else if (e.key === 'Escape'){
      e.stopPropagation();
      e.preventDefault();
      AppActions.editing();
    }
  },
  render: function(){
    var cellValue = this.props.cellData.value;
    var cellEdit = <input autoFocus onKeyDown={this.checkCell} className={'cell-edit'} type='text' defaultValue={cellValue} />;
    var cellView = this.props.state.editing ? cellEdit : cellValue;

    /* a css class toggle object based on state */
    var classes = classSet({
      'selected-cell': this.props.state.selected,
      'cell-view': true
    });

    return (
      <td onClick={this.handleClick} className={classes}>
        {cellView}
      </td>
    )
  }
});

module.exports = CELL;