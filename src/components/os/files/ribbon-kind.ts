export type RibbonKind = "approved" | "ribbon" | "rejected" | "unmarked";

export function ribbonKind(approvalStatus: string | undefined): RibbonKind {
  if (approvalStatus === "approved") return "approved";
  if (approvalStatus === "needs-review") return "ribbon";
  if (approvalStatus === "rejected") return "rejected";
  return "unmarked";
}
