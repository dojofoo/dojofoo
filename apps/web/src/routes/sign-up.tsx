import { createFileRoute } from "@tanstack/react-router";
import Login from "@dojofoo/uix/components/login-blocks-9";

export const Route = createFileRoute("/sign-up")({
  head: () => ({ meta: [{ title: "Sign up · dojofoo" }] }),
  component: () => <Login mode="sign-up" />,
});
