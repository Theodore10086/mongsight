# 蒙格穿梭 (Mengge Chuansuo) - 部署与安全指南

## 1. AutoDL GPU 服务器部署

### 1.1 环境准备

```bash
# 1. 创建项目目录
mkdir -p /root/mengge-chuansuo/{app,models,logs}
cd /root/mengge-chuansuo

# 2. 创建 Python 虚拟环境
python3 -m venv venv
source venv/bin/activate

# 3. 安装依赖
pip install --upgrade pip
pip install fastapi uvicorn pydantic numpy opencv-python python-multipart
```

### 1.2 项目结构

```
/root/mengge-chuansuo/
├── app/
│   ├── main.py           # FastAPI 主应用
│   ├── requirements.txt  # Python 依赖
│   └── config.py         # 配置文件
├── models/               # AI 模型目录
│   ├── recovery/         # 笔迹复原模型
│   ├── evaluate/        # DTW 评估模型
│   └── generate/        # 艺术生成模型
├── logs/                 # 日志目录
└── start.sh            # 启动脚本
```

### 1.3 启动方式

#### 方式一: nohup 后台运行

```bash
# 启动服务
nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 > logs/uvicorn.log 2>&1 &

# 查看日志
tail -f logs/uvicorn.log

# 查看进程
ps aux | grep uvicorn

# 停止服务
pkill -f uvicorn
```

#### 方式二: systemd 服务 (推荐)

```bash
# 创建 systemd 服务文件
cat > /etc/systemd/system/mengge-ai.service << EOF
[Unit]
Description=Mengge Chuansuo AI Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/mengge-chuansuo
ExecStart=/root/mengge-chuansuo/venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 启用服务
systemctl daemon-reload
systemctl enable mengge-ai
systemctl start mengge-ai

# 查看状态
systemctl status mengge-ai
```

### 1.4 防火墙配置

```bash
# 开放端口 (AutoDL 控制台也可配置)
# 仅开放 8000 端口
firewall-cmd --permanent --add-port=8000/tcp
firewall-cmd --reload

# 查看端口
netstat -tlnp | grep 8000
```

### 1.5 MySQL 数据库部署

```bash
# 安装 MySQL (Ubuntu)
apt update
apt install mysql-server mysql-client

# 启动 MySQL
systemctl start mysql
systemctl enable mysql

# 登录 MySQL
mysql -u root -p

# 执行初始化 SQL
source /path/to/init_database.sql
```

## 2. 动态 IP 解决方案

### 2.1 问题说明

AutoDL 实例每次启动后公网 IP 会变化，需要处理这个问题。

### 2.2 方案一: 启动脚本自动获取并通知

```python
#!/usr/bin/env python3
"""
文件: get_public_ip.py
功能: 启动时自动获取公网 IP 并发送通知
"""

import requests
import json
import os

def get_public_ip():
    """获取公网 IP"""
    try:
        # 使用多个服务获取 IP，增加可靠性
        services = [
            'https://api.ipify.org?format=json',
            'https://api.my-ip.io/v2/ip.json',
            'https://ipinfo.io/json'
        ]
        
        for service in services:
            try:
                response = requests.get(service, timeout=5)
                if response.status_code == 200:
                    data = response.json()
                    ip = data.get('ip') or data.get('data', {}).get('ip')
                    if ip:
                        return ip
            except:
                continue
        
        return None
    except Exception as e:
        print(f"获取 IP 失败: {e}")
        return None

def notify_webhook(ip, webhook_url):
    """发送 IP 到 webhook"""
    if not webhook_url:
        print("未配置 webhook，跳过通知")
        return
    
    try:
        payload = {
            "ip": ip,
            "service": "mengge-chuansuo-ai",
            "timestamp": str(int(time.time()))
        }
        
        response = requests.post(webhook_url, json=payload, timeout=10)
        if response.status_code == 200:
            print(f"IP 通知成功: {ip}")
        else:
            print(f"IP 通知失败: {response.status_code}")
    except Exception as e:
        print(f"通知失败: {e}")

if __name__ == "__main__":
    import time
    
    ip = get_public_ip()
    if ip:
        print(f"公网 IP: {ip}")
        
        # 读取 webhook URL (可通过环境变量或文件配置)
        webhook_url = os.environ.get('IP_WEBHOOK_URL', '')
        notify_webhook(ip, webhook_url)
    else:
        print("无法获取公网 IP")
```

