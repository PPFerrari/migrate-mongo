const { expect } = require("chai");
const sinon = require("sinon");

const proxyquire = require("proxyquire");

describe("up", () => {
  let up;
  let status;
  let configFile;
  let migrationsDir;
  let db;

  let firstPendingMigration;
  let secondPendingMigration;
  let changelogCollection;

  function mockStatus() {
    return sinon.stub().returns(
      Promise.resolve([
        {
          fileName: "20160509113224-first_migration.js",
          appliedAt: new Date()
        },
        {
          fileName: "20160512091701-second_migration.js",
          appliedAt: new Date()
        },
        {
          fileName: "20160512091701-pending_first_003.js",
          appliedAt: "PENDING",
          hash: "75b7e5769f897d6e238d5371cd6aeb44"
        },
        {
          fileName: "20160512091701-pending_second_002.js",
          appliedAt: "PENDING",
          hash: "66f8df53c2c0ef4daae328176516e283"
        }
      ])
    );
  }

  function mockConfigFile() {
    return {
      shouldExist: sinon.stub().returns(Promise.resolve()),
      read: sinon.stub().returns({
        changelogCollectionName: "changelog",
        migrationsDir: "test/migrations"
      })
    };
  }

  function mockMigrationsDir() {
    const mock = {};
    mock.loadMigration = sinon.stub();
    mock.loadMigration
      .withArgs("20160512091701-pending_first_003.js")
      .returns(Promise.resolve(firstPendingMigration));
    mock.loadMigration
      .withArgs("20160512091701-pending_second_002.js")
      .returns(Promise.resolve(secondPendingMigration));
    return mock;
  }

  function mockDb() {
    const mock = {};
    mock.collection = sinon.stub();
    mock.collection.withArgs("changelog").returns(changelogCollection);
    return mock;
  }

  function mockMigration() {
    const migration = {
      up: sinon.stub()
    };
    migration.up.returns(Promise.resolve());
    return migration;
  }

  function mockChangelogCollection() {
    return {
      insertOne: sinon.stub().returns(Promise.resolve())
    };
  }

  function loadUpWithInjectedMocks() {
    return proxyquire("../lib/actions/up", {
      "./status": status,
      "../env/configFile": configFile,
      "../env/migrationsDir": migrationsDir
    });
  }

  beforeEach(() => {
    firstPendingMigration = mockMigration();
    secondPendingMigration = mockMigration();
    changelogCollection = mockChangelogCollection();

    status = mockStatus();
    configFile = mockConfigFile();
    migrationsDir = mockMigrationsDir();
    db = mockDb();

    up = loadUpWithInjectedMocks();
  });

  it("should fetch the status", async () => {
    await up(db);
    expect(status.called).to.equal(true);
  });

  it("should load all the pending migrations", async () => {
    await up(db);
    expect(migrationsDir.loadMigration.called).to.equal(true);
    expect(migrationsDir.loadMigration.callCount).to.equal(2);
    expect(migrationsDir.loadMigration.getCall(0).args[0]).to.equal(
      "20160512091701-pending_first_003.js"
    );
    expect(migrationsDir.loadMigration.getCall(1).args[0]).to.equal(
      "20160512091701-pending_second_002.js"
    );
  });

  it("should upgrade all pending migrations in ascending order", async () => {
    await up(db);
    expect(firstPendingMigration.up.called).to.equal(true);
    expect(secondPendingMigration.up.called).to.equal(true);
    sinon.assert.callOrder(firstPendingMigration.up, secondPendingMigration.up);
  });

  it("should be able to upgrade callback based migration", async () => {
    firstPendingMigration = {
      up(theDb, callback) {
        return callback();
      }
    };
    migrationsDir = mockMigrationsDir();
    up = loadUpWithInjectedMocks();
    await up(db);
  });

  
  it("should populate the changelog with info about the upgraded migrations", async () => {
    const clock = sinon.useFakeTimers(
      new Date("2016-06-09T08:07:00.077Z").getTime()
    );
    await up(db);

    expect(changelogCollection.insertOne.called).to.equal(true);
    expect(changelogCollection.insertOne.callCount).to.equal(2);
    expect(changelogCollection.insertOne.getCall(0).args[0]).to.deep.equal({
      appliedAt: new Date("2016-06-09T08:07:00.077Z"),
      fileName: "20160512091701-pending_first_003.js",
      hash: "1dfa4fb994efc619e1d999c58a3f44d3"
    });
    clock.restore();
  });

  it("should yield a list of upgraded migration file names", async () => {
    const upgradedFileNames = await up(db);
    expect(upgradedFileNames).to.deep.equal([
      "20160512091701-pending_first_003.js",
      "20160512091701-pending_second_002.js"
    ]);
  });

  // // TODO this test first also had a list of migrated files (on error), review !
  it("should stop migrating when an error occurred and yield the error", async () => {
    try {
      const p = Promise.reject(new Error("Nope"));
      p.catch(() => {});
      secondPendingMigration.up.returns(p);

      await up(db);
      expect.fail("Error was not thrown");
    } catch (err) {
      expect(err.message).to.deep.equal(
        "Could not migrate up 20160512091701-pending_second_002.js: Nope"
      );
    }
  });

  it("should yield an error + items already migrated when unable to update the changelog", async () => {
    const p = Promise.reject(new Error("Kernel panic"))
    p.catch(() => {});
    changelogCollection.insertOne.onSecondCall().returns(p);

    try {
      await up(db);
      expect.fail("Error was not thrown");
    } catch (err) {
      expect(err.message).to.deep.equal(
        "Could not update changelog: Kernel panic"
      );
    }
  });
});
