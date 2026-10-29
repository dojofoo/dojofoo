import { createFileRoute } from "@tanstack/react-router";
import Login from "@dojofoo/uix/components/login-blocks-9";
import { authRobots, loadAuthFlags } from "@/lib/feature-flags.functions";

export const Route = createFileRoute("/sign-in")({
  loader: () => loadAuthFlags(),
  head: ({ loaderData }) => ({ meta: [{ title: "Sign in · dojofoo" }, ...authRobots(loaderData)] }),
  component: () => <Login mode="sign-in" {...Route.useLoaderData()} />,
});
