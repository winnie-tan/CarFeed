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

function hasDeepTranslation(translations, article) {
  const entry = translations[article.url];
  return Boolean(entry && cleanText(entry.summary_long));
}

function main() {
  const args = process.argv.slice(2);
  const beforePath = getArgValue(args, "--before");
  const afterPath = getArgValue(args, "--after", "./02-inputs/data/articles.json");
  const translationsPath = getArgValue(args, "--translations", "./02-inputs/data/translations-deepseek.json");
  const targetsOutPath = getArgValue(args, "--targets-out");
  const statusOutPath = getArgValue(args, "--status-out");
  const limit = Number(getArgValue(args, "--limit", "400"));
  const newOnly = args.includes("--new-only");

  const beforeArticles = loadJsonIfExists(beforePath, []);
  const afterArticles = loadJsonIfExists(afterPath, []).slice(0, limit);
  const translations = loadJsonIfExists(translationsPath, {});
  const beforeUrlSet = new Set(beforeArticles.map((item) => item.url).filter(Boolean));

  const newArticles = [];
  const backlogArticles = [];

  for (const article of afterArticles) {
    if (hasDeepTranslation(translations, article)) continue;
    if (beforeUrlSet.has(article.url)) {
      backlogArticles.push(article);
    } else {
      newArticles.push(article);
    }
  }

  const queuedArticles = newOnly ? newArticles : [...newArticles, ...backlogArticles];
  const targets = queuedArticles.map((item) => item.url).filter(Boolean);

  if (targetsOutPath) {
    writeJson(targetsOutPath, targets);
  }

  const status = {
    workflow: {
      generated_at: new Date().toISOString(),
      articles_in_feed: afterArticles.length,
      deepseek_translated_before_run: afterArticles.length - queuedArticles.length,
      deepseek_untranslated_before_run: queuedArticles.length,
      newly_fetched_articles: afterArticles.filter((item) => !beforeUrlSet.has(item.url)).length,
      newly_fetched_untranslated: newArticles.length,
      backlog_untranslated: backlogArticles.length,
      translation_scope: newOnly ? "new_only" : "new_and_backlog",
      translation_queue_count: queuedArticles.length,
      translation_queue_preview: queuedArticles.slice(0, 20).map((item) => ({
        source: item.source || "",
        time: item.time || "",
        title: item.title_en || "",
        url: item.url || ""
      }))
    }
  };

  if (statusOutPath) {
    const currentStatus = loadJsonIfExists(statusOutPath, {});
    writeJson(statusOutPath, {
      ...currentStatus,
      ...status
    });
  } else {
    console.log(JSON.stringify(status, null, 2));
  }
}

main();
