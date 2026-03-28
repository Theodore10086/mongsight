# 蒙格穿梭 - 联调测试步骤指南

本文档指导您如何从本地测试到云端部署的完整联调流程。

## 测试前准备

### 1. 确认环境

| 组件 | 位置 | 状态 |
|------|------|------|
| 微信开发者工具 | 本地 | ✅ 已安装 |
| Python 3.8+ | 本地/AutoDL | ✅ 已安装 |
| MySQL 数据库 | AutoDL | ✅ 已部署 |
| 微信云开发 | 微信小程序 | ✅ 已开通 |

### 2. 获取必要配置

请记录以下配置信息：

```env
# 微信云开发配置 (在小程序 app.js 中)
APP_ID=wx1234567890abcdef
ENV_ID=your-env-id

# AI 服务配置 (在云函数环境变量中设置)
AI_SERVICE_URL=http://<AutoDL-IP>:8000
AI_API_KEY=mengge_secret_key_2024

# MySQL 配置
MYSQL_HOST=<AutoDL-IP>
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=mengge_chuansuo
```

---

## 阶段一: 本地 FastAPI 服务测试

### 1.1 安装依赖

```bash
# 在 AutoDL 服务器上
cd /root/mengge-chuansuo
source venv/bin/activate

pip install -r requirements.txt
```

requirements.txt 内容:
```
fastapi==0.104.1
uvicorn==0.24.0
pydantic==2.5.0
numpy==1.26.2
opencv-python==4.8.1.78
requests==2.31.0
python-multipart==0.0.6
```

### 1.2 启动服务

```bash
# 方式一: 直接运行
python main.py

# 方式二: 使用 uvicorn
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 1.3 测试 API 端点

使用 curl 或 Postman 测试：

#### 健康检查

```bash
curl http://localhost:8000/health
```

预期响应:
```json
{"status": "healthy", "models_loaded": false}
```

#### 测试笔迹复原 API

```bash
curl -X POST http://localhost:8000/api/v1/recover \
  -H "Content-Type: application/json" \
  -H "X-API-Key: mengge_secret_key_2024" \
  -d '{"image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "word_id": "word_001"}'
```

#### 测试书写评估 API

```bash
curl -X POST http://localhost:8000/api/v1/evaluate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: mengge_secret_key_2024" \
  -d '{
    "user_coords": [
      {"x": 100, "y": 200, "t": 0},
      {"x": 120, "y": 180, "t": 50},
      {"x": 150, "y": 150, "t": 100}
    ],
    "standard_coords": [
      {"x": 100, "y": 200, "t": 0},
      {"x": 120, "y": 180, "t": 50},
      {"x": 150, "y": 150, "t": 100}
    ]
  }'
```

预期响应:
```json
{
  "score": 95,
  "dtw_distance": 2.5,
  "advice": "书写流畅, 继续保持!",
  "stroke_scores": [96.5, 97.2, 95.8]
}
```

#### 测试艺术图生成 API

```bash
curl -X POST http://localhost:8000/api/v1/generate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: mengge_secret_key_2024" \
  -d '{
    "user_image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "style": "traditional_mongol",
    "strength": 0.8
  }'
```

---

## 阶段二: 云函数本地测试

### 2.1 配置云函数

在每个云函数的 `config.json` 中配置环境变量：

```json
{
  "permissions": {
    "openapi": ["*"]
  },
  "envVariables": {
    "AI_SERVICE_URL": "http://localhost:8000",
    "AI_API_KEY": "mengge_secret_key_2024"
  }
}
```

### 2.2 本地调用云函数

在微信开发者工具中：

1. 打开云开发控制台
2. 进入「云函数」
3. 选择「本地调试」
4. 输入参数并点击「调用」

#### 测试 login 云函数

```json
{
  "userInfo": {
    "nickName": "测试用户",
    "avatarUrl": "https://example.com/avatar.png"
  }
}
```

#### 测试 submit-writing 云函数

```json
{
  "wordId": "word_001",
  "userCoords": [
    {"x": 100, "y": 200, "t": 0},
    {"x": 120, "y": 180, "t": 50},
    {"x": 150, "y": 150, "t": 100}
  ],
  "generateArtwork": false
}
```

---

## 阶段三: 云端联调测试

### 3.1 部署 FastAPI 到 AutoDL

```bash
# 在 AutoDL 服务器上
cd /root/mengge-chuansuo

# 使用 nohup 后台运行
nohup python -m uvicorn main:app --host 0.0.0.0 --port 8000 > logs/uvicorn.log 2>&1 &

# 检查服务是否启动
curl http://localhost:8000/health

# 获取公网 IP
curl ifconfig.me
```

### 3.2 更新云函数配置

在云开发控制台中，更新每个云函数的环境变量：

```
AI_SERVICE_URL: http://<您的AutoDL公网IP>:8000
AI_API_KEY: mengge_secret_key_2024
```

### 3.3 重新部署云函数

在微信开发者工具中：

1. 右键点击每个云函数目录
2. 选择「上传并部署: 云端安装依赖」
3. 等待上传完成

### 3.4 小程序端测试

在小程序中触发相应功能：

1. **登录测试**: 点击登录按钮，检查用户是否创建成功
2. **书写评测**: 完成书写后提交，检查评分是否返回
3. **社区功能**: 查看帖子列表是否正常加载
4. **商城功能**: 创建订单测试

---

## 阶段四: 完整流程测试

### 4.1 端到端测试场景

```
用户书写流程:
1. 用户打开小程序 -> 调用 login 云函数
   ↓
2. 选择词汇练习 -> 显示标准笔顺
   ↓
3. 用户书写 -> canvas 记录坐标
   ↓
4. 点击提交 -> 调用 submit-writing 云函数
   ↓
5. 云函数调用 AI 评估 -> /api/v1/evaluate
   ↓
6. 返回评分 -> 保存到 user_works 表
   ↓
7. 小程序显示评分和改进建议
```

### 4.2 检查数据

登录云开发控制台，检查数据是否正确存储：

- **users 表**: 用户信息
- **user_works 表**: 作品记录
- **posts 表**: 社区帖子
- **orders 表**: 订单记录

---

## 常见问题排查

### Q1: 云函数调用 AI 服务超时

**解决**:
1. 检查 AutoDL 防火墙是否开放 8000 端口
2. 确认 AI_SERVICE_URL 配置正确
3. 检查云函数日志

### Q2: API Key 验证失败

**解决**:
1. 确认云函数环境变量中 AI_API_KEY 正确
2. 检查 FastAPI 服务是否正常启动

### Q3: 数据库连接失败

**解决**:
1. 确认 MySQL 服务运行正常
2. 检查数据库连接配置
3. 确认数据库和表已创建

### Q4: CORS 跨域问题

**解决**:
FastAPI 已配置 CORS 中间件，如仍有问题，检查请求头是否正确。

---

## 测试检查清单

- [ ] FastAPI 服务本地测试通过
- [ ] 云函数本地调用成功
- [ ] FastAPI 已部署到 AutoDL
- [ ] 云函数环境变量已更新
- [ ] 云函数已重新部署
- [ ] 小程序端到端测试通过
- [ ] 数据正确存储到云数据库

---

## 联系方式

如有问题，请检查：
1. 云函数日志 (云开发控制台 -> 云函数 -> 日志)
2. FastAPI 服务日志 (`logs/uvicorn.log`)
3. MySQL 错误日志
