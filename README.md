# CarFeed

一个用于聚合全球汽车文化资讯的静态信息流原型。

## 项目记录

除了本文件中的项目总览，阶段性推进记录单独沉淀在 [PROJECT_LOG.md](./PROJECT_LOG.md)。

当前最新一章：

- `2026-04-01` 自动翻译可验证化与 21:40 冒烟测试
- `2026-04-01` 自动抓取后增量翻译接入工作流
- `2026-04-01` 本地汉化预览、排序修正与 Response 图片修复
- `2026-03-31` 首页交互、Vespa 扩展与新能源板块落地
- 已完成一级页面反馈浮标、吸顶分类栏与 `新能源` 分类
- 已接入多条 EV 来源，Vespa 仍需继续补强稳定来源
- 二级内容当前仍以本地预览形态验证，但已接入 DeepSeek 增量翻译链路

## 项目定位

CarFeed 当前不是完整产品，而是一个面向后续产品化的内容聚合底座：

- 聚合多个汽车媒体站点内容
- 统一为本地 JSON 数据
- 提供本地网页预览
- 为后续 AI 摘要、翻译、推荐和信息流产品做输入层

## 当前进度

目前已经完成：

- 多来源抓取
  - Motor1
  - The Drive
  - Best Car Web
  - Response.jp
- 首页抓取与 RSS 补充抓取混合策略
- 本地数据归档
- 基础分类
  - `car`
  - `bike`
  - `custom`
  - `ev`
- 本地预览页面
  - 分类筛选
  - 搜索
  - 桌面端多列瀑布流
  - 手机端双列瀑布流
  - 吸顶分类栏
  - 一级页面反馈浮标
  - 卡片点击弹出本地预览弹层
- 本地汉化预览测试
  - DeepSeek 中文标题、摘要、要点与关键词预览
  - 免费翻译标题回退
  - 浏览器本地缓存翻译结果
  - 为后续通义 / 智谱等批处理方案验证交互结构
- 自动抓取后增量翻译
  - 每日自动抓取后补翻译未完成条目
  - 默认复用已生成的 `translations-deepseek.json`
  - 不再把 DeepSeek 翻译拆成单独的一次性工作流
  - 工作流会先校验 `DEEPSEEK_API_KEY` 与接口可用性，再进入抓取和翻译
  - 每次运行会写入 `data/automation-status.json`，记录抓取、翻译、构建是否成功
  - 当前已额外安排 `2026-04-01 21:40 CST` 的 `10` 条 DeepSeek 冒烟测试
- 图片质量修正
  - 对 `Best Car Web` 优先抓正文原图
  - 对 `Response.jp` 改为优先抓正文主图
  - 对历史归档中的缩略图做修复
  - 预览页增加图片缓存破除参数，避免浏览器继续显示旧缩略图
- 内容排序修正
  - 有图内容优先
  - 组内按最新时间降序展示
  - 无图内容统一沉底

## 当前数据策略

抓取脚本在 [scripts/fetch.js](./scripts/fetch.js)。

当前逻辑不是“每次覆盖旧数据，只保留少量新内容”，而是：

1. 从每个来源抓取一批最新文章
2. 与本地归档合并
3. 去重
4. 重新计算分类
5. 输出最近一批可用于前端展示的数据

对图片的当前处理策略：

1. 优先使用来源页面中可拿到的较大图片
2. 对常见缩略图 URL 做还原
3. 对 `Best Car Web` 这类站点，优先进入文章页抓正文第一张原图
4. 对 `Response.jp` 这类列表页缩略图裁切明显的站点，优先进入文章页抓正文主图
5. 修复归档中的历史图片，避免旧缩略图持续残留在页面里

当前前端展示顺序：

1. 有图文章排在前面
2. 同组内按最新时间倒序
3. 无图文章统一放在列表底部

当前默认参数：

- 单来源抓取上限：`30`
- 前端输出上限：`400`
- 本地归档上限：`3000`
- 前端最近内容保留窗口：`14 天`

这些值都在 [scripts/fetch.js](./scripts/fetch.js) 顶部常量中可调整。

当前前端不是只展示“今天抓到的内容”，而是默认输出最近 `14` 天内的内容，因此已经满足“至少看到一周以上信息”的要求。

## 项目结构

```text
CarFeed/
├── data/
│   ├── archive.json      # 本地归档历史
│   ├── articles.json     # 前端当前读取的数据
│   ├── automation-status.json # 自动抓取与翻译执行状态
│   ├── translations-deepseek.json # DeepSeek 中文结果
│   └── translations-free.json  # 本地免费翻译测试占位文件
├── scripts/
│   ├── fetch.js          # 抓取与归档脚本
│   ├── build-static.js   # 生成 dist 静态产物
│   ├── generate-deepseek-translations.js # DeepSeek 增量翻译脚本
│   ├── prepare-translation-targets.js # 生成待翻译队列与执行前状态
│   ├── finalize-automation-status.js # 汇总自动化执行结果
│   ├── validate-deepseek-config.js # 校验 DeepSeek Secret 与接口可用性
│   ├── generate-free-translations.js # 免费翻译实验脚本
│   └── generate-free-title-translations.sh # 免费标题翻译实验脚本
├── preview.html          # 本地预览页面
├── package.json
└── README.md
```

