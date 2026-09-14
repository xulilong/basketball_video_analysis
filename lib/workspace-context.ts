import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
export type WorkspaceUser = {
  id: string;
  username: string;
  role: "admin" | "user";
};
export const workspaceContext = new AsyncLocalStorage<WorkspaceUser>();
export const storageRoot = () =>
  path.resolve(
    process.env.BASKETBALL_DATA_DIR ||
      path.join(process.cwd(), ".local-run/workbench")
  );
export function rootForUser(user: WorkspaceUser) {
  if (user.role === "admin") return storageRoot();
  if (!/^[a-f0-9-]{36}$/.test(user.id)) throw new Error("Invalid account");
  return path.join(storageRoot(), "accounts", user.id, "workspace");
}
export function currentUser() {
  const user = workspaceContext.getStore();
  if (!user) throw new Error("请先登录");
  return user;
}
