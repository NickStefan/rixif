/*** @jsx React.DOM */

var Ribbon = React.createClass({

  addRow: function(e){
    this.props.rows.trigger('addRow');
  },
  addCol: function(e){
    this.props.rows.trigger('addCol');
  },
  render: function(){
    return (
      <div>
        <button onClick={this.addRow}> new row </button>
        <button onClick={this.addCol}> new col </button>
      </div>
    )
  }
});

var getAlphaHeader = function(num){

  var alpha = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  return alpha[num];
}

var Cell = React.createClass({
  render: function(){
    return (
      <td>
        { this.props.cellModel.get('value') }
      </td>
    )
  }
});

var Row = React.createClass({
  render: function(){
    var cells =  this.props.row.get('cells').map(function(cellData,index){
      return <Cell key={cellData.cid} cellModel={cellData} />
    });
    return (
      <tr>
        <th>{this.props.index}</th> {cells}
      </tr>
    )
  }
});

var Table = React.createClass({

  componentWillMount: function(){
    this.props.rows.on('addRow addCol add remove change', function(){
      this.forceUpdate()
    }.bind(this));
  },

  render: function(){

    var rows = this.props.rows.map(function(rowData,rowIndex){
      return (
        < Row key={rowData.cid} row={rowData} index={rowIndex} />
      )
    });

    var rowsHeaders = this.props.rows.at(0).get('cells').slice(0);
    rowsHeaders.push("")
    rowsHeaders = rowsHeaders.map(function(row,colIndex){
      return <th> {getAlphaHeader(colIndex)} </th>
    });

    return (
      <table>
        <thead>
          <tr>

            {rowsHeaders}

          </tr>
        </thead>
        <tbody>

          {rows}

        </tbody>
      </table>
    )
  }
});

var App = React.createClass({
  render: function(){
    return (
      <div>
        <Ribbon rows={this.props.appModel.get('table')} />
        <Table rows={this.props.appModel.get('table')} />
      </div>
    )
  }
});

React.render(<App appModel={appModel} />, document.body);