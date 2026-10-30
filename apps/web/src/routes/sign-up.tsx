import { createFileRoute } from "@tanstack/react-router";
import Login from "@dojofoo/uix/components/login-blocks-9";
import { authRobots, loadAuthFlags } from "@/lib/feature-flags.functions";

export const Route = createFileRoute("/sign-up")({
  loader: () => loadAuthFlags(),
  head: ({ loaderData }) => ({ meta: [{ title: "Sign up" }, ...authRobots(loaderData)] }),
  component: () => <Login mode="sign-up" {...Route.useLoaderData()} />,
});
