export function reportPathUnderReports(reportPath: string): string {
  const stripped = reportPath.trim().replace(/^\/+/, "").replace(/^reports\/+/, "");
  const parts = stripped.split("/").filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.some((part) => part === "." || part === "..")) return "";
  return parts.map(encodeURIComponent).join("/");
}

export function reportApiPath(clientSlug: string, reportPath: string): string {
  return `/api/clients/${encodeURIComponent(clientSlug)}/reports/${reportPathUnderReports(reportPath)}`;
}
