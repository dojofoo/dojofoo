import { isAbsolute, parse, resolve } from "node:path";
import { defineSandbox } from "@dojofoo/agent/sandbox";
import { justbash } from "@dojofoo/agent/sandbox/just-bash";

/** Live course files, not a seed or copy. Eve retains its own private filesystem. */
export function createAuthoringSandbox(courseRoot: string) {
  if (!isAbsolute(courseRoot) || resolve(courseRoot) === parse(courseRoot).root) {
    throw new Error("Authoring requires an absolute course directory, not a filesystem root.");
  }
  return defineSandbox({
    backend: justbash({
      autoInstall: false,
      filesystem: ({ defaultFilesystem, justBash }) => new justBash.MountableFs({
        base: defaultFilesystem,
        mounts: [{
          mountPoint: "/course",
          filesystem: new justBash.ReadWriteFs({ root: courseRoot }),
        }],
      }),
    }),
  });
}
