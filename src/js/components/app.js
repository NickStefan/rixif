var React = require('react/dist/react-with-addons.min.js');

//var RIBBONBAR = require('./ribbonbar.js');
var TABLE = require('./table');

var APP = React.createClass({
  render: function(){
    return (
      <div>
        <TABLE />
      </div>
    )
  }
});

module.exports = APP;
