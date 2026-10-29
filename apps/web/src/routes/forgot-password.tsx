import { createFileRoute } from "@tanstack/react-router";
import ForgotPassword from "@dojofoo/uix/components/forgot-password-2";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot password · dojofoo" }] }),
  component: ForgotPassword,
});
