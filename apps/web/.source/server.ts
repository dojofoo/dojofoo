// @ts-nocheck
/// <reference types="vite/client" />
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();

export const comparisons = await create.doc("comparisons", "comparisons", import.meta.glob(["./**/*.{mdx,md}"], {
  "base": "./../comparisons",
  "query": {
    "collection": "comparisons"
  },
  "eager": true
}));

export const docs = await create.docs("docs", "content", import.meta.glob(["./**/*.{json,yaml}"], {
  "base": "./../content",
  "query": {
    "collection": "docs"
  },
  "import": "default",
  "eager": true
}), import.meta.glob(["./**/*.{mdx,md}"], {
  "base": "./../content",
  "query": {
    "collection": "docs"
  },
  "eager": true
}));