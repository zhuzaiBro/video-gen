# 技术栈配置指南

## 数据库：Supabase (PostgreSQL)

### 配置步骤

1. **创建 Supabase 项目**
   - 访问 https://supabase.com
   - 创建新项目，选择 PostgreSQL 数据库
   - 获取连接字符串格式：`postgresql://user:password@host:port/database`

2. **环境变量配置**
   - `SUPABASE_URL`: Supabase 项目 URL
   - `SUPABASE_ANON_KEY`: 匿名密钥（前端使用）
   - `SUPABASE_SERVICE_ROLE_KEY`: 服务角色密钥（后端使用）
   - `DATABASE_URL`: PostgreSQL 连接字符串（用于 Drizzle ORM）

3. **Drizzle ORM 集成**
   - 已在项目中配置 `drizzle.config.ts`
   - 使用 PostgreSQL 驱动而非 MySQL
   - 迁移文件存储在 `drizzle/migrations/`

### 优势

- 实时数据库功能（WebSocket 支持）
- 内置认证系统（可选）
- 自动备份和恢复
- RESTful API 自动生成
- 行级安全策略 (RLS)

## 文件存储：腾讯云 COS (对象存储)

### 配置步骤

1. **创建腾讯云 COS 存储桶**
   - 登录腾讯云控制台
   - 创建 COS 存储桶（Bucket）
   - 获取 Bucket 名称和所在地域

2. **获取访问凭证**
   - 创建 API 密钥或临时凭证
   - 获取 SecretId 和 SecretKey
   - 配置 CORS 规则允许跨域访问

3. **环境变量配置**
   - `TENCENT_COS_SECRET_ID`: 腾讯云 API 密钥 ID
   - `TENCENT_COS_SECRET_KEY`: 腾讯云 API 密钥
   - `TENCENT_COS_BUCKET`: 存储桶名称
   - `TENCENT_COS_REGION`: 地域标识（如 ap-shanghai）
   - `TENCENT_COS_CDN_URL`: CDN 加速域名（可选）

4. **SDK 集成**
   - 安装 `cos-nodejs-sdk-v5` 包
   - 在 `server/storage.ts` 中实现腾讯云 COS 上传/下载逻辑
   - 支持文件分类存储（参考图片、生成视频等）

### 文件存储结构

```
bucket/
├── personas/              # 数字人人设参考图片
│   └── {personaId}/
│       └── {imageId}.jpg
├── generated-videos/      # 生成的视频文件
│   └── {taskId}/
│       └── video.mp4
└── temp/                  # 临时文件
    └── {userId}/
        └── {tempId}
```

### 优势

- 高可用性和可靠性
- CDN 加速支持
- 成本相对较低
- 与国内用户网络友好
- 支持断点续传和大文件上传

## 集成流程

### 后端存储层 (server/storage.ts)

```typescript
// 上传参考图片到 COS
export async function uploadReferenceImage(
  personaId: string,
  file: Buffer,
  filename: string
): Promise<{ key: string; url: string }> {
  // 使用腾讯云 COS SDK 上传
  // 返回文件 key 和可访问的 URL
}

// 上传生成的视频到 COS
export async function uploadGeneratedVideo(
  taskId: string,
  videoBuffer: Buffer
): Promise<{ key: string; url: string }> {
  // 使用腾讯云 COS SDK 上传
  // 返回文件 key 和可访问的 URL
}

// 获取文件下载 URL
export async function getFileUrl(
  key: string,
  expiresIn?: number
): Promise<string> {
  // 生成签名 URL 或 CDN 链接
}
```

### 数据库存储关系

- **personas 表**: 存储人设元数据
- **reference_images 表**: 存储参考图片的 COS key 和 URL
- **video_generation_tasks 表**: 追踪生成任务状态和参数
- **generated_videos 表**: 存储生成视频的 COS key、URL 和元数据

## 环境变量完整清单

```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyxxxxx
DATABASE_URL=postgresql://user:password@db.xxxxx.supabase.co:5432/postgres

# 腾讯云 COS
TENCENT_COS_SECRET_ID=AKIDxxxxx
TENCENT_COS_SECRET_KEY=xxxxx
TENCENT_COS_BUCKET=mybucket-1234567890
TENCENT_COS_REGION=ap-shanghai
TENCENT_COS_CDN_URL=https://mybucket-1234567890.file.myqcloud.com

# Gemini API
GEMINI_API_KEY=xxxxx

# 其他现有变量
JWT_SECRET=xxxxx
VITE_APP_ID=xxxxx
# ... 其他
```

## 迁移注意事项

1. **从 MySQL 到 PostgreSQL**
   - 修改 `drizzle/schema.ts` 中的表定义（使用 PostgreSQL 类型）
   - 更新 `drizzle.config.ts` 配置
   - 重新生成迁移文件

2. **从 S3 到腾讯云 COS**
   - 实现新的存储适配器
   - 更新所有文件上传/下载逻辑
   - 迁移现有文件（如有）

3. **连接字符串格式**
   - Supabase 提供标准 PostgreSQL 连接字符串
   - 确保网络连接正确（可能需要配置 IP 白名单）
