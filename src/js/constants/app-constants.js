module.exports = {
  ActionTypes: {

    undo: 'undo',
    redo: 'redo',

    addCol: 'addCol',
    rmCol: 'rmCol',

    addRow: 'addRow',
    rmRow: 'rmRow',

    selected: 'selected',
    editing: 'editing'
  },

  notForCommandManager: {
    selected: 'selected',
    editing: 'editing'
  },

  reverse: {
    
    addCol: 'rmCol',
    rmCol: 'addCol',

    addRow: 'rmRow',
    rmRow: 'addRow'
  }
};