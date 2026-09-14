import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  storageRoot,
  workspaceContext,
  type WorkspaceUser,
} from "./workspace-context";
type Account = WorkspaceUser & { salt: string; passwordHash: string };
type Store = {
  users: Account[];
  sessions: { hash: string; userId: string; expires: number }[];
};
export const sessionCookie = "mt_session";
export async function accounts<T>(
  fn: (store: Store) => T | Promise<T>
): Promise<T> {
  const root = path.join(storageRoot(), "access");
  await mkdir(root, { recursive: true });
  const lock = path.join(root, "lock");
  let acquired = false;
  for (let n = 0; n < 200; n++) {
    try {
      await mkdir(lock);
      acquired = true;
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const info = await stat(lock).catch(() => null);
      if (info && Date.now() - info.mtimeMs > 60000)
        await rm(lock, { recursive: true, force: true });
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  if (!acquired) throw new Error("账号服务繁忙，请稍后重试");
  try {
    const file = path.join(root, "accounts.json");
    const db: Store = await readFile(file, "utf8")
      .then(JSON.parse)
      .catch((e) => {
        if (e.code === "ENOENT") return { users: [], sessions: [] };
        throw e;
      });
    db.sessions = db.sessions.filter((s) => s.expires > Date.now());
    const result = await fn(db);
    const temp = file + "." + randomUUID();
    await writeFile(temp, JSON.stringify(db), { mode: 0o600 });
    await rename(temp, file);
    return result;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
function newAccount(
  username: string,
  password: string,
  role: Account["role"]
): Account {
  const salt = randomBytes(16).toString("hex");
  return {
    id: randomUUID(),
    username,
    role,
    salt,
    passwordHash: scryptSync(password, salt, 32).toString("hex"),
  };
}
export async function bootstrapAdmin(password: string) {
  if (password.length < 12) throw new Error("管理员密码至少 12 位");
  return accounts((db) => {
    if (db.users.some((u) => u.role === "admin")) return false;
    db.users.push(newAccount("admin", password, "admin"));
    return true;
  });
}
function publicUser(u: Account): WorkspaceUser {
  return { id: u.id, username: u.username, role: u.role };
}
const attempts = new Map<string, { count: number; until: number }>();
export async function authenticate(
  action: string,
  username: unknown,
  password: unknown
) {
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !/^[\p{L}\p{N}_-]{2,30}$/u.test(username) ||
    password.length < 8 ||
    password.length > 128
  )
    throw new Error("用户名为 2–30 位文字、数字或下划线；密码为 8–128 位");
  const key = username.toLowerCase(),
    now = Date.now();
  const attempt = attempts.get(key);
  if (attempt && attempt.until > now && attempt.count >= 10)
    throw new Error("尝试过于频繁，请 10 分钟后重试");
  attempts.set(key, {
    count: attempt && attempt.until > now ? attempt.count + 1 : 1,
    until: attempt && attempt.until > now ? attempt.until : now + 600000,
  });
  if (attempts.size > 1000)
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  return accounts((db) => {
    if (!db.users.some((u) => u.role === "admin"))
      throw new Error("管理员尚未初始化");
    let user = db.users.find((u) => u.username.toLowerCase() === key);
    if (action === "register") {
      if (user) throw new Error("该用户名已被使用");
      if (db.users.length >= 101) throw new Error("当前试用账号数量已达上限");
      user = newAccount(username, password, "user");
      db.users.push(user);
    } else if (action === "login") {
      const hash = scryptSync(password, user?.salt || "missing-account", 32);
      if (
        !user ||
        !timingSafeEqual(hash, Buffer.from(user.passwordHash, "hex"))
      )
        throw new Error("用户名或密码不正确");
    } else throw new Error("不支持的账号操作");
    attempts.delete(key);
    const token = randomBytes(32).toString("hex");
    db.sessions.push({
      hash: createHash("sha256").update(token).digest("hex"),
      userId: user.id,
      expires: now + 7 * 86400000,
    });
    return { user: publicUser(user), token };
  });
}
export function cookieToken(request: Request) {
  return (
    (request.headers.get("cookie") || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(sessionCookie + "="))
      ?.slice(sessionCookie.length + 1) || ""
  );
}
export async function sessionUser(
  request: Request
): Promise<WorkspaceUser | null> {
  const token = cookieToken(request);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return accounts((db) => {
    const s = db.sessions.find(
      (s) => s.hash === createHash("sha256").update(token).digest("hex")
    );
    const u = s && db.users.find((u) => u.id === s.userId);
    return u ? publicUser(u) : null;
  });
}
export async function logout(request: Request) {
  const hash = createHash("sha256").update(cookieToken(request)).digest("hex");
  await accounts((db) => {
    db.sessions = db.sessions.filter((s) => s.hash !== hash);
  });
}
export function workspaceRoute<T extends unknown[]>(
  handler: (request: Request, ...args: T) => Promise<Response>
) {
  return async (request: Request, ...args: T): Promise<Response> => {
    try {
      const user = await sessionUser(request);
      if (!user)
        return Response.json(
          { error: "请先登录" },
          { status: 401, headers: { "Cache-Control": "no-store" } }
        );
      const url = new URL(request.url);
      if (
        [
          "/api/local-sample",
          "/api/sample-review",
          "/api/automatic-scores",
        ].includes(url.pathname) &&
        user.role !== "admin"
      )
        return Response.json({ error: "没有权限" }, { status: 403 });
      const response = await workspaceContext.run(user, () =>
        handler(request, ...args)
      );
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "请求失败" },
        { status: 500 }
      );
    }
  };
}
