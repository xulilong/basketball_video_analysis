import { workspaceRoute } from "@/lib/account-server";
import { currentUser } from "@/lib/workspace-context";
import { readTaskQueue } from "@/lib/task-queue";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async () => {
  if (currentUser().role !== "admin")
    return Response.json(
      { error: "仅管理员可查看本机任务队列" },
      { status: 403 }
    );
  try {
    return Response.json(await readTaskQueue());
  } catch {
    return Response.json(
      { error: "任务队列读取失败，请稍后重试" },
      { status: 500 }
    );
  }
});
