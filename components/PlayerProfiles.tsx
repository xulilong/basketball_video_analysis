"use client";
import { useAccount } from "./AccountAccess";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Plus,
  Search,
  Users,
  Upload,
  ArrowUpRight,
  X,
  ImagePlus,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
} from "lucide-react";
import type { Person, PersonStats } from "@/lib/workbench-types";
type Profile = Omit<Person, "descriptors">;
export function PlayerProfiles() {
  const { user } = useAccount();
  const [players, setPlayers] = useState<Profile[]>([]),
    [stats, setStats] = useState<PersonStats[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [scope, setScope] = useState("roster"),
    [search, setSearch] = useState(""),
    [sortBy, setSortBy] = useState("number"),
    [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{
    id: string;
    name: string;
    jerseyNumber: string;
    target: string;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    photoInput = useRef<HTMLInputElement>(null);
  async function load() {
    try {
      const r = await fetch("/api/players", { cache: "no-store" });
      if (!r.ok) throw new Error("无法读取球员档案");
      const data = await r.json();
      setPlayers(data.players);
      setStats(data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    setPage(1);
  }, [scope, search, sortBy]);
  useEffect(() => {
    if (editor && !dialog.current?.open) dialog.current?.showModal();
  }, [editor]);
  async function mutate(body: unknown, method = "PATCH") {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/players", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      await load();
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
      return null;
    } finally {
      setBusy(false);
    }
  }
  const selected = players.find((p) => p.id === editor?.id);
  async function uploadPhoto(file?: File) {
    if (!file || !editor) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("照片不能超过 10 MB");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/players/${editor.id}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "照片上传失败");
    } finally {
      setBusy(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  }
  const activeRoster = players.filter((p) => p.roster && !p.archived),
    candidates = players.filter((p) => !p.roster && !p.archived),
    archived = players.filter((p) => p.archived);
  const rows = (
    scope === "roster"
      ? activeRoster
      : scope === "candidates"
      ? candidates
      : archived
  )
    .filter((p) =>
      `${p.name} ${p.jerseyNumber ?? ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    )
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name, "zh-CN-u-co-pinyin", {
        numeric: true,
        sensitivity: "base",
      });
      if (sortBy === "name") return byName;
      const numberA = a.jerseyNumber?.trim()
        ? Number(a.jerseyNumber)
        : Infinity;
      const numberB = b.jerseyNumber?.trim()
        ? Number(b.jerseyNumber)
        : Infinity;
      return numberA - numberB || byName;
    });
  const pages = Math.max(1, Math.ceil(rows.length / 12)),
    currentPage = Math.min(page, pages);
  function edit(p?: Profile) {
    setError("");
    setEditor({
      id: p?.id ?? "new",
      name: p?.name ?? "",
      jerseyNumber: p?.jerseyNumber ?? "",
      target: "",
    });
  }
  return (
    <div className="mt-roster space-y-6">
      <div className="mt-page-heading">
        <div>
          <p className="mt-eyebrow">THE TEAM ROSTER</p>
          <h1>球员档案</h1>
          <p>认识每一位队友，为比赛记录建立清晰的身份。</p>
        </div>
        <button className="mt-primary" onClick={() => edit()}>
          <Plus size={17} />
          新增球员
        </button>
      </div>
      <div className="mt-roster-intro">
        <div className="mt-feature-icon">
          <Users size={26} />
        </div>
        <div>
          <h2>一位球员，一份专属档案</h2>
          <p>
            初始姓名与号码来自球队名单。照片、档案修改和视频关联仅保存在当前账号。
          </p>
        </div>
        <Link href="/statistics" className="mt-text-link">
          进入视频分析 <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="mt-roster-summary">
        <span>
          <strong>{activeRoster.length}</strong> 正式球员
        </span>
        <span>
          <strong>
            {activeRoster.filter((p) => p.referencePhotos?.length).length}
          </strong>{" "}
          已补充照片
        </span>
        <span>
          <strong>{candidates.length}</strong> 待关联人物
        </span>
      </div>
      <div className="mt-roster-toolbar">
        <div className="mt-roster-tabs" role="group" aria-label="档案分类">
          {[
            ["roster", "正式球员", activeRoster.length],
            ["candidates", "待关联人物", candidates.length],
            ["archived", "已归档", archived.length],
          ].map(([key, label, count]) => (
            <button
              key={key}
              aria-pressed={scope === key}
              className={scope === key ? "active" : ""}
              onClick={() => setScope(String(key))}
            >
              {label}
              <small>{count}</small>
            </button>
          ))}
        </div>
        <div className="mt-roster-controls">
          <label className="mt-roster-sort">
            <span>排序</span>
            <select
              aria-label="球员档案排序"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="number">球衣号码升序</option>
              <option value="name">姓名首字母 A–Z</option>
            </select>
          </label>
          <label className="mt-search">
            <Search size={16} />
            <input
              aria-label="搜索姓名或球衣号码"
              placeholder="搜索姓名或球衣号码"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
      </div>
      {error && !editor && (
        <p role="alert" className="mt-error">
          {error}
          <button className="ml-3 underline" onClick={() => void load()}>
            重试
          </button>
        </p>
      )}
      {loading ? (
        <div className="mt-empty">
          <Loader2 className="animate-spin" />
          正在读取球员档案…
        </div>
      ) : !rows.length ? (
        <div className="mt-panel mt-empty">
          <Users size={30} />
          <h3>{search ? "没有找到匹配的球员" : "这里暂时没有球员档案"}</h3>
          <p>
            {scope === "roster"
              ? "点击“新增球员”建立档案，或尝试其他搜索条件。"
              : "人物识别记录可在这里整理与关联。"}
          </p>
        </div>
      ) : (
        <div className="mt-player-grid">
          {rows.slice((currentPage - 1) * 12, currentPage * 12).map((p) => {
            const s = stats.find((s) => s.id === p.id);
            return (
              <article className="mt-player-card" key={p.id}>
                <div className="mt-player-portrait">
                  <Image
                    unoptimized
                    src={p.photo || "/assets/player-placeholder.svg"}
                    alt={p.name}
                    width={240}
                    height={210}
                  />
                  <span className="mt-jersey">
                    {p.jerseyNumber ? `#${p.jerseyNumber}` : "—"}
                  </span>
                  <span className="mt-player-photo-count">
                    {p.referencePhotos?.length
                      ? `${p.referencePhotos.length} 张参考照片`
                      : p.roster
                      ? "待补充照片"
                      : "视频截图"}
                  </span>
                </div>
                <div className="mt-player-card-body">
                  <div>
                    <h3>{p.name}</h3>
                    <span className="mt-status">
                      {p.archived ? "已归档" : p.roster ? "正式球员" : "待关联"}
                    </span>
                  </div>
                  <p>
                    {s?.videos
                      ? `${s.videos} 个关联视频 · ${s.made} 个计入进球`
                      : "尚未关联比赛视频"}
                  </p>
                  <button onClick={() => edit(p)}>
                    {p.roster ? "管理档案" : "整理 / 关联球员"}
                    <ArrowUpRight size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="mt-pagination">
        <span>
          共 {rows.length} 条 · 第 {currentPage} / {pages} 页
        </span>
        <div>
          <button
            aria-label="上一页档案"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            aria-label="下一页档案"
            disabled={currentPage === pages}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="mt-profile-notes">
        {user?.role === "admin" && (
          <p>
            名单来源：
            <a
              href="https://magictavern.feishu.cn/sheets/NQgVsX4JfhqxPbtLfGDcvjjtnqb"
              target="_blank"
              rel="noreferrer"
            >
              飞书队服名单 <ArrowUpRight size={12} />
            </a>
            。导入后在当前工作空间独立管理，不会修改原表。相同号码可以属于不同球员。
          </p>
        )}
        <p>
          参考照片用于后续接入人脸匹配，建议上传清晰、无遮挡的正面和侧面照片。当前技术统计仍采用外观关联，人脸匹配尚未启用。
        </p>
      </div>
      {editor && (
        <dialog
          ref={dialog}
          aria-labelledby="profile-dialog-title"
          className="mt-profile-dialog"
          onCancel={(e) => {
            if (busy) e.preventDefault();
            else setEditor(null);
          }}
        >
          <div className="mt-profile-dialog-heading">
            <div>
              <p className="mt-eyebrow">PLAYER PROFILE</p>
              <h2 id="profile-dialog-title">
                {editor.id === "new" ? "新增球员" : "管理球员档案"}
              </h2>
            </div>
            <button
              aria-label="关闭档案编辑"
              disabled={busy}
              onClick={() => setEditor(null)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="mt-profile-dialog-body">
            {error && (
              <p role="alert" className="mt-error">
                {error}
              </p>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const data = await mutate(
                  {
                    type: "edit",
                    id: editor.id,
                    name: editor.name,
                    jerseyNumber: editor.jerseyNumber,
                  },
                  editor.id === "new" ? "POST" : "PATCH"
                );
                if (data) {
                  if (editor.id === "new")
                    setEditor({ ...editor, id: data.id });
                  else setEditor(null);
                }
              }}
            >
              <div className="mt-profile-fields">
                <label>
                  姓名
                  <input
                    required
                    maxLength={60}
                    value={editor.name}
                    disabled={busy}
                    onChange={(e) =>
                      setEditor({ ...editor, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  球衣号码
                  <input
                    maxLength={3}
                    inputMode="numeric"
                    pattern="[0-9]{0,3}"
                    placeholder="可留空"
                    value={editor.jerseyNumber}
                    disabled={busy}
                    onChange={(e) =>
                      setEditor({ ...editor, jerseyNumber: e.target.value })
                    }
                  />
                </label>
              </div>
              <button
                className="mt-primary mt-4"
                disabled={busy || !editor.name.trim()}
              >
                <Check size={16} />
                {editor.id === "new" ? "创建档案，继续上传照片" : "保存资料"}
              </button>
            </form>
            {selected && (
              <>
                <section className="mt-profile-photo-section">
                  <div className="mt-card-heading">
                    <h3>参考照片</h3>
                    <span>{selected.referencePhotos?.length ?? 0} / 8</span>
                  </div>
                  <p>
                    建议清晰正面、侧面各一张。JPG / PNG / WebP，每张不超过 10
                    MB。
                  </p>
                  <div className="mt-profile-photo-grid">
                    {selected.referencePhotos?.map((photo) => (
                      <div key={photo.id}>
                        <Image
                          unoptimized
                          src={photo.url}
                          alt={`${selected.name}参考照片`}
                          width={110}
                          height={130}
                        />
                        <button
                          disabled={busy}
                          onClick={() =>
                            void mutate({
                              type: "cover",
                              id: selected.id,
                              photoId: photo.id,
                            })
                          }
                        >
                          {selected.photo === photo.url
                            ? "当前封面"
                            : "设为封面"}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void mutate({
                              type: "removePhoto",
                              id: selected.id,
                              photoId: photo.id,
                            })
                          }
                        >
                          移除
                        </button>
                      </div>
                    ))}
                    <button
                      className="mt-photo-add"
                      disabled={
                        busy || (selected.referencePhotos?.length ?? 0) >= 8
                      }
                      onClick={() => photoInput.current?.click()}
                    >
                      {busy ? (
                        <Loader2 size={22} className="animate-spin" />
                      ) : (
                        <ImagePlus size={24} />
                      )}
                      本地上传
                    </button>
                  </div>
                  <input
                    ref={photoInput}
                    className="sr-only"
                    aria-label="上传球员参考照片"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => void uploadPhoto(e.target.files?.[0])}
                  />
                </section>
                {!selected.archived && (
                  <section className="mt-profile-merge">
                    <h3>关联到已有球员</h3>
                    <p>
                      确认是同一人后，将当前档案的照片和视频记录合并到目标球员，个人数据会重新汇总。
                    </p>
                    <select
                      aria-label="合并到正式球员"
                      value={editor.target}
                      disabled={busy}
                      onChange={(e) =>
                        setEditor({ ...editor, target: e.target.value })
                      }
                    >
                      <option value="">选择正式球员档案</option>
                      {activeRoster
                        .filter((p) => p.id !== editor.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.jerseyNumber ? ` · #${p.jerseyNumber}` : ""}
                          </option>
                        ))}
                    </select>
                    <button
                      className="mt-music-upload"
                      disabled={busy || !editor.target}
                      onClick={async () => {
                        if (
                          await mutate({
                            type: "merge",
                            id: editor.id,
                            target: editor.target,
                          })
                        )
                          setEditor(null);
                      }}
                    >
                      确认同一人，合并记录
                    </button>
                  </section>
                )}
                <div className="mt-profile-archive">
                  <p>归档后从常用名单隐藏，历史比赛数据仍会保留。</p>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await mutate({
                          type: "archive",
                          id: editor.id,
                          archived: !selected.archived,
                        })
                      )
                        setEditor(null);
                    }}
                  >
                    {selected.archived ? "恢复档案" : "归档球员"}
                  </button>
                </div>
              </>
            )}
          </div>
        </dialog>
      )}
    </div>
  );
}
