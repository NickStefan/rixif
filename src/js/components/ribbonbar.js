var React = require('react/dist/react-with-addons.js');

var AppActions = require('../actions/app-actions');

var RIBBONBAR = React.createClass({
  addCol: function(e){
    AppActions.addCol();
  },
  rmCol: function(e){
    AppActions.rmCol();
  },
  addRow: function(e){
    AppActions.addRow();
  },
  rmRow: function(e){
    AppActions.rmRow();
  },
  undo: function(e){
    AppActions.undo();
  },
  redo: function(e){
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
        <button onClick={this.rmCol}> remove col </button>
        <button onClick={this.addRow}> new row </button>
        <button onClick={this.rmRow}> remove row </button>
        <button onClick={this.undo}> undo </button>
        <button onClick={this.redo}> redo </button>
      </div>
    )
  }
});

module.exports = RIBBONBAR;
