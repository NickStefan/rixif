
var CommandManager = function(){

  // stack of chronological commands
  this.history = [];
  // stack of available undos
  this.undos = [];
  // stack of available redos
  this.redos = [];

  // add a command
  this.add = function(redo,undo){
    var args = Array.prototype.slice.call(arguments,2);
    var cmd = {redo: redo, undo: undo, args: args };
    this.history.push(cmd);
    this.undos.push(cmd);
    // if we add to our undos, we have to reset our available redos
    if (this.undos.length) this.redos = [];
    if (this.undos.length > 100) this.undos.shift();
  }

  this.undo = function(storeModel){
    if (this.undos.length){
      var cmd = this.undos.pop();
      var args = [storeModel].concat(cmd.args);
      this.redos.push(cmd);
      // invoking an undo command, adds a new command to the history stack.
      // this new command is a 'forward' movement in context of adding to history stack,
      // thus we store this cmd's 'undo' function as if it were a redo method.
      // if we started from the bottom of the history stack,
      // we would invoke all of the redo methods to go forward in time.
      this.history.push({redo: cmd.undo, undo: cmd.redo, args: cmd.args });
      return cmd.undo.apply(null,args);
    }
    return storeModel;
  }
    
  this.redo = function(storeModel){
    if (this.redos.length){
      var cmd = this.redos.pop();
      var args = [storeModel].concat(cmd.args);
      this.undos.push(cmd);
      this.history.push(cmd);
      return cmd.redo.apply(null,args);
    }
    return storeModel;
  }

}

module.exports = CommandManager;
