"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useSpring, useTransform } from "motion/react";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import { cn } from "~/lib/utils";

export type Player = { id: string; name: string; score: number; avatar?: string };

const ROW_H = 52;
const AVATAR = 32;
// Rows glide to their new rank. Critically damped, so a row never
// overshoots into the slot of the player it just passed.
const REORDER = { type: "spring", visualDuration: 0.45, bounce: 0 } as const;
const ROLL = { type: "spring", visualDuration: 0.35, bounce: 0 } as const;
const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;
const SCORE = { visualDuration: 0.45, bounce: 0 };

const number = new Intl.NumberFormat("en-US");

export function Leaderboard({
  players,
  moves = {},
  label = "Leaderboard",
  className,
}: {
  players: Player[];
  /** Places each player just gained (positive) or lost (negative). */
  moves?: Record<string, number>;
  label?: string;
  className?: string;
}) {
  const ranked = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return (
    // Rows are placed by transform, not flow, so the list keeps one fixed
    // height however the ranks shuffle.
    <ol
      aria-label={label}
      className={cn("relative w-full", className)}
      style={{ height: ranked.length * ROW_H }}
    >
      {ranked.map((p, i) => (
        <Row key={p.id} player={p} rank={i + 1} move={moves[p.id] ?? 0} />
      ))}
    </ol>
  );
}

function Row({ player, rank, move }: { player: Player; rank: number; move: number }) {
  const reduceMotion = useReducedMotion();
  const score = useSpring(player.score, SCORE);
  const scoreText = useTransform(score, (v) => number.format(Math.round(v)));

  useEffect(() => {
    if (reduceMotion) score.jump(player.score);
    else score.set(player.score);
  }, [player.score, reduceMotion, score]);

  return (
    <motion.li
      initial={false}
      animate={{ y: (rank - 1) * ROW_H }}
      transition={reduceMotion ? { duration: 0 } : REORDER}
      className={cn(
        "absolute inset-x-0 top-0 flex items-center gap-3 rounded-xl bg-muted px-3",
        // Climbers pass over fallers, so crossing rows never interleave.
        move > 0 ? "z-[2]" : move < 0 ? "z-[1]" : "z-0",
      )}
      style={{ height: ROW_H }}
    >
      <Rank rank={rank} reduceMotion={!!reduceMotion} />
      <Avatar player={player} />
      <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">
        <span className="sr-only">{ordinal(rank)}, </span>
        {player.name}
        <span className="sr-only">, {number.format(player.score)} points</span>
      </span>
      <Movement move={move} reduceMotion={!!reduceMotion} />
      <motion.span
        aria-hidden
        className="w-16 text-right text-[15px] font-medium text-foreground tabular-nums"
      >
        {scoreText}
      </motion.span>
    </motion.li>
  );
}

function Rank({ rank, reduceMotion }: { rank: number; reduceMotion: boolean }) {
  // Remembers which way the rank last changed, so the old number rolls
  // out the way the row is heading and the new one follows it in.
  const [seen, setSeen] = useState({ rank, direction: 0 });
  if (seen.rank !== rank) setSeen({ rank, direction: rank < seen.rank ? 1 : -1 });
  const direction = seen.direction;

  const podium = rank <= 3;
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-full text-sm tabular-nums",
        "transition-[background-color,color] duration-200 ease-out",
        // A restrained podium: the leader inverts, second and third get a
        // quiet tint, everyone else is plain muted text.
        rank === 1 && "bg-foreground font-semibold text-background",
        podium && rank !== 1 && "bg-foreground/10 font-semibold text-foreground",
        !podium && "text-muted-foreground",
      )}
    >
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <motion.span
          key={rank}
          custom={direction}
          variants={{
            enter: (d: number) => ({ y: reduceMotion ? 0 : `${d * 100}%`, opacity: 0 }),
            idle: { y: "0%", opacity: 1 },
            exit: (d: number) => ({ y: reduceMotion ? 0 : `${-d * 100}%`, opacity: 0 }),
          }}
          initial="enter"
          animate="idle"
          exit="exit"
          transition={ROLL}
          className="col-start-1 row-start-1"
        >
          {rank}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Avatar({ player }: { player: Player }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full text-xs font-medium",
        // Line-drawn faces are black ink, so they sit on a light circle in
        // both themes; initials take the theme's own tint.
        player.avatar ? "bg-[oklch(0.97_0_0)]" : "bg-foreground/[0.07] text-foreground",
        "outline-1 -outline-offset-1 outline-foreground/10",
      )}
      style={{ width: AVATAR, height: AVATAR }}
    >
      {player.avatar ? (
        <img
          src={player.avatar}
          alt=""
          width={AVATAR}
          height={AVATAR}
          draggable={false}
          className="size-full"
        />
      ) : (
        initials(player.name)
      )}
    </span>
  );
}

