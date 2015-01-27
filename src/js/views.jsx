
// utility functions
var getAlphaHeader = function(num){
  if (num > 25) return null;
  var alpha = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return alpha[num];
}

var classSet = React.addons.classSet;


// React Views
/* views are slaves to the models and state, just like idiomatic backbone.
 * can still reason a view tree like backbone.
 * huge performance improvements due to the virtual DOM diffing.
 * can simplify code based on these improvements:
  > simple, composition based, mixins for viewClasses.
  > mixins dont need to store and apply overwritten methods of a defined class
    can define multiple lifecycle methods in multiple mixins and all will run
    (both will be called if a mixin and class definition have same method name)
    (exceptions:
      cant double define render method
      cant set same state name in getInitialState
      cant define same _custom_ methods amongst multiple mixins
    )
  > mixins can include other mixins
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
    /* track cell position */
    this.setState({position:{
      col: this.props.colIndex,
      row: this.props.rowIndex
    }});

    /* set css attributes with an object */
    this.cellStyle = {};
    appEvents.on('colorCell',function(color){
      if (this.state.selected)
        this.cellStyle.backgroundColor = color;
        this.forceUpdate();
    },this);

    /* UI states */
    appEvents.on('enterEditMode',function(){
      if (this.state.selected){
        this.enterEditMode();
      }
    },this);

    appEvents.on('moveSelected',function(position){
      if (position.row === this.state.position.row && position.col === this.state.position.col){
        this.selectCell();
      }
    },this);

    appEvents.on('closeOtherEditModeCells',function(){
      this.closeEditMode();
    },this);

    appEvents.on('unSelectOtherCells',function(){
      if (this.state.selected){
        this.unSelectCell();
      }
    },this);
  },
  selectCell: function(){
    var position = _.extend({},this.state.position);
    appEvents.trigger('unSelectOtherCells');
    appEvents.trigger('setSelectedPosition',position);
    appEvents.trigger('reFocus');
    this.setState({selected: true});
  },
  unSelectCell: function(){
    this.setState({selected: false});
    this.setState({editing: false});
  },
  enterEditMode: function(){
    if (!this.state.editing){
      this.setState({editing: true});
      appEvents.trigger('closeOtherEditModeCells');
      appEvents.trigger('cellInEditMode',true);    
    }
  },
  closeEditMode: function(){
    if (this.state.editing){
      this.setState({editing: false});
      appEvents.trigger('reFocus');
      appEvents.trigger('cellInEditMode',false);
    }
  },
  checkCell: function(e){
    if (e.key === 'Enter'){
      this.props.cellModel.set('value',e.target.value);
      // inside of here should set the formula?
      // model could then trigger events on listening cells?
      // collections could do filter events for those cells values
      // build up a ????
      this.closeEditMode();
    } else if (e.key === 'Escape'){
      this.closeEditMode();
    }
  },
  shouldComponentUpdate: function(nextProps,nextState){
    if (this.state.selected !== nextState.selected ||
        this.state.editing !== nextState.editing) {
      return true;
    }
    return false;
  },
   render: function(){
    var cellValue = this.props.cellModel.get('value');
    var cellEdit = <input autoFocus onKeyDown={this.checkCell} className={'cell-edit'} type='text' defaultValue={cellValue} />;
    var cellView = this.state.editing ? cellEdit : cellValue;
    
    /* set dom event handlers based on state */
    var cellClick, cellMenu;
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
    var self = this;
    var cells =  this.props.row.get('cells').map(function(cellData,index){
      return (
        <Cell key={cellData.cid} colIndex={index} rowIndex={self.props.index} cellModel={cellData} />
      )
    });
    return (
      <tr>
        <th className={"r-spreadsheet"}>{this.props.index + 1 }</th> {cells}
      </tr>
    )
  }
});

var Table = React.createClass({
  getInitialState: function(){
    return {
      cellInEditMode: false
    };
  },
  componentWillMount: function(){
    this.props.rows.on('addRow addCol', function(){
      this.forceUpdate();
    }.bind(this));

    appEvents.on('setSelectedPosition',function(position){
      this.setState({position: position});
    },this);

    appEvents.on('reFocus',function(){
      this.getDOMNode().focus();
    },this);

    appEvents.on('cellInEditMode',function(bool){
      this.setState({cellInEditMode: bool});
    },this);
  },
  navigateDebounced: function(e){
    var fn = _.debounce(this.navigate,250,true);
    fn.call(this,e);
  },
  navigate: function(e){
    var position = _.extend({},this.state.position);
    if (e.key === 'ArrowLeft' && !this.state.cellInEditMode){
      e.stopPropagation();
      e.preventDefault();
      position.col -= 1;
      appEvents.trigger('moveSelected',position);
    } else if (e.key === 'ArrowRight' && !this.state.cellInEditMode){
      e.stopPropagation();
      e.preventDefault();
      position.col += 1;
      appEvents.trigger('moveSelected',position);
    } else if (e.key === 'ArrowUp' && !this.state.cellInEditMode){
      e.stopPropagation();
      e.preventDefault();
      position.row -= 1;
      appEvents.trigger('moveSelected',position);
    } else if (e.key === 'ArrowDown' && !this.state.cellInEditMode){
      e.stopPropagation();
      e.preventDefault();
      position.row += 1;
      appEvents.trigger('moveSelected',position);
    } else if (e.key === 'Enter' && !this.state.cellInEditMode){
      e.stopPropagation();
      e.preventDefault();
      appEvents.trigger('enterEditMode');
    }
  },
  render: function(){
    var rows = this.props.rows.map(function(rowData,rowIndex){
      return (
        <Row key={rowData.cid} row={rowData} index={rowIndex} />
      )
    });

    var rowsHeaders = this.props.rows.at(0).get('cells').slice(0);
    rowsHeaders.push("")
    rowsHeaders = rowsHeaders.map(function(row,colIndex){
      return <th className={"r-spreadsheet"}> {getAlphaHeader(colIndex)} </th>
    });

    return (
      <table tabIndex={-1} onKeyDown={this.navigateDebounced} className={"r-spreadsheet"}>
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
    appEvents.trigger('reFocus');
  },
  addCol: function(e){
    this.props.rows.trigger('addCol');
    appEvents.trigger('reFocus');
  },
  colorCell: function(e){
    if (e.key === 'Enter'){
      appEvents.trigger('colorCell', e.target.value);
      e.target.value = "";
      appEvents.trigger('reFocus');
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
