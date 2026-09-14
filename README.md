# MT球员统计工作台

让每次精彩进球，都能够被记录。

基于 [firatgoktepe/basketball-ai-agent](https://github.com/firatgoktepe/basketball-ai-agent) 开发的本地篮球视频工作台，包含首页、技术统计、进球剪辑和球员档案。

## 功能

- **技术统计**：上传视频、后台分析、人物截图、事件关联与跨视频统计累计。
- **进球剪辑**：自动检测进球候选、生成片段和集锦、导出视频；支持前后时长、重叠合并、原声音量、自定义及预制背景音乐。
- **球员档案**：姓名、球衣号码、多张本地照片、封面、归档及人物合并；默认号码升序，也可按姓名拼音排序。
- **本地存储**：视频、照片、音乐和统计数据库保存在运行服务的电脑上。

## 当前识别能力

这是实验性实现，存在人物拆分、串人、进球漏检和误检。两分/三分尚未可靠判定，未判定分值单列展示。助攻、篮板、自动分局和人脸匹配尚未实现。参考照片用于后续人脸匹配接入，上传照片不会自动启用人脸识别。集锦可能包含热身或死球后的投篮。

新上传的视频通过本地 Python 模型分析，不依赖对话中预先生成的结果；当前分析链路不调用云端 AI 接口。

## 部署方式

**不能直接用 GitHub Pages 运行完整产品。** [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) 是静态托管，本项目需要 Next.js 服务端 API、可写磁盘、长时间后台任务以及 Python/FFmpeg。应部署到本机或具备这些条件的服务器。本机和公网均使用独立账号，管理员可选择发布统计到公共看板。

仓库包含源码，不包含内部比赛视频、球员名单数据库、球员照片、自定义音乐和本地模型权重。原项目附带的公开演示视频保留。只克隆代码不会恢复当前电脑的数据。

服务器试用配置见 [SERVER-DEPLOYMENT.md](SERVER-DEPLOYMENT.md)，包含 Docker、HTTPS、访问密码和持久化数据卷；尚待目标服务器实测。

### 本地启动（macOS / Linux）

运行环境：兼容 Next.js 15 的 Node.js、Python 3.9.6、FFmpeg。当前电脑验证使用 Node 18；分析脚本使用 POSIX 文件锁，Windows 请使用 Linux 环境。

```bash
git clone https://github.com/xulilong/basketball_video_analysis.git
cd basketball_video_analysis
npm ci
python3 -m venv .venv-analysis
.venv-analysis/bin/python -m pip install -r requirements-analysis.txt
```

另外安装 FFmpeg，确保 `ffmpeg` 命令可用。`npm ci` 的安装脚本会准备原项目的浏览器运行时资源；**不会下载下面的服务端分析权重**。

将以下模型放到 `.local-run/models/`，再进行视频分析：

| 文件名 | 来源 |
| --- | --- |
| `yolo11s.pt` | [Ultralytics](https://github.com/ultralytics/assets/releases) |
| `yolo11s-pose.pt` | [Ultralytics](https://github.com/ultralytics/assets/releases) |
| `basketball-best.pt` | [篮球检测模型项目的 best.pt](https://github.com/avishah3/AI-Basketball-Shot-Detection-Tracker)，保存为左侧文件名 |
| `osnet-ain-msmt17.pth` | [OSNet 作者权重](https://huggingface.co/kaiyangzhou/osnet) |

这些权重和各自许可独立于本仓库；按来源说明获取对应模型。尚未验证全新机器从零安装，以上 Python 版本锁定来自当前已运行环境。

```bash
npm run build
node scripts/init-admin.mjs
bash start-local.sh
```

访问 http://localhost:3001 。页面修改后重新构建并重启服务。未准备模型时可管理档案，但不能执行视频检测。

### 数据与验证

默认数据目录为 `.local-run/workbench/`，可通过 `BASKETBALL_DATA_DIR` 更改。迁移数据时停止写入，备份整个数据目录；另行复制 `.local-run/models/` 并安装运行依赖。

```bash
npx tsx --test lib/workbench-domain.test.ts lib/player-profiles.test.ts lib/highlight-options.test.ts lib/workbench-origin.test.ts
```

生产构建和关键交互已在当前电脑验证；规则测试通过不代表视频识别准确率达标。

实现及已知限制见 [WORKBENCH.md](WORKBENCH.md)。其他样例分析文档保留开发过程记录，不应视作当前准确率承诺。

## 来源与许可

原项目作者 Fırat Göktepe，原项目声明 MIT 许可；保留原 Git 历史与[原版说明](UPSTREAM-README.md)。OSNet 架构代码的作者许可见 [scripts/vendor/OSNET-LICENSE](scripts/vendor/OSNET-LICENSE)。第三方运行时和模型分别遵守各自许可。

账号隔离、公共看板、分片上传和浏览器视频保存见 [PRIVATE-WORKSPACES.md](PRIVATE-WORKSPACES.md)。初始管理员凭据在数据目录的 `access/admin-initial.json` 中，勿提交到 Git。


### 公共看板与账号工作流程

导航：首页、公共技术看板；统计工具下包含视频分析、进球剪辑和球员档案。首页和公共看板无需登录，统计工具按账号隔离。

管理员在已完成的视频分析结果处点击“预览并发布到公共技术看板”，确认后公开本视频的球员得分。重复发布替换该视频快照，重新关联球员后发布也会移除旧关联。不同视频按同一账号的球员档案 ID 累计，同名档案不自动合并。管理员发布中心仍可选择其他账号的数据发布或撤回；账号累计快照与单视频累计分别标注。

飞书历史榜单使用独立导入快照，与视频分析发布的数据分开展示，避免重复累计。导入过程不需要把用户凭据交给 Web 服务，数据保存在数据目录的 `public-board/history.json`，不提交 Git。导入输入为已授权的 `lark-cli base +record-list --format json` 完整导出，投影字段必须包含“球员姓名”“场均得分”“出勤次数”“球员标签”，且 `has_more=false`。执行：

```sh
node scripts/import-board-history.mjs <导出文件.json>
```

导入会保留上一份历史数据备份，页面显示导入时间。目前没有后台定时同步飞书。历史场均得分沿用原表公式，出勤不推断为比赛局数，标签不推断为助攻或篮板次数。

球员档案初始名单可通过 `tsx scripts/import-player-roster.ts <名单.json> --defaults` 配置。名单只包含姓名、号码和来源键，保存在数据目录的 `default-roster.json`。各账号首次访问工作空间时补齐来源键缺失的球员，生成独立档案 ID；已有来源记录（含已归档、已合并记录）的照片、姓名、号码和统计不会被覆盖。重复号码允许属于不同球员。该初始名单不是实时飞书同步。

### 导出部分进球片段

进球剪辑完成后默认全选，可逐段勾选、全选或取消全选，页面显示已选数量和预计时长。点击“合成选中片段”，完成后下载选中集锦 MP4；完整集锦及单片段下载仍保留。

选中导出沿用该版已生成结果的剪辑范围及音量/音乐配置，按照比赛时间从原视频重新编码，音乐在新集锦中连续混合，不重新运行进球识别。未应用的配置修改仍需先“应用并重新生成”。导出任务在后台执行，页面轮询进度；服务端验证片段及结果版本，下载受账号权限保护。导出期间禁止重新剪辑及清理同一视频素材。
