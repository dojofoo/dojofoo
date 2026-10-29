import { createFileRoute } from "@tanstack/react-router";
import ForgotPassword from "@dojofoo/uix/components/forgot-password-2";
import { authRobots, loadAuthFlags } from "@/lib/feature-flags.functions";

export const Route = createFileRoute("/forgot-password")({
  loader: () => loadAuthFlags(),
  head: ({ loaderData }) => ({ meta: [{ title: "Forgot password · dojofoo" }, ...authRobots(loaderData)] }),
  component: ForgotPassword,
});
