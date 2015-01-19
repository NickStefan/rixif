
var CellModel = Backbone.Model.extend({
  defaults: {
    value: 'bob'
  }
});

var RowModel = Backbone.Model.extend({});

var AppModel = Backbone.Model.extend({});

var TableCollection = Backbone.Collection.extend({
  initialize: function(){
    this.on('addRow',this.addRow);
    this.on('addCol',this.addCol);
  },
  addRow: function(){
    var row = new RowModel({
      cells: new RowCollection(),
    });
    var rowLength = this.at(0).get('cells').length;
    _.times(rowLength,function(){
      row.get('cells').add(new CellModel());
    });
    this.add(row);
  },
  addCol: function(){
    this.forEach(function(row){
      row.get('cells').add(new CellModel());
    });
  },
});

var RowCollection = Backbone.Collection.extend({});

var appEvents = _.extend({},Backbone.Events);

var tablecollection = new TableCollection();
_.times(300,function(){
  var row = new RowModel({
    cells: new RowCollection()
  });
  _.times(10,function(){
    row.get('cells').add(new CellModel());
  });
  tablecollection.add(row);
});

var appModel = new AppModel({
  table: tablecollection
});
