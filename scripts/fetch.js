const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const cheerio = require("cheerio");
const { XMLParser } = require("fast-xml-parser");

const execFileAsync = promisify(execFile);

const SOURCE_LIMIT = 30;
const OUTPUT_LIMIT = 400;
const ARCHIVE_LIMIT = 3000;
const FEED_RETENTION_DAYS = 14;
const ARCHIVE_PATH = "./data/archive.json";
const ARTICLES_PATH = "./data/articles.json";
const SOURCE_META = {
  Motor1: {
    logo: "https://www.motor1.com/favicon.ico"
  },
  "The Drive": {
    logo: "https://www.thedrive.com/wp-content/uploads/2024/07/cropped-drive_favicon-1.png?quality=85&w=192"
  },
  "Best Car Web": {
    logo: "https://img.bestcarweb.jp/wp-content/uploads/2021/04/14182035/bestcar-256.png"
  },
  "Response.jp": {
    logo: "https://response.jp/favicon.ico"
  },
  Vespa: {
    logo: "https://press.piaggiogroup.com/images/logo/small-vespa.png"
  },
  InsideEVs: {
    logo: "https://cdn.motor1.com/images/static/insideevs/favicon-196.png"
  },
  Electrek: {
    logo: "https://electrek.co/wp-content/uploads/sites/3/2018/09/cropped-electrek-logo11.png"
  },
  "Top Gear EV": {
    logo: "https://www.topgear.com/apple-touch-icon.png"
  },
  "Car and Driver EV": {
    logo: "https://www.caranddriver.com/_assets/design-tokens/caranddriver/static/images/apple-touch-icon.57b92b6.png"
  }
};

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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordInText(text, keyword) {
  if (!keyword) return false;
  if (/[a-z0-9]/i.test(keyword)) {
    const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
    return pattern.test(text);
  }

  return text.includes(keyword);
}

function formatDate(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseDisplayDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function hasUsableImage(item) {
  return Boolean(cleanText(item?.image));
}

function getArticleSortTime(item) {
  return (
    parseDate(item?.published_at)?.getTime() ||
    parseDisplayDate(item?.time)?.getTime() ||
    parseDate(item?.last_seen_at)?.getTime() ||
    parseDate(item?.first_seen_at)?.getTime() ||
    0
  );
}

function buildFallbackLogoUrl(url, source) {
  const candidate = url || source;

  try {
    const parsed = new URL(candidate);
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(parsed.origin)}`;
  } catch {
    if (!candidate) return "";
    const host = String(candidate).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!host) return "";
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`;
  }
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

  const evSources = [
    "InsideEVs",
    "Electrek",
    "Top Gear EV",
    "Car and Driver EV"
  ];

  const evKeywords = [
    "electric", "ev", "bev", "phev", "plug-in", "plug in", "hybrid", "battery",
    "charging", "nacs", "range", "robotaxi", "e-mobility", "e mobility", "电动",
    "纯电", "插混", "混动", "增程", "新能源", "充电", "续航"
  ];

  const bikeKeywords = [
    "motorcycle", "bike", "biker", "scooter", "motogp", "ducati", "yamaha",
    "kawasaki", "harley", "honda cbr", "ninja ", "gsx", "triumph", "aprilia",
    "bmw motorrad", "touring bike", "adventure bike", "two-wheeler", "2-wheeler",
    "vespa", "バイク", "スクーター", "モーターサイクル", "ドゥカティ", "ヤマハ", "カワサキ",
    "ハーレー", "bmwモトラッド", "ニンジャ", "原付", "ライダー"
  ];

  const customKeywords = [
    "custom", "tuning", "tuned", "restomod", "aftermarket", "body kit", "bodykit",
    "widebody", "stance", "drift build", "project car", "modded", "off-road build",
    "lift kit", "brake caliper", "suspension", "turbo kit", "カスタム", "改装", "改造",
    "チューニング", "エアロ", "足回り", "ブレーキ", "サスペンション", "ドレスアップ"
  ];

  if (evSources.includes(item.source) || evKeywords.some((keyword) => keywordInText(text, keyword))) {
    return "ev";
  }

  if (bikeKeywords.some((keyword) => keywordInText(text, keyword))) {
    return "bike";
  }

  if (customKeywords.some((keyword) => keywordInText(text, keyword))) {
    return "custom";
  }

  return "car";
}

