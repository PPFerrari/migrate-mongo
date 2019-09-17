const _ = require("lodash");
const pEachSeries = require("p-each-series");
const fnArgs = require("fn-args");
const { promisify } = require("util");
const status = require("./status");
const hasha = require('hasha');

const configFile = require("../env/configFile");
const migrationsDir = require("../env/migrationsDir");

module.exports = async db => {
  const statusItems = await status(db);

  const pendingItems = _.filter(statusItems, { appliedAt: "PENDING" });
  const migrated = [];
  const migrateItem = async item => {
    try {
      const migration = await migrationsDir.loadMigration(item.fileName);
      const args = fnArgs(migration.up);
      const up = args.length > 1 ? promisify(migration.up) : migration.up;
      await up(db);
    } catch (err) {
        const error = new Error(
          `Could not migrate up ${item.fileName}: ${err.message}`
        );
        error.migrated = migrated;
        throw error;
    }

    const config = await configFile.read();
    const collectionName = config.changelogCollectionName;
    const collection = db.collection(collectionName);

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
  };

  await pEachSeries(pendingItems, migrateItem);
  return migrated;
};
