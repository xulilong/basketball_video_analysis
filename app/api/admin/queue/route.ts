import { cancelQueueTask } from "@/lib/cancel-queue-task";
import { checkOrigin } from "@/lib/workbench-server";
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

export const POST = workspaceRoute(async (request: Request) => {
  if (currentUser().role !== "admin")
    return Response.json({ error: "仅管理员可取消任务" }, { status: 403 });
  try {
    checkOrigin(request);
    const body = await request.json();
    if (body.action !== "cancel") throw new Error("操作不支持");
    return Response.json(await cancelQueueTask(body.id, body.runId));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "取消失败" },
      { status: 400 }
    );
  }
});
