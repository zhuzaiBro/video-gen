# Gemini Digital Human Agent (数字人视频生成平台)

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

一个高端精致的数字人 AI 视频生成平台，集成 Google Gemini Veo 3.1 API、LLM 能力、Supabase 数据库和腾讯云 COS 存储，支持数字人人设管理与多种模式的智能视频生成。

## 🌟 项目愿景

我们的目标是创建一个**易用、高效、专业**的数字人视频生成工具，为内容创作者、营销团队和企业提供 AI 驱动的视频生成能力。通过数字人人设管理和智能提示词扩展，让用户能够快速生成高质量、风格一致的数字人视频。我们欢迎任何形式的贡献，无论是修复 Bug、增加新功能，还是改进文档。

## ✨ 核心功能

### 1. 数字人人设管理
- 创建、编辑、删除数字人人设
- 人设属性包含：名称、外貌描述、性格特征、声音风格、背景故事等
- 支持上传参考图片作为人设素材
- 人设库管理和快速查询

### 2. 三种视频生成模式

#### 📝 提示词生成
- 用户输入自定义提示词
- 调用 Veo 3.1 API 生成视频
- 支持设置视频时长、分辨率、宽高比

#### 🖼️ 参考图片生成
- 上传 1-3 张参考图片
- 结合提示词调用 Veo 3.1 API
- 生成结果与参考图片风格保持一致

#### 🤖 人设 Agent 生成（智能模式）
- 选择已有数字人人设
- LLM 自动根据人设属性扩写提示词
- 调用 Veo 3.1 生成符合人设的视频
- 支持用户补充自定义方向

### 3. 任务队列与进度追踪
- 展示生成中、已完成、失败的任务列表
- 支持查看生成进度
- 提供下载与预览生成结果

### 4. 视频历史记录库
- 按人设或时间维度筛选浏览
- 支持视频预览与管理
- 收藏、下载、删除等操作

### 5. 智能存储与管理
- 使用腾讯云 COS 存储所有媒体资产
- 参考图片和生成视频持久化保存
- CDN 加速访问

## 🚀 快速入门

### 环境要求

在开始之前，请确保您的本地环境已安装：
- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Git
- PostgreSQL 客户端（可选）

### 本地运行

1. **克隆仓库**
   ```bash
   git clone https://github.com/zhuzaiBro/video-gen.git
   cd video-gen
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **配置环境变量**
   
   创建 `.env.local` 文件并填入以下变量：
   ```env
   # Supabase PostgreSQL
   DATABASE_URL=postgresql://user:password@db.supabase.co:5432/postgres
   
   # Gemini API
   GEMINI_API_KEY=your_gemini_api_key
   
   # 腾讯云 COS
   TENCENT_COS_SECRET_ID=your_secret_id
   TENCENT_COS_SECRET_KEY=your_secret_key
   TENCENT_COS_BUCKET=your_bucket_name
   TENCENT_COS_REGION=ap-shanghai
   TENCENT_COS_CDN_URL=https://your_cdn_domain.com (可选)
   
   # Manus OAuth (自动注入)
   VITE_APP_ID=xxx
   OAUTH_SERVER_URL=https://api.manus.im
   JWT_SECRET=xxx
   ```

4. **初始化数据库**
   ```bash
   pnpm drizzle-kit migrate
   ```

5. **启动开发服务器**
   ```bash
   pnpm dev
   ```

   服务器将在 `http://localhost:3000` 启动

## 📂 项目结构

了解项目的文件组织方式有助于您快速定位代码：

| 目录/文件 | 说明 |
| :--- | :--- |
| `client/src/` | React 前端源代码 |
| `client/src/pages/` | 页面组件（首页、人设管理、视频生成、历史记录） |
| `client/src/components/` | 可复用 UI 组件 |
| `server/` | Express 后端源代码 |
| `server/routers/` | tRPC API 路由（人设、视频生成、历史记录） |
| `drizzle/` | 数据库 schema 和迁移文件 |
| `drizzle/schema.ts` | PostgreSQL 数据库表定义 |
| `package.json` | 项目配置文件及依赖管理 |
| `DEPLOYMENT.md` | 部署指南和配置说明 |
| `CONTRIBUTING.md` | 贡献指南 |

## 🏗️ 技术栈

- **前端**: React 19 + Tailwind CSS 4 + shadcn/ui
- **后端**: Express 4 + tRPC 11 + Node.js
- **数据库**: Supabase (PostgreSQL)
- **文件存储**: 腾讯云 COS (对象存储)
- **AI 能力**: 
  - Google Gemini Veo 3.1 (视频生成)
  - LLM (提示词扩展)
- **认证**: Manus OAuth

## 📖 文档

- [部署指南](DEPLOYMENT.md) - 详细的部署配置和环境变量说明
- [API 文档](docs/API.md) - 后端 API 端点详解
- [贡献指南](CONTRIBUTING.md) - 如何参与项目开发

## 🔧 开发命令

```bash
# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 启动生产服务器
pnpm start

# 运行测试
pnpm test

# 类型检查
pnpm check

# 代码格式化
pnpm format

# 生成数据库迁移
pnpm drizzle-kit generate

# 执行数据库迁移
pnpm drizzle-kit migrate
```

## 🤝 参与贡献

我们非常看重社区的贡献。在您开始编写代码之前，请先阅读我们的 [贡献指南 (CONTRIBUTING.md)](CONTRIBUTING.md)。

### 贡献流程

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📝 项目状态

### 已完成
- ✅ 数据库 schema 设计
- ✅ 后端 API 框架
- ✅ Gemini API 集成
- ✅ 腾讯云 COS 存储适配器
- ✅ 前端页面框架

### 开发中
- 🚧 参考图片上传功能
- 🚧 异步任务轮询机制
- 🚧 前端交互优化
- 🚧 测试覆盖

### 计划中
- 📋 视频预览功能
- 📋 批量生成支持
- 📋 高级人设模板库
- 📋 分析和统计面板

## 🐛 问题报告

如果您发现了 Bug 或有功能建议，请 [创建 Issue](https://github.com/zhuzaiBro/video-gen/issues)。

## 📄 开源协议

本项目基于 [MIT](LICENSE) 协议开源。

## 📞 联系方式

- 提交 Issue: [GitHub Issues](https://github.com/zhuzaiBro/video-gen/issues)
- 讨论功能: [GitHub Discussions](https://github.com/zhuzaiBro/video-gen/discussions)

---

**Made with ❤️ by the Gemini Digital Human Agent Team**
