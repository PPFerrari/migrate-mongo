
module.exports = {
  up(db) {
    // migration - settiamo tutti i valori diventati obbligatori
    db.collection('test').updateMany({
      $or: [
        {address: {$exists: false}},
        {color: {$exists: false}},
        {cost: {$exists: false}},
        {owner: {$exists: false}},
      ]}, {
      $set: {
        address: 'via carciano 9',
        color: 'red',
        cost: 20,
        owner: 'Accenture',
      },
    });
  },
};
