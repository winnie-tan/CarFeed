const fs = require("fs");

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

async function main() {
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
      temperature: 0,
      max_tokens: 8,
      messages: [
        {
          role: "user",
          content: "Reply with OK"
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`DeepSeek API ${response.status}${body ? ` ${body.slice(0, 200)}` : ""}`);
  }

  console.log(`DeepSeek key OK for model ${MODEL}`);
}

main().catch((error) => {
  console.error(`❌ DeepSeek 配置校验失败：${error.message}`);
  process.exit(1);
});