## 数据文件说明

### `data/articles.json`

用于前端页面直接读取。

### `data/archive.json`

用于保留历史抓取结果，避免每次刷新后旧文章消失。

### `data/translations-free.json`

用于本地免费翻译测试。

当前仅作为浏览器端预览的补充数据占位，不代表已经完成正式的离线全量翻译。

### `data/translations-deepseek.json`

用于保存 DeepSeek 生成的中文标题、短摘要、长概述、要点和关键词。

当前自动化策略不是每天重跑全部历史，而是随抓取流程一起补齐尚未完成翻译的条目。

### `data/automation-status.json`

用于记录 GitHub Actions 自动抓取与翻译的执行状态。

当前会记录：

- 本次运行前前端文章池里已有多少条 DeepSeek 翻译
- 本次待翻译队列有多少条
- 抓取、翻译、构建分别是否成功
- 本次运行结束后，仍有多少条前端内容未完成 DeepSeek 翻译

每条数据当前包含：

```json
{
  "title_en": "...",
  "image": "...",
  "url": "...",
  "source": "Motor1",
  "source_logo": "...",
  "time": "2026.3.29",
  "category": "car",
  "published_at": "2026-03-29T00:00:00.000Z",
  "first_seen_at": "2026-03-29T08:46:26.522Z",
  "last_seen_at": "2026-03-29T08:46:34.981Z"
}
```

## 本地使用方式

### 1. 安装依赖

```bash
npm install
```

### 2. 运行抓取

```bash
node scripts/fetch.js
```

运行后会更新：

```text
data/articles.json
data/archive.json
```

如果需要本地补跑 DeepSeek 翻译：

```bash
npm run translate:deepseek
```

默认会读取当前 `data/articles.json`，并跳过已经有长摘要的条目，只补尚未完成翻译的内容。

如果需要先校验 DeepSeek 配置：

```bash
node scripts/validate-deepseek-config.js
```

如果需要本地静态构建：

```bash
npm run build
```

### 3. 启动预览

```bash
python3 -m http.server 4176 --bind 0.0.0.0
```

浏览器打开：

```text
http://127.0.0.1:4176/preview.html
```

如果手机和电脑在同一个 Wi‑Fi，也可以通过局域网 IP 访问：

```text
http://<你的局域网IP>:4176/preview.html
```

如果你已经在浏览器里打开过旧版本页面，建议在看到图片没有变化时优先尝试：

```bash
Cmd+Shift+R
```

因为 `preview.html` 当前会对 `articles.json` 和图片本身都追加缓存破除参数，但浏览器仍可能短暂保留旧资源。

## Cloudflare Pages 部署

当前仓库已经补齐静态构建脚本，可直接用于 Cloudflare Pages。

构建命令：

```bash
npm run build
```

构建输出目录：

```text
dist
```

构建产物说明：

- `dist/index.html`
  - 由 `preview.html` 生成，用作站点首页
- `dist/preview.html`
  - 保留预览入口，便于继续沿用原页面路径
- `dist/data/*.json`
  - 当前会复制 `data/` 下全部 JSON，包括测试用翻译文件

如果 Cloudflare Pages 之前失败在 `npm run build`，重新部署后应可继续进入静态发布流程。

## 自动抓取与自动发布

仓库已补充 GitHub Actions 定时任务：

- 文件路径：`.github/workflows/refresh-feed.yml`
- 触发方式：
  - 每天 `00:00 UTC`
  - 每天 `12:00 UTC`
  - 手动触发 `workflow_dispatch`

这对应中国时区大致为：

- `08:00`
- `20:00`

任务会自动执行：

1. `npm ci`
2. `node scripts/fetch.js`
3. `npm run translate:deepseek -- --limit 400`
4. `npm run build`
5. 提交 `data/*.json` 与 `dist/` 的更新
6. 推送到仓库，触发 Cloudflare Pages 重新部署

如果后续希望改成别的时间，只需要调整工作流中的 `cron`。

## 当前实验项

截至 `2026-04-01`，仓库中还包含一版仅用于本地验证的“免费翻译预览”实验：

- 如果存在 `data/translations-deepseek.json`，预览页会优先使用 DeepSeek 结果
- `preview.html` 仍会读取 `data/translations-free.json` 作为补充回退
- 如果本地没有有效翻译结果，会在浏览器端调用免费翻译端点尝试翻译标题
- 结果缓存在浏览器 `localStorage`

当前也已补入本地 DeepSeek 试运行脚本：

```bash
npm run translate:deepseek
```

默认会处理当前前端文章池中的条目，并输出到：

