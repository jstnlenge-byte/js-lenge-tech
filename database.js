const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
const databaseFile = path.join(dataDir, "database.json");

const initialDatabase = {
  members: [],
  ideas: [],
  projects: [],
  publications: [],
  messages: [],
  notifications: [],
  links: [],
  photos: [],
  announcements: []
};

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(databaseFile)) {
  fs.writeFileSync(
    databaseFile,
    JSON.stringify(initialDatabase, null, 2),
    "utf8"
  );
}

function readDatabase() {
  const content = fs.readFileSync(databaseFile, "utf8");
  return JSON.parse(content);
}

function writeDatabase(database) {
  fs.writeFileSync(
    databaseFile,
    JSON.stringify(database, null, 2),
    "utf8"
  );
}

module.exports = {
  readDatabase,
  writeDatabase
};
