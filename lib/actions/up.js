const _ = require("lodash");
const pEachSeries = require("p-each-series");
const fnArgs = require("fn-args");
const { promisify } = require("util");
const status = require("./status");
const hasha = require('hasha');
const configFile = require("../env/configFile");
const migrationsDir = require("../env/migrationsDir");

module.exports = async dbObject => {
  const config = await configFile.read();

  console.log("Checking status of the changelog collection")
  const statusItems = await status(dbObject.db);

  // create session to execute transaction
  console.log("Creating db session")
  const session = dbObject.client.startSession();
  
  console.log("Starting db transaction")
  session.startTransaction();

  const opts = { session };
  const pendingItems = _.filter(statusItems, { appliedAt: "PENDING" });
  const migrated = [];
  
  const migrateItem = async item => {
    try {
      const migration = await migrationsDir.loadMigration(item.fileName);


      const args = fnArgs(migration.up);
      const up = args.length > 1 ? promisify(migration.up) : migration.up;

      console.log("Executing migration script => " + item.fileName)
      const dbUtils = { db: dbObject.db, options: opts}
      await up(dbUtils);
    } catch (err) {
        const error = new Error(`Could not migrate up ${item.fileName}: ${err.message}`);
        error.migrated = migrated;
        throw error;
    }
  }

  try {
    await pEachSeries(pendingItems, migrateItem);
    await session.commitTransaction();
    session.endSession();
  } catch (err) {
      const error = new Error(`Could not migrate up : ${err.message}`);
      await session.abortTransaction();
      session.endSession();
      throw error;
  }

  const populateChangelog = async item => {
    
    const collectionName = config.changelogCollectionName;
    const collection = dbObject.db.collection(collectionName);

    const { fileName } = item;
    const appliedAt = new Date();

    try {
      // calculate hash of the migration file
      const hash = await hasha.fromFile(config.migrationsDir + "/" + fileName, {algorithm: 'md5'})

      // add migration file's information inside the changelog collection 
      await collection.insertOne({ fileName, appliedAt, hash });
    } catch (err) {
        throw new Error(`Could not update changelog: ${err.message}`);
    }
    migrated.push(item.fileName);
  }
  
  await pEachSeries(pendingItems, populateChangelog);
  return migrated;
};