function normalizeArticle(article) {
  const nowIso = new Date().toISOString();
  const publishedAt = article.published_at || null;
  const time = article.time || formatDate(publishedAt || nowIso);
  const supportedCategories = new Set(["car", "bike", "custom", "ev"]);
  const sourceLogo =
    article.source_logo ||
    SOURCE_META[article.source]?.logo ||
    buildFallbackLogoUrl(article.url, article.source);
  const category = supportedCategories.has(article.category)
    ? article.category
    : inferCategory(article);

  return {
    title_en: cleanText(article.title_en),
    image: article.image || "",
    url: article.url || "",
    source: article.source || "",
    source_logo: sourceLogo,
    time,
    category,
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
    const imageDelta = Number(hasUsableImage(b)) - Number(hasUsableImage(a));
    if (imageDelta !== 0) return imageDelta;

    const timeDelta = getArticleSortTime(b) - getArticleSortTime(a);
    if (timeDelta !== 0) return timeDelta;

    return String(a.title_en || "").localeCompare(String(b.title_en || ""));
  });
}

function keepRecentItems(items, retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  return items.filter((item) => {
    const publishedAt = parseDate(item.published_at)?.getTime() || 0;
    const lastSeenAt = parseDate(item.last_seen_at)?.getTime() || 0;
    const firstSeenAt = parseDate(item.first_seen_at)?.getTime() || 0;
    const effectiveTime = Math.max(publishedAt, lastSeenAt, firstSeenAt);
    return effectiveTime >= cutoff;
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
  const resolvedSourceLogo = sourceLogo || SOURCE_META[source]?.logo || "";

  return normalizeArticle({
    title_en: article.title_en,
    image: normalizeImageUrl(article.image),
    url: article.url,
    source,
    source_logo: resolvedSourceLogo,
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
    }, "Motor1"));
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
    ...(await fetchRssFeed("https://www.motor1.com/rss/google/news/", "Motor1", SOURCE_META.Motor1.logo)),
    ...(await fetchRssFeed("https://www.motor1.com/rss/google/reviews/", "Motor1", SOURCE_META.Motor1.logo)),
    ...(await fetchRssFeed("https://www.motor1.com/rss/google/features/", "Motor1", SOURCE_META.Motor1.logo))
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
    }, "The Drive"));
  });

  const rssItems = await fetchRssFeed(
    "https://www.thedrive.com/feed",
    "The Drive",
    SOURCE_META["The Drive"].logo
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
    }, "Best Car Web"));
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
    }, "Response.jp"));
  });

  const deduped = sortByFreshness(dedupe(items)).slice(0, SOURCE_LIMIT);
  return await enrichItemsWithArticleImages(deduped, {
    source: "Response.jp",
    onlyWhenSized: true
  });
}

async function fetchVespaPress() {
  const base = "https://press.piaggiogroup.com/";
  const listingUrl = "https://press.piaggiogroup.com/en_EN/post/index";
  const html = await fetchHtml(listingUrl, { allowCurlFallback: true });
  const $ = cheerio.load(html);
  const items = [];

  $(".pagination_item.public").each((_, el) => {
    const card = $(el);
    const titleLink = card.find(".row.title a[href*='/post/show/']").first();
    const title = cleanText(titleLink.text());
    const href = absoluteUrl(base, titleLink.attr("href"));
    const brand = cleanText(card.find(".row.date h6").first().text());
    const description = cleanText(card.find(".description p").first().text());
    const imageNode = card.find(".animated-thumbnails img").first();
    const image =
      imageNode.attr("data-original") ||
      imageNode.attr("data-src") ||
      imageNode.attr("src");

    const combinedText = [title, brand, description].join(" ").toLowerCase();

    if (!href || !title) return;
    if (!href.includes("/post/show/")) return;
    if (!combinedText.includes("vespa")) return;

    items.push(createArticleItem({
      title_en: title,
      image: absoluteUrl(base, image),
      url: href
    }, "Vespa", SOURCE_META.Vespa.logo, "bike"));
  });

  return sortByFreshness(dedupe(items)).slice(0, SOURCE_LIMIT);
}

