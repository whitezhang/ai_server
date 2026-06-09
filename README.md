# ai_server

GitHub Trending 定时爬虫与查询 API 服务

## 功能特性

- 定时抓取 GitHub Trending 页面（支持 daily/weekly/monthly）
- 支持按编程语言过滤
- SQLite 持久化存储
- RESTful API 查询接口
- 自动去重，每天同一类型只抓取一次

## 环境要求

- Node.js >= 22

## 安装

```bash
npm install
```

## 运行

```bash
# 生产模式
npm start

# 开发模式（自动重启）
npm run dev
```

## 配置

通过环境变量配置：

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `PORT` | 服务端口 | `8080` |
| `DB_PATH` | 数据库路径 | `./data/trends.db` |
| `FETCH_INTERVAL` | 抓取间隔 | `10m` |
| `FETCH_PERIODS` | 抓取周期列表 | `daily,weekly,monthly` |
| `FETCH_LANGUAGES` | 抓取语言列表 | `` (空，表示全部) |
| `FETCH_DELAY_MS` | 抓取间隔延迟 | `2000` |
| `USER_AGENT` | 请求 User-Agent | `ai-server-github-trends/1.0` |

示例：

```powershell
$env:PORT=8081
$env:FETCH_INTERVAL="30m"
$env:FETCH_LANGUAGES="javascript,python,go"
npm start
```

## API 接口

### 健康检查

```
GET /health
```

响应示例：
```json
{ "status": "ok" }
```

### 统计信息

```
GET /api/v1/stats
```

响应示例：
```json
{
  "snapshot_count": 100,
  "repo_count": 2500,
  "date_count": 30,
  "first_date": "2024-01-01",
  "last_date": "2024-01-30",
  "last_captured_at": "2024-01-30T10:00:00.000Z"
}
```

### 获取 Trending 数据

```
GET /api/v1/trends?since=daily&language=javascript&date=2024-01-30
```

参数：
- `since` - 周期：`daily`、`weekly`、`monthly`（必填）
- `language` - 编程语言过滤（可选）
- `date` - 指定日期，格式 `YYYY-MM-DD`（可选，默认今天或最新）

响应示例：
```json
{
  "id": 1,
  "date": "2024-01-30",
  "captured_at": "2024-01-30T10:00:00.000Z",
  "since": "daily",
  "language": "javascript",
  "repo_count": 25,
  "repos": [
    {
      "rank": 1,
      "owner": "facebook",
      "name": "react",
      "full_name": "facebook/react",
      "url": "https://github.com/facebook/react",
      "description": "A declarative, efficient, and flexible JavaScript library for building user interfaces.",
      "language": "JavaScript",
      "stars_total": 220000,
      "stars_today": 150,
      "forks": 45000
    }
  ]
}
```

### 获取可用日期列表

```
GET /api/v1/trends/dates?since=daily&language=&limit=30
```

参数：
- `since` - 周期过滤（可选）
- `language` - 语言过滤（可选）
- `limit` - 返回数量（可选，默认 30）

### 获取快照列表

```
GET /api/v1/trends/snapshots?since=daily&language=&date=&from=&to=&limit=30
```

参数：
- `since` - 周期过滤（可选）
- `language` - 语言过滤（可选）
- `date` - 指定日期（可选）
- `from` - 起始日期（可选）
- `to` - 结束日期（可选）
- `limit` - 返回数量（可选，默认 30）

### 获取单个快照

```
GET /api/v1/trends/snapshots/:id
```

### 手动触发抓取

```
POST /api/v1/fetch
```

响应示例：
```json
{ "message": "fetch started in background" }
```

## 项目结构

```
ai_server/
├── src/
│   ├── index.js      # 入口文件，启动服务
│   ├── config.js     # 配置加载与解析
│   ├── fetcher.js    # GitHub Trending 页面抓取与解析
│   ├── scheduler.js  # 定时任务调度器
│   ├── storage.js    # SQLite 数据存储
│   └── routes.js     # API 路由定义
├── data/             # 数据库文件目录（自动创建）
├── package.json
└── README.md
```

## 技术栈

- [Express](https://expressjs.com/) - Web 框架
- [Cheerio](https://cheerio.js.org/) - HTML 解析
- [Node.js SQLite](https://nodejs.org/api/sqlite.html) - 数据存储
