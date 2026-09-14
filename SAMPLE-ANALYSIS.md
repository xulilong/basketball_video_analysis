# 实际录像：示例.mp4

## 输入与确认的需求

- 本地源文件：项目上一层的 `示例.mp4`，约 196 MiB。
- 视频长度 552.733 秒，1280 × 720，30 fps，H.264。文件包含 180° 旋转元数据，分析使用 ffmpeg 自动校正后的画面，原文件不修改。
- 固定篮下广角机位，左上篮筐可见。远端人物较小、存在遮挡，背景有其他场地人员。
- 用户确认：录像包含热身或死球后的投篮，不能将所有入筐动作视为有效比赛得分。
- 人数不固定，个人得分优先，不以分局、球衣号码或固定八人名单为前提。

## 本轮已落地

首页增加“打开文件夹中的示例.mp4”。通过固定本地文件接口播放，支持 HTTP Range 拖动，原视频不上传到外部服务。

“载入本地初筛结果”展示两个不同层级的证据：

1. 人物轨迹片段截图：只代表检测器的一段跟踪，不能将片段数当作球员人数。需要确认或合并后才加入球员档案。
2. 篮筐动作候选：针对本机位手工标定篮筐区域，扫描全片 16,582 帧，按篮网运动筛选出 30 段待回看片段。阈值为 12，峰值间隔大于 5 秒，回看窗口为峰值前 6 秒至后 2 秒。

这些候选**不是 30 个进球**。篮网余振、擦网、碰筐、抖动和死球投篮都可能进入候选；弱信号进球也可能漏检。窗口内可能有多个动作，峰值时间不是准确得分时间。候选默认不进入统计。

支持排除“热身 / 死球 / 非进球”。排除操作移除该候选建立的记账记录，并保留可恢复的排除标记。恢复只恢复待核对状态，不自动恢复得分。

候选草稿必须核对有效比赛、是否进球、得分者、分值和时间后再确认。尚未自动完成投篮者归属、两分/三分判断、有效比赛识别、助攻或篮板统计。

## 复现

第一轮人物试验实际处理了前 90 秒、450 个抽样帧，产生 70 个满足最短观察数的轨迹片段；同一人被多次拆分，因此这些编号不能直接用作球员 ID。跟踪输出仅 1 帧包含篮球记录，这不等于原始检测器的召回率，但说明该组合无法支撑连续球权与得分者判断。

已人工查看截图并按外观初步整理为 P01–P11，共 11 个候选档案。候选可能包含场边人员；身份、是否参赛及重复情况仍待用户确认。该整理是人工视觉初筛，不是自动重识别的准确率结果。

随后单独试验了 [Avi Shah 的篮球/篮筐专用权重](https://github.com/avishah3/AI-Basketball-Shot-Detection-Tracker)：前 90 秒、10 fps 的 900 帧中，184 帧返回篮球候选。该结果是原始预测输出，与上面的通用跟踪输出不属于同一个指标，不能据此计算提升倍数或准确率。观察到部分人员头部附近的可疑误报，球在飞行过程中仍有连续漏检；22.5–22.6 秒、47.7–47.8 秒附近可观察到篮网下方的篮球候选，但不能仅靠这一点决定有效比赛得分或得分者。详细结果为 `.local-run/sample-review/basketball-detection.json`。未把专用模型的输出自动计入正式统计。

```bash
python3 -m venv .venv-analysis
.venv-analysis/bin/python -m pip install 'ultralytics==8.3.0' 'opencv-python==4.10.0.84' 'numpy==1.26.4' lapx
mkdir -p .local-run/models .local-run/sample-review
curl -fL https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11s.pt -o .local-run/models/yolo11s.pt
ffmpeg -i ../示例.mp4 -vf fps=10 -c:v libx264 -preset ultrafast -crf 23 -an .local-run/sample-review/upright-10fps.mp4
.venv-analysis/bin/python scripts/scan-rim-motion.py ../示例.mp4 --output .local-run/sample-review
.venv-analysis/bin/python scripts/track-sample.py .local-run/sample-review/upright-10fps.mp4 --original ../示例.mp4 --seconds 90 --output .local-run/sample-review
```

人物初筛使用 [Ultralytics 官方跟踪接口](https://docs.ultralytics.com/modes/track/)，YOLO11s + ByteTrack。当前人物试验范围见页面实际报告；抽样帧的篮球检出比例只表示检出覆盖，不等于准确率。

分析产物放在 `.local-run/sample-review`，不提交视频或球员图片。结果使用源文件 SHA-256 绑定，更换原视频后不会误载旧结果。篮筐和场地边界是本视频的校准参数，不能直接套用其他机位。

## 验证与下一步

记账测试覆盖候选排除后撤销得分、未确认事件不计分、球员合并/移除/改归属和导出，共 7 项。生产构建通过；本地视频完整请求、Range 请求和越界 Range 均已检查。

优先补齐：用已确认人物截图评估身份串号；给真实有效进球、投失、热身/死球标注时间段；针对小球和篮筐训练或选用专用检测器；在这些依据上建立得分者归属，不能由篮网动作或离球最近的人直接生成正式得分。
