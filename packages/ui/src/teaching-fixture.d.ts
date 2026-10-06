declare module "virtual:dojo-teaching-fixture" {
  const blocks: import("./lib/teaching-document").TeachingBlock[];
  export default blocks;
  export const second: import("./lib/teaching-document").TeachingBlock[];
}
