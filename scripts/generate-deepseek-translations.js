const fs = require("fs");
const cheerio = require("cheerio");

const ARTICLES_PATH = "./data/articles.json";
const OUTPUT_PATH = "./data/translations-deepseek.json";
const CONCURRENCY = Number(process.env.CONCURRENCY || 2);
const MAX_BODY_CHARS = Number(process.env.MAX_BODY_CHARS || 1800);
const DEFAULT_LIMIT = Number(process.env.LIMIT || 400);
const BRAND_TERMS = [
  "Toyota",
  "Lexus",
  "Nissan",
  "Honda",
  "Mazda",
  "Subaru",
  "Suzuki",
  "Mitsubishi",
  "Daihatsu",
  "Yamaha",
  "Kawasaki",
  "Harley-Davidson",
  "Harley Davidson",
  "BMW",
  "Mercedes-Benz",
  "Mercedes",
  "Audi",
  "Porsche",
  "Volkswagen",
  "Jeep",
  "Tesla",
  "Rivian",
  "Kia",
  "Hyundai",
  "BYD",
  "Vespa",
  "Piaggio",
  "Land Rover",
  "Ferrari"
];

function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    env[key] = value;
  }
  return env;
}

const fileEnv = parseDotEnv("./.env");
for (const [key, value] of Object.entries(fileEnv)) {
  if (!(key in process.env)) {
    process.env[key] = value;
  }
}

const API_KEY = process.env.DEEPSEEK_API_KEY || "";
const BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function loadJsonIfExists(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) return fallbackValue;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallbackValue;
  }
}

