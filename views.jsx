
// utility functions
var getAlphaHeader = function(num){
  var alpha = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return alpha[num];
}

var classSet = React.addons.classSet;



// React Views
/* views are slaves to the models and state, just like idiomatic backbone.
 * can still reason a view tree like backbone.
 * huge performance improvements due to the virtual DOM diffing.
 * can simplify code based on these improvements:
  > jsx components are resusable in other components (like angular directives)
  > any ui change is simply rerendered rather than dealing with jquery hacks.
  > this greatly simplifies ui updates.
  > simply change the model, or state, and then rerender.
  > helper functions to toggle classes based on state (or model), already exist.
  > helper functions to easily add inline css style objects already exist.
  > DOM updates are 5+ times faster than jquery/backboneViews
  > Can use backbone models and react views together
  > Path to reactive architecture could have an intermediary step:
    1. Replace backboneViews/jquery with react views, but continue to use backbone models
    2. Replace backbone models with RXJS observables
*/

var Cell = React.createClass({

  getInitialState: function(){
    return {
      editing: false,
      selected: false
    };
  },
  componentWillMount: function(){
    /* set css attributes with an object */
    this.cellStyle = {};
    appEvents.on('colorCell',function(color){
      if (this.state.selected)
        this.cellStyle.backgroundColor = color;
        this.forceUpdate();
    },this);

    appEvents.on('closeOtherEditModeCells',function(){
      this.closeEditMode();
    },this);

    appEvents.on('unSelectOtherCells',function(){
      this.unSelectCell();
    },this);
  },
  selectCell: function(){
    appEvents.trigger('unSelectOtherCells');
    this.setState({selected: true});
    this.forceUpdate();
  },
  unSelectCell: function(){
    this.setState({selected: false});
    this.setState({editing: false});
    this.forceUpdate();
  },
  enterEditMode: function(){
    this.setState({editing: true});
    appEvents.trigger('closeOtherEditModeCells');
    this.forceUpdate();
  },
  closeEditMode: function(){
    if (this.state.editing){
      this.setState({editing: false});
      this.forceUpdate();
    }
  },
  checkCell: function(e){
    if (e.key === 'Enter'){
      this.props.cellModel.set('value',e.target.value);
      this.closeEditMode();
    }
  },
  render: function(){
    var cellValue = this.props.cellModel.get('value');
    var cellEdit = <input autoFocus onKeyDown={this.checkCell} className={'cell-edit'} type='text' defaultValue={cellValue} />;
    var cellView = this.state.editing ? cellEdit : cellValue;
    
    /* set dom event handlers based on state */
    var cellClick;
    if (this.state.selected){
      cellClick = this.enterEditMode;
    } else {
      cellClick = this.selectCell;
    }

    /* a css class toggle object based on state */
    var classes = classSet({
      'selected-cell': this.state.selected,
      'cell-view': true
    });

    return (
      <td onClick={cellClick} className={classes} style={this.cellStyle}>
        {cellView}
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

var RibbonBar = React.createClass({

  addRow: function(e){
    this.props.rows.trigger('addRow');
  },
  addCol: function(e){
    this.props.rows.trigger('addCol');
  },
  colorCell: function(e){
    if (e.key === 'Enter'){
      appEvents.trigger('colorCell', e.target.value);
      e.target.value = "";
    }
  },
  render: function(){
    return (
      <div>
        <button onClick={this.addRow}> new row </button>
        <button onClick={this.addCol}> new col </button>
        <label> cell color </label>
        <input placeholder="ex: green" onKeyDown={this.colorCell} type="text" />
      </div>
    )
  }
});

var App = React.createClass({
  render: function(){
    return (
      <div>
        <RibbonBar rows={this.props.appModel.get('table')} />
        <Table rows={this.props.appModel.get('table')} />
      </div>
    )
  }
});

React.render(<App appModel={appModel} />, document.body);
