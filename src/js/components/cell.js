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
  changeCell: function(e,direction){
    e.preventDefault();
    e.stopPropagation();
    var newValue = e.target.value;
    var formula = newValue.length && newValue[0] === '=' ? true : false;
    var oldValue = formula ? this.props.cellData.formula : this.props.cellData.get('value');

    if (formula && newValue !== this.props.cellData.formula){
      AppActions.changeCell(this.props.rowIndex, this.props.colIndex, newValue, oldValue);

    } else if (!formula && newValue !== this.props.cellData.value){
      AppActions.changeCell(this.props.rowIndex, this.props.colIndex, newValue, oldValue);
      
    } else {
      AppActions.editing();
    }
    AppActions.move(direction)
  },
  checkCell: function(e){
    if (e.key === 'Tab' && e.shiftKey){
      this.changeCell(e,'left');
    } else if (e.key === 'Tab'){
      this.changeCell(e,'right');
    } else if (e.key === 'Enter' && e.shiftKey){
      this.changeCell(e,'up');
    } else if (e.key === 'Enter'){
      this.changeCell(e,'down');
    } else if (e.key == 'Escape'){
      e.stopPropagation();
      e.preventDefault();
      AppActions.editing();
    }
  },
  render: function(){
    var cellValue = this.props.cellData.get('value');
    var cellFormula = this.props.cellData.get('formula');
    var cellEditValue = cellFormula ? cellFormula : cellValue;
    var cellEdit = <input autoFocus onKeyDown={this.checkCell} className={'cell-edit'} type='text' defaultValue={cellEditValue} />;
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
  },
  shouldComponentUpdate: function(nextProps,nextState){
    if (this.props.state.selected === nextProps.state.selected &&
        this.props.state.editing === nextProps.state.editing  &&
        this.props.cellData === nextProps.cellData) {
      return false;
    }
    return true;
  }
});

module.exports = CELL;