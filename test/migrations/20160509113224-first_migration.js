
module.exports = {
  up(db) {
    db.collection('test').insertOne({
      'name': 'piero',
      'surname': 'ferrari',
    });


    
    
    db.collection('test').insertOne({
      'owner': 'Accenture',
      'color': 'red',
    });

    db.collection('test').insertOne({
      'address': 'via carciano 9',
      'cost': 10000000,
    });
  },
};
