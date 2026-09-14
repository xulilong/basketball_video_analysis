import {
  authenticate,
  sessionUser,
  logout,
  sessionCookie,
} from "@/lib/account-server";
import { checkOrigin } from "@/lib/workbench-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return Response.json(
    { user: await sessionUser(request) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (Number(request.headers.get("content-length")) > 4096)
      return Response.json({ error: "请求过大" }, { status: 413 });
    const text = await request.text();
    if (text.length > 4096) throw new Error("请求过大");
    const body = JSON.parse(text);
    const secure =
      new URL(request.url).protocol === "https:" ||
      request.headers.get("x-forwarded-proto") === "https";
    const cookie = (token: string, age: number) =>
      `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${
        secure ? "; Secure" : ""
      }`;
    if (body.action === "logout") {
      await logout(request);
      return Response.json(
        { ok: true },
        { headers: { "Set-Cookie": cookie("", 0) } }
      );
    }
    const result = await authenticate(
      body.action,
      body.username,
      body.password
    );
    return Response.json(
      { user: result.user },
      {
        headers: {
          "Set-Cookie": cookie(result.token, 7 * 86400),
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "登录失败" },
      { status: 400 }
    );
  }
}
