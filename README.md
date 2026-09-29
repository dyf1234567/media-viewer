# Media Viewer

本地图片 / 视频素材库管理器。功能规格见 [功能清单-2026-09-29.md](./功能清单-2026-09-29.md)。

**规格已全部实现**,含两阶段:
- 第一阶段(核心闭环):窗口框架 / 导入 / 图库浏览 / 详情面板 / 图片预览器与编辑器 / 视频播放 / 标签 / 随机浏览 / 两级回收站 / 设置与外观 / 外部文件监听
- 第二阶段(对比工作台,规格第 9 章):双图对比(并排/擦除/差值/闪烁、同步缩放 0.1–32 倍、网格/参考线/取色器/放大镜、参数差异面板、PNG 合成导出)、多宫格(4/6/9 档、图片视频通用、视频同步播放+音源选择)、双视频对比(挑选盲测投票+按内容哈希的长期战绩、验收模式逐帧 PSNR/SSIM 质量曲线、框选同步放大)

## 技术栈

- Electron 33 + electron-vite + TypeScript
- Vue 3 + Pinia(渲染进程)
- better-sqlite3(图库数据库,WAL)
- sharp(缩略图 / 图像变换 / 主色 / 直方图)
- ffmpeg / ffprobe(视频信息、缩略图、转封装)
- chokidar(外部文件变动监听)
- exifr(EXIF)

## 运行

```bash
npm install        # postinstall 会自动把 better-sqlite3 换成 Electron ABI 预编译
npm run dev        # 开发模式
npm run build      # 构建(out/)
npm run start      # 运行构建产物
npm run typecheck  # 类型检查
npm run dist       # 打包 Windows 安装包(release/Media Viewer Setup x.x.x.exe)
```

若 better-sqlite3 报 `NODE_MODULE_VERSION` 不匹配(如手动重装过依赖):

```bash
cd node_modules/better-sqlite3
npx prebuild-install --runtime electron --target <electron 版本号>
```

## 数据位置

- 图库(素材副本 / 缩略图 / 视频缓存 / 回收区 / library.db):`%USERPROFILE%\Pictures\MediaViewerLibrary`,可在「图库设置」中整库迁移
- 应用配置(窗口位置 / 图库位置):Electron userData 目录下 `config.json`

## 目录结构

```
src/
├── main/            # 主进程:窗口、mvfile:// 协议(Range 流式)、ipc、
│   │                #   导入管线(sha256 去重)、缩略图队列、编辑写盘、
│   │                #   视频分档(direct/remux/unsupported)、chokidar 监听、
│   │                #   两级回收站、启动维护
├── preload/         # contextBridge API(window.mv)
├── renderer/        # Vue 3 界面:瀑布流/列表虚拟滚动、12 维筛选、详情面板、
│                    #   预览器(缩放平移/裁切)、编辑器、视频播放器、对话框
└── shared/          # 主/渲染共享类型
```

## 设计要点

- **不偷偷动用户文件**:引用导入不复制不改动;HEVC 等不支持的编码如实提示、绝不后台重编码;删除永远两级回收站(应用回收站 → Windows 回收站),任何情况下不永久销毁文件
- **原子写入**:编辑/导入先写临时文件成功后落地;SQLite WAL
- **内容寻址**:sha256 去重、缺失文件按内容找回、AI 元数据缓存独立于磁盘文件
- **性能**:虚拟滚动(布局高度由数据库尺寸预计算)、缩略图 800px WebP 队列生成、视频按 Range 流式播放不整段进内存、MKV/AVI 转封装一次并 LRU 缓存

## 本轮增量功能

- 指标曲线悬停十字线 + 帧/时间/数值气泡(点击跳帧保留)
- ? / F1 快捷键速查面板
- 预览器幻灯片轮播(3 秒/张,手动导航重置计时)
- 界面浅色主题(外观 → 界面明暗),查看/对比背景默认跟随界面底色(follow)
- pHash 感知相似查重(工具栏「查相似」,阈值可调,结果可一键加入对比)
- 批量导出(原样复制 / 转换 PNG·JPG·WebP,同名自动加序号)
- 对比取色器首次点击自动等待像素就绪
- 单元测试: npm test(vitest,48 用例);基准: scripts/bench-*.cjs

