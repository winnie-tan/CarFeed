const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const cheerio = require("cheerio");
const { XMLParser } = require("fast-xml-parser");

const execFileAsync = promisify(execFile);

const SOURCE_LIMIT = 30;
const OUTPUT_LIMIT = 180;
const ARCHIVE_LIMIT = 1000;
const ARCHIVE_PATH = "./data/archive.json";
const ARTICLES_PATH = "./data/articles.json";

function absoluteUrl(base, url) {
  if (!url) return "";
  try {
    return new URL(url, base).href;
  } catch {
    return "";
  }
}

function cleanText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function formatDate(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function pickSrcFromSrcset(srcset) {
  if (!srcset) return "";

  return srcset
    .split(",")
    .map((part) => cleanText(part).split(" ")[0])
    .filter(Boolean)
    .pop() || "";
}

function normalizeImageUrl(url) {
  if (!url) return "";

  const normalizePath = (value) => value
    .replace(/-\d+x\d+(?:-\d+)?(?=\.(jpg|jpeg|png|webp|avif)$)/ig, "")
    .replace(/-\d+x\d+(?:-\d+)?(?=\?)/ig, "");

  try {
    const parsed = new URL(url);
    parsed.pathname = normalizePath(parsed.pathname);
    return parsed.toString();
  } catch {
    return normalizePath(url);
  }
}

function isSizedImageUrl(url) {
  return /-\d+x\d+(?=\.(jpg|jpeg|png|webp|avif)(\?|$))/i.test(url || "");
}

function pickImageFromNode($, node, base) {
  const imageNode = $(node).find("img").first();
  const image =
    pickSrcFromSrcset(imageNode.attr("srcset")) ||
    pickSrcFromSrcset(imageNode.attr("data-srcset")) ||
    imageNode.attr("data-large-file") ||
    imageNode.attr("data-src") ||
    imageNode.attr("src");

  return absoluteUrl(base, normalizeImageUrl(image));
}

function pickBestMetaImage($, base) {
  const candidates = [
    $('meta[property="og:image:secure_url"]').attr("content"),
    $('meta[property="og:image"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[name="twitter:image:src"]').attr("content"),
    $('link[rel="preload"][as="image"]').attr("href")
  ].filter(Boolean);

  for (const candidate of candidates) {
    const image = absoluteUrl(base, normalizeImageUrl(candidate));
    if (image) return image;
  }

  return "";
}

function pickBestArticleImage($, base) {
  const selectors = [
    "img.article__mainImage",
    ".article__mainImage img",
    ".article__image img",
    ".entry-content img",
    "article img"
  ];

  for (const selector of selectors) {
    const node = $(selector).first();
    if (!node.length) continue;

    const image =
      node.attr("data-src") ||
      node.attr("data-large-file") ||
      pickSrcFromSrcset(node.attr("srcset")) ||
      pickSrcFromSrcset(node.attr("data-srcset")) ||
      node.attr("src");

    const absolute = absoluteUrl(base, normalizeImageUrl(image));
    if (absolute) return absolute;
  }

  return "";
}

function pickBestCarWebArticleImage($, base) {
  const figureImageSelectors = [
    'figure img[data-src*="img.bestcarweb.jp"]',
    'figure img[src*="img.bestcarweb.jp"]'
  ];

  for (const selector of figureImageSelectors) {
    const node = $(selector).first();
    if (!node.length) continue;

    const image =
      node.attr("data-src") ||
      pickSrcFromSrcset(node.attr("data-srcset")) ||
      node.attr("src");

    const absolute = absoluteUrl(base, normalizeImageUrl(image));
    if (absolute) return absolute;
  }

  const originalFigureLink = [
    '.article__content figure a[href*="img.bestcarweb.jp"]',
    '.article__content a[href*="img.bestcarweb.jp"]',
    'figure a[href*="img.bestcarweb.jp"]'
  ];

  for (const selector of originalFigureLink) {
    const href = $(selector).first().attr("href");
    const absolute = absoluteUrl(base, normalizeImageUrl(href));
    if (absolute) return absolute;
  }

  return pickBestArticleImage($, base);
}

async function enrichItemsWithArticleImages(items, options = {}) {
  const {
    source,
    onlyWhenSized = false,
    concurrency = 4
  } = options;

  const enriched = [...items];
  const queue = enriched.map((item, index) => ({ item, index }));

  async function worker() {
    while (queue.length) {
      const current = queue.shift();
      if (!current) return;

      const { item, index } = current;
      if (source && item.source !== source) continue;
      if (!item.url) continue;
      if (onlyWhenSized && !isSizedImageUrl(item.image)) continue;

      try {
        const html = await fetchHtml(item.url, { allowCurlFallback: true });
        const $ = cheerio.load(html);
        const preferredImage =
          (item.source === "Best Car Web"
            ? pickBestCarWebArticleImage($, item.url)
            : pickBestArticleImage($, item.url)) ||
          pickBestMetaImage($, item.url);
        if (preferredImage) {
          enriched[index] = {
            ...item,
            image: preferredImage
          };
        }
      } catch {
        continue;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, () => worker()));
  return enriched;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function readJsonFile(path, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

function inferCategory(item) {
  const text = [
    item.title_en,
    item.url,
    item.source
  ].join(" ").toLowerCase();

  const bikeKeywords = [
    "motorcycle", "bike", "biker", "scooter", "motogp", "ducati", "yamaha",
    "kawasaki", "harley", "honda cbr", "ninja ", "gsx", "triumph", "aprilia",
    "bmw motorrad", "touring bike", "adventure bike", "two-wheeler", "2-wheeler",
    "バイク", "スクーター", "モーターサイクル", "ドゥカティ", "ヤマハ", "カワサキ",
    "ハーレー", "bmwモトラッド", "ニンジャ", "原付", "ライダー"
  ];

  const customKeywords = [
    "custom", "tuning", "tuned", "restomod", "aftermarket", "body kit", "bodykit",
    "widebody", "stance", "drift build", "project car", "modded", "off-road build",
    "lift kit", "brake caliper", "suspension", "turbo kit", "カスタム", "改装", "改造",
    "チューニング", "エアロ", "足回り", "ブレーキ", "サスペンション", "ドレスアップ"
  ];

  if (bikeKeywords.some((keyword) => text.includes(keyword))) {
    return "bike";
  }

  if (customKeywords.some((keyword) => text.includes(keyword))) {
    return "custom";
  }

  return "car";
}

function normalizeArticle(article) {
  const nowIso = new Date().toISOString();
  const publishedAt = article.published_at || null;
  const time = article.time || formatDate(publishedAt || nowIso);

  return {
    title_en: cleanText(article.title_en),
    image: article.image || "",
    url: article.url || "",
    source: article.source || "",
    source_logo: article.source_logo || "",
    time,
    category: inferCategory(article),
    published_at: publishedAt,
    first_seen_at: article.first_seen_at || nowIso,
    last_seen_at: article.last_seen_at || nowIso
  };
}

function isLikelyArticle(item) {
  const url = item.url || "";

  if (item.source === "Response.jp") {
    return /response\.jp\/article\/\d{4}\/\d{2}\/\d{2}\/\d+\.html/.test(url);
  }

  if (item.source === "Best Car Web") {
    return /bestcarweb\.jp\/.+\/\d{6,}/.test(url);
  }

  if (item.source === "Motor1") {
    return /motor1\.com\/(news|features)\//.test(url);
  }

  if (item.source === "The Drive") {
    return /thedrive\.com\/(news|car-reviews|reviews|culture|accelerator)\//.test(url);
  }

  return true;
}

async function fetchHtmlWithFetch(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Upgrade-Insecure-Requests": "1"
    },
    redirect: "follow"
  });

  if (!res.ok) {
    throw new Error(`${url} 返回 ${res.status}`);
  }

  return await res.text();
}

async function fetchHtmlWithCurl(url) {
  const { stdout } = await execFileAsync("curl", [
    "-L",
    "--silent",
    "--show-error",
    "--max-time",
    "20",
    "-A",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "-H",
    "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "-H",
    "Accept-Language: en-US,en;q=0.9,ja;q=0.8",
    url
  ], {
    maxBuffer: 8 * 1024 * 1024
  });

  return stdout;
}

async function fetchHtml(url, options = {}) {
  try {
    return await fetchHtmlWithFetch(url);
  } catch (error) {
    if (!options.allowCurlFallback) {
      throw error;
    }
    return await fetchHtmlWithCurl(url);
  }
}

function dedupe(items) {
  const map = new Map();
  for (const rawItem of items) {
    const item = normalizeArticle(rawItem);
    if (!item.url) continue;
    if (!isLikelyArticle(item)) continue;

    const existing = map.get(item.url);
    if (!existing) {
      map.set(item.url, item);
      continue;
    }

    map.set(item.url, {
      ...existing,
      ...item,
      first_seen_at: existing.first_seen_at || item.first_seen_at,
      last_seen_at: item.last_seen_at || existing.last_seen_at
    });
  }
  return Array.from(map.values());
}

function sortByFreshness(items) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.published_at || a.last_seen_at || 0).getTime();
    const bTime = new Date(b.published_at || b.last_seen_at || 0).getTime();
    return bTime - aTime;
  });
}

