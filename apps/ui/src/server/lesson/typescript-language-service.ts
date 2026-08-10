import { relative, resolve } from "node:path";
import ts from "typescript";

type LanguageRequest = {
  code: string;
  filePath: string;
  projectRoot: string;
};

type CompletionRequest = LanguageRequest & { position: number };

export type TypeScriptCompletion = {
  label: string;
  type: "class" | "constant" | "function" | "interface" | "keyword" | "method" | "property" | "type" | "variable";
};

export type TypeScriptDiagnostic = {
  code: number;
  from: number;
  message: string;
  severity: "error" | "info" | "warning";
  to: number;
};

type LanguageSession = {
  service: ts.LanguageService;
  touchedAt: number;
  update: (code: string) => void;
};

const sessions = new Map<string, LanguageSession>();
const maximumSessions = 12;

export function getTypeScriptCompletions(request: CompletionRequest) {
  const filePath = safeFilePath(request.projectRoot, request.filePath);
  const session = languageSession(request.projectRoot, filePath, request.code);
  const position = Math.max(0, Math.min(request.position, request.code.length));
  const completions = session.service.getCompletionsAtPosition(filePath, position, {
    includeCompletionsForImportStatements: true,
    includeCompletionsWithInsertText: true,
  });
  const word = request.code.slice(0, position).match(/[\w$]*$/)?.[0] ?? "";

  return {
    from: completions?.optionalReplacementSpan?.start ?? position - word.length,
    options: completions?.entries.map((entry) => ({
      label: entry.name,
      type: completionType(entry.kind),
    })) ?? [],
  };
}

export function getTypeScriptDiagnostics(request: LanguageRequest): TypeScriptDiagnostic[] {
  const filePath = safeFilePath(request.projectRoot, request.filePath);
  const session = languageSession(request.projectRoot, filePath, request.code);
  const diagnostics = [
    ...session.service.getSyntacticDiagnostics(filePath),
    ...session.service.getSemanticDiagnostics(filePath),
  ];

  return diagnostics.flatMap((diagnostic) => {
    if (diagnostic.start === undefined) return [];
    const from = Math.min(diagnostic.start, request.code.length);
    const to = Math.min(from + Math.max(diagnostic.length ?? 1, 1), request.code.length);
    return [{
      code: diagnostic.code,
      from,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      severity: diagnosticCategory(diagnostic.category),
      to,
    }];
  });
}

function languageSession(projectRoot: string, filePath: string, code: string): LanguageSession {
  let session = sessions.get(filePath);
  if (!session) {
    let currentCode = code;
    let currentVersion = 1;
    const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, "tsconfig.json");
    const parsed = configPath ? parsedConfig(configPath) : undefined;
    const compilerOptions: ts.CompilerOptions = parsed?.options ?? {
      allowJs: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
    };
    const currentDirectory = configPath ? resolve(configPath, "..") : projectRoot;
    const host: ts.LanguageServiceHost = {
      directoryExists: ts.sys.directoryExists,
      fileExists: ts.sys.fileExists,
      getCompilationSettings: () => compilerOptions,
      getCurrentDirectory: () => currentDirectory,
      getDefaultLibFileName: ts.getDefaultLibFilePath,
      getDirectories: ts.sys.getDirectories,
      getScriptFileNames: () => [filePath],
      getScriptSnapshot: (name) => {
        const contents = name === filePath ? currentCode : ts.sys.readFile(name);
        return contents === undefined ? undefined : ts.ScriptSnapshot.fromString(contents);
      },
      getScriptVersion: (name) => name === filePath ? String(currentVersion) : "0",
      readDirectory: ts.sys.readDirectory,
      readFile: ts.sys.readFile,
      realpath: ts.sys.realpath,
    };
    const service = ts.createLanguageService(host, ts.createDocumentRegistry());
    session = {
      service,
      touchedAt: Date.now(),
      update(nextCode) {
        if (currentCode === nextCode) return;
        currentCode = nextCode;
        currentVersion += 1;
      },
    };
    sessions.set(filePath, session);
    evictOldSessions();
  }
  session.update(code);
  session.touchedAt = Date.now();
  return session;
}

function parsedConfig(configPath: string) {
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  return ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, resolve(configPath, ".."), {}, configPath);
}

function safeFilePath(projectRoot: string, requestedPath: string) {
  const root = resolve(projectRoot);
  const filePath = resolve(root, requestedPath);
  const pathFromRoot = relative(root, filePath);
  if (pathFromRoot.startsWith("..") || pathFromRoot === "" || !/\.[cm]?[jt]sx?$/.test(filePath)) {
    throw new Error("The editor file must be a JavaScript or TypeScript file inside the dojo project");
  }
  return filePath;
}

function evictOldSessions() {
  if (sessions.size <= maximumSessions) return;
  const oldest = [...sessions.entries()].sort(([, left], [, right]) => left.touchedAt - right.touchedAt)[0];
  if (!oldest) return;
  oldest[1].service.dispose();
  sessions.delete(oldest[0]);
}

function diagnosticCategory(category: ts.DiagnosticCategory): TypeScriptDiagnostic["severity"] {
  if (category === ts.DiagnosticCategory.Error) return "error";
  if (category === ts.DiagnosticCategory.Warning) return "warning";
  return "info";
}

function completionType(kind: ts.ScriptElementKind): TypeScriptCompletion["type"] {
  switch (kind) {
    case ts.ScriptElementKind.classElement: return "class";
    case ts.ScriptElementKind.constElement: return "constant";
    case ts.ScriptElementKind.functionElement: return "function";
    case ts.ScriptElementKind.interfaceElement: return "interface";
    case ts.ScriptElementKind.keyword: return "keyword";
    case ts.ScriptElementKind.memberFunctionElement: return "method";
    case ts.ScriptElementKind.memberVariableElement:
    case ts.ScriptElementKind.memberGetAccessorElement:
    case ts.ScriptElementKind.memberSetAccessorElement: return "property";
    case ts.ScriptElementKind.typeElement: return "type";
    default: return "variable";
  }
}
