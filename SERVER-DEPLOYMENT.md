# 独立服务器试用部署

这套配置用于单台 Linux 服务器上的团队试用，电脑关机后仍可运行。架构为 Caddy HTTPS/访问密码 → Next.js → 本机 Python/FFmpeg 后台分析。应用使用独立账号和私有工作空间，代理密码仅为外层访问控制，管理员可选择用户统计发布到公共看板。

## 当前验证状态

部署文件已准备；当前开发电脑没有 Docker，尚未执行 Docker 镜像构建、Linux/ARM 模型推理或公网验收。完成这些检查前不能称为已上线。Python 容器使用 3.11，Node 使用 22；本机原有环境为 Python 3.9.6 和 Node 18，因此仍需在目标服务器验证依赖与实际分析。

## Oracle 免费实例准备

先由账号持有人完成 [Oracle Cloud 注册](https://www.oracle.com/cloud/free/)。注册的身份和支付方式验证由本人操作，不要把密码或银行卡信息发到聊天或仓库。

截至本次查阅，[官方 Always Free 文档](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) 列出的 A1 免费总额度为 2 OCPU / 12 GB RAM，启动盘与块存储共 200 GB。以账号控制台当时的免费标记和额度为准。可能因区域容量不足无法创建，闲置实例也可能被回收。不要把临时试用金机器当作长期免费实例。

建议准备 Ubuntu 22.04/24.04 ARM64、A1 2 OCPU / 12 GB，先使用 80 GB 启动盘（仍需确认没有其他资源占用免费磁盘额度）。这只是部署起点，不是性能承诺；先用短视频测试，现有分析串行排队。

需要服务器公网地址、已配置的 SSH 登录方式，以及一个指向服务器的域名/子域名。若暂无域名，在正式对外试用前另行配置。只公开 TCP 80/443；SSH 仅允许管理员来源，不公开应用的 3001 端口。

## 安装与配置

在服务器安装 [Docker Engine 和 Compose 插件](https://docs.docker.com/engine/install/ubuntu/)，然后：

```bash
git clone https://github.com/xulilong/basketball_video_analysis.git
cd basketball_video_analysis
mkdir -p .local-run/models
cp .env.example .env
```

模型不进入镜像或 Git。将现有电脑 `.local-run/models/` 的以下四个已验证文件复制到服务器同名目录：

- yolo11s.pt
- yolo11s-pose.pt
- basketball-best.pt
- osnet-ain-msmt17.pth

可以通过 SSH/SCP 传输这些权重；不需要复制公司比赛视频、球员照片或统计数据库。来源见 README，校验值记录在 `deploy/models.sha256.json`。模型目录只读挂载，启动前进行 SHA-256 校验；缺文件或内容不一致会拒绝启动。服务器首次启动为空工作空间。

配置 `.env` 中的 `SITE_HOST` 为真实域名（不含协议、路径）。生成试用密码哈希：

```bash
docker run --rm -it caddy:2 caddy hash-password
```

按提示输入自己设置的密码，将输出哈希填入 `.env` 的 `TRIAL_PASSWORD_HASH`，**保留单引号**，避免哈希中的 `$` 被 Compose 插值。登录名固定为 `trial`。`.env` 已被 Git 和 Docker 构建上下文忽略。

```bash
chmod 600 .env
docker compose config --quiet
docker compose build
docker compose run --rm app .venv-analysis/bin/python -c 'import torch, torchvision, cv2, lap; from ultralytics import YOLO; print("Python imports OK")'
docker compose run --rm app .venv-analysis/bin/python deploy/check-models.py
docker compose run --rm app node -e 'require("fs").accessSync(".local-run/workbench", require("fs").constants.W_OK); console.log("Data volume writable")'
docker compose run --rm proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose up -d
docker compose ps
```

镜像同时面向 amd64 / arm64，构建跟随服务器架构。首次构建会下载 Node/Python 依赖，需要网络和磁盘空间。使用 CPU 版 PyTorch，避免下载不需要的 CUDA 运行库；没有 GPU 加速保证。跟踪依赖 lapx 已明确安装，关闭模型库运行时自动装包。

Caddy 在 DNS 和端口配置正确时申请 HTTPS 证书。访问 `https://你的域名`，浏览器提示用户名/密码。页面、API、照片和视频均经过代理密码保护。旧样例分析接口在代理层关闭，不作为试用功能提供。用户上传会经过服务器，无需依赖开发电脑。

## 上线验收（部署后执行）

- 不携带凭据访问首页、`/api/players`、视频媒体和图片地址，应返回 401。
- 登录后上传照片及一段短视频，确认上传没有 HTTPS 来源校验错误。
- 分别验证统计分析、进球集锦、配乐和导出，记录实际耗时；无进球视频应返回空结果。
- 等任务完成后重启应用，确认档案、照片、视频及已导出结果仍保留。
- 从外部网络访问 3001 应无法连接，应用仅可从受保护代理进入。

队列保存在磁盘，分析进程在容器内运行；容器重启会中断正在处理的任务，原有检测不自动续跑，需要在页面重试。已完成的数据在 Docker 命名卷 `mt-basketball_workbench` 中保留。

## 更新与备份

```bash
git pull --ff-only
docker compose up -d --build
```

更新前等待分析结束。`docker compose down` 保留数据卷；**不要使用 `down -v`**，它会删除数据。默认云端数据与当前电脑数据库互不相通，也不会自动同步球员名单。

备份时停止服务写入，复制 `mt-basketball_workbench` 整个卷，连同 `.env`、模型和 Caddy 证书卷分别妥善保存。恢复后检查数据卷权限及任务状态。磁盘不会自动清理，应定期检查占用，试用期间优先上传短视频。

应用管理员由 `scripts/init-admin.mjs` 初始化，初始账号信息只写入数据卷 `access/admin-initial.json`（权限 600），不要公开此文件。普通注册无法获得管理员角色。可用 `BASKETBALL_ADMIN_PASSWORD` 在首次初始化时指定管理员密码。账号隔离和发布流程见 [PRIVATE-WORKSPACES.md](PRIVATE-WORKSPACES.md)。