function Movement({ move, reduceMotion }: { move: number; reduceMotion: boolean }) {
  // Keeps the last change on screen while it fades out, so the arrow never
  // empties mid-exit.
  const [last, setLast] = useState(move);
  if (move !== 0 && move !== last) setLast(move);
  const visible = move !== 0;
  const up = last > 0;
  const hidden = reduceMotion ? { opacity: 0 } : { scale: 0.25, opacity: 0, filter: "blur(4px)" };

  return (
    <motion.span
      aria-hidden
      initial={false}
      animate={visible ? { scale: 1, opacity: 1, filter: "blur(0px)" } : hidden}
      transition={ICON_SWAP}
      className={cn(
        "flex w-9 shrink-0 items-center justify-end gap-0.5 text-xs font-medium tabular-nums",
        up ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <svg
        viewBox="0 0 12 12"
        className={cn("size-3", !up && "rotate-180")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9.5v-7M3 5.5l3-3 3 3" />
      </svg>
      {Math.abs(last)}
    </motion.span>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

function ordinal(n: number) {
  const suffix = { one: "st", two: "nd", few: "rd", other: "th" } as const;
  const rule = new Intl.PluralRules("en-US", { type: "ordinal" }).select(n);
  return `${n}${suffix[rule as keyof typeof suffix] ?? "th"}`;
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Faces are "Notionists" by Zoish, CC0 1.0, stored in public/avatars.
const PLAYERS: Player[] = [
  { id: "ava", name: "Amara Okafor", score: 2480, avatar: "/avatars/ava.svg" },
  { id: "ben", name: "Jonas Weber", score: 2310, avatar: "/avatars/ben.svg" },
  { id: "cara", name: "Mei Tanaka", score: 2265, avatar: "/avatars/cara.svg" },
  { id: "dev", name: "Rafael Costa", score: 2140, avatar: "/avatars/dev.svg" },
  { id: "fay", name: "Sara Lindqvist", score: 2055, avatar: "/avatars/fay.svg" },
  { id: "gus", name: "Gus Holm", score: 1990 },
  { id: "ivy", name: "Ivy Nakamura", score: 1920 },
  { id: "jon", name: "Jon Reyes", score: 1875 },
];
// Long enough to spot who moved, short enough to be gone before the next
// round is likely to be played.
const MOVE_CUE_MS = 1600;

function rankOf(players: Player[]) {
  const order = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return Object.fromEntries(order.map((p, i) => [p.id, i]));
}

export default function LeaderboardDemo() {
  const [players, setPlayers] = useState(PLAYERS);
  const [moves, setMoves] = useState<Record<string, number>>({});
  const [round, setRound] = useState(1);
  const random = useRef(mulberry32(42));
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const simulate = () => {
    const before = rankOf(players);
    // Gains overlap the gaps between players, so most rounds reshuffle a
    // few places without turning the whole table upside down.
    const next = players.map((p) => ({
      ...p,
      score: p.score + Math.round(random.current() ** 1.5 * 260),
    }));
    const after = rankOf(next);
    setPlayers(next);
    setMoves(Object.fromEntries(next.map((p) => [p.id, before[p.id] - after[p.id]])));
    setRound((r) => r + 1);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMoves({}), MOVE_CUE_MS);
  };

  const leader = players.reduce((a, b) => (b.score > a.score ? b : a));

  return (
    <div className="flex w-[440px] max-w-full flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[15px] font-medium text-foreground">Weekly league</p>
          <p className="text-sm text-muted-foreground tabular-nums">Round {round}</p>
        </div>
        <button
          type="button"
          onClick={simulate}
          className="h-9 touch-manipulation rounded-full bg-background px-4 text-sm font-medium text-foreground shadow-raised transition-[scale] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-none"
        >
          Simulate round
        </button>
      </div>
      {/* 6px of padding around 12px row radii keeps the corners concentric:
          18 = 12 + 6. */}
      <div className="rounded-[18px] bg-muted p-1.5">
        <Leaderboard players={players} moves={moves} label="Weekly league standings" />
      </div>
      <p className="sr-only" aria-live="polite">
        {round > 1 ? `Round ${round}. ${leader.name} leads with ${number.format(leader.score)} points.` : ""}
      </p>
    </div>
  );
}
