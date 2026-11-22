// 补丁文件：仓库快照缺少 public-url.js（server.js 依赖 absoluteTaskUrl）
// 根据 server.js 的调用点 `absoluteTaskUrl(config, req, data.url)` 反推实现：
// - 已是绝对 URL 时原样返回
// - 配置了 publicBaseUrl 时以它为基准拼接
// - 否则依据请求头（x-forwarded-proto / x-forwarded-host / host）推导

export function absoluteTaskUrl(config, req, url) {
  if (!url) return url;
  const value = String(url);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;

  const publicBase = String(config?.publicBaseUrl || "").trim().replace(/\/+$/, "");
  if (publicBase) {
    try {
      return new URL(value, publicBase + "/").toString();
    } catch {
      return publicBase + (value.startsWith("/") ? value : `/${value}`);
    }
  }

  const forwardedProto = req?.headers?.["x-forwarded-proto"];
  const proto = String(forwardedProto || req?.protocol || "http").split(",")[0].trim();
  const forwardedHost = req?.headers?.["x-forwarded-host"];
  const host = String(forwardedHost || req?.headers?.host || `127.0.0.1:${config?.port ?? 8190}`).split(",")[0].trim();
  const pathPart = value.startsWith("/") ? value : `/${value}`;
  return `${proto}://${host}${pathPart}`;
}

export default { absoluteTaskUrl };
