/*** @jsx React.DOM */

var Ribbon = React.createClass({
  render: function(){
    return (
      <div>
        <button class="add-row">new row</button>
        <button class="add-col">new col</button>
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
      return <Cell cellModel={cellData} />
    });
    return (
      <tr>
        <th>{this.props.index}</th> {cells}
      </tr>
    )
  }
});

var Table = React.createClass({

  render: function(){

    var rows = this.props.rows.map(function(rowData,rowIndex){
      return (
        < Row row={rowData} index={rowIndex} />
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