async function fetchVespaWorldClub() {
  const base = "https://vespaworldclub.org/";
  const apiUrl = "https://vespaworldclub.org/wp-json/wp/v2/posts?per_page=20&_embed";
  const raw = await fetchHtml(apiUrl, { allowCurlFallback: true });
  const posts = JSON.parse(raw);

  return sortByFreshness(dedupe(posts.map((post) => {
    const embeddedMedia = post?._embedded?.["wp:featuredmedia"]?.[0];
    const image =
      embeddedMedia?.source_url ||
      embeddedMedia?.media_details?.sizes?.medium_large?.source_url ||
      embeddedMedia?.media_details?.sizes?.medium?.source_url ||
      "";

    return createArticleItem({
      title_en: cleanText(post?.title?.rendered || ""),
      image,
      url: absoluteUrl(base, post?.link),
      published_at: post?.date_gmt ? `${post.date_gmt}Z` : post?.date
    }, "Vespa", SOURCE_META.Vespa.logo, "bike");
  }))).slice(0, SOURCE_LIMIT);
}

async function fetchInsideEvsNews() {
  return await fetchRssFeed(
    "https://insideevs.com/rss/news/all/",
    "InsideEVs",
    SOURCE_META.InsideEVs.logo
  );
}

async function fetchElectrekEv() {
  return await fetchRssFeed(
    "https://electrek.co/guides/electric-vehicles/feed/",
    "Electrek",
    SOURCE_META.Electrek.logo
  );
}

async function fetchTopGearElectric() {
  const base = "https://www.topgear.com/";
  const html = await fetchHtml("https://www.topgear.com/car-news/electric", { allowCurlFallback: true });
  const $ = cheerio.load(html);
  const seen = new Set();
  const items = [];

  $('a[href^="/car-news/electric/"]').each((_, el) => {
    const href = absoluteUrl(base, $(el).attr("href"));
    const title = cleanText($(el).text());
    if (!href || !title || seen.has(href)) return;
    seen.add(href);

    items.push(createArticleItem({
      title_en: title,
      image: "",
      url: href
    }, "Top Gear EV", SOURCE_META["Top Gear EV"].logo, "ev"));
  });

  return sortByFreshness(dedupe(items)).slice(0, SOURCE_LIMIT);
}

async function fetchCarAndDriverEv() {
  const base = "https://www.caranddriver.com/";
  const html = await fetchHtml("https://www.caranddriver.com/ev/", { allowCurlFallback: true });
  const $ = cheerio.load(html);
  const seen = new Set();
  const items = [];

  $('a[href^="/"]').each((_, el) => {
    const href = absoluteUrl(base, $(el).attr("href"));
    const title = cleanText($(el).text());
    if (!href || !title || seen.has(href)) return;
    if (!/caranddriver\.com\/(news|reviews|features|shopping-advice|comparison-test|ev)\//.test(href)) return;
    if (title.length < 14) return;
    seen.add(href);

    items.push(createArticleItem({
      title_en: title,
      image: "",
      url: href
    }, "Car and Driver EV", SOURCE_META["Car and Driver EV"].logo, "ev"));
  });

  return sortByFreshness(dedupe(items)).slice(0, SOURCE_LIMIT);
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
    fetchResponseHome(),
    fetchVespaPress(),
    fetchVespaWorldClub(),
    fetchInsideEvsNews(),
    fetchElectrekEv(),
    fetchTopGearElectric(),
    fetchCarAndDriverEv()
  ]);

  const names = [
    "Motor1",
    "The Drive",
    "Best Car Web",
    "Response.jp",
    "Vespa Press",
    "Vespa World Club",
    "InsideEVs",
    "Electrek",
    "Top Gear EV",
    "Car and Driver EV"
  ];

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
  const recentFeed = sortByFreshness(keepRecentItems(archive, FEED_RETENTION_DAYS));
  const outputFeed = recentFeed.slice(0, OUTPUT_LIMIT);

  fs.writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2), "utf-8");
  fs.writeFileSync(ARTICLES_PATH, JSON.stringify(outputFeed, null, 2), "utf-8");

  console.log(`🎉 当前抓到 ${currentFeed.length} 条，本地归档保留 ${archive.length} 条，最近 ${FEED_RETENTION_DAYS} 天输出 ${outputFeed.length} 条到 data/articles.json`);
}

main().catch((err) => {
  console.error("❌ 总报错：", err.message);
});
