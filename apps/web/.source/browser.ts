// @ts-nocheck
/// <reference types="vite/client" />
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  comparisons: create.doc("comparisons", import.meta.glob(["./**/*.{mdx,md}"], {
    "base": "./../comparisons",
    "query": {
      "collection": "comparisons"
    },
    "eager": false
  })),
  docs: create.doc("docs", import.meta.glob(["./**/*.{mdx,md}"], {
    "base": "./../content",
    "query": {
      "collection": "docs"
    },
    "eager": false
  })),
};
export default browserCollections;