function mergeArchive(currentItems) {
  const existing = readJsonFile(ARCHIVE_PATH, []);
  const merged = dedupe([
    ...existing,
    ...currentItems.map((item) => ({
      ...item,
      first_seen_at: item.first_seen_at || new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    }))
  ]);

  return sortByFreshness(merged);
}

function createArticleItem(article, source, sourceLogo, category) {
  return normalizeArticle({
    title_en: article.title_en,
    image: normalizeImageUrl(article.image),
    url: article.url,
    source,
    source_logo: sourceLogo,
    category,
    published_at: article.published_at || null,
    time: article.time || formatDate(article.published_at || new Date())
  });
}

function extractMotor1HomepageItems(html, base) {
  const $ = cheerio.load(html);
  const items = [];

  $("article.item-recommendation, a.group\\/hover-title").each((_, el) => {
    const node = $(el);
    const container = node.is("article") ? node : node.closest("article, div");
    const headlineLink = container.find("h2 a, h3 a, a.group\\/hover-title").first();
    const title = cleanText(headlineLink.text());
    const href = absoluteUrl(base, headlineLink.attr("href"));
    const image =
      pickImageFromNode($, container, base) ||
      absoluteUrl(base, normalizeImageUrl(pickSrcFromSrcset(container.find("source").first().attr("srcset"))));

    if (!href || !title || !image) return;
    if (!href.includes("/news/") && !href.includes("/features/")) return;

    items.push(createArticleItem({
      title_en: title,
      image,
      url: href
    }, "Motor1", "https://www.google.com/s2/favicons?domain=motor1.com&sz=64"));
  });

  return dedupe(items);
}

