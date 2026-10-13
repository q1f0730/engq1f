/**
 * 发音：有道 dictvoice（type=1 英音 / type=2 美音），失败时回退到 speechSynthesis。
 * v3：语速设置（0.75× / 1× / 1.25×）同时作用于有道音频和系统语音；
 * speak / say 返回 Promise，读完（或失败、超时）后 resolve，供磁带模式串联。
 */
import { getState } from "./store";
import { speechTimeout, ttsRate } from "./tape";

let el: HTMLAudioElement | null = null;
let token = 0;
/** 正在进行的一次朗读：被新的朗读或 stopAudio 打断时立即 resolve */
let pending: (() => void) | null = null;

/** 单词音频最长等待（1× 语速） */
const WORD_TIMEOUT = 4000;

const curRate = () => getState().settings.rate ?? 1;

function interrupt() {
  const p = pending;
  pending = null;
  p?.();
}

function tts(text: string, lang: string, rate: number, onEnd: () => void) {
  try {
    if (!("speechSynthesis" in window)) {
      setTimeout(onEnd, 400);
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = ttsRate(rate);
    u.onend = onEnd;
    u.onerror = onEnd;
    window.speechSynthesis.speak(u);
  } catch {
    onEnd();
  }
}

export function audioUrl(word: string, accent: "us" | "uk") {
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${accent === "uk" ? 1 : 2}`;
}

const langOf = (accent: "us" | "uk") => (accent === "uk" ? "en-GB" : "en-US");

/** 读一个单词：有道音频优先，失败回退系统语音 */
export function speak(word: string, accent: "us" | "uk" = "us", rate: number = curRate()): Promise<void> {
  if (typeof window === "undefined" || !word) return Promise.resolve();
  interrupt();
  const my = ++token;
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (pending === finish) pending = null;
      resolve();
    };
    pending = finish;
    const timer = setTimeout(finish, WORD_TIMEOUT / rate);
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
      tts(word, langOf(accent), rate, finish);
    };
    a.onerror = fallback;
    a.onended = () => my === token && finish();
    a.src = audioUrl(word, accent);
    a.defaultPlaybackRate = rate;
    a.playbackRate = rate;
    const p = a.play();
    if (p && typeof p.catch === "function") {
      p.catch((e: unknown) => {
        // 自动播放被拦截时不打扰用户；其它错误回退到 TTS
        if ((e as { name?: string })?.name === "NotAllowedError") finish();
        else fallback();
      });
    }
  });
}

/** 用系统语音读一段文字（中文释义、英文例句） */
export function say(text: string, lang = "zh-CN", rate: number = curRate()): Promise<void> {
  if (typeof window === "undefined" || !text) return Promise.resolve();
  interrupt();
  ++token;
  el?.pause();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (pending === finish) pending = null;
      resolve();
    };
    pending = finish;
    const timer = setTimeout(finish, speechTimeout(text, rate));
    tts(text, lang, rate, finish);
  });
}

/** 读英文句子（例句） */
export function sayEnglish(text: string, accent: "us" | "uk" = "us") {
  return say(text, langOf(accent));
}

/** 停止一切朗读 */
export function stopAudio() {
  ++token;
  interrupt();
  try {
    el?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
