/**
 * 13.1 · 电脑端适配顺手修的：别的窗口改了「包含基础词」，这个窗口的词库索引跟着换。
 * 以前 syncFromStorage 只换了状态、没换词库索引：设置里写着「已隐藏 362 个基础词」，词书却还显示「全部词 4544」（或者反过来）。
 */
import { beforeAll, describe, expect, it } from "vitest";

const mem = new Map<string, string>();
beforeAll(() => {
  // 最小的浏览器替身：store 改设置时会切主题 / 写 <html> 的属性
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = { matchMedia: () => ({ matches: false }), addEventListener: () => {} };
  g.document = {
    documentElement: { classList: { contains: () => false, remove: () => {}, add: () => {} }, dataset: {}, setAttribute: () => {}, getAttribute: () => null },
    querySelector: () => null,
  };
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  } as Storage;
});

describe("13.1 · basic-word mode follows another tab", () => {
  it("syncFromStorage switches the word index's basic mode with the synced settings", async () => {
    const store = await import("./store");
    const data = await import("./data");
    expect(data.basicMode()).toBe(false);
    // 另一个窗口打开了「包含基础词」：先在这里造出那份存档，再退回去，最后把那份写回存储，模拟别的窗口写入
    store.setSettings({ basic: true });
    const other = localStorage.getItem(store.KEY)!;
    store.setSettings({ basic: false });
    expect(data.basicMode()).toBe(false);
    localStorage.setItem(store.KEY, other);
    expect(store.syncFromStorage()).toBe(true);
    expect(store.getState().settings.basic).toBe(true);
    expect(data.basicMode()).toBe(true);
    // 再关掉
    store.setSettings({ basic: false });
    const off = localStorage.getItem(store.KEY)!;
    store.setSettings({ basic: true });
    localStorage.setItem(store.KEY, off);
    store.syncFromStorage();
    expect(data.basicMode()).toBe(false);
    // 索引的个数和设置一致
    const words = [{ w: "the", t: [["art.", "这"]], b: 1 }, { w: "abandon", t: [["v.", "放弃"]], c: 1 }] as unknown as import("./data").Word[];
    expect(data.build(words, data.basicMode()).list.length).toBe(1);
  });
});