function getArgValue(args, flagName) {
  const index = args.indexOf(flagName);
  return index >= 0 && args[index + 1] ? args[index + 1] : "";
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function writeStatus(statusFilePath, updater) {
  if (!statusFilePath) return;
  const current = loadJsonIfExists(statusFilePath, {});
  const next = typeof updater === "function" ? updater(current) : updater;
  writeJson(statusFilePath, next);
}

function absoluteUrl(base, url) {
  if (!url) return "";
  try {
    return new URL(url, base).href;
  } catch {
    return "";
  }
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function cutText(text, maxChars) {
  if (!text || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trim()}...`;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,ja;q=0.8,zh-CN;q=0.7"
    }
  });

  if (!response.ok) {
    throw new Error(`抓取正文失败 ${response.status}`);
  }

  return response.text();
}

function pickDescription($) {
  return cleanText(
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="twitter:description"]').attr("content")
  );
}

function pickParagraphs($, article) {
  const selectors = {
    "Response.jp": [".arti-body p"],
    "Best Car Web": [".article__content p", ".entry-content p"],
    Motor1: ["article p", ".article-body p", ".content p"],
    "The Drive": ["article p", ".body-copy p"],
    InsideEVs: ["article p", ".article-body p"],
    Electrek: [".entry-content p", "article p"],
    "Top Gear EV": ["article p", ".field-name-body p"],
    "Car and Driver EV": ["article p", ".article-body p"],
    Vespa: ["article p", ".content p"]
  };

  const candidates = selectors[article.source] || ["article p", ".entry-content p", "main p"];
  for (const selector of candidates) {
    const paragraphs = $(selector)
      .toArray()
      .map((el) => cleanText($(el).text()))
      .filter((text) => text.length > 40)
      .slice(0, 5);
    if (paragraphs.length) return paragraphs;
  }

  return [];
}

function normalizeImageUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("w");
    parsed.searchParams.delete("h");
    parsed.searchParams.delete("width");
    parsed.searchParams.delete("height");
    parsed.searchParams.delete("quality");
    return parsed.toString();
  } catch {
    return String(url);
  }
}

function isUsefulGalleryImage(url, width, height) {
  const normalized = String(url || "");
  if (!normalized) return false;
  if (/favicon|logo|avatar|icon/i.test(normalized)) return false;
  if (/sq_m_l1|sq_s|\/thumb\//i.test(normalized)) return false;
  if (width && Number(width) < 160) return false;
  if (height && Number(height) < 120) return false;
  return /^https?:\/\//i.test(normalized);
}

function extractGalleryImages($, article) {
  const collected = [];
  const pushImage = (url, width, height) => {
    const absolute = normalizeImageUrl(absoluteUrl(article.url, url));
    if (!isUsefulGalleryImage(absolute, width, height)) return;
    collected.push(absolute);
  };

  pushImage(
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") ||
    article.image
  );

  const selectors = [
    ".figure-area img.image",
    "a.inbody-img-link img",
    ".arti-body img",
    "article img",
    "main img",
    ".article img",
    ".entry-content img"
  ];

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const node = $(element);
      pushImage(
        node.attr("src") || node.attr("data-src") || node.attr("data-lazy-src"),
        node.attr("width"),
        node.attr("height")
      );
    });
  }

  return unique(collected).slice(0, 3);
}

function buildSourcePayload(article, html) {
  const $ = cheerio.load(html);
  const description = pickDescription($);
  const paragraphs = pickParagraphs($, article);
  return cutText(
    unique([
      article.title_en || "",
      description,
      ...paragraphs
    ]).join("\n\n"),
    MAX_BODY_CHARS
  );
}

function extractJsonObject(text) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    throw new Error("模型返回为空");
  }

  try {
    return JSON.parse(normalized);
  } catch {}

  const match = normalized.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("模型返回不是 JSON");
  }

  return JSON.parse(match[0]);
}

function normalizeArray(value, max = 6) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item)).filter(Boolean).slice(0, max);
}

function addCjkAsciiSpacing(text) {
  return cleanText(text)
    .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, "$1 $2")
    .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, "$1 $2")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function looksLikeVehicleOrBrandEntity(article, englishPart) {
  const normalized = cleanText(englishPart);
  if (!normalized) return false;

  if (BRAND_TERMS.some((term) => normalized.toLowerCase().includes(term.toLowerCase()))) {
    return true;
  }

  if (article.title_en && article.title_en.toLowerCase().includes(normalized.toLowerCase())) {
    return true;
  }

  return /[A-Z]/.test(normalized) && (
    /\d/.test(normalized) ||
    /\b(?:GT|XR|GL|RS|Rally|Rubicon|Limited|Sport|Series|Wrangler|Ninja|Fazzio|Glide|Wagoneer|Trike)\b/i.test(normalized)
  );
}

function normalizeEntities(article, value) {
  const items = normalizeArray(value, 5);
  return items.map((item) => {
    if (!item.includes("|")) return addCjkAsciiSpacing(item);
    const [zhPartRaw, enPartRaw] = item.split("|").map((part) => cleanText(part));
    const zhPart = addCjkAsciiSpacing(zhPartRaw);
    const enPart = addCjkAsciiSpacing(enPartRaw);
    if (!enPart) return zhPart || addCjkAsciiSpacing(item);
    if (!zhPart) return enPart;
    if (/^[A-Za-z0-9 .'\-()]+$/.test(zhPart) || zhPart.toLowerCase() === enPart.toLowerCase()) {
      return enPart;
    }
    return looksLikeVehicleOrBrandEntity(article, enPart)
      ? `${zhPart} | ${enPart}`
      : zhPart;
  }).filter(Boolean);
}

function shortenHighlight(text) {
  const normalized = addCjkAsciiSpacing(text)
    .replace(/[。！？!?,，；;：:]+$/g, "");
  if (!normalized) return "";
  const firstClause = normalized.split(/[，,；;。！？!?]/)[0].trim();
  const concise = firstClause || normalized;
  return concise.length > 26 ? `${concise.slice(0, 26).trim()}…` : concise;
}

function normalizeHighlights(value) {
  return normalizeArray(value, 4)
    .map(shortenHighlight)
    .filter(Boolean);
}

function normalizeTitleZh(value) {
  return addCjkAsciiSpacing(value)
    .replace(/([\u4e00-\u9fa5A-Za-z0-9·\-（）()]+)\s*\|\s*([A-Za-z0-9][A-Za-z0-9 .'\-()]+)/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeTranslationPayload(article, payload, galleryImages = []) {
  return {
    title_zh: normalizeTitleZh(payload.title_zh) || article.title_en || "",
    summary_short: addCjkAsciiSpacing(payload.summary_short),
    summary_long: addCjkAsciiSpacing(payload.summary_long),
    highlights_zh: normalizeHighlights(payload.highlights_zh),
    entities: normalizeEntities(article, payload.entities),
    gallery_images: unique(galleryImages.map((item) => normalizeImageUrl(item))).slice(0, 3),
    translation_source: `deepseek:${MODEL}`,
    translated_at: new Date().toISOString()
  };
}

async function requestDeepSeekTranslation(article, sourceText) {
  if (!API_KEY) {
    throw new Error("缺少 DEEPSEEK_API_KEY");
  }

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "你是汽车媒体翻译与摘要编辑。",
            "你需要把输入的汽车新闻整理为中文结构化内容。",
            "必须只返回 JSON，不要返回任何额外说明。",
            "summary_short 用于首页卡片，控制在 45-70 个中文字符。",
            "summary_long 用 1-2 段中文概述文章要义，不要使用“这篇文章”这类措辞。",
            "highlights_zh 输出 3-4 条要点，每条尽量短，适合在手机端单行展示，避免完整长句。",
            "entities 输出 3-5 个关键词。",
            "只有品牌名、车系名、车型名使用“中文 | English”格式。",
            "如果某个品牌或车型没有自然中文译名，不要输出“English | English”或重复双写，直接保留单个词即可。",
            "其他关键词一律只输出中文，不要中英双写。",
            "不要输出 Facebook、TikTok、社交媒体、观看量、时间地点等低价值标签，优先保留品牌、车型、核心主题。"
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            article: {
              source: article.source || "",
              category: article.category || "",
              title_original: article.title_en || "",
              url: article.url || "",
              time: article.time || ""
            },
            source_text: sourceText,
            output_schema: {
              title_zh: "string",
              summary_short: "string",
              summary_long: "string",
              highlights_zh: ["string"],
              entities: ["中文 | English"]
            }
          })
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content || "";
  return extractJsonObject(content);
}

async function buildTranslation(article, index, total) {
  try {
    const html = await fetchHtml(article.url);
    const $ = cheerio.load(html);
    const sourceText = buildSourcePayload(article, html);
    if (!sourceText) {
      throw new Error("正文抽取为空");
    }

    const galleryImages = extractGalleryImages($, article);
    const payload = await requestDeepSeekTranslation(article, sourceText);
    const translation = normalizeTranslationPayload(article, payload, galleryImages);
    console.log(`✅ [${index + 1}/${total}] ${article.source} ${article.url}`);
    return [article.url, translation];
  } catch (error) {
    console.log(`⚠️ [${index + 1}/${total}] 失败 ${article.url} ${error.message}`);
    return [
      article.url,
      {
        title_zh: "",
        summary_short: "",
        summary_long: "",
        highlights_zh: [],
        entities: [],
        gallery_images: article.image ? [normalizeImageUrl(article.image)] : [],
        translation_source: `deepseek:${MODEL}`,
        translated_at: new Date().toISOString(),
        error: error.message
      }
    ];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const forceFlag = args.includes("--force");
  const limit = Number(getArgValue(args, "--limit") || DEFAULT_LIMIT);
  const targetsFilePath = getArgValue(args, "--targets-file");
  const statusFilePath = getArgValue(args, "--status-file");

  const existingOutput = loadJsonIfExists(OUTPUT_PATH, {});
  const allArticles = JSON.parse(fs.readFileSync(ARTICLES_PATH, "utf-8")).slice(0, limit);
  const targetUrls = targetsFilePath ? loadJsonIfExists(targetsFilePath, []) : [];
  const targetUrlSet = new Set(Array.isArray(targetUrls) ? targetUrls : []);
  const scopedArticles = targetsFilePath
    ? allArticles.filter((article) => targetUrlSet.has(article.url))
    : allArticles;
  const articles = forceFlag
    ? scopedArticles
    : scopedArticles.filter((article) => {
        const existing = existingOutput[article.url];
        return !existing || !cleanText(existing.summary_long);
      });
  const queue = articles.map((article, index) => ({ article, index }));
  const output = { ...existingOutput };

  writeStatus(statusFilePath, (current) => ({
    ...current,
    translation: {
      ...(current.translation || {}),
      model: MODEL,
      targets_file: targetsFilePath || "",
      scoped_articles: scopedArticles.length,
      queued_articles: articles.length,
      started_at: new Date().toISOString(),
      finished_at: "",
      success: false,
      error: "",
      processed: 0
    }
  }));

  console.log(
    `准备处理 ${articles.length} / ${scopedArticles.length} 篇文章` +
      (forceFlag ? "（强制重跑）" : "（自动跳过已有长摘要的条目）")
  );

  if (!articles.length) {
    writeStatus(statusFilePath, (current) => ({
      ...current,
      translation: {
        ...(current.translation || {}),
        finished_at: new Date().toISOString(),
        success: true,
        processed: 0
      }
    }));
    console.log("无需翻译，已跳过。");
    return;
  }

  if (!API_KEY) {
    writeStatus(statusFilePath, (current) => ({
      ...current,
      translation: {
        ...(current.translation || {}),
        finished_at: new Date().toISOString(),
        success: false,
        error: "缺少 DEEPSEEK_API_KEY"
      }
    }));
    console.error("❌ 缺少 DEEPSEEK_API_KEY");
    process.exit(1);
  }

  async function worker() {
    while (queue.length) {
      const current = queue.shift();
      if (!current) return;
      const [url, value] = await buildTranslation(current.article, current.index, articles.length);
      output[url] = value;
      writeJson(OUTPUT_PATH, output);
      writeStatus(statusFilePath, (status) => ({
        ...status,
        translation: {
          ...(status.translation || {}),
          processed: Number(status?.translation?.processed || 0) + 1
        }
      }));
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  writeStatus(statusFilePath, (current) => ({
    ...current,
    translation: {
      ...(current.translation || {}),
      finished_at: new Date().toISOString(),
      success: true,
      processed: articles.length
    }
  }));
  console.log(`🎉 写入 ${OUTPUT_PATH}，共 ${Object.keys(output).length} 条`);
}

main().catch((error) => {
  console.error("❌ 生成 DeepSeek 翻译失败：", error.message);
  process.exitCode = 1;
});
