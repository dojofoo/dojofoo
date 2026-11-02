declare const process: { env: { NODE_ENV?: string } };

function isProduction(): boolean {
  try {
    return process.env.NODE_ENV === 'production';
  } catch {
    // No bundler and no `process`: treat as development.
    return false;
  }
}

const warned = new Set<string>();

/** Warns once per key, outside production. */
export function deprecate(key: string, message: string): void {
  if (isProduction() || warned.has(key)) return;
  warned.add(key);
  console.warn(`[creance] ${message}`);
}
