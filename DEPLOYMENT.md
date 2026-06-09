# Gemini Digital Human Agent - 部署指南

## 项目概述

这是一个高端精致的数字人视频生成平台，集成了 Google Gemini Veo 3.1 API、LLM 能力、Supabase 数据库和腾讯云 COS 存储。

## 技术栈

- **前端**: React 19 + Tailwind CSS 4 + shadcn/ui
- **后端**: Express 4 + tRPC 11 + Node.js
- **数据库**: Supabase (PostgreSQL)
- **文件存储**: 腾讯云 COS (对象存储)
- **AI 能力**: 
  - Google Gemini Veo 3.1 (视频生成)
  - LLM (提示词扩展)
- **认证**: Manus OAuth

## 环境变量配置

### 必需的环境变量

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

## 数据库初始化

1. **创建 Supabase 项目**
   - 访问 https://supabase.com
   - 创建新项目
   - 获取 DATABASE_URL

2. **运行迁移**
   ```bash
   pnpm drizzle-kit migrate
   ```

3. **验证表创建**
   - 5 个表已创建：users, personas, reference_images, video_generation_tasks, generated_videos
   - 3 个 enum 类型：role, task_status, generation_mode

## 文件存储配置

### 腾讯云 COS 设置

1. **创建存储桶**
   - 登录腾讯云控制台
   - 创建 COS 存储桶
   - 记录 Bucket 名称和地域

2. **配置 CORS**
   ```json
   {
     "AllowedOrigins": ["*"],
     "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
     "AllowedHeaders": ["*"],
     "MaxAgeSeconds": 3600
   }
   ```

3. **获取访问凭证**
   - 创建 API 密钥
   - 获取 SecretId 和 SecretKey

4. **配置 CDN（可选）**
   - 绑定 CDN 加速域名
   - 设置 TENCENT_COS_CDN_URL

## API 端点

### 人设管理
- `POST /api/trpc/personas.create` - 创建人设
- `GET /api/trpc/personas.list` - 获取人设列表
- `GET /api/trpc/personas.getById` - 获取人设详情
- `PATCH /api/trpc/personas.update` - 更新人设
- `DELETE /api/trpc/personas.delete` - 删除人设
- `POST /api/trpc/personas.uploadReferenceImage` - 上传参考图片

### 视频生成
- `POST /api/trpc/videoGeneration.generateFromPrompt` - 从提示词生成
- `POST /api/trpc/videoGeneration.generateFromReferenceImages` - 从参考图生成
- `POST /api/trpc/videoGeneration.generateFromPersona` - 从人设生成（Agent 模式）
- `GET /api/trpc/videoGeneration.getTask` - 获取任务详情
- `GET /api/trpc/videoGeneration.listTasks` - 获取任务列表
- `POST /api/trpc/videoGeneration.cancelTask` - 取消任务

### 历史记录
- `GET /api/trpc/history.listVideos` - 获取视频列表
- `POST /api/trpc/history.toggleFavorite` - 切换收藏
- `PATCH /api/trpc/history.updateMetadata` - 更新元数据
- `DELETE /api/trpc/history.deleteVideo` - 删除视频
- `GET /api/trpc/history.getDownloadUrl` - 获取下载 URL

## 前端页面

### 首页 (`/`)
- 未登录用户：功能介绍和登录入口
- 已登录用户：快速导航到各功能

### 人设管理 (`/personas`)
- 创建、编辑、删除数字人人设
- 上传参考图片
- 快速生成视频入口

### 视频生成 (`/generate`)
- **提示词模式**: 输入提示词生成视频
- **参考图模式**: 上传参考图片 + 提示词生成
- **人设 Agent 模式**: 选择人设，LLM 自动扩写提示词

### 历史记录 (`/history`)
- 浏览所有生成的视频
- 按人设筛选
- 下载、收藏、删除、分享操作

## 开发流程

### 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 运行测试
pnpm test

# 类型检查
pnpm check
```

### 代码结构

```
server/
├── routers/
│   ├── personas.ts           # 人设管理 API
│   ├── video-generation.ts   # 视频生成 API
│   └── history.ts            # 历史记录 API
├── db.ts                      # 数据库查询助手
├── storage-cos.ts             # 腾讯云 COS 存储适配器
├── gemini-video.ts            # Gemini API 集成
└── routers.ts                 # 主路由文件

client/src/
├── pages/
│   ├── Home.tsx              # 首页
│   ├── Personas.tsx          # 人设管理
│   ├── Generate.tsx          # 视频生成
│   └── History.tsx           # 历史记录
├── components/               # UI 组件
└── lib/trpc.ts              # tRPC 客户端

drizzle/
├── schema.ts                 # 数据库 schema
└── migrations/               # 迁移文件
```

## 关键实现

### 三种视频生成模式

1. **纯提示词模式**
   - 用户输入详细提示词
   - 直接调用 Veo 3.1 API
   - 支持设置时长、分辨率、宽高比

2. **参考图片模式**
   - 用户上传 1-3 张参考图片
   - 提供提示词指导生成
   - Veo 3.1 保持参考图风格

3. **人设 Agent 模式**
   - 选择已有数字人人设
   - LLM 根据人设属性自动扩写提示词
   - Veo 3.1 生成符合人设的视频
   - 支持用户补充方向

### 异步任务处理

- 所有视频生成任务都是异步的
- 任务状态：pending → processing → completed/failed
- 前端轮询获取任务状态
- 生成完成后自动保存到 COS 和数据库

### 文件存储策略

- **参考图片**: `personas/{personaId}/{timestamp}-{filename}`
- **生成视频**: `generated-videos/{taskId}/video.mp4`
- **临时文件**: `temp/{userId}/{tempId}`
- 所有文件都有 CDN 加速 URL

## 部署注意事项

1. **数据库连接**
   - 确保 Supabase 网络连接正确
   - 配置 IP 白名单（如需要）
   - 使用 SSL 连接

2. **文件存储**
   - 腾讯云 COS 凭证安全性
   - CDN 域名配置
   - 跨域资源共享 (CORS) 设置

3. **API 限制**
   - Gemini API 速率限制
   - 成本控制和监控
   - 任务队列管理

4. **性能优化**
   - 数据库查询优化
   - CDN 缓存策略
   - 前端代码分割

## 故障排除

### 数据库连接失败
- 检查 DATABASE_URL 格式
- 验证 Supabase 凭证
- 确保网络连接

### 文件上传失败
- 检查腾讯云 COS 凭证
- 验证存储桶名称和地域
- 检查 CORS 配置

### 视频生成失败
- 检查 Gemini API 密钥
- 验证提示词格式
- 检查参考图片格式

## 监控和日志

- 开发服务器日志: `.manus-logs/devserver.log`
- 浏览器控制台日志: `.manus-logs/browserConsole.log`
- 网络请求日志: `.manus-logs/networkRequests.log`

## 下一步

1. 配置所有必需的环境变量
2. 初始化 Supabase 数据库
3. 测试腾讯云 COS 连接
4. 测试 Gemini API 集成
5. 本地开发和测试
6. 部署到生产环境
