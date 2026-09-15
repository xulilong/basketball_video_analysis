# 球场时刻 · Android

面向篮球爱好者的独立原生安卓 App。包名 `com.courtmoments.app`，最低 Android 8.0，当前内测版 0.2.0。

界面由原生 Activity/View 构成，不使用 WebView。账号登录通过 HTTPS 直接访问服务；会话使用 Android Keystore AES-GCM 加密后本机保存。视频分析仍在服务器运行，不能离线分析。

## 功能

- 登录、注册、退出；独立账号与数据空间。
- “我的”：姓名、球衣号码、拍照/上传照片、选择历史照片、跨视频累计得分与进球。个人档案及封面照片保存在账号下，换手机登录可恢复。
- “精彩记录”：现场拍摄先选择个人/团队；已有视频先上传，再选择个人/团队。
- 个人默认使用自己的档案和上次选中的照片。
- 团队创建球局、命名球队、二维码/链接邀请、选择队伍、自填资料、创建者代录和管理成员照片。
- 已上传但未创建记录的视频，可在同一设备继续；视频分片上传后提交分析与剪辑；历史记录可恢复查看处理进度、个人/队伍得分。
- 原生核对球员归属，预览/下载全部集锦、专属集锦，或选择部分片段合成下载。
- 注册无需公司账号；不导入 MT 公司名单，不展示内部公共看板和管理入口。

## 服务端隔离

复用项目的分析/剪辑代码，使用**另一个进程和存储根**部署：

```
PORT=3005
BASKETBALL_PRODUCT=public
BASKETBALL_DATA_DIR=/absolute/path/to/independent-data
BASKETBALL_PUBLIC_ORIGIN=https://your-public-origin.example
```

`BASKETBALL_PRODUCT=public` 使用独立的下载/扫码报名外观。独立存储根不复制 `default-roster.json`、账号库或工作台视频。二维码报名页支持普通手机浏览器；已安装用户也可通过 `courtmoments://join?invite=...` 进入 App。

MT 现有服务保持原存储根和入口。对外预览服务当前仍运行在本机，经临时公网隧道访问；不是永久云端部署。

## 构建

JDK 17、Android SDK 35、Build Tools 34.0.0，Gradle 8.9。

`local.properties`（不提交）中设置 `sdk.dir=/absolute/path/to/sdk`，然后：

```sh
./gradlew assembleDebug lintDebug -PserverUrl=https://your-public-origin.example
```

输出 `app/build/outputs/apk/debug/app-debug.apk`。调试签名只用于内测；不是应用商店发布包。

将 APK 复制到 `.local-run/releases/CourtMoments-debug.apk` 后，独立服务的 `/api/android` 可下载。APK 不提交到 Git。

## 产品边界

单段视频最大 500 MB，上传时保持应用在前台。服务器接收后异步处理，离开后可从历史恢复查看。原视频临时保存于服务端，不自动删除用户拍摄的原件。

当前视觉模型仍是实验能力：照片用于档案与报名，尚不能可靠地仅凭照片自动认人；两分/三分及进球归属可能需要核对。专属集锦只纳入归属明确的片段，歧义及混合片段保留在全部集锦中。本轮独立产品开发不代表模型精度提升。

## 本轮验证

- Android APK 构建、Lint、签名校验以及 Next.js 生产构建通过。
- 账号请求超时/重试、独立工作区、个人档案跨会话恢复与启动接口隔离测试通过。
- Android 15 ARM64 模拟器实测：登录与重启恢复、档案修改、上传后选择个人/团队、团队成员管理、二维码解码、提交分析，以及系统相机录像后返回上传。
- 使用合成短视频验证处理链路，分析和剪辑任务完成，正确返回无进球。没有据此验证真实篮球识别准确率。
- 真机不同厂商相机、长视频上传、后台切换和导出到相册的兼容性仍需进一步验证。
