/**
 * 11.3 · 提示条（sonner）按需加载：首屏不带它（省 ~10KB gzip），第一次 toast 时才下载并挂上 Toaster，
 * 之前发出的提示排队，Toaster 挂好后按顺序补发。API 和 sonner 的 toast 一样（只用到这几种）。
 */
import { useSyncExternalStore, type ReactNode } from "react";

type Opts = Record<string, unknown> | undefined;
type Kind = "base" | "success" | "error" | "warning";
type Real = ((m: ReactNode, o?: Opts) => unknown) & Record<Exclude<Kind, "base">, (m: ReactNode, o?: Opts) => unknown>;

let real: Real | null = null;
let wanted = false;
const queue: [Kind, ReactNode, Opts][] = [];
const subs = new Set<() => void>();

function fire(k: Kind, m: ReactNode, o: Opts) {
  if (!real) return;
  if (k === "base") real(m, o);
  else real[k](m, o);
}

/** Toaster 挂好了：从此直接发，排队的补发 */
export function toasterReady(t: Real) {
  real = t;
  for (const [k, m, o] of queue.splice(0)) fire(k, m, o);
}

/** 要不要挂 Toaster（第一次 toast 之后才挂） */
export function useToasterWanted(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => wanted,
    () => false,
  );
}

/** 提前挂上 Toaster（空闲时预热，第一次提示不用等下载） */
export function wantToaster() {
  if (wanted) return;
  wanted = true;
  subs.forEach((f) => f());
}

const call =
  (k: Kind) =>
  (m: ReactNode, o?: Opts): void => {
    if (real) return void fire(k, m, o);
    queue.push([k, m, o]);
    wantToaster();
  };

export const toast = Object.assign(call("base"), { success: call("success"), error: call("error"), warning: call("warning") });
