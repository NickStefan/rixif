var React = require('react/dist/react-with-addons.min.js');
var classSet = React.addons.classSet;

var CELL = React.createClass({
  getInitialState: function(){
    return {
      editing: false,
      selected: false
    };
  },
  render: function(){
    var cellValue = this.props.cellData.value;
    //var cellEdit = <input autoFocus onKeyDown={this.checkCell} className={'cell-edit'} type='text' defaultValue={cellValue} />;
    var cellView = this.state.editing ? cellEdit : cellValue;
    
    /* set dom event handlers based on state */
    // var cellClick, cellMenu;
    // if (this.state.selected){
    //   cellClick = this.enterEditMode;
    // } else {
    //   cellClick = this.selectCell;
    // }

    /* a css class toggle object based on state */
    var classes = classSet({
      'selected-cell': this.state.selected,
      'cell-view': true
    });

    return (
      <td className={classes}>
        {cellView}
      </td>
    )
  }
});

module.exports = CELL;