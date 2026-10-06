"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import styles from "./text-morph.module.css";

export interface TextMorphProps {
  children: string;
  as?: "span" | "div" | "p" | "strong" | "h1" | "h2" | "h3";
  className?: string;
  id?: string;
}

/** Arc text morph, adapted to fade whole labels without moving their letters. */
export function TextMorph({ children, as: Tag = "span", className, id }: TextMorphProps) {
  const reduced = useReducedMotion();
  return <Tag id={id} className={className}>
    <span className={styles.srOnly}>{children}</span>
    <span data-text-morph="" className={styles.frame} aria-hidden="true">
      <AnimatePresence initial={false}>
        <motion.span
          key={children}
          className={styles.label}
          initial={reduced ? false : { opacity: 0, filter: "blur(4px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: reduced ? "none" : "blur(4px)" }}
          transition={{ duration: reduced ? 0 : 0.15, ease: "easeOut" }}
        >{children}</motion.span>
      </AnimatePresence>
    </span>
  </Tag>;
}

export default TextMorph;
