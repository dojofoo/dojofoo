import { createFileRoute } from "@tanstack/react-router";
import Login from "@dojofoo/uix/components/login-blocks-9";

export const Route = createFileRoute("/sign-in")({
  head: () => ({ meta: [{ title: "Sign in · dojofoo" }] }),
  component: () => <Login mode="sign-in" />,
});
