"use client";

// One shape context shared with uix, so a ShapeProvider set by the app (via
// @dojofoo/ui) also reaches uix components such as AskUserQuestions.
export {
  ShapeProvider,
  useShape,
  useShapeContext,
  shapeMap,
  type ShapeVariant,
  type ShapeClasses,
} from "@dojofoo/uix/lib/shape-context";
