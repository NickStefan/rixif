var React = require('react/dist/react-with-addons.js');
var classSet = React.addons.classSet;
var AppActions = require('../actions/app-actions');

var CELL = React.createClass({

  handleClick: function(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!this.props.state.get('selected')){
      AppActions.selected(this.props.rowIndex, this.props.colIndex);
    } else if (this.props.state.get('selected') && !this.props.state.get('editing')){
      AppActions.editing(this.props.rowIndex, this.props.colIndex);
    } else if (this.props.state.get('selected') && this.props.state.get('editing')){
      // do nothing
    }
  },

  changeCell: function(e,direction){
    e.preventDefault();
    e.stopPropagation();
    var newValue = e.target.value;
    var formula = newValue.length && newValue[0] === '=' ? true : false;
    var oldValue = formula ? this.props.cellData.get('formula') : this.props.cellData.get('value');

    if (formula && newValue !== this.props.cellData.get('formula')){
      console.time('formula');
      AppActions.changeCell(this.props.rowIndex, this.props.colIndex, newValue, oldValue);

    } else if (!formula && newValue !== this.props.cellData.value){
      console.time('value');
      AppActions.changeCell(this.props.rowIndex, this.props.colIndex, newValue, oldValue);
      
    } else {
      AppActions.editing();
    }
    AppActions.move(direction)
  },

  checkCell: function(e){
    if (e.key === 'Tab' && e.shiftKey){
      e.stopPropagation();
      e.preventDefault();
      this.changeCell(e,'left');
    } else if (e.key === 'Tab'){
      e.stopPropagation();
      e.preventDefault();
      this.changeCell(e,'right');
    } else if (e.key === 'Enter' && e.shiftKey){
      e.stopPropagation();
      e.preventDefault();
      this.changeCell(e,'up');
    } else if (e.key === 'Enter'){
      e.stopPropagation();
      e.preventDefault();
      this.changeCell(e,'down');
    } else if (e.key === 'Escape'){
      e.stopPropagation();
      e.preventDefault();
      AppActions.editing();
    }
    this.checkEditBoxWidth();
  },

  checkEditBoxWidth: function(givenWidth){
    var input = this.getDOMNode().firstChild;
    var firstWidth = givenWidth || this.state.width;
    if (input.scrollWidth >= input.offsetWidth - 2){
      input.style.width = (parseInt(input.offsetWidth) + firstWidth) + 'px';
    }
  },

  componentDidUpdate: function(){
    if (this.props.state.get('editing')){
      // cursor at the end of input, use the key they used to enter this mode
      var el = this.getDOMNode();
      var input = el.firstChild;
      input.value += this.props.state.get('lastKey') || "";
      input.selectionStart = input.selectionEnd = input.value.length;

      // ie they hit delete key to enter this edit mode
      if (this.props.state.get('displayAction') === 'clearValue'){
        input.value = "";
      }

      // position input box with a z-index
      var top = 'top:' + (parseInt(el.offsetTop) + parseInt(el.offsetHeight) + 2) + 'px;';
      var left = 'left:' + el.offsetLeft + 'px;';
      var height = 'height:' + el.offsetHeight + 'px;';
      var width = 'width:' + el.offsetWidth + 'px;';

      input.setAttribute('style',top+left+height+width);

      // note the original element
      this.setState({
        top: (parseInt(el.offsetTop) + parseInt(el.offsetHeight) + 2),
        left: parseInt(el.offsetLeft),
        height: parseInt(el.offsetHeight),
        width: parseInt(el.offsetWidth)
      });

      // fix edit box width
      this.checkEditBoxWidth(el.offsetWidth);
    }
  },

  render: function(){
    var cellValue = this.props.cellData.get('value');
    var cellFormula = this.props.cellData.get('formula');
    var cellEditValue = cellFormula ? cellFormula : cellValue;

    var cellEdit = (
      <input autoFocus onKeyDown={this.checkCell} className={'r-cell-edit'}
       type='text' defaultValue={cellEditValue} />
    );
    var cellEditView;
    if (this.props.state.get('editing')){
      cellEditView = cellEdit;
    } else {
      cellEditView = null;
    }

    var cellValueView = cellValue !== null && cellValue !== undefined ? cellValue.toString() : cellValue;

    /* a css class toggle object based on state */
    var classesTD = classSet({
      'r-selected-cell': this.props.state.get('selected'),
      'r-cell-view': true
    });
    var classesSpan = classSet({
      'r-invisible': this.props.state.get('editing')
    });
    console.timeEnd('value');
    console.timeEnd('formula')
    return (
      <td onClick={this.handleClick} className={classesTD}>
        {cellEditView}
        <span className={classesSpan}>{ cellValueView }</span>
      </td>
    )
  },

  shouldComponentUpdate: function(nextProps,nextState){
    if (this.props.state === nextProps.state &&
        this.props.cellData === nextProps.cellData) {
      return false;
    }
    return true;
  }
});

module.exports = CELL;