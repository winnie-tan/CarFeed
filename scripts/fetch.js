const fs = require("fs");
const cheerio = require("cheerio");

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

function formatDate() {
  const d = new Date();
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "en-US,en;q=0.9,ja;q=0.8"
    }
  });

  if (!res.ok) {
    throw new Error(`${url} 返回 ${res.status}`);
  }

  return await res.text();
}

function dedupe(items) {
  const map = new Map();
  for (const item of items) {
    if (!item.url) continue;
    if (!map.has(item.url)) {
      map.set(item.url, item);
    }
  }
  return Array.from(map.values());
}

async function fetchMotor1Home() {
  const base = "https://www.motor1.com/";
  const html = await fetchHtml(base);
  const $ = cheerio.load(html);
  const items = [];

  $("a").each((_, el) => {
    const href = absoluteUrl(base, $(el).attr("href"));
    const title =
      cleanText($(el).find("h1,h2,h3,h4").first().text()) ||
      cleanText($(el).attr("title"));
    const image =
      absoluteUrl(base, $(el).find("img").first().attr("src")) ||
      absoluteUrl(base, $(el).find("img").first().attr("data-src"));

    if (!href || !title || !image) return;
    if (!href.includes("motor1.com")) return;
    if (title.length < 8) return;

    items.push({
      title_en: title,
      image,
      url: href,
      source: "Motor1",
      source_logo: "https://www.google.com/s2/favicons?domain=motor1.com&sz=64",
      time: formatDate(),
      category: "car"
    });
  });

  return dedupe(items).slice(0, 15);
}

async function fetchTheDriveHome() {
  const base = "https://www.thedrive.com/";
  const html = await fetchHtml(base);
  const $ = cheerio.load(html);
  const items = [];

  $("a").each((_, el) => {
    const href = absoluteUrl(base, $(el).attr("href"));
    const title =
      cleanText($(el).find("h1,h2,h3,h4").first().text()) ||
      cleanText($(el).attr("title"));
    const image =
      absoluteUrl(base, $(el).find("img").first().attr("src")) ||
      absoluteUrl(base, $(el).find("img").first().attr("data-src"));

    if (!href || !title || !image) return;
    if (!href.includes("thedrive.com")) return;
    if (title.length < 8) return;

    items.push({
      title_en: title,
      image,
      url: href,
      source: "The Drive",
      source_logo: "https://www.google.com/s2/favicons?domain=thedrive.com&sz=64",
      time: formatDate(),
      category: "car"
    });
  });

  return dedupe(items).slice(0, 15);
}

async function fetchBestCarWebHome() {
  const base = "https://bestcarweb.jp/";
  const html = await fetchHtml(base);
  const $ = cheerio.load(html);
  const items = [];

  $("a").each((_, el) => {
    const href = absoluteUrl(base, $(el).attr("href"));
    const title =
      cleanText($(el).find("h1,h2,h3,h4,p").first().text()) ||
      cleanText($(el).attr("title"));
    const image =
      absoluteUrl(base, $(el).find("img").first().attr("src")) ||
      absoluteUrl(base, $(el).find("img").first().attr("data-src"));

    if (!href || !title || !image) return;
    if (!href.includes("bestcarweb.jp")) return;
    if (title.length < 6) return;

    items.push({
      title_en: title,
      image,
      url: href,
      source: "Best Car Web",
      source_logo: "https://www.google.com/s2/favicons?domain=bestcarweb.jp&sz=64",
      time: formatDate(),
      category: "car"
    });
  });

  return dedupe(items).slice(0, 15);
}

async function fetchResponseHome() {
  const base = "https://response.jp/";
  const html = await fetchHtml(base);
  const $ = cheerio.load(html);
  const items = [];

  $("a").each((_, el) => {
    const href = absoluteUrl(base, $(el).attr("href"));
    const title =
      cleanText($(el).find("h1,h2,h3,h4,p").first().text()) ||
      cleanText($(el).attr("title"));
    const image =
      absoluteUrl(base, $(el).find("img").first().attr("src")) ||
      absoluteUrl(base, $(el).find("img").first().attr("data-src"));

    if (!href || !title || !image) return;
    if (!href.includes("response.jp")) return;
    if (title.length < 6) return;

    items.push({
      title_en: title,
      image,
      url: href,
      source: "Response.jp",
      source_logo: "https://www.google.com/s2/favicons?domain=response.jp&sz=64",
      time: formatDate(),
      category: "car"
    });
  });

  return dedupe(items).slice(0, 15);
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

  const merged = dedupe(
    results
      .filter(r => r.status === "fulfilled")
      .flatMap(r => r.value)
  );

  fs.writeFileSync(
    "./data/articles.json",
    JSON.stringify(merged, null, 2),
    "utf-8"
  );

  console.log(`🎉 最终写入 ${merged.length} 条到 data/articles.json`);
}

main().catch((err) => {
  console.error("❌ 总报错：", err.message);
});