### 2.3 方案二: 使用 DDNS (推荐)

推荐使用 **DNSPod** 或 **阿里云 DNS** 的 DDNS 服务：

1. 在域名服务商处创建 API Token
2. 在 AutoDL 启动脚本中调用 DDNS 更新 API
3. 使用固定域名访问服务

### 2.4 AutoDL 启动脚本配置

在 AutoDL 控制台「自定义启动脚本」中添加：

```bash
#!/bin/bash
# 启动后自动运行

# 激活虚拟环境
source /root/mengge-chuansuo/venv/bin/activate

# 启动 FastAPI 服务
cd /root/mengge-chuansuo
nohup python -m uvicorn main:app --host 0.0.0.0 --port 8000 > logs/uvicorn.log 2>&1 &

# 获取并通知 IP
python /root/mengge-chuansuo/get_public_ip.py
```

## 3. 安全建议

### 3.1 API Key 管理

```javascript
// ❌ 错误: 硬编码在小程序端
const API_KEY = 'mengge_secret_key_2024'; // 不要这样做!

// ✅ 正确: 存放在云函数环境变量中
// 在云函数 config.json 中配置
{
  "permissions": {
    "openapi": ["*"]
  },
  "envVariables": {
    "AI_API_KEY": "请在云开发控制台设置",
    "AI_SERVICE_URL": "http://your-autoDL-ip:8000"
  }
}
```

### 3.2 在云开发控制台设置环境变量

1. 登录 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 打开云开发控制台
3. 进入「云函数」-> 选择函数 -> 「配置」
4. 添加环境变量:
   - `AI_API_KEY`: 您的 API Key
   - `AI_SERVICE_URL`: AutoDL 服务器地址

### 3.3 增强安全措施

1. **IP 白名单**: 在 FastAPI 中限制仅允许云函数的 IP 访问
2. **请求限流**: 使用 `slowapi` 库限制请求频率
3. **日志审计**: 记录所有 API 请求日志
4. **HTTPS**: 生产环境务必使用 HTTPS

```python
# main.py 中添加 IP 白名单
from fastapi import FastAPI
from fastapi.middleware.trustedhost import TrustedHostMiddleware

app = FastAPI()

# 仅允许特定域名/IP
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["*.weixin.qq.com", "localhost"]
)
```

## 4. 微信云函数配置

### 4.1 安装 wx-server-sdk

在每个云函数目录下的 `package.json`:

```json
{
  "name": "login",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "^2.6.3"
  }
}
```

### 4.2 云函数目录结构

```
cloudfunctions/
├── utils/
│   ├── aiService.js      # AI 服务工具
│   └── package.json
├── login/
│   ├── index.js
│   ├── config.json
│   └── package.json
├── submit-writing/
│   ├── index.js
│   ├── config.json
│   └── package.json
└── ...
```

### 4.3 部署云函数

```bash
# 在微信开发者工具中
# 1. 右键云函数目录
# 2. 选择「上传并部署: 云端安装依赖」
```

## 5. 快速检查清单

- [ ] AutoDL 服务器 Python 环境已配置
- [ ] MySQL 数据库已创建并执行 init_database.sql
- [ ] FastAPI 服务已启动并测试通过
- [ ] 防火墙已开放 8000 端口
- [ ] 微信云函数已创建并上传
- [ ] 云函数环境变量已配置 (AI_API_KEY, AI_SERVICE_URL)
- [ ] 小程序端已配置云函数调用
