/**
 * 锁屏控制（Media Session）：磁带模式播放时，锁屏/通知栏显示当前单词，
 * 耳机线控和锁屏按钮可以播放/暂停、切上一个/下一个。
 */
export interface TapeHandlers {
  play: () => void;
  pause: () => void;
  prev: () => void;
  next: () => void;
}

const ms = () => (typeof navigator !== "undefined" && "mediaSession" in navigator ? navigator.mediaSession : null);

export function setTapeMeta(title: string, meaning: string, playing: boolean) {
  const s = ms();
  if (!s) return;
  try {
    if (typeof MediaMetadata !== "undefined") {
      s.metadata = new MediaMetadata({
        title,
        artist: meaning,
        album: "四级单词打卡 · 磁带模式",
        artwork: [{ src: new URL("icon.svg", document.baseURI).href, sizes: "512x512", type: "image/svg+xml" }],
      });
    }
    s.playbackState = playing ? "playing" : "paused";
  } catch {
    /* ignore */
  }
}

export function bindTapeHandlers(h: TapeHandlers) {
  const s = ms();
  if (!s) return () => {};
  const pairs: [MediaSessionAction, () => void][] = [
    ["play", h.play],
    ["pause", h.pause],
    ["previoustrack", h.prev],
    ["nexttrack", h.next],
    ["stop", h.pause],
  ];
  for (const [a, fn] of pairs) {
    try {
      s.setActionHandler(a, fn);
    } catch {
      /* 不支持的动作 */
    }
  }
  return () => {
    for (const [a] of pairs) {
      try {
        s.setActionHandler(a, null);
      } catch {
        /* ignore */
      }
    }
    try {
      s.metadata = null;
      s.playbackState = "none";
    } catch {
      /* ignore */
    }
  };
}

/**
 * 后台保活：手机浏览器只为「较长的媒体」显示锁屏控制，单词音频太短。
 * 磁带模式播放时循环一段运行时生成的静音 WAV（不进仓库、不走网络），
 * 让锁屏控制和耳机键持续可用，也让后台的定时器不被过度节流。
 */
let keep: HTMLAudioElement | null = null;
let keepUrl: string | null = null;

/** 生成 n 秒静音 WAV（8kHz / 8bit / 单声道） */
export function silentWav(seconds = 6): Uint8Array {
  const rate = 8000;
  const n = rate * seconds;
  const buf = new Uint8Array(44 + n);
  const dv = new DataView(buf.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, k) => dv.setUint8(o + k, c.charCodeAt(0)));
  str(0, "RIFF");
  dv.setUint32(4, 36 + n, true);
  str(8, "WAVE");
  str(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate, true); // byte rate
  dv.setUint16(32, 1, true); // block align
  dv.setUint16(34, 8, true); // bits
  str(36, "data");
  dv.setUint32(40, n, true);
  buf.fill(128, 44); // 8bit PCM 的静音是 128
  return buf;
}

export function startKeepAlive() {
  try {
    if (!keep) {
      keepUrl = URL.createObjectURL(new Blob([silentWav() as BlobPart], { type: "audio/wav" }));
      keep = new Audio(keepUrl);
      keep.loop = true;
      keep.dataset.keepalive = "1";
    }
    void keep.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

export function stopKeepAlive() {
  try {
    keep?.pause();
  } catch {
    /* ignore */
  }
}

export function disposeKeepAlive() {
  stopKeepAlive();
  if (keepUrl) URL.revokeObjectURL(keepUrl);
  keep = null;
  keepUrl = null;
}
