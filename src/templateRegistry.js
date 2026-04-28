const fs = require("node:fs");
const path = require("node:path");

const registryPath = path.join(__dirname, "..", "templates", "registry.json");
const questionnairePath = path.join(__dirname, "..", "data", "questionnaire.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getTemplateRegistry() {
  return readJson(registryPath);
}

function getQuestionnaire() {
  return readJson(questionnairePath);
}

module.exports = {
  getQuestionnaire,
  getTemplateRegistry,
};
