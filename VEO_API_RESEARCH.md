# Gemini Veo 3.1 API 调研报告

## 核心能力

### 1. 基础视频生成
- **模型**: `veo-3.1-generate-preview` (Veo 3.1 Fast 版本也可用)
- **输出规格**:
  - 时长: 8 秒
  - 分辨率: 720p, 1080p, 4K
  - 宽高比: 16:9 (横屏) 或 9:16 (竖屏)
  - 原生音频生成: 支持对话、音效、背景音乐
- **API 调用方式**: 异步长时间运行操作，需轮询检查状态

### 2. 参考图片指导生成 (Image-based Direction)
- **功能**: 使用最多 3 张参考图片指导视频内容生成
- **用途**: 
  - 保持角色一致性（多个镜头中的同一角色）
  - 应用特定风格到视频
  - 维持场景风格连贯性
- **API 参数**: `reference_images` 数组（最多 3 个）

### 3. 视频扩展 (Scene Extension)
- **功能**: 扩展已生成的视频，创建更长的内容（可超过 1 分钟）
- **原理**: 基于前一个视频的最后一秒生成新的连接片段
- **用途**: 创建长视频故事、背景音频配合
- **API 参数**: `video` 字段传入要扩展的视频

### 4. 首尾帧控制 (First and Last Frame)
- **功能**: 指定起始和结束图片，生成平滑的过渡视频
- **用途**: 创建自然的场景过渡，完整的音频伴随
- **API 参数**: 
  - `image`: 首帧
  - `config.last_frame`: 末帧

## 三种生成模式映射

| 模式 | API 调用方式 | 参数 | 场景 |
|------|-------------|------|------|
| **纯提示词** | `generate_videos(prompt)` | 仅 prompt | 快速创意生成 |
| **参考图片** | `generate_videos(prompt, reference_images)` | prompt + 1-3 张图 | 保持风格/角色一致 |
| **首尾帧** | `generate_videos(prompt, image, last_frame)` | prompt + 首帧 + 末帧 | 精确控制过渡 |

## 异步操作流程

1. 调用 `generate_videos()` → 返回 Operation 对象
2. Operation 包含 `name` 和 `done` 字段
3. 轮询 `operations.get(operation)` 检查状态（建议 10 秒间隔）
4. 当 `done=true` 时，从 `response.generated_videos[0].video` 获取视频

## 文件处理

- 支持通过 Files API 上传参考图片
- 生成的视频通过 URI 返回，需下载或转存到 S3
- 建议所有媒体资产持久化到 S3

## 定价模型

- Veo 3.1 与 Veo 3 价格相同
- 按生成次数计费（需确认具体单价）
- 建议实现任务队列和生成历史追踪

## 关键设计考量

1. **异步处理**: 所有视频生成需后台任务队列支持
2. **状态追踪**: 需数据库记录生成任务状态（待生成/生成中/完成/失败）
3. **媒体存储**: 参考图片和生成视频都需 S3 持久化
4. **LLM 集成**: 人设 Agent 模式需 LLM 根据人设属性扩写提示词
5. **并发控制**: 考虑 API 速率限制和成本控制

## 数据库设计建议

- **PersonaTable**: 存储数字人人设信息
- **ReferenceImageTable**: 存储参考图片 S3 URL
- **VideoGenerationTaskTable**: 追踪生成任务状态、参数、结果
- **GeneratedVideoTable**: 存储生成视频的元数据和 S3 URL
