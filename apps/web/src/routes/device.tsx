import { createFileRoute } from "@tanstack/react-router";
import DeviceAuth from "@dojofoo/uix/components/device-auth";
import { authRobots, loadAuthFlags } from "@/lib/feature-flags.functions";

// better-auth's device authorization sends the CLI's code here (its default verificationUri, /device?user_code=…)
export const Route = createFileRoute("/device")({
  validateSearch: (search: Record<string, unknown>) => ({
    user_code: typeof search.user_code === "string" ? search.user_code : undefined,
    status: search.status === "approved" || search.status === "denied" ? (search.status as "approved" | "denied") : undefined,
  }),
  loader: () => loadAuthFlags(),
  head: ({ loaderData }) => ({ meta: [{ title: "Authenticate device" }, ...authRobots(loaderData)] }),
  component: DevicePage,
});

function DevicePage() {
  const { user_code, status } = Route.useSearch();
  return <DeviceAuth userCode={user_code} status={status} />;
}
