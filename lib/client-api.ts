let base = "";
const tokenKey = "report-atlas-session-v1";
export function setApiBase(value: string) {
  base = value.replace(/\/$/, "");
}
export function getToken() {
  return typeof window === "undefined"
    ? null
    : sessionStorage.getItem(tokenKey);
}
export function setToken(token: string | null) {
  if (token) sessionStorage.setItem(tokenKey, token);
  else sessionStorage.removeItem(tokenKey);
}
export async function api(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", "Bearer " + token);
  let r: Response;
  try {
    r = await fetch(base + "/api/" + path, {
      ...options,
      headers,
      credentials: "omit",
    });
  } catch {
    throw new Error("无法连接数据服务，请检查网络后重试");
  }
  const type = r.headers.get("content-type") || "";
  if (!type.includes("application/json"))
    throw new Error("数据服务尚未就绪，请稍后重试");
  const data: any = await r.json();
  if (!r.ok) {
    if (r.status === 401) setToken(null);
    throw new Error(data.error || "请求失败");
  }
  return data;
}
export async function downloadAttachment(id: string, filename: string) {
  const token = getToken();
  if (!token) throw new Error("请先登录");
  const r = await fetch(base + "/api/files/" + id, {
    headers: { Authorization: "Bearer " + token },
    credentials: "omit",
  });
  if (!r.ok) {
    if (r.status === 401) setToken(null);
    throw new Error("附件下载失败，请确认登录状态和权限");
  }
  const blob = await r.blob(),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
