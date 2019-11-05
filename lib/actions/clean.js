const pEachSeries = require("p-each-series");
module.exports = async db => {
  let collections = []

  collections = await db.listCollections().toArray(); 
  const dropCollection = async collection => {
    console.log("Executing DROP of " + collection.name)
    await db.dropCollection(collection.name)
    console.log(collection.name + " dropped")
  }

  await pEachSeries(collections, dropCollection);
  return collections;
}
