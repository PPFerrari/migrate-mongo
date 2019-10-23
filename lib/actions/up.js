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

  let session; 
  let opts = {};
  const pendingItems = _.filter(statusItems, { appliedAt: "PENDING" });
  const migrated = [];
  let scriptsArray = [];
  const transactionRegex = new RegExp("^(V[0-9])__(T[0-9]*)__([0-9]*)__(.*).js$")
  const normalRegex = new RegExp("^(V[0-9])__(.*).js$")
  
  
  
  for (var i = 0, len = pendingItems.length; i < len; i++) {
    
    let fileName = pendingItems[i].fileName
    // console.log(fileName)
    
    if ( fileName.match(transactionRegex) ) {
      let matchArray = fileName.match(transactionRegex);
      var index = _.findIndex(scriptsArray, { version: matchArray[2] } );

      // console.log(matchArray)
      if ( fileName.includes("__0__init.js") ) {
        scriptsArray.push(
          { 
            "version": matchArray[2],
            "withTransaction": true,
            "files": [ fileName ]
          }
        )
      } else {
          const tmp = _.filter(scriptsArray, { "version": matchArray[2]   } );
          const tmpFiles = tmp[0].files;
          tmpFiles.push(fileName)

          scriptsArray[index].files = tmpFiles
      }
    } else {
        let matchArray = fileName.match(normalRegex);
        if ( matchArray )
        scriptsArray.push(
          { 
            "version": matchArray[1],
            "withTransaction": false,
            "files": [ fileName ]
          }
        )
    }

    
  }

  console.log("Scripts to execute: ")
  console.log(scriptsArray)
  const migrateItem = async item => {
    try {
      let index = 0;
      const dbUtils = { db: dbObject.db, options: opts}
      if ( item.withTransaction ) {
        console.log("Transaction detected")
        // first, execute the init file if present
        // the init file is executed without a session
        // because it can be used to create collections
        // or do other operations not supported with 
        // multi-document transaction
        if ( item.files[0].includes("0__init.js") ) {
          console.log("Transaction INIT file found!")
          const migration = await migrationsDir.loadMigration(item.files[0]);
          const args = fnArgs(migration.up);
          const up = args.length > 1 ? promisify(migration.up) : migration.up;
          console.log("Executing " + item.files[0])
          await up(dbUtils)

          index = 1
        }

        // then, create session to be used in the migration files
        console.log("Creating db session")
        session = dbObject.client.startSession();
        console.log("Starting transaction")
        session.startTransaction();
        dbUtils['options'] = { session }

      }

      for (index; index < item.files.length; index++) {
        const file = item.files[index]
        console.log("Executing " + file)
        const migration = await migrationsDir.loadMigration(file);
        const args = fnArgs(migration.up);
        const up = args.length > 1 ? promisify(migration.up) : migration.up;
        await up(dbUtils)
      }


      if ( item.withTransaction && session ) {
        console.log("Commit transaction")
        await session.commitTransaction();
        console.log("Ending session")
        session.endSession();

        dbUtils['options'] = { }
      } 
    } catch (err) {
        const error = new Error(`Could not migrate up: ${err.message}`);
        error.migrated = migrated;
        throw error;
    }
  }

  
  try {
    await pEachSeries(scriptsArray, migrateItem);
  } catch (err) {
      const error = new Error(`Could not migrate up : ${err.message}`);
      if ( session )  { 
        await session.abortTransaction();
        session.endSession();
      }
      throw error;
  }
  


  const populateChangelog = async item => {
    
    const collectionName = config.changelogCollectionName;
    const collection = dbObject.db.collection(collectionName);

    let index = 0;
    
    for (index; index < item.files.length; index++) {
      const fileName = item.files[index]
      try {
        // calculate hash of the migration file
        const hash = await hasha.fromFile(config.migrationsDir + "/" + fileName, {algorithm: 'md5'})
        const appliedAt = new Date();
        // add migration file's information inside the changelog collection 
        await collection.insertOne({ fileName, appliedAt, hash });
      } catch (err) {
          throw new Error(`Could not update changelog: ${err.message}`);
      }

      migrated.push(fileName);
    }
    
  }
  
  await pEachSeries(scriptsArray, populateChangelog);
  return migrated;
};
