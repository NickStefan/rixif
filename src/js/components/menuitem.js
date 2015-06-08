var React = require('react/dist/react-with-addons.js');
var AppActions = require('../actions/app-actions');

var MENUITEM = React.createClass({
  handleClick: function(){
    AppActions[this.props.command].apply(this, this.props.commandArgs);
  },
  render: function(){
    return (
      <li onClick={this.handleClick} >
        { this.props.label }
      </li>
    );
  }
});

module.exports = MENUITEM;