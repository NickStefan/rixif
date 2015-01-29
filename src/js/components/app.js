var React = require('react/dist/react-with-addons.js');

var RIBBONBAR = require('./ribbonbar.js');
var TABLE = require('./table');

var APP = React.createClass({
  render: function(){
    return (
      <div>
        <RIBBONBAR />
        <TABLE />
      </div>
    )
  }
});

module.exports = APP;
