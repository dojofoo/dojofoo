"use client";

import { SiteHeader } from "@dojofoo/uix/web/site";
import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function SiteNavigation({ as: Component = "header", mobileAction, className = "" }: {
  as?: "header" | "div"; mobileAction?: ReactNode; className?: string;
}) {
  const section = useLocation({ select: location => location.pathname.split("/")[1] });
  const current = section === "dojos" || section === "courses" ? "courses" : section ? "help" : "home";
  return <Component data-site-shell="" className={`w-full ${className}`}><SiteHeader as="div" current={current} mobileAction={mobileAction} /></Component>;
}
