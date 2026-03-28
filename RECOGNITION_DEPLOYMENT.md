# Recognition Deployment

## 1. 云数据库集合

在微信开发者工具的云开发控制台里创建四个集合：

- `recognition_words`
- `user_latest_recognition`
- `posts`
- `comments`

建议第一版权限：

- `recognition_words`: 所有用户可读，仅管理员写
- `user_latest_recognition`: 仅创建者可读写

## 2. 云函数

把下面两个云函数部署到当前云环境：

- `cloudfunctions/recognize-word-image`
- `cloudfunctions/community`
- `cloudfunctions/score-writing`

## 3. 安装脚本依赖

在项目根目录运行：

```bash
npm install wx-server-sdk@~2.6.3
```

然后在 [cloudfunctions/recognize-word-image](/C:/Users/31013/WeChatProjects/miniprogram-1/cloudfunctions/recognize-word-image) 目录安装识别依赖：

```bash
cd cloudfunctions/recognize-word-image
npm install
```

## 4. 初始化白名单词表和标准轨迹

在项目根目录运行：

```bash
node scripts/init-recognition-catalog.js
```

如果你要切换云环境：

```bash
$env:CLOUD_ENV='你的云环境ID'
node scripts/init-recognition-catalog.js
```

## 5. 小程序端验证

按这个顺序检查：

1. 打开微信开发者工具，确认云开发环境已经绑定当前项目。
2. 上传并部署 `recognize-word-image`、`community`、`score-writing` 云函数。
3. 在云数据库确认 `recognition_words` 已经写入 3 条记录，并且每条记录都有 `trajectoryFileID` 和 `templateImageFileID`。
4. 编译小程序，确认底部导航顺序是“首页 / 识别 / 社区 / 商城 / 我”。
5. 进入“识别”页，选择拍照或相册，确认图片先被压缩后再上传。
6. 识别成功后，确认页面会显示词名、蒙古文、转写、识别时间、预览图。
7. 点击“去首页播放”，确认首页会接收完整轨迹 JSON 并直接播放。
8. 进入“社区”页，发一条带 `蒙宝AI` 或 `@蒙宝AI` 的帖子，确认云端会自动插入一条幽默回复。

## 6. 当前 OCR 说明

这版代码优先尝试微信云开发原生 OCR 接口。如果你的环境还没有可用的竖写蒙古文 OCR，这条链路会返回明确错误，并保留好后续接第三方 OCR 的插槽。
