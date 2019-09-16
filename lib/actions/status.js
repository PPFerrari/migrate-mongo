const { find } = require("lodash");
const migrationsDir = require("../env/migrationsDir");
const configFile = require("../env/configFile");
const hasha = require('hasha');

module.exports = async db => {
  await migrationsDir.shouldExist();
  await configFile.shouldExist();
  const fileNames = await migrationsDir.getFileNames();
  const config = await configFile.read();
  const collectionName = config.changelogCollectionName;
  const collection = db.collection(collectionName);
  const changelog = await collection.find({}).toArray();
  let promises
  try {
    promises = fileNames.map(async fileName => {
      const itemInLog = find(changelog, { fileName });
      const appliedAt = itemInLog ? itemInLog.appliedAt.toJSON() : "PENDING";
      const hash = itemInLog ? await hasha.fromFile(config.migrationsDir + "/" + fileName, {algorithm: 'md5'}) : "";
      if ( typeof itemInLog !== 'undefined' ) {
        if ( hash !== itemInLog.hash ) {
          throw new Error(`${fileName}'s hash is changed! Exiting... `);
        }
      }
      return { fileName, appliedAt, hash };
    })
  } catch (err) {
      const error = new Error(
        `Could not get status: ${err.message}`
      );
      throw error;
  }

  const statusTableRows = await Promise.all(promises)
  return statusTableRows;
};
