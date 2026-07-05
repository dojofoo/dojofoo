import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findProjectRoot } from "../config";

/**
 * `dojo ui` — start the dojo web UI (apps/ui) and open it in the browser.
 *
 * Spawns `pnpm dev` inside apps/ui via the user's package manager. This
 * is the v1 dev path. A built/start path (`vite preview`) lands when we
 * have a deploy story.
 *
 * Extra args are forwarded to the dev script (e.g. `dojo ui --port 5173`
 * or any vite/nitro flag).
 */
export function ui(_cwd: string, args: string[]): void {
	const port = process.env.DOJO_UI_PORT ?? "4567";
	const uiDir = resolveUiDir();
	const projectRoot = findProjectRoot();

	if (!uiDir) {
		console.error("Could not locate apps/ui/. The dojo UI currently requires running");
		console.error("`dojo` from inside (or near) the dojocho monorepo.");
		process.exit(1);
	}

	console.error(`→ starting dojo UI from ${uiDir}`);
	console.error(`  project: ${projectRoot}`);
	console.error(`  http://localhost:${port}\n`);

	const env = { ...process.env, DOJO_PROJECT_ROOT: projectRoot, PORT: port };
	const child = spawn("pnpm", ["dev", ...args], {
		cwd: uiDir,
		stdio: "inherit",
		env,
	});

	child.on("error", (err) => {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			console.error("Could not find `pnpm` on PATH.");
			console.error("Install pnpm: https://pnpm.io/installation");
			process.exit(127);
		}
		console.error(`Failed to launch UI: ${err.message}`);
		process.exit(1);
	});
	child.on("exit", (code, signal) => {
		if (signal) process.kill(process.pid, signal);
		else process.exit(code ?? 0);
	});
}

function resolveUiDir(): string | null {
	const here = fileURLToPath(import.meta.url);
	let dir = dirname(here);
	for (let i = 0; i < 10; i++) {
		const candidate = join(dir, "apps", "ui");
		if (existsSync(join(candidate, "package.json"))) return candidate;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}
