const init = require("./actions/init");
const create = require("./actions/create");
const clean = require("./actions/clean");
const up = require("./actions/up");
const down = require("./actions/down");
const status = require("./actions/status");
const database = require("./env/database");
const config = require("./env/configFile");

module.exports = {
  init,
  create,
  clean,
  up,
  down,
  status,
  database,
  config
};
