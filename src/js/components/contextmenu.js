var React = require('react/dist/react-with-addons.js');
var AppActions = require('../actions/app-actions');

var CONTEXTMENU = React.createClass({
  render: function(){
    return (
      <ul style={this.props.style}>
        { this.props.children }
      </ul>
    );
  }
});

module.exports = CONTEXTMENU;