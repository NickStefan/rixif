
var CommandManager = function(){
  // class container
  var obj = {};
  // track where in our history we currently are
  obj.state = -1;
  // stack of chronological commands
  obj.history = [];
  // add a command
  obj.add = function(redo,undo){
    var args = Array.prototype.slice.call(arguments,2);
    obj.history.push({
      redo: redo,
      undo: undo,
      args: args
    });
    obj.state += obj.history - 1;
  }

  // move towards bottom of stack
  obj.undo = function(storeModel){
    if (obj.state >= 0){
      var cmd = obj.history[obj.state].undo;
      var args = [storeModel].concat(obj.history[obj.state].args);
      obj.state -= 1;
      //console.table(obj.history);
      console.log(obj.state)
      return cmd.apply(null,args);
    }
    console.table(obj.history);
    console.log(obj.state)
    return storeModel;
  }
  // move towards top of stack
  obj.redo = function(storeModel){
    if (obj.state < obj.history.length - 1){
      obj.state = obj.state >= 0 ? obj.state : 0;
      var cmd = obj.history[obj.state].redo;
      var args = [storeModel].concat(obj.history[obj.state].args);
      obj.state += 1;
      //console.table(obj.history);
      console.log(obj.state)
      return cmd.apply(null,args);
    }
    console.table(obj.history);
    console.log(obj.state)
    return storeModel;
  }
  return obj;
}

module.exports = CommandManager;
