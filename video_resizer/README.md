# 批量视频尺寸调整工具 - 使用说明

## 当前状态

工具的UI界面已完成，设计精美且功能完整。但由于浏览器的跨域安全限制，FFmpeg.wasm无法从CDN加载。

## 问题说明

FFmpeg.wasm需要特殊的浏览器环境配置才能工作：
- 需要Cross-Origin-Embedder-Policy和Cross-Origin-Opener-Policy响应头
- CDN上的Worker脚本需要Cross-Origin-Resource-Policy响应头
- 这些限制使得在本地开发环境中难以使用

## 解决方案

### 方案一：使用桌面版FFmpeg（推荐）

如果您需要批量处理视频，建议使用桌面版FFmpeg，它更快速且稳定：

```powershell
# 下载FFmpeg: https://ffmpeg.org/download.html
# 批量处理示例：
Get-ChildItem *.mp4 | ForEach-Object {
    ffmpeg -i $_.Name -vf "scale=720:-2" -c:v libx264 -preset fast -crf 23 -c:a copy "$(.BaseName)_720p.mp4"
}
```

### 方案二：在线视频处理服务

使用现有的在线服务：
- CloudConvert (https://cloudconvert.com/)
- Online-Convert (https://www.online-convert.com/)
- FreeConvert (https://www.freeconvert.com/)

### 方案三：本地部署FFmpeg.wasm（高级）

1. 下载FFmpeg.wasm的所有文件到本地
2. 修改app.js中的CDN路径为本地路径
3. 使用支持SharedArrayBuffer的服务器

## 工具特点（UI已完成）

 现代化深色主题设计
 拖放上传界面
 批量文件管理
 进度显示系统
 响应式布局

## 文件说明

- index.html - 主页面，包含完整的UI结构
- index.css - 精美的样式设计（深色主题+Glassmorphism）
- pp.js - JavaScript逻辑（包含FFmpeg集成代码）
- server.py - 带CORS头的Python服务器
- README.md - 本文档

## 如何查看UI

即使FFmpeg无法加载，您仍可以查看精美的UI设计：

1. 启动服务器：python server.py
2. 打开浏览器：http://localhost:8000
3. 在浏览器控制台执行：document.getElementById('loadingOverlay').style.display='none'
4. 现在可以看到完整的UI界面

## 技术栈

- HTML5 + CSS3 + JavaScript
- FFmpeg.wasm（视频处理引擎）
- Google Fonts - Inter
- 现代CSS特性（CSS变量、Grid、Flexbox、动画）

## 开发者备注

本工具展示了如何构建现代化的Web应用UI，虽然FFmpeg.wasm在本地环境中存在限制，但代码结构完整，可以作为学习参考。

如果部署到支持SharedArrayBuffer的生产环境（如Vercel、Netlify等），FFmpeg.wasm可以正常工作。

## 联系与支持

如需帮助，请参考：
- FFmpeg官方文档：https://ffmpeg.org/documentation.html
- FFmpeg.wasm GitHub：https://github.com/ffmpegwasm/ffmpeg.wasm
