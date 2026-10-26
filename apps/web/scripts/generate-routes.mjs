import { Generator, getConfig } from "@tanstack/router-generator";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
await new Generator({ root, config: getConfig({}, root) }).run();
