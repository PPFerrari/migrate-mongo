const { find } = require("lodash");
const migrationsDir = require("../env/migrationsDir");
const configFile = require("../env/configFile");
const hasha = require('hasha');

module.exports = async db => {
  await migrationsDir.shouldExist();
  await configFile.shouldExist();

  console.log("Get filenames")
  const fileNames = await migrationsDir.getFileNames();

  console.log("Read configuration file")
  const config = await configFile.read();
  const collectionName = config.changelogCollectionName;
  const collection = db.collection(collectionName);
  const changelog = await collection.find({}).toArray();
  let promises
  
  // cycle through all the files inside the migration dir
  // check if the hash has changed since it was
  // applied to the database
  console.log("Check files...")
  try {
    promises = fileNames.map(async fileName => {
      const itemInLog = find(changelog, { fileName });
      const appliedAt = itemInLog ? itemInLog.appliedAt.toJSON() : "PENDING";
      const hash = itemInLog ? await hasha.fromFile(config.migrationsDir + "/" + fileName, {algorithm: 'md5'}) : "";
      if ( itemInLog ) {
        if ( hash !== itemInLog.hash ) {
          throw new Error("Hash calculated is different from the one in the changelog collection! Exit");
        }
      }
      return { fileName, appliedAt, hash };
    })
    const statusTableRows = await Promise.all(promises)
    return statusTableRows; 
  } catch (err) {
      throw new Error("Not able to get status: " + err.message)
  }

  

};
