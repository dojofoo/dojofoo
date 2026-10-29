import { createFileRoute } from "@tanstack/react-router";
import { SignOut } from "@dojofoo/uix/components/forgot-password-2";
import { authRobots, loadAuthFlags } from "@/lib/auth-flags.functions";

export const Route = createFileRoute("/sign-out")({
  loader: () => loadAuthFlags(),
  head: ({ loaderData }) => ({ meta: [{ title: "Sign out · dojofoo" }, ...authRobots(loaderData)] }),
  component: SignOut,
});
