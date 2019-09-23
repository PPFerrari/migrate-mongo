
module.exports = {
  up(db) {
    // migration - settiamo tutti i valori diventati obbligatori
    db.collection('test').updateMany({
    });
  },
};
