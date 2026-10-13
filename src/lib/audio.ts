/** 发音：有道 dictvoice（type=1 英音 / type=2 美音），失败时回退到 speechSynthesis */
let el: HTMLAudioElement | null = null;
let token = 0;

function tts(word: string, accent: "us" | "uk") {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = accent === "uk" ? "en-GB" : "en-US";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch {
    /* 无语音能力，静默 */
  }
}

export function audioUrl(word: string, accent: "us" | "uk") {
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${accent === "uk" ? 1 : 2}`;
}

export function speak(word: string, accent: "us" | "uk" = "us") {
  if (typeof window === "undefined" || !word) return;
  const my = ++token;
  // 离线时也先试 <audio>：听过的词由 service worker 从缓存返回；没缓存会触发 error → TTS
  if (!el) {
    el = new Audio();
    el.preload = "auto";
  }
  const a = el;
  let fell = false;
  const fallback = () => {
    if (fell || my !== token) return;
    fell = true;
    tts(word, accent);
  };
  a.onerror = fallback;
  a.src = audioUrl(word, accent);
  const p = a.play();
  if (p && typeof p.catch === "function") {
    p.catch((e: unknown) => {
      // 自动播放被拦截时不打扰用户；其它错误回退到 TTS
      if ((e as { name?: string })?.name !== "NotAllowedError") fallback();
    });
  }
}
