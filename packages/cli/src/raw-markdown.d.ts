// Matches the Markdown text loader in tsup.config.ts.
declare module "*.md?raw" {
  const content: string;
  export default content;
}