```text
data/translations-deepseek.json
```

如果只想限制处理量：

```bash
node scripts/generate-deepseek-translations.js --limit 20
```

如果想强制重跑已有条目：

```bash
node scripts/generate-deepseek-translations.js --limit 20 --force
```

这条路径的目的不是正式上线，而是验证：

1. 首页卡片是否应该直接显示中文标题
2. 点击卡片后是否应该先展示站内中文弹层，而不是立刻跳原文
3. 自动抓取后的增量翻译链路是否稳定
4. 后续如果切换到 `通义 / 智谱`，前端信息结构是否已经合理

这意味着当前仓库里已经具备“抓取 -> 增量翻译 -> 静态发布”的基础链路，但仍处于效果验证阶段，不等于已经完成成熟的正式内容生产系统。

## 微信传播判断

当前更稳妥的路线不是继续只靠“微信里直接打开外链”，而是分成两层：

1. 短期继续保留当前 H5 站点
2. 中期增加微信小程序入口，把 H5 作为小程序里的承载页或备用页

原因：

- H5 外链在微信内仍可能受风控、缓存、投诉或分享链路影响
- 即使一次恢复成功，也不代表后续不会再次触发
- 小程序入口通常比纯外链更稳定，尤其适合作为微信内主传播入口

但要注意：

- 小程序不是“零成本替代”
- 如果要在小程序里直接承载现有站点，通常需要配置业务域名
- 如果要把体验做稳，最终更适合把信息流页面原生实现成小程序页面，而不是长期只包一层 `web-view`

## 当前来源

当前稳定接入的来源：

- `Motor1`
- `The Drive`
- `Best Car Web`
- `Response.jp`
- `Vespa`
- `InsideEVs`
- `Electrek`
- `Top Gear EV`
- `Car and Driver EV`

下一批优先准备接入的来源：

- `Car Watch`
- `Speedhunters`
- `Cycle World`
- `RideApart`

候选扩展：

- `Visordown`
- `Motorcycle.com`
- `Top Gear`
- `Autocar`
- `Jalopnik`
- `Carscoops`

## 当前限制

当前版本仍然是原型，存在这些明显限制：

- 还不是自动实时刷新
  - 需要手动运行 `node scripts/fetch.js`
- 分类仍然依赖规则匹配
  - `bike` 和 `custom` 目前已有内容，但数量还偏少
- 部分来源仍然偏汽车主站
  - `摩托 / 改装` 分类需要更垂直的数据源才能真正做厚
- 当前没有后端服务
  - 只是本地脚本 + 静态预览页
- 当前没有正式部署方案
  - 目前仓库已进入可部署阶段，但部署流程和内容同步仍需手动确认
- `Best Car Web` 的图片规则已经做了专项优化
  - 但不同栏目页面结构并不完全一致，后续仍建议继续拆成站点专用抓取器
- `Vespa` 当前稳定自动抓取来源仍然偏少
  - `Piaggio Group Press` 当前可稳定产出
  - `Vespa World Club` 当前未稳定产出文章条目
  - `SIP Scootershop` 当前被 Cloudflare challenge 拦截，不适合作为稳定自动抓取源
- 一级页面反馈浮标已经上线
  - 但真实问卷链接尚未填入
- 微信内长按卡片分享仍不适合作为最终方案
  - 后续需要改成更适合微信的分享或反馈交互

## 为什么现在内容量比之前更多

之前的实现偏向“抓首页卡片”，所以经常只能拿到很少的内容。

现在内容量提升主要来自三点：

- `Motor1` 增加了更多首页区块解析
- `Motor1 / The Drive` 增加 RSS 补充
- 增加本地归档，不再只显示“这一次刚抓到”的少量数据

## EdgeOne / GitHub 同步

如果只是更新本地数据与页面，推荐顺序：

```bash
node scripts/fetch.js
```

确认本地预览无误后，再同步到 GitHub：

```bash
git add .
git commit -m "update carfeed"
git push origin main
```

如果你的 EdgeOne Pages 项目是通过 Git 仓库连接创建的，推送后会自动触发部署。

如果你的 EdgeOne Pages 项目是通过手动上传创建的，则需要在控制台重新上传项目目录或创建新的 deployment。

## 下一步建议

优先级最高的方向：

- 增加更垂直的数据源
  - 摩托站
  - 改装站
- 继续扩充 Vespa 稳定来源
- 优化 `新能源` 分类精度与来源覆盖
- 增加时间维度筛选
  - 今日
  - 最近 3 天
  - 历史
- 增加自动刷新机制
  - 定时抓取
  - 常驻服务
- 增加正式部署
  - 让多人稳定访问，不依赖本地手动启动
- 增加二级页承接
  - AI 摘要
  - 收藏 / 稍后读
  - 多来源聚合

## 备注

当前仓库里的 [preview.html](./preview.html) 主要用于快速验证数据和页面结构，不代表最终产品视觉稿。
