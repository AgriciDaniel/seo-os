import { redirect } from "next/navigation";
import {
  configuredProviderId,
  selectedProviderId,
} from "@/lib/integrations/providers";

export const dynamic = "force-dynamic";

export default async function Home() {
  const configuredProvider = configuredProviderId();
  const provider = await selectedProviderId();
  // Office is the unified workspace: 3D scene + chat + state. If a provider
  // was explicitly chosen, drop the user straight into it. Auto-detected
  // providers still go through /setup so first-run users can choose.
  redirect(configuredProvider && provider === configuredProvider ? "/office" : "/setup");
}
