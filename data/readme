# 🚗 CarFeed

一个用于聚合全球汽车文化资讯的本地信息流系统。

---

## 🧠 项目定位

CarFeed 不是一个传统网站，而是一个：

👉 **信息聚合 + 数据结构化 + AI输入源系统**

核心目标：

* 抓取多个汽车网站首页内容
* 转换为统一 JSON 数据结构
* 用于：

  * 本地浏览（preview）
  * AI 分析输入
  * 信息流构建

---

## 📦 当前能力

已实现：

* 抓取网站首页（非 RSS）
* 多数据源整合（部分）
* 本地 JSON 数据存储
* 简单前端预览（瀑布流）

---

## 📁 项目结构

```
CarFeed/
├── data/                # 数据输出
│   └── articles.json
├── scripts/             # 抓取脚本
│   └── fetch.js
├── preview.html         # 本地预览页面
├── package.json
└── README.md
```

---

## ⚙️ 使用方式

### 1️⃣ 安装依赖

```
npm install
```

---

### 2️⃣ 运行抓取

```
node scripts/fetch.js
```

生成：

```
data/articles.json
```

---

### 3️⃣ 启动预览

```
serve .
```

打开：

```
http://localhost:3000/preview.html
```

---

## 🧩 数据结构

```json
{
  "title_en": "...",
  "image": "...",
  "url": "...",
  "source": "Motor1",
  "source_logo": "...",
  "time": "2026.3.29",
  "category": "car"
}
```

---

## 🚧 当前问题

1. Motor1 首页抓取不稳定（DOM 变化）
2. 多网站抓取规则不统一
3. 分类（car / bike / custom）尚未完善
4. logo 来源不稳定
5. UI 仍为 prototype

---

## 🎯 下一步目标（交给 Codex）

### 数据层

* [ ] 修复 Motor1 首页抓取
* [ ] 稳定多网站解析规则
* [ ] 增加更多数据源：

  * The Drive
  * Speedhunters
  * Car Watch
* [ ] 自动分类（car / bike / custom）

---

### 前端层

* [ ] 优化瀑布流布局
* [ ] 添加分类筛选
* [ ] 添加搜索
* [ ] 优化移动端体验

---

### AI层（后期）

* [ ] 自动翻译标题
* [ ] 自动摘要
* [ ] 生成 AI feed

---

## 🧠 开发方式

本项目后续开发方式：

👉 **主要由 Codex CLI 接管开发**

推荐工作流：

```
codex
→ 阅读 README
→ 改写 scripts/fetch.js
→ 优化 preview.html
→ 迭代数据结构
```

---

## 🚀 项目愿景

构建一个：

👉 类似「小红书 + RSS + AI输入层」的汽车信息系统

---
