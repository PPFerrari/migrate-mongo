
module.exports = async db => {
  let collections = db.collections();

  for (var i = 0, len = collections.length; i < len; i++) {
    db.dropCollection(collections[i])
  }
};
