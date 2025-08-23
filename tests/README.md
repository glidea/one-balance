# 测试文件说明

此目录包含 One Balance 项目的各种测试脚本。

## 文件列表

### `test-openai-compat.mjs`

OpenAI 兼容格式功能的综合测试脚本，包括：

- **模型列表端点测试**: 测试 `/api/compat/models` 端点
- **非流式请求测试**: 测试标准的聊天完成API
- **流式请求测试**: 测试Server-Sent Events流式响应
- **中文编码测试**: 验证中文字符的正确处理

#### 使用方法

```bash
# 从项目根目录运行，自动从 .env 文件加载配置
node tests/test-openai-compat.mjs

# 使用环境变量覆盖配置
WORKER_URL=https://your-worker.workers.dev AUTH_KEY=your-key node tests/test-openai-compat.mjs

# 从环境变量文件加载后运行
source .env && node tests/test-openai-compat.mjs
```

#### 配置要求

测试脚本需要以下环境变量：

- `WORKER_URL`: One Balance Worker 的URL
- `AUTH_KEY`: 访问Worker的认证密钥

配置优先级：环境变量 > .env文件 > 默认值

## 添加新测试

当添加新的测试脚本时：

1. 放置在此 `tests/` 目录下
2. 使用描述性的文件名，如 `test-功能名.mjs`
3. 确保测试脚本能从项目根目录的 `.env` 文件读取配置
4. 在此 README 中更新文件列表和说明
