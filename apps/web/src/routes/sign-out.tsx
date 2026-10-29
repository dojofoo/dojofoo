import { createFileRoute } from "@tanstack/react-router";
import { SignOut } from "@dojofoo/uix/components/forgot-password-2";

export const Route = createFileRoute("/sign-out")({
  head: () => ({ meta: [{ title: "Sign out · dojofoo" }] }),
  component: SignOut,
});
