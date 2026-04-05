function normalizeTitleForDedup(title) {
  if (!title) return "";

  // 移除日期模式：YYYY.MM.DD, YYYY-MM-DD, YYYY/MM/DD, YYYY年MM月DD日等
  let normalized = title.replace(/\d{4}[-\.\/]\d{1,2}[-\.\/]\d{1,2}/g, "");
  normalized = normalized.replace(/\d{4}年\d{1,2}月\d{1,2}日/g, "");

  // 移除常见的日期前缀如 "2026.4.2 " 或 "[2026.4.2]"
  normalized = normalized.replace(/\[\d{4}[\.\-]\d{1,2}[\.\-]\d{1,2}\]/g, "");
  normalized = normalized.replace(/\d{4}[\.\-]\d{1,2}[\.\-]\d{1,2}\s+/g, "");

  // 移除所有标点符号和特殊字符，保留字母、数字、空格
  normalized = normalized.replace(/[^\w\s]/g, " ");

  // 转换为小写
  normalized = normalized.toLowerCase();

  // 合并多个空格为单个空格
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

function createDedupe({ normalizeArticle, isLikelyArticle, parseDate }) {
  function isWithin48Hours(time1, time2) {
    if (!time1 || !time2) return false;

    const date1 = parseDate(time1);
    const date2 = parseDate(time2);
    if (!date1 || !date2) return false;

    const diffHours = Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60 * 60);
    return diffHours <= 48;
  }

  function dedupe(items) {
    const urlMap = new Map();
    const titleSourceMap = new Map(); // key: `${source}|${normalizedTitle}` -> item

    for (const rawItem of items) {
      const item = normalizeArticle(rawItem);
      if (!item.url) continue;
      if (!isLikelyArticle(item)) continue;

      // 1. URL 去重（现有逻辑）
      const existingByUrl = urlMap.get(item.url);
      if (existingByUrl) {
        // 合并现有项
        urlMap.set(item.url, {
          ...existingByUrl,
          ...item,
          first_seen_at: existingByUrl.first_seen_at || item.first_seen_at,
          last_seen_at: item.last_seen_at || existingByUrl.last_seen_at
        });
        continue;
      }

      // 2. 标题标准化去重
      const normalizedTitle = normalizeTitleForDedup(item.title_en);
      const titleSourceKey = `${item.source}|${normalizedTitle}`;

      let shouldSkip = false;
      let existingByTitle = titleSourceMap.get(titleSourceKey);

      if (existingByTitle && normalizedTitle.length > 5) {
        // 检查是否在48小时内
        const timeField = item.published_at || item.first_seen_at || item.last_seen_at;
        const existingTimeField = existingByTitle.published_at || existingByTitle.first_seen_at || existingByTitle.last_seen_at;

        if (isWithin48Hours(timeField, existingTimeField)) {
          // 保留较新的文章
          const itemTime = parseDate(timeField)?.getTime() || 0;
          const existingTime = parseDate(existingTimeField)?.getTime() || 0;

          if (itemTime > existingTime) {
            // 新文章时间更晚，替换旧条目
            titleSourceMap.set(titleSourceKey, item);
            // 也需要从 urlMap 中移除旧条目（如果存在）
            if (existingByTitle.url && urlMap.has(existingByTitle.url)) {
              urlMap.delete(existingByTitle.url);
            }
          } else {
            // 已有文章时间更晚或相同，跳过新文章
            shouldSkip = true;
          }
        }
      }

      if (!shouldSkip) {
        urlMap.set(item.url, item);
        if (normalizedTitle.length > 5) {
          titleSourceMap.set(titleSourceKey, item);
        }
      }
    }

    return Array.from(urlMap.values());
  }

  return dedupe;
}

module.exports = { createDedupe, normalizeTitleForDedup };