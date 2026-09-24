import { beforeEach, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => {
  Object.defineProperty(probe, Symbol.for("nodejs.util.promisify.custom"), {
    value: (...args: unknown[]) => new Promise((resolve, reject) => {
      probe(...args, (error: Error | null, stdout: string, stderr: string) => {
        if (error) reject(error);
        else resolve({ stdout, stderr });
      });
    }),
  });
  return { execFile: probe };
});
import { authoringEnvironment } from "./environment";

beforeEach(() => {
  probe.mockReset();
  probe.mockImplementation((_command, _args, _options, callback) => callback(new Error("not GNU")));
});

it("preserves environment without probing unrelated harnesses or platforms", async () => {
  const source = { PATH: "/bin", HOME: "/example" };
  expect(await authoringEnvironment("pi", source, "darwin")).toEqual(source);
  expect(await authoringEnvironment("fx", source, "linux")).toEqual(source);
  expect(probe).not.toHaveBeenCalled();
});

it("keeps an existing GNU chmod on PATH", async () => {
  probe.mockImplementation((_command, _args, _options, callback) => callback(null, "chmod (GNU coreutils) 9.8", ""));
  const source = { PATH: "/custom/bin" };
  expect(await authoringEnvironment("fx", source, "darwin")).toEqual(source);
  expect(probe).toHaveBeenCalledTimes(1);
});

it.each(["/opt/homebrew", "/usr/local"])("discovers %s coreutils without mutating caller environment", async prefix => {
  const directory = `${prefix}/opt/coreutils/libexec/gnubin`;
  probe.mockImplementation((command, _args, _options, callback) => {
    if (command === `${directory}/chmod`) callback(null, "chmod (GNU coreutils) 9.8", "");
    else callback(new Error("not GNU"));
  });
  const source = { PATH: "/bin", HOME: "/example" };
  expect(await authoringEnvironment("fx", source, "darwin")).toEqual({ ...source, PATH: `${directory}:/bin` });
  expect(source.PATH).toBe("/bin");
});

it("fails before starting the adapter when its prerequisite is missing", async () => {
  await expect(authoringEnvironment("fx", { PATH: "/bin" }, "darwin")).rejects.toThrow("brew install coreutils");
});
