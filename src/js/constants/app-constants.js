module.exports = {
  ActionTypes: {

    undo: 'undo',
    redo: 'redo',

    addCol: 'addCol',
    rmCol: 'rmCol',

    addRow: 'addRow',
    rmRow: 'rmRow',

    selected: 'selected',
    editing: 'editing',
    enterEditMode: 'enterEditMode',

    move: 'move',
    changeCell: 'changeCell'
  },

  notForCommandManager: {
    selected: 'selected',
    editing: 'editing',
    enterEditMode: 'enterEditMode',
    move: 'move'
  },

  reverse: {
    
    addCol: 'rmCol',
    rmCol: 'addCol',

    addRow: 'rmRow',
    rmRow: 'addRow',

    changeCell: 'changeCell'
  }
};