async function fetchRssFeed(feedUrl, source, sourceLogo) {
  const xml = await fetchHtml(feedUrl, { allowCurlFallback: true });
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseTagValue: false,
    trimValues: false
  });
  const parsed = parser.parse(xml);
  const items = asArray(parsed?.rss?.channel?.item);

  return dedupe(items.map((item) => {
    const content = item["content:encoded"] || "";
    const imgMatch = content.match(/<img[^>]+src="([^"]+)"/i);
    const image = item.enclosure?.url || imgMatch?.[1] || "";

    return createArticleItem({
      title_en: cleanText(item.title),
      image,
      url: item.link,
      published_at: item.pubDate,
      time: formatDate(item.pubDate)
    }, source, sourceLogo);
  }));
}

async function fetchMotor1Home() {
  const base = "https://www.motor1.com/";
  const html = await fetchHtml(base, { allowCurlFallback: true });

  const homepageItems = extractMotor1HomepageItems(html, base);
  const rssItems = dedupe([
    ...(await fetchRssFeed("https://www.motor1.com/rss/google/news/", "Motor1", "https://www.google.com/s2/favicons?domain=motor1.com&sz=64")),
    ...(await fetchRssFeed("https://www.motor1.com/rss/google/reviews/", "Motor1", "https://www.google.com/s2/favicons?domain=motor1.com&sz=64")),
    ...(await fetchRssFeed("https://www.motor1.com/rss/google/features/", "Motor1", "https://www.google.com/s2/favicons?domain=motor1.com&sz=64"))
  ]);

  return sortByFreshness(dedupe([...homepageItems, ...rssItems])).slice(0, SOURCE_LIMIT);
}

