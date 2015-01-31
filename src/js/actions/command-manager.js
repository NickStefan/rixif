
var LocalCommandManager = function(AppDispatcher, io){

  // this.history = [];
  // stack of available undos
  this.undos = [];
  // stack of available redos
  this.redos = [];
  // available commands hash, set as a property after instantiation
  this.AppDispatcher = AppDispatcher;

  // optional socket.io connection to server:
  // * multi-user collaboration via commands passed to other clients
  // * document version control via replaying commands either direction
  this.io = io;

  // add a command
  this.add = function(redo,undo){
    var args = arguments[2];
    var cmd = {redo: redo, undo: undo, args: args };
    this.undos.push(cmd);
    // if we add to our undos, we have to reset our available redos
    this.redos = [];
    // keep local commands from getting too big
    if (this.undos.length > 100) this.undos.shift();

    // if (io) socket.emmit('cmd', cmd)
    // this.history.push(cmd)
    // console.table(this.history);
  }

  this.undo = function(){
    if (this.undos.length){
      var cmd = this.undos.pop();
      var args = cmd.args;
      this.redos.push(cmd);
      this.AppDispatcher[ cmd.undo ]({
        type: cmd.undo,
        args: args
      });
      
      // invoking an undo command, adds a new command to the history stack.
      // this new command is a 'forward' movement in context of adding to history stack,
      // thus we store this cmd's 'undo' function as if it were a redo method.
      // if we started from the bottom of the history stack,
      // we would invoke all of the redo methods to go forward in time.
      
      // var chronoTimeCmd = {redo: cmd.undo, undo: cmd.redo, args: cmd.args };
      // // if (io) socket.emmit('cmd', chronoTimeCmd);
      // this.history.push(chronoTimeCmd);
      // console.table(this.history);
    }
  }
    
  this.redo = function(){
    if (this.redos.length){
      var cmd = this.redos.pop();
      var args = cmd.args;
      this.undos.push(cmd);
      this.AppDispatcher[ cmd.redo ]({
        type: cmd.redo,
        args: args
      });
      
      // if (io) socket.emmit('cmd', cmd);
      // this.history.push(cmd)
      // console.table(this.history);
    }
  }

}

module.exports = LocalCommandManager;
