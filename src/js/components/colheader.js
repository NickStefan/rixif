var React = require('react/dist/react-with-addons.js');
var AppActions = require('../actions/app-actions');
var colHelpers = require('../stores/col-num-helpers');

var MenuItem = require('./menuitem');
var ContextMenu = require('./contextmenu');

var COLHEADER = React.createClass({
  renderMenu: function(e){
    e.preventDefault();
    e.stopPropagation();
    this.setState({
      menuStyle: {
          position: 'absolute',
          backgroundColor: 'grey',
          zIndex: 10,
          top: e.clientY,
          left: e.clientX
        }
    });
    AppActions.renderMenu('COLHEADER' + this.props.realIndex);
  },

  componentWillReceiveProps: function(nextProps){
    if (nextProps.tableState.get('contextMenuOpen') === 'COLHEADER' + this.props.realIndex){
      this.setState({
        displayMenu: true
      });
    } else if (this.state && this.state.displayMenu && nextProps.tableState.get('contextMenuOpen') !== 'COLHEADER' + this.props.realIndex){
      this.setState({
        displayMenu: false
      });
    }
  },

  render: function(){
    var menu = null;
    var displayIndex = this.props.realIndex + 1;
    if (this.state && this.state.displayMenu){
      menu = (
          <ContextMenu style={this.state.menuStyle}>
            <MenuItem label={"Insert Col Before"} command={"addCol"} commandArgs={[this.props.realIndex]} />
            <MenuItem label={"Insert Col After"} command={"addCol"} commandArgs={[this.props.readlIndex + 1]} />
            <MenuItem label={"Remove Col"} command={"rmCol"} commandArgs={[this.props.realIndex]} />
          </ContextMenu>
      );
    }
    var colName = colHelpers.getAlphaHeader(this.props.colIndex);
    return (
      <th className={"r-spreadsheet"} onContextMenu={this.renderMenu }>
        {colName}
        {menu}
      </th>
    );
  }
});

module.exports = COLHEADER;