var React = require('react/dist/react-with-addons.js');
var AppActions = require('../actions/app-actions');

var ROWHEADER = React.createClass({
  // renderMenu: function(e){
  //   e.preventDefault();
  //   e.stopPropagation();

  //   this.setState({
  //     displayMenu: true,
  //     menuStyle: {
  //       position: absolute,
  //       zIndex: 10,
  //       top: e.clientX,
  //       left: e.clientY
  //     }
  //   });
  // },

  render: function(){
    var menu = null;
    var displayIndex = this.props.realIndex + 1;
    // if (this.state.displayMenu){
    //   menu = (
    //       <Menu style={this.state.menuStyle}}>
    //       </Menu>
    //   );
    // }
    return (
      <th className={"r-spreadsheet"}>
        { displayIndex }
        { menu }
      </th>
    );
  }
});

module.exports = ROWHEADER;