async function fetchTheDriveHome() {
  const base = "https://www.thedrive.com/";
  const html = await fetchHtml(base, { allowCurlFallback: true });
  const $ = cheerio.load(html);
  const items = [];

  $(".card-post.article-feed-block-post, .card-post.featured-post").each((_, el) => {
    const article = $(el);
    const titleLink = article.find(".card-post-title-link").first();
    const title = cleanText(titleLink.text());
    const href = absoluteUrl(base, titleLink.attr("href"));
    const image = pickImageFromNode($, article, base);

    if (!href || !title || !image) return;
    if (!href.includes("thedrive.com/")) return;

    items.push(createArticleItem({
      title_en: title,
      image,
      url: href
    }, "The Drive", "https://www.google.com/s2/favicons?domain=thedrive.com&sz=64"));
  });

  const rssItems = await fetchRssFeed(
    "https://www.thedrive.com/feed",
    "The Drive",
    "https://www.google.com/s2/favicons?domain=thedrive.com&sz=64"
  );

  return sortByFreshness(dedupe([...items, ...rssItems])).slice(0, SOURCE_LIMIT);
}

async function fetchBestCarWebHome() {
  const base = "https://bestcarweb.jp/";
  const html = await fetchHtml(base, { allowCurlFallback: true });
  const $ = cheerio.load(html);
  const items = [];

  $("a").each((_, el) => {
    const href = absoluteUrl(base, $(el).attr("href"));
    const title =
      cleanText($(el).find("h1,h2,h3,h4,p").first().text()) ||
      cleanText($(el).attr("title"));
    const image = pickImageFromNode($, el, base);

    if (!href || !title || !image) return;
    if (!href.includes("bestcarweb.jp")) return;
    if (!/bestcarweb\.jp\/.+\/\d{6,}/.test(href)) return;
    if (title.length < 8) return;

    items.push(createArticleItem({
      title_en: title,
      image,
      url: href
    }, "Best Car Web", "https://www.google.com/s2/favicons?domain=bestcarweb.jp&sz=64"));
  });

  const deduped = sortByFreshness(dedupe(items)).slice(0, SOURCE_LIMIT);
  return await enrichItemsWithArticleImages(deduped, {
    source: "Best Car Web"
  });
}

async function fetchResponseHome() {
  const base = "https://response.jp/";
  const html = await fetchHtml(base, { allowCurlFallback: true });
  const $ = cheerio.load(html);
  const items = [];

  $("a").each((_, el) => {
    const href = absoluteUrl(base, $(el).attr("href"));
    const title =
      cleanText($(el).find("h1,h2,h3,h4,p").first().text()) ||
      cleanText($(el).attr("title"));
    const image = pickImageFromNode($, el, base);

    if (!href || !title || !image) return;
    if (!href.includes("response.jp")) return;
    if (!/response\.jp\/article\/\d{4}\/\d{2}\/\d{2}\/\d+\.html/.test(href)) return;
    if (title.length < 8) return;

    items.push(createArticleItem({
      title_en: title,
      image,
      url: href
    }, "Response.jp", "https://www.google.com/s2/favicons?domain=response.jp&sz=64"));
  });

  const deduped = sortByFreshness(dedupe(items)).slice(0, SOURCE_LIMIT);
  return await enrichItemsWithArticleImages(deduped, {
    source: "Response.jp",
    onlyWhenSized: true
  });
}

async function repairArchiveImages(items) {
  const bestCarWebItems = await enrichItemsWithArticleImages(items, {
    source: "Best Car Web"
  });

  return await enrichItemsWithArticleImages(bestCarWebItems, {
    source: "Response.jp",
    onlyWhenSized: true
  });
}

async function main() {
  const results = await Promise.allSettled([
    fetchMotor1Home(),
    fetchTheDriveHome(),
    fetchBestCarWebHome(),
    fetchResponseHome()
  ]);

  const names = ["Motor1", "The Drive", "Best Car Web", "Response.jp"];

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      console.log(`✅ ${names[i]} 抓到 ${r.value.length} 条`);
    } else {
      console.log(`⚠️ ${names[i]} 失败：${r.reason.message}`);
    }
  });

  const currentFeed = sortByFreshness(dedupe(
    results
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => r.value)
  ));

  const archive = (await repairArchiveImages(mergeArchive(currentFeed))).slice(0, ARCHIVE_LIMIT);
  const outputFeed = archive.slice(0, OUTPUT_LIMIT);

  fs.writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2), "utf-8");
  fs.writeFileSync(ARTICLES_PATH, JSON.stringify(outputFeed, null, 2), "utf-8");

  console.log(`🎉 当前抓到 ${currentFeed.length} 条，本地归档保留 ${archive.length} 条，输出 ${outputFeed.length} 条到 data/articles.json`);
}

main().catch((err) => {
  console.error("❌ 总报错：", err.message);
});
