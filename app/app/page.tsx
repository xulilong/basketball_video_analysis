export default function PublicAppPage() {
  return (
    <section className="mt-panel p-8 space-y-5 mt-10">
      <p className="text-sm text-teal-600">COURT MOMENTS</p>
      <h1 className="text-3xl font-bold">记录每一次上场</h1>
      <p>属于每一位篮球爱好者的个人档案、比赛数据和精彩集锦。</p>
      <a className="mt-primary" href="/api/android">
        下载安卓内测版
      </a>
      <p className="text-sm text-slate-500">
        支持现场拍摄或上传视频，选择个人记录或团队记录。当前统计仍为实验功能，请核对识别结果。
      </p>
    </section>
  );
}
