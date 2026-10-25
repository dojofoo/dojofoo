/** Browser-facing language service responses. No server or filesystem dependencies. */
export type TypeScriptDiagnostic = {
  code: number;
  from: number;
  to: number;
  message: string;
  severity: "error" | "info" | "warning";
};

export type TypeScriptHover = {
  from: number;
  to: number;
  signature: string;
  documentation: string;
  tags: { name: string; text: string }[];
};
