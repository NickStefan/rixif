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

    
    changeCell: 'changeCell',
    unchangeCell: 'unchangeCell'
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

    changeCell: 'unchangeCell',
    unchangeCell: 'changeCell'
  }
};