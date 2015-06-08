var React = require('react/dist/react-with-addons.js');
var AppActions = require('../actions/app-actions');

var MenuItem = require('./menuitem');
var ContextMenu = require('./contextmenu');

var ROWHEADER = React.createClass({
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
    AppActions.renderMenu('ROWHEADER' + this.props.realIndex);
  },

  componentWillReceiveProps: function(nextProps){
    if (nextProps.tableState.get('contextMenuOpen') === 'ROWHEADER' + this.props.realIndex){
      this.setState({
        displayMenu: true
      });
    } else if (this.state && this.state.displayMenu && nextProps.tableState.get('contextMenuOpen') !== 'ROWHEADER' + this.props.realIndex){
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
            <MenuItem label={"Insert Row Before"} command={"addRow"} commandArgs={[this.props.realIndex]} />
            <MenuItem label={"Insert Row After"} command={"addRow"} commandArgs={[this.props.readlIndex + 1]} />
            <MenuItem label={"Remove Row"} command={"rmRow"} commandArgs={[this.props.realIndex]} />
          </ContextMenu>
      );
    }
    return (
      <th className={"r-spreadsheet"} onContextMenu={this.renderMenu }>
        { displayIndex }
        { menu }
      </th>
    );
  }
});

module.exports = ROWHEADER;