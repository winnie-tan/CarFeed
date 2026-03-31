# CarFeed

一个用于聚合全球汽车文化资讯的静态信息流原型。

## 项目记录

除了本文件中的项目总览，阶段性推进记录单独沉淀在 [PROJECT_LOG.md](./PROJECT_LOG.md)。

当前最新一章：

- `2026-03-30` 域名与部署路线定稿
- 正式域名确定为 `carfeed.forum`
- DNS 正在传播，下一步是 Cloudflare Pages 正式挂站

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
- 本地预览页面
  - 分类筛选
  - 搜索
  - 桌面端多列瀑布流
  - 手机端双列瀑布流
- 图片质量修正
  - 对 `Best Car Web` 优先抓正文原图
  - 对历史归档中的缩略图做修复
  - 预览页增加图片缓存破除参数，避免浏览器继续显示旧缩略图

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
4. 修复归档中的历史图片，避免旧缩略图持续残留在页面里

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
│   └── articles.json     # 前端当前读取的数据
├── scripts/
│   └── fetch.js          # 抓取与归档脚本
├── preview.html          # 本地预览页面
├── package.json
└── README.md
```

## 数据文件说明

### `data/articles.json`

用于前端页面直接读取。

### `data/archive.json`

用于保留历史抓取结果，避免每次刷新后旧文章消失。

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

### 3. 启动预览

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

浏览器打开：

```text
http://127.0.0.1:4173/preview.html
```

如果手机和电脑在同一个 Wi‑Fi，也可以通过局域网 IP 访问：

```text
http://<你的局域网IP>:4173/preview.html
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
- `dist/data/articles.json`
- `dist/data/archive.json`

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
3. `npm run build`
4. 提交 `data/*.json` 与 `dist/` 的更新
5. 推送到仓库，触发 Cloudflare Pages 重新部署

如果后续希望改成别的时间，只需要调整工作流中的 `cron`。

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
