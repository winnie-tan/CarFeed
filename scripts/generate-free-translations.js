const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const cheerio = require("cheerio");

const execFileAsync = promisify(execFile);

const ARTICLES_PATH = "./data/articles.json";
const OUTPUT_PATH = "./data/translations-free.json";
const CONCURRENCY = 4;
const MAX_BODY_CHARS = 900;

const BRAND_MAP = [
  ["Toyota", "丰田"],
  ["Lexus", "雷克萨斯"],
  ["Nissan", "日产"],
  ["Honda", "本田"],
  ["Mazda", "马自达"],
  ["Subaru", "斯巴鲁"],
  ["Suzuki", "铃木"],
  ["Mitsubishi", "三菱"],
  ["Daihatsu", "大发"],
  ["Yamaha", "雅马哈"],
  ["Kawasaki", "川崎"],
  ["Harley-Davidson", "哈雷戴维森"],
  ["Harley Davidson", "哈雷戴维森"],
  ["BMW", "宝马"],
  ["Mercedes-Benz", "梅赛德斯-奔驰"],
  ["Mercedes", "梅赛德斯-奔驰"],
  ["Audi", "奥迪"],
  ["Porsche", "保时捷"],
  ["Volkswagen", "大众"],
  ["Jeep", "Jeep"],
  ["Tesla", "特斯拉"],
  ["Rivian", "Rivian"],
  ["Kia", "起亚"],
  ["Hyundai", "现代"],
  ["BYD", "比亚迪"],
  ["Vespa", "Vespa"],
  ["Piaggio", "比亚乔"],
  ["Land Rover", "路虎"],
  ["Ferrari", "法拉利"],
  ["Red Bull", "红牛"],
  ["Dunlop", "邓禄普"]
];

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function cutText(text, maxChars) {
  if (!text || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trim()}...`;
}

function absoluteUrl(base, url) {
  if (!url) return "";
  try {
    return new URL(url, base).href;
  } catch {
    return "";
  }
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function fetchHtml(url) {
  const cmd = [
    "curl -L --silent --show-error --max-time 20",
    "-A",
    shellEscape("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"),
    "-H",
    shellEscape("Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"),
    "-H",
    shellEscape("Accept-Language: en-US,en;q=0.9,ja;q=0.8,zh-CN;q=0.7"),
    shellEscape(url)
  ].join(" ");

  const { stdout } = await execFileAsync("/bin/zsh", ["-lc", cmd], {
    maxBuffer: 8 * 1024 * 1024
  });

  return stdout;
}

const translationCache = new Map();

async function translateText(text) {
  const normalized = cleanText(text);
  if (!normalized) return "";
  if (translationCache.has(normalized)) return translationCache.get(normalized);

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(normalized)}`;
  const cmd = `curl -L --silent --show-error --max-time 20 ${shellEscape(url)}`;
  const { stdout } = await execFileAsync("/bin/zsh", ["-lc", cmd], {
    maxBuffer: 2 * 1024 * 1024
  });
  const parsed = JSON.parse(stdout);
  const translated = (parsed?.[0] || []).map((item) => item?.[0] || "").join("");
  translationCache.set(normalized, translated);
  return translated;
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
    const paragraphs = $(selector).toArray()
      .map((el) => cleanText($(el).text()))
      .filter((text) => text.length > 40)
      .slice(0, 3);
    if (paragraphs.length) return paragraphs;
  }

  return [];
}

function inferEntities(article) {
  const title = article.title_en || "";
  const entities = [];

  for (const [en, zh] of BRAND_MAP) {
    const pattern = new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (pattern.test(title)) {
      entities.push(`${zh} | ${en}`);
    }
  }

  const quotedMatches = [
    ...title.matchAll(/[「『"'“](.{1,32}?)[」』"'”]/g),
    ...title.matchAll(/\b([A-Z][A-Za-z0-9-]{1,20}(?:\s+[A-Z0-9][A-Za-z0-9-]{0,20}){0,3})\b/g)
  ]
    .map((match) => cleanText(match[1]))
    .filter((value) => value.length >= 2)
    .filter((value) => !/^(Trending|Opinion|Review|Response|Motor1|The Drive)$/i.test(value));

  for (const item of quotedMatches.slice(0, 4)) {
    entities.push(`${item} | ${item}`);
  }

  return unique(entities).slice(0, 6);
}

function buildSummaryShort(text) {
  const normalized = cleanText(text);
  if (!normalized) return "";
  const sentence = normalized.split(/(?<=[。！？.!?])\s+/)[0] || normalized;
  return cutText(sentence, 92);
}

async function buildTranslation(article, index, total) {
  try {
    const html = await fetchHtml(article.url);
    const $ = cheerio.load(html);
    const description = pickDescription($);
    const paragraphs = pickParagraphs($, article);
    const bodySource = cutText(unique([description, ...paragraphs]).join("\n\n"), MAX_BODY_CHARS);
    const [titleZh, bodyZh] = await Promise.all([
      translateText(article.title_en || ""),
      translateText(bodySource)
    ]);

    console.log(`✅ [${index + 1}/${total}] ${article.source} ${article.url}`);

    return [
      article.url,
      {
        title_zh: titleZh || article.title_en || "",
        summary_short: buildSummaryShort(bodyZh),
        summary_long: bodyZh || "",
        entities: inferEntities(article),
        translation_source: "google-translate-free-web",
        translated_at: new Date().toISOString()
      }
    ];
  } catch (error) {
    console.log(`⚠️ [${index + 1}/${total}] 失败 ${article.url} ${error.message}`);
    return [
      article.url,
      {
        title_zh: "",
        summary_short: "",
        summary_long: "",
        entities: inferEntities(article),
        translation_source: "google-translate-free-web",
        translated_at: new Date().toISOString(),
        error: error.message
      }
    ];
  }
}

async function main() {
  const articles = JSON.parse(fs.readFileSync(ARTICLES_PATH, "utf-8"));
  const queue = articles.map((article, index) => ({ article, index }));
  const output = {};

  async function worker() {
    while (queue.length) {
      const current = queue.shift();
      if (!current) return;
      const [url, value] = await buildTranslation(current.article, current.index, articles.length);
      output[url] = value;
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`🎉 写入 ${OUTPUT_PATH}，共 ${Object.keys(output).length} 条`);
}

main().catch((error) => {
  console.error("❌ 生成免费翻译失败：", error.message);
  process.exitCode = 1;
});
