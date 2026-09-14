# 本地部署

当前部署步骤、环境依赖和 GitHub Pages 限制请参阅 [README.md](README.md#部署方式)。

在项目目录执行 `bash start-local.sh`，默认仅监听 `127.0.0.1:3001`。脚本在当前 Mac 上优先使用已安装的 Node 18，其他环境使用 PATH 中的 Node。

当前电脑的视频、球员档案、照片和统计数据保存在 `.local-run/workbench/`；模型位于 `.local-run/models/`，Python 位于 `.venv-analysis/`。这些目录不进入 Git，需要单独迁移。此前本机的安装和运行结果不代表新机器已经完成安装。

后台服务的本机日志为 `.local-run/server.log`，进程号为 `.local-run/server.pid`。重启电脑后需要重新启动，尚未配置开机自启。
