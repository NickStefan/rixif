
var CellModel = Backbone.Model.extend({
  defaults: {
    value: 'bob'
  }
});

var RowModel = Backbone.Model.extend({
  initialize: function(options){
  }
});

var AppModel = Backbone.Model.extend({});

var TableCollection = Backbone.Collection.extend({
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

var tablecollection = new TableCollection();
_.times(300,function(){
  var row = new RowModel({
    cells: new RowCollection()
  });
  _.times(5,function(){
    row.get('cells').add(new CellModel());
  });
  tablecollection.add(row);
});

var appModel = new AppModel({
  table: tablecollection
});
