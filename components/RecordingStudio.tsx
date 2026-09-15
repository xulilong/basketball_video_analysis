"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import {
  Camera,
  Upload,
  UserRound,
  Users,
  ArrowRight,
  Plus,
  Film,
  ChevronLeft,
  Download,
} from "lucide-react";
import { uploadVideoChunks } from "@/lib/upload-client";
import type { Recording } from "@/lib/recording-types";
import type { Person } from "@/lib/workbench-types";
async function request(url: string, body?: unknown) {
  const r = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" }
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "请求失败");
  return d;
}
type Detail = {
  record: Recording;
  members: (Recording["members"][number] & {
    name: string;
    photo: string;
    jerseyNumber?: string;
    made: number;
    knownPoints: number;
    unknownValue: number;
  })[];
  scope: {
    files: string[];
    signature: string;
    selection: {
      key: string;
      progress: { status: string; message?: string };
    } | null;
  };
  unmatched: number;
  video: { id: string; status: string } | null;
  highlights: {
    progress?: { status: string; message: string; percent: number };
    result?: {
      generation?: string;
      clips: { file: string; start: number; end: number; baskets: number[] }[];
    };
  } | null;
};
export function RecordingStudio({ join = false }: { join?: boolean }) {
  const [people, setPeople] = useState<Person[]>([]),
    [history, setHistory] = useState<Recording[]>([]),
    [mode, setMode] = useState<"personal" | "team">("personal"),
    [source, setSource] = useState<"upload" | "camera" | null>(null),
    [personId, setPersonId] = useState(""),
    [name, setName] = useState(""),
    [number, setNumber] = useState(""),
    [title, setTitle] = useState(""),
    [teams, setTeams] = useState<[string, string]>(["A队", "B队"]),
    [members, setMembers] = useState<Recording["members"]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [id, setId] = useState(""),
    [pending, setPending] = useState<{ id: string; name: string } | null>(null),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [qr, setQr] = useState(""),
    [invite, setInvite] = useState<{
      title: string;
      teams: string[];
      closed: boolean;
    } | null>(null),
    [joinTeam, setJoinTeam] = useState("A"),
    [joinToken, setJoinToken] = useState("");
  const file = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null),
    photo = useRef<HTMLInputElement>(null);
  async function loadProfiles() {
    const d = await request("/api/players");
    setPeople(d.players.filter((p: Person) => p.roster && !p.archived));
    return d.players as Person[];
  }
  useEffect(() => {
    let live = true;
    Promise.all([request("/api/players"), request("/api/recordings")])
      .then(([p, h]) => {
        if (!live) return;
        setPeople(p.players.filter((p: Person) => p.roster && !p.archived));
        setHistory(h);
        const last = h.find((r: Recording) => r.mode === "personal");
        if (last) setPersonId(last.members[0]?.personId || "");
      })
      .catch((e) => setError(e.message));
    const params = new URLSearchParams(window.location.search);
    if (join) {
      const token = params.get("invite") || "";
      setJoinToken(token);
      request(`/api/recordings/invite/${token}`)
        .then(setInvite)
        .catch((e) => setError(e.message));
    } else setId(params.get("id") || "");
    return () => {
      live = false;
    };
  }, [join]);
  useEffect(() => {
    if (!id) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const d = await request(`/api/recordings/${id}`);
        if (live) {
          setDetail(d);
          if (!d.record.videoId && d.record.draftVideoId)
            setPending({ id: d.record.draftVideoId, name: "已上传的视频" });
          setMembers(d.record.members);
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "读取失败");
      }
      if (live) timer = setTimeout(poll, 3000);
    }
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [id]);
  useEffect(() => {
    const token = detail?.record.mode === "team" ? detail.record.invite : null;
    let live = true;
    if (token)
      QRCode.toDataURL(`${window.location.origin}/join?invite=${token}`, {
        width: 220,
        margin: 2,
      }).then((s) => {
        if (live) setQr(s);
      });
    else setQr("");
    return () => {
      live = false;
    };
  }, [detail?.record.invite, detail?.record.mode]);
  const exportAttempt = useRef("");
  useEffect(() => {
    if (
      !detail?.video ||
      detail.video.status !== "complete" ||
      detail.highlights?.progress?.status !== "complete" ||
      !detail.scope.files.length ||
      detail.scope.selection
    )
      return;
    const key = detail.record.id + detail.scope.signature;
    if (exportAttempt.current === key) return;
    exportAttempt.current = key;
    request(`/api/recordings/${detail.record.id}`, { action: "export" }).catch(
      (e) => setError(e.message)
    );
  }, [detail]);
  const selected = people.find((p) => p.id === personId);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  async function addPerson() {
    await act(async () => {
      const p = await request("/api/players", { name, jerseyNumber: number });
      await loadProfiles();
      setPersonId(p.id);
      setName("");
      setNumber("");
    });
  }
  async function choosePhoto(photoId: string) {
    const r = await fetch("/api/players", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "cover", id: personId, photoId }),
    });
    if (!r.ok) throw new Error((await r.json()).error);
    await loadProfiles();
  }
  async function uploadPhoto(f?: File) {
    if (!f || !personId) return;
    await act(async () => {
      const r = await fetch(`/api/players/${personId}/photos`, {
        method: "POST",
        body: f,
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error);
      await choosePhoto(p.id);
    });
  }
  async function uploadVideo(f?: File) {
    if (!f) return;
    await act(async () => {
      setProgress(0);
      try {
        const { video } = await uploadVideoChunks(f, setProgress);
        setPending({ id: video.id, name: video.name });
        if (id) {
          const d = await request(`/api/recordings/${id}`, {
            videoId: video.id,
          });
          if (d.errors?.length) throw new Error(d.errors.join("；"));
          setDetail(await request(`/api/recordings/${id}`));
        } else setSource("upload");
      } finally {
        setProgress(null);
      }
    });
  }
  function openRecord(key: string) {
    setDetail(null);
    setPending(null);
    setId(key);
    window.history.replaceState(null, "", `/record?id=${key}`);
  }
  async function create() {
    await act(async () => {
      const r = await request("/api/recordings", {
        mode,
        title,
        teams,
        draftVideoId: pending?.id,
        members: mode === "personal" ? [{ personId, team: "A" }] : members,
      });
      setId(r.id);
      window.history.replaceState(null, "", `/record?id=${r.id}`);
      setDetail(await request(`/api/recordings/${r.id}`));
      setHistory(await request("/api/recordings"));
    });
  }
  async function saveMembers(next: Recording["members"]) {
    await act(async () => {
      await request(`/api/recordings/${id}`, {
        action: "members",
        members: next,
      });
      setDetail(await request(`/api/recordings/${id}`));
      setPersonId("");
    });
  }
  const portrait = (
    <section className="mt-panel p-5 space-y-4">
      <h2>本次记录谁的精彩？</h2>
      <select
        aria-label="选择个人档案"
        className="mt-record-input"
        value={personId}
        onChange={(e) => setPersonId(e.target.value)}
      >
        <option value="">选择球员档案</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.jerseyNumber !== undefined ? ` · ${p.jerseyNumber}号` : ""}
          </option>
        ))}
      </select>
      {selected && (
        <>
          <div className="flex items-center gap-4">
            <Image
              src={selected.photo}
              alt={selected.name}
              width={80}
              height={80}
              unoptimized
              className="rounded-2xl object-cover w-20 h-20"
            />
            <div>
              <strong>{selected.name}</strong>
              <p className="text-xs text-slate-500 mt-1">
                默认沿用上次选择的照片
              </p>
              <button
                className="mt-text-link mt-2"
                disabled={busy}
                onClick={() => photo.current?.click()}
              >
                拍摄 / 上传新照片
              </button>
            </div>
          </div>
          {!!selected.referencePhotos?.length && (
            <div>
              <p className="text-sm text-slate-500 mb-2">选择历史照片</p>
              <div className="flex gap-2 flex-wrap">
                {selected.referencePhotos.map((p) => (
                  <button
                    aria-label="使用这张历史照片"
                    key={p.id}
                    disabled={busy}
                    onClick={() => void act(() => choosePhoto(p.id))}
                    className={`rounded-xl p-1 border-2 ${
                      p.url === selected.photo
                        ? "border-orange-500"
                        : "border-transparent"
                    }`}
                  >
                    <Image
                      src={p.url}
                      width={56}
                      height={56}
                      unoptimized
                      alt="历史照片"
                      className="w-14 h-14 object-cover rounded-lg"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <details>
        <summary className="mt-text-link">没有自己的档案？新增球员</summary>
        <div className="grid gap-3 mt-3">
          <input
            className="mt-record-input"
            placeholder="姓名"
            aria-label="新球员姓名"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="mt-record-input"
            placeholder="球衣号码（可不填）"
            aria-label="新球员号码"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <button
            className="mt-primary"
            disabled={busy || !name.trim()}
            onClick={() => void addPerson()}
          >
            <Plus size={16} />
            保存档案
          </button>
        </div>
      </details>
    </section>
  );
  return (
    <div className="mt-record-page space-y-5">
      <input
        ref={file}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          void uploadVideo(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={camera}
        type="file"
        accept="video/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void uploadVideo(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={photo}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void uploadPhoto(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="mt-page-heading">
        <div>
          <p className="mt-eyebrow">每一球，都值得记录</p>
          <h1>{join ? "加入本次球局" : "开启精彩记录"}</h1>
          <p>
            {join
              ? "填写你的信息，加入自己的队伍。"
              : "现场拍摄，或上传一段已有的比赛视频。"}
          </p>
        </div>
      </div>
      {error && (
        <p className="mt-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-panel p-4" role="status">
          {notice}
        </p>
      )}
      {progress !== null && (
        <div className="mt-panel p-5">
          <strong>正在上传视频 · {progress}%</strong>
          <progress
            className="w-full accent-orange-500 mt-3"
            value={progress}
            max={100}
          />
          <p className="text-xs text-slate-500">上传期间请保持 APP 在前台。</p>
        </div>
      )}
      {join ? (
        <>
          {invite && (
            <section className="mt-panel p-5">
              <h2>{invite.title}</h2>
              <p>{invite.teams.join(" VS ")}</p>
              {invite.closed && <p>球局已开始，暂不能加入。</p>}
            </section>
          )}
          {portrait}
          <section className="mt-panel p-5 space-y-4">
            <select
              className="mt-record-input"
              aria-label="加入的队伍"
              value={joinTeam}
              onChange={(e) => setJoinTeam(e.target.value)}
            >
              {invite?.teams.map((t, i) => (
                <option value={i ? "B" : "A"} key={i}>
                  {t}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              加入后，姓名、号码和当前选择的照片会提供给球局创建者，用于本场记录。
            </p>
            <button
              className="mt-primary"
              disabled={busy || !personId || !invite || invite.closed}
              onClick={() =>
                void act(async () => {
                  await request(`/api/recordings/invite/${joinToken}`, {
                    personId,
                    team: joinTeam,
                  });
                  setNotice("已加入本次球局，请交给拍摄者开始录制。");
                })
              }
            >
              确认加入
            </button>
          </section>
        </>
      ) : id ? (
        <>
          {!detail ? (
            <p>正在读取记录…</p>
          ) : (
            <>
              <section className="mt-record-hero">
                <span className="mt-pill">
                  {detail.record.mode === "personal" ? "个人记录" : "团队记录"}
                </span>
                <h2>{detail.record.title}</h2>
                <p>
                  {detail.record.mode === "personal"
                    ? detail.members[0]?.name
                    : detail.record.teams.join(" VS ")}
                </p>
              </section>
              {!detail.video && (
                <>
                  <section className="mt-panel p-5 space-y-4">
                    <h2>本场名单</h2>
                    {detail.members.map((m) => (
                      <p key={m.personId}>
                        {m.name} · {m.jerseyNumber || "未填号码"}
                        {detail.record.mode === "team"
                          ? ` · ${detail.record.teams[m.team === "A" ? 0 : 1]}`
                          : ""}
                      </p>
                    ))}
                    {detail.record.mode === "team" && (
                      <>
                        <select
                          className="mt-record-input"
                          aria-label="代录球员"
                          value={personId}
                          onChange={(e) => setPersonId(e.target.value)}
                        >
                          <option value="">选择要加入的球员</option>
                          {people
                            .filter(
                              (p) => !members.some((m) => m.personId === p.id)
                            )
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                        <div className="flex flex-wrap gap-2">
                          {detail.record.teams.map((t, i) => (
                            <button
                              className="mt-primary"
                              key={i}
                              disabled={busy || !personId}
                              onClick={() =>
                                void saveMembers([
                                  ...members,
                                  { personId, team: i ? "B" : "A" },
                                ])
                              }
                            >
                              加入 {t}
                            </button>
                          ))}
                        </div>
                        <details>
                          <summary className="mt-text-link">代录新成员</summary>
                          {portrait}
                        </details>
                        {members.map((m) => (
                          <button
                            key={m.personId}
                            className="mt-text-link mr-3"
                            disabled={busy}
                            onClick={() =>
                              void saveMembers(
                                members.filter((p) => p.personId !== m.personId)
                              )
                            }
                          >
                            移除{" "}
                            {people.find((p) => p.id === m.personId)?.name ||
                              detail.members.find(
                                (p) => p.personId === m.personId
                              )?.name}
                          </button>
                        ))}
                      </>
                    )}
                  </section>
                  {detail.record.mode === "team" && (
                    <section className="mt-panel p-5 flex flex-wrap items-center gap-5">
                      {qr && (
                        <Image
                          src={qr}
                          alt="球局加入二维码"
                          width={180}
                          height={180}
                          unoptimized
                        />
                      )}
                      <div>
                        <h2>扫码填写资料，加入球队</h2>
                        <p className="text-sm text-slate-500 my-3">
                          队员也可以在手机浏览器中填写。
                        </p>
                        <button
                          className="mt-text-link"
                          onClick={() =>
                            void act(async () => {
                              await navigator.clipboard.writeText(
                                `${window.location.origin}/join?invite=${detail.record.invite}`
                              );
                              setNotice("邀请链接已复制");
                            })
                          }
                        >
                          复制邀请链接
                        </button>
                      </div>
                    </section>
                  )}
                  <section className="mt-panel p-5 space-y-4">
                    <h2>
                      {pending ? "视频已上传，准备开始" : "名单就绪，开始记录"}
                    </h2>
                    {pending && <p>{pending.name}</p>}
                    <div className="flex flex-wrap gap-3">
                      {pending ? (
                        <button
                          className="mt-primary"
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              const r = await request(`/api/recordings/${id}`, {
                                videoId: pending.id,
                              });
                              if (r.errors?.length)
                                throw new Error(r.errors.join("；"));
                              setDetail(await request(`/api/recordings/${id}`));
                            })
                          }
                        >
                          开始分析与自动剪辑 <ArrowRight size={16} />
                        </button>
                      ) : (
                        <>
                          <button
                            className="mt-primary"
                            disabled={
                              busy ||
                              (detail.record.mode === "team" &&
                                (!members.some((m) => m.team === "A") ||
                                  !members.some((m) => m.team === "B")))
                            }
                            onClick={() => camera.current?.click()}
                          >
                            <Camera size={18} />
                            开始拍摄
                          </button>
                          <button
                            className="mt-text-link"
                            disabled={busy}
                            onClick={() => file.current?.click()}
                          >
                            <Upload size={17} />
                            上传已有视频
                          </button>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      拍摄结束后自动上传、分析并剪辑。建议固定机位，完整拍到篮筐与场上球员。单段最大
                      500 MB。
                    </p>
                  </section>
                </>
              )}
              {detail.video && (
                <>
                  <section className="mt-panel p-5 space-y-3">
                    <h2>自动处理进度</h2>
                    <p>
                      个人数据：
                      {(
                        {
                          queued: "排队中",
                          running: "分析中",
                          complete: "分析完成",
                          failed: "分析失败",
                          cancelled: "已取消",
                          uploaded: "待启动",
                        } as Record<string, string>
                      )[detail.video.status] || detail.video.status}
                    </p>
                    <p>
                      进球剪辑：
                      {detail.highlights?.progress?.message || "等待启动"}
                    </p>
                    {detail.record.launchErrors?.map((e) => (
                      <p className="mt-error" key={e}>
                        {e}
                      </p>
                    ))}
                    <button
                      className="mt-text-link"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const r = await request(`/api/recordings/${id}`, {
                            videoId: detail.video!.id,
                          });
                          setNotice(r.errors?.join("；") || "任务已提交");
                        })
                      }
                    >
                      重新提交未完成任务
                    </button>
                  </section>
                  <section className="mt-panel p-5 space-y-4">
                    <h2>
                      {detail.record.mode === "personal"
                        ? "个人表现"
                        : "两队得分"}
                    </h2>
                    {detail.record.mode === "team" && (
                      <div className="grid grid-cols-2 gap-4">
                        {detail.record.teams.map((t, i) => (
                          <div className="mt-record-score" key={i}>
                            <p>{t}</p>
                            <strong>
                              {detail.members
                                .filter((m) => m.team === (i ? "B" : "A"))
                                .reduce((s, m) => s + m.knownPoints, 0)}
                            </strong>
                            <small>已判定得分</small>
                          </div>
                        ))}
                      </div>
                    )}
                    {detail.members.map((m) => (
                      <div
                        key={m.personId}
                        className="flex items-center justify-between border-b border-slate-100 py-3"
                      >
                        <strong>{m.name}</strong>
                        <span>
                          {m.knownPoints} 分 · {m.made} 个进球
                          {m.unknownValue
                            ? ` · ${m.unknownValue} 球待判分`
                            : ""}
                        </span>
                      </div>
                    ))}
                    <p className="text-sm text-slate-500">
                      {detail.unmatched}{" "}
                      个候选进球尚未关联到本场成员。照片目前用于档案管理，不能保证自动认人；未关联或未判分不代表实际零分。
                    </p>
                    <Link
                      href={`/statistics?video=${detail.video.id}`}
                      className="mt-text-link"
                    >
                      核对球员关联与统计 <ArrowRight size={15} />
                    </Link>
                  </section>
                  <section className="mt-panel p-5 space-y-4">
                    <h2>
                      {detail.record.mode === "personal"
                        ? "个人进球集锦"
                        : "本场成员进球集锦"}
                    </h2>
                    {detail.scope.selection?.progress.status === "complete" ? (
                      <>
                        <video
                          controls
                          playsInline
                          className="w-full rounded-xl bg-black"
                          src={`/api/videos/${detail.video.id}/highlights/media?selection=${detail.scope.selection.key}`}
                        />
                        <a
                          className="mt-primary"
                          href={`/api/videos/${detail.video.id}/highlights/media?selection=${detail.scope.selection.key}&download=1`}
                        >
                          <Download size={17} />
                          下载专属集锦
                        </a>
                      </>
                    ) : (
                      <p className="text-sm text-slate-500">
                        {detail.scope.selection?.progress.message ||
                          (detail.scope.files.length
                            ? "正在准备已关联的进球片段"
                            : "暂时没有能明确关联到所选球员的片段，核对球员归属后会自动生成。")}
                      </p>
                    )}
                    {detail.scope.files.length > 0 &&
                      detail.scope.selection?.progress.status !== "complete" &&
                      detail.scope.selection?.progress.status !== "running" && (
                        <button
                          className="mt-text-link"
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              await request(`/api/recordings/${id}`, {
                                action: "export",
                                retry: true,
                              });
                              setDetail(await request(`/api/recordings/${id}`));
                            })
                          }
                        >
                          重试生成专属集锦
                        </button>
                      )}
                    <p className="text-xs text-slate-500">
                      仅纳入能明确关联的进球；混合了其他人进球的连续片段暂不自动纳入。
                    </p>
                  </section>
                  <section className="mt-panel p-5 space-y-4">
                    <h2>本视频全部进球片段</h2>
                    {detail.highlights?.result?.clips?.length ? (
                      <>
                        <video
                          controls
                          playsInline
                          className="w-full rounded-xl bg-black"
                          src={`/api/videos/${detail.video.id}/highlights/media`}
                        />
                        <a
                          className="mt-primary"
                          href={`/api/videos/${detail.video.id}/highlights/media?download=1`}
                        >
                          <Download size={17} />
                          下载视频进球集锦
                        </a>
                        <Link
                          className="mt-text-link"
                          href={`/highlights?video=${detail.video.id}`}
                        >
                          选择片段并导出
                        </Link>
                      </>
                    ) : (
                      <p className="text-sm text-slate-500">
                        集锦完成后会显示在这里。
                      </p>
                    )}
                    {detail.record.mode === "personal" && (
                      <p className="text-xs text-slate-500">
                        这里包含本视频检测到的全部进球，可自行选择片段导出。
                      </p>
                    )}
                  </section>
                </>
              )}
              <button
                className="mt-text-link"
                disabled={busy}
                onClick={() => {
                  setId("");
                  setDetail(null);
                  setPending(null);
                  setSource(null);
                  setMembers([]);
                  setTitle("");
                  setTeams(["A队", "B队"]);
                  window.history.replaceState(null, "", "/record");
                  void request("/api/recordings").then(setHistory);
                }}
              >
                <ChevronLeft size={16} />
                返回精彩记录
              </button>
            </>
          )}
        </>
      ) : (
        <>
          {!source ? (
            <>
              <section className="mt-record-hero">
                <p>MAKE EVERY SHOT COUNT</p>
                <h2>
                  你的下一次高光，
                  <br />
                  从这里开始。
                </h2>
                <p>一个人练习，或和队友打一场。</p>
              </section>
              <div className="grid sm:grid-cols-2 gap-4">
                <button
                  className="mt-record-choice"
                  disabled={busy}
                  onClick={() => setSource("camera")}
                >
                  <Camera size={28} />
                  <strong>现场拍摄</strong>
                  <span>先确认记录对象，再开启摄像头</span>
                </button>
                <button
                  className="mt-record-choice"
                  disabled={busy}
                  onClick={() => file.current?.click()}
                >
                  <Upload size={28} />
                  <strong>上传视频</strong>
                  <span>从相册选择，再选个人或团队记录</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                className="mt-text-link"
                disabled={busy}
                onClick={() => setSource(null)}
              >
                <ChevronLeft size={16} />
                返回
              </button>
              {pending && (
                <p className="mt-panel p-4">已上传：{pending.name}</p>
              )}
              <h2>这次，记录谁的精彩？</h2>
              <div className="grid grid-cols-2 gap-3">
                {(["personal", "team"] as const).map((m) => (
                  <button
                    key={m}
                    className={`mt-record-choice ${
                      mode === m ? "selected" : ""
                    }`}
                    onClick={() => setMode(m)}
                  >
                    {m === "personal" ? (
                      <UserRound size={24} />
                    ) : (
                      <Users size={24} />
                    )}
                    <strong>
                      {m === "personal" ? "个人记录" : "团队记录"}
                    </strong>
                    <span>
                      {m === "personal"
                        ? "我的得分与高光"
                        : "本次球局与两队表现"}
                    </span>
                  </button>
                ))}
              </div>
              {mode === "personal" ? (
                portrait
              ) : (
                <section className="mt-panel p-5 space-y-3">
                  <h2>创建本次球局</h2>
                  <p className="text-sm text-slate-500">
                    创建后可以扫码加入，也可以代录成员。
                  </p>
                  {teams.map((t, i) => (
                    <input
                      key={i}
                      aria-label={`队伍${i + 1}名称`}
                      className="mt-record-input"
                      value={t}
                      onChange={(e) =>
                        setTeams(
                          i
                            ? [teams[0], e.target.value]
                            : [e.target.value, teams[1]]
                        )
                      }
                    />
                  ))}
                </section>
              )}
              <input
                aria-label="记录名称"
                className="mt-record-input"
                placeholder={
                  mode === "personal"
                    ? "给这次记录起个名字（选填）"
                    : "球局名称（选填）"
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <button
                className="mt-primary"
                disabled={busy || (mode === "personal" && !personId)}
                onClick={() => void create()}
              >
                {mode === "personal" ? "确认个人记录" : "创建球局"}
                <ArrowRight size={17} />
              </button>
            </>
          )}
          {!!history.length && (
            <section className="mt-panel p-5 space-y-3">
              <h2>我的记录</h2>
              {history.map((r) => (
                <button
                  key={r.id}
                  className="mt-record-history"
                  onClick={() => openRecord(r.id)}
                >
                  <Film size={20} />
                  <span>
                    <strong>{r.title}</strong>
                    <small>
                      {r.mode === "personal" ? "个人" : "团队"} ·{" "}
                      {new Date(r.createdAt).toLocaleDateString("zh-CN")}
                    </small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
