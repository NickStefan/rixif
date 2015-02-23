var React = require('react/dist/react-with-addons.js');

var AppActions = require('../actions/app-actions');

var RIBBONBAR = React.createClass({
  addCol: function(e){
    e.stopPropagation();
    e.preventDefault();
    var input = document.querySelector('.addCol');
    var inputVal = !isNaN(parseInt(input.value)) ? parseInt(input.value)+1 : undefined;
    AppActions.addCol(inputVal);
  },
  rmCol: function(e){
    e.stopPropagation();
    e.preventDefault();
    var input = document.querySelector('.rmCol');
    var inputVal = !isNaN(parseInt(input.value)) ? parseInt(input.value)+1 : undefined;
    AppActions.rmCol(inputVal);
  },
  addRow: function(e){
    e.stopPropagation();
    e.preventDefault();
    var input = document.querySelector('.addRow');
    var inputVal = !isNaN(parseInt(input.value)) ? parseInt(input.value)+1 : undefined;
    AppActions.addRow(inputVal);
  },
  rmRow: function(e){
    e.stopPropagation();
    e.preventDefault();
    var input = document.querySelector('.rmRow');
    var inputVal = !isNaN(parseInt(input.value)) ? parseInt(input.value)+1 : undefined;
    AppActions.rmRow(inputVal);
  },
  undo: function(e){
    e.stopPropagation();
    e.preventDefault();
    AppActions.undo();
  },
  redo: function(e){
    e.stopPropagation();
    e.preventDefault();
    AppActions.redo();
  },

  colorCell: function(e){
    // if (e.key === 'Enter'){
    //   appEvents.trigger('colorCell', e.target.value);
    //   e.target.value = "";
    //   appEvents.trigger('reFocus');
    // }
  },
  render: function(){
    /*
    <label> cell color </label>
    <input placeholder="ex: green" onKeyDown={this.colorCell} type="text" />
    */
    return (
      <div>
        <button onClick={this.addCol}> new col </button>
        <input className={'addCol'} type='text' placeholder='col index'/>
        <button onClick={this.rmCol}> remove col </button>
        <input className={'rmCol'} type='text' placeholder='col index'/>
        <button onClick={this.addRow}> new row </button>
        <input className={'addRow'} type='text' placeholder='row index'/>
        <button onClick={this.rmRow}> remove row </button>
        <input className={'rmRow'} type='text' placeholder='row index'/>
        <button onClick={this.undo}> undo </button>
        <button onClick={this.redo}> redo </button>
      </div>
    )
  }
});

module.exports = RIBBONBAR;
