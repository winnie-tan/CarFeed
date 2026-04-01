const fs = require("fs");

function getArgValue(args, flagName, fallback = "") {
  const index = args.indexOf(flagName);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function loadJsonIfExists(filePath, fallbackValue) {
  if (!filePath || !fs.existsSync(filePath)) return fallbackValue;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallbackValue;
  }
}

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function summarizeOutcome(value) {
  return value || "skipped";
}

function countTranslated(articles, translations) {
  return articles.filter((article) => {
    const entry = translations[article.url];
    return Boolean(entry && cleanText(entry.summary_long));
  }).length;
}

function main() {
  const args = process.argv.slice(2);
  const statusPath = getArgValue(args, "--status", "./data/automation-status.json");
  const articlesPath = getArgValue(args, "--articles", "./data/articles.json");
  const translationsPath = getArgValue(args, "--translations", "./data/translations-deepseek.json");
  const fetchOutcome = summarizeOutcome(getArgValue(args, "--fetch-outcome"));
  const translateOutcome = summarizeOutcome(getArgValue(args, "--translate-outcome"));
  const buildOutcome = summarizeOutcome(getArgValue(args, "--build-outcome"));
  const eventName = getArgValue(args, "--event");
  const runId = getArgValue(args, "--run-id");
  const sha = getArgValue(args, "--sha");

  const status = loadJsonIfExists(statusPath, {});
  const articles = loadJsonIfExists(articlesPath, []);
  const translations = loadJsonIfExists(translationsPath, {});
  const translatedInFeed = countTranslated(articles, translations);
  const untranslatedInFeed = Math.max(articles.length - translatedInFeed, 0);

  const result =
    fetchOutcome !== "success" ? "failed" :
    translateOutcome !== "success" ? "failed" :
    buildOutcome !== "success" ? "failed" :
    "success";

  writeJson(statusPath, {
    ...status,
    workflow: {
      ...(status.workflow || {}),
      event_name: eventName || status?.workflow?.event_name || "",
      run_id: runId || status?.workflow?.run_id || "",
      sha: sha || status?.workflow?.sha || "",
      completed_at: new Date().toISOString(),
      fetch_outcome: fetchOutcome,
      translate_outcome: translateOutcome,
      build_outcome: buildOutcome,
      deepseek_translated_after_run: translatedInFeed,
      deepseek_untranslated_after_run: untranslatedInFeed,
      result
    }
  });
}

main();
