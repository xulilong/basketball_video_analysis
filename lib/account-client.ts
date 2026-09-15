// Cross-tab notifications are optional; unavailable browser APIs must never block login.
export function accountChannel(onChange?: () => void) {
  try {
    if (typeof BroadcastChannel === "undefined") return null;
    const channel = new BroadcastChannel("mt-account-events");
    if (onChange) channel.onmessage = onChange;
    return channel;
  } catch {
    return null;
  }
}
export function notifyAccountChange() {
  const channel = accountChannel();
  try {
    channel?.postMessage("changed");
  } catch {
    /* Optional notification. */
  } finally {
    channel?.close();
  }
}
export async function accountRequest(body?: unknown, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/auth", {
      cache: "no-store",
      signal: controller.signal,
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "账号服务暂时不可用");
    return data;
  } catch (e) {
    if (controller.signal.aborted)
      throw new Error("连接超时，请检查网络后重试");
    throw new Error(
      e instanceof Error && e.message !== "Failed to fetch"
        ? e.message
        : "无法连接工作台，请检查网络后重试"
    );
  } finally {
    clearTimeout(timer);
  }
}
