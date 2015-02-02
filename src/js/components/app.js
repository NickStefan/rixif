var React = require('react/dist/react-with-addons.js');
var AppStore = require('../stores/app-store');
var RIBBONBAR = require('./ribbonbar.js');
var TABLE = require('./table');

function getTableData(){
  return AppStore.getTable();
}

function getTableState(){
  return AppStore.getTableState();
}

var APP = React.createClass({
  getInitialState: function(){
    return {
      table: getTableData(),
      tableState: getTableState()
    };
  },
  componentWillMount: function(){
    AppStore.addChangeListener(this._onChange);
  },
  _onChange: function(){
    this.setState({
      table: getTableData(),
      tableState: getTableState()
    });
  },
  render: function(){
    return (
      <div>
        <RIBBONBAR table={this.state.table} tableState={this.state.tableState} />
        <TABLE table={this.state.table} tableState={this.state.tableState} />
      </div>
    )
  }
});

module.exports = APP;
