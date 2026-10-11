// Sensei contracts in @dojofoo/ui are imported as raw Markdown (Vite, Vitest, tsup).
declare module "*.md?raw" {
  const content: string;
  export default content;
}
