/**
 * 12.0 · 应用自己的图标（替换 lucide-react）
 * 24 网格、1.6 描边、圆头圆角、几何简化——像钢笔在纸上画的线。
 * 只用在功能控件上；装饰性图标已从界面里拿掉。
 * 名字沿用原来的（方便对照），同一种意思的图标共用一个形状。
 */
import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & { strokeWidth?: number | string; size?: number };

function make(name: string, body: React.ReactNode) {
  function Icon({ strokeWidth = 1.6, size, className, ...rest }: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size ?? 24}
        height={size ?? 24}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={className ? `ico ${className}` : "ico"}
        data-icon={name}
        {...rest}
      >
        {body}
      </svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}

/* ---------------------------------------------------------------- 方向 */
export const ArrowLeft = make("arrow-left", <path d="M19 12H5.5M11 6l-6 6 6 6" />);
export const ArrowRight = make("arrow-right", <path d="M5 12h13.5M13 6l6 6-6 6" />);
export const ChevronLeft = make("chevron-left", <path d="M14.5 5.5 8 12l6.5 6.5" />);
export const ChevronRight = make("chevron-right", <path d="M9.5 5.5 16 12l-6.5 6.5" />);
export const ChevronDown = make("chevron-down", <path d="M5.5 9.5 12 16l6.5-6.5" />);
export const ChevronUp = make("chevron-up", <path d="M5.5 14.5 12 8l6.5 6.5" />);
export const ChevronLeftIcon = ChevronLeft;
export const ChevronRightIcon = ChevronRight;
export const ChevronDownIcon = ChevronDown;
export const ArrowUpDown = make("sort", <path d="M8 4v16M4.5 7.5 8 4l3.5 3.5M16 20V4M12.5 16.5 16 20l3.5-3.5" />);

/* ---------------------------------------------------------------- 动作 */
export const X = make("close", <path d="M6 6l12 12M18 6 6 18" />);
export const Check = make("check", <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />);
export const Plus = make("plus", <path d="M12 5v14M5 12h14" />);
export const Minus = make("minus", <path d="M5 12h14" />);
export const Search = make("search", <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>);
export const Copy = make("copy", <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></>);
export const Pencil = make("pencil", <path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20ZM13.5 7l3 3" />);
export const Trash2 = make("trash", <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3l.8-12.2M10 10.5v6M14 10.5v6" />);
export const Undo2 = make("undo", <path d="M9 14 4.5 9.5 9 5M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3" />);
export const RotateCcw = make("reset", <path d="M4.5 4.5v5h5M5 13a7.5 7.5 0 1 0 1.8-6.4L4.5 9.5" />);
export const RefreshCw = make("refresh", <path d="M19.5 4.5v5h-5M4.5 19.5v-5h5M18.7 9.5A7.5 7.5 0 0 0 5.5 8M5.3 14.5A7.5 7.5 0 0 0 18.5 16" />);
export const Repeat = make("repeat", <path d="M4.5 11V9.5a3 3 0 0 1 3-3h12M16 3l3.5 3.5L16 10M19.5 13v1.5a3 3 0 0 1-3 3h-12M8 21l-3.5-3.5L8 14" />);
export const Repeat2 = Repeat;
export const Shuffle = make("shuffle", <path d="M3.5 7h3.2c2 0 3.2 1 4.3 3l2 4c1.1 2 2.3 3 4.3 3h3.2M17.5 4l3 3-3 3M3.5 17h3.2c1.2 0 2.1-.4 2.9-1.1M14.4 8.1c.8-.7 1.7-1.1 2.9-1.1h3.2M17.5 14l3 3-3 3" />);
export const Replace = make("replace", <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />);
export const GitMerge = make("merge", <><circle cx="7" cy="5.5" r="2" /><circle cx="7" cy="18.5" r="2" /><circle cx="17" cy="12" r="2" /><path d="M7 7.5v9M7 7.5c0 3 2.5 4.5 8 4.5" /></>);
export const Share2 = make("share", <path d="M12 3.5v11M7.5 8 12 3.5 16.5 8M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />);
export const Download = make("download", <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 17.5v1a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1" />);
export const HardDriveDownload = Download;
export const MonitorDown = Download;
export const FileUp = make("file-up", <path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9ZM13.5 3.5V9H19M12 17.5v-5M9.5 15 12 12.5l2.5 2.5" />);
export const FileSpreadsheet = make("file-sheet", <path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9ZM13.5 3.5V9H19M8.5 13h7M8.5 16.5h7M12 13v3.5" />);
export const Printer = make("printer", <path d="M7 8V3.5h10V8M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 5 8h14a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 19 17h-2M7 14h10v6.5H7Z" />);
export const Link2 = make("link", <path d="M9.5 16.5H7a4.5 4.5 0 0 1 0-9h2.5M14.5 7.5H17a4.5 4.5 0 0 1 0 9h-2.5M8.5 12h7" />);
export const Link2Off = make("link-off", <path d="M9.5 16.5H7a4.5 4.5 0 0 1-1.6-8.7M14.5 7.5H17a4.5 4.5 0 0 1 1.6 8.7M4 4l16 16" />);
export const ListPlus = make("list-plus", <path d="M4 6.5h11M4 12h11M4 17.5h7M18 14.5v6M15 17.5h6" />);
export const ListMinus = make("list-minus", <path d="M4 6.5h11M4 12h11M4 17.5h7M15 17.5h6" />);
export const GripVertical = make("grip", <path d="M9 5.5h.01M15 5.5h.01M9 12h.01M15 12h.01M9 18.5h.01M15 18.5h.01" strokeWidth={2.6} />);
export const MoreHorizontal = make("more", <path d="M5.5 12h.01M12 12h.01M18.5 12h.01" strokeWidth={2.6} />);
export const Maximize = make("maximize", <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />);
export const Minimize = make("minimize", <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />);
export const SlidersHorizontal = make("sliders", <path d="M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5" />);
export const Eye = make("eye", <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>);
export const EyeOff = make("eye-off", <path d="M10 5.8c.6-.2 1.3-.3 2-.3 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.4 3.2M6.3 7.5C3.9 9.2 2.5 12 2.5 12S6 18.5 12 18.5c1.7 0 3.2-.5 4.4-1.2M10 10a2.8 2.8 0 0 0 4 4M4 4l16 16" />);
export const Lock = make("lock", <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>);

/* ---------------------------------------------------------------- 播放与声音 */
export const Volume2 = make("speaker", <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5ZM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />);
export const Play = make("play", <path d="M7.5 5.2v13.6a.6.6 0 0 0 .9.5l11-6.8a.6.6 0 0 0 0-1L8.4 4.7a.6.6 0 0 0-.9.5Z" />);
export const Pause = make("pause", <path d="M8 5.5v13M16 5.5v13" strokeWidth={2.4} />);
export const SkipBack = make("skip-back", <path d="M6 5.5v13M18.5 6.2v11.6a.6.6 0 0 1-.9.5L9.4 12.5a.6.6 0 0 1 0-1l8.2-5.8a.6.6 0 0 1 .9.5Z" />);
export const SkipForward = make("skip-forward", <path d="M18 5.5v13M5.5 6.2v11.6a.6.6 0 0 0 .9.5l8.2-5.8a.6.6 0 0 0 0-1L6.4 5.7a.6.6 0 0 0-.9.5Z" />);
export const FastForward = make("fast-forward", <path d="M3.5 6.5v11L11 12ZM12.5 6.5v11L20 12Z" />);
export const Headphones = make("headphones", <path d="M4 15.5V13a8 8 0 0 1 16 0v2.5M4 15.5a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2ZM20 15.5a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2Z" />);

/* ---------------------------------------------------------------- 学习 */
export const Star = make("star", <path d="m12 3.8 2.5 5.2 5.6.7-4.1 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.7Z" />);
export const Swords = make("cut", <path d="M5 19 19 5M14.5 5H19v4.5M4 15l5 5M6.5 17.5 4 20" />);
export const BookOpen = make("book", <path d="M12 6.5c-1.6-1.4-4-2-7.5-2v13c3.5 0 5.9.6 7.5 2 1.6-1.4 4-2 7.5-2v-13c-3.5 0-5.9.6-7.5 2ZM12 6.5v13" />);
export const BookMarked = make("book-marked", <path d="M6 3.5h11.5a1 1 0 0 1 1 1v16l-6.5-4-6.5 4v-16a1 1 0 0 1 1-1Z" />);
export const Library = make("library", <path d="M5 4v16M9.5 4v16M14 5.5l3.8 14.2M4 20h16" />);
export const Layers = make("layers", <path d="M12 4 3.5 8.5 12 13l8.5-4.5ZM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5" />);
export const GraduationCap = make("exam", <path d="M3 9.5 12 5l9 4.5-9 4.5ZM7 11.5V16c1.4 1.3 3 2 5 2s3.6-.7 5-2v-4.5M21 9.5v5" />);
export const Brain = make("brain", <path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.3A3 3 0 0 0 9 17.5V4.5ZM15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 1.5 5.3A3 3 0 0 1 15 17.5V4.5ZM9 17.5V20M15 17.5V20" />);
export const Puzzle = make("pairs", <><rect x="3.5" y="5" width="7" height="6" rx="1.2" /><rect x="13.5" y="13" width="7" height="6" rx="1.2" /><path d="M10.5 8h3a1.5 1.5 0 0 1 1.5 1.5V13" /></>);
export const Scale = make("judge", <path d="M12 4v16M8 20h8M5 7.5h14M5 7.5 2.5 13a2.5 2.5 0 0 0 5 0ZM19 7.5 16.5 13a2.5 2.5 0 0 0 5 0Z" />);
export const ClipboardCheck = make("test", <path d="M9 4.5H6.5a1.5 1.5 0 0 0-1.5 1.5v13a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15M9 3.5h6v2.5H9ZM8.5 13l2.5 2.5 4.5-5" />);
export const CheckSquare = make("check-square", <><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="m8 12.5 3 3 5-6" /></>);
export const Target = make("target", <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></>);
export const Dumbbell = make("drill", <path d="M6.5 7v10M4 9.5v5M17.5 7v10M20 9.5v5M6.5 12h11" />);
export const Keyboard = make("keyboard", <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M8 14.5h8" /></>);
export const Ticket = make("ticket", <path d="M3.5 8.5V6.5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v2a3.5 3.5 0 0 0 0 7v2a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-2a3.5 3.5 0 0 0 0-7ZM14 6v12" />);
export const Flag = make("flag", <path d="M5.5 21V4M5.5 4.5h11l-2 4 2 4h-11" />);
export const Mountain = make("mountain", <path d="M2.5 19.5 9 8l4 7 2-3 6.5 7.5Z" />);
export const Trophy = make("trophy", <path d="M8 4.5h8v5a4 4 0 0 1-8 0ZM8 6.5H4.5A3.5 3.5 0 0 0 8 10M16 6.5h3.5A3.5 3.5 0 0 1 16 10M12 13.5v3.5M8.5 20h7M9.5 20l.5-3h4l.5 3" />);
export const Skull = make("skull", <path d="M12 3.5a7.5 7.5 0 0 0-4.5 13.5V20h9v-3A7.5 7.5 0 0 0 12 3.5ZM9 11.5h.01M15 11.5h.01M10.5 20v-2M13.5 20v-2" strokeWidth={1.6} />);
export const Sparkles = make("spark", <path d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l1.5 1.5M15.5 15.5 17 17M17 7l-1.5 1.5M8.5 15.5 7 17" />);
export const Zap = make("bolt", <path d="M13 3 5 13.5h6L10 21l8-10.5h-6Z" />);
export const Flame = make("flame", <path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-3.6-2.6-5.6-3.6-8.5-.4 1.6-1.3 2.7-2.4 3.2C12.6 6.4 11 4.3 9 3c.4 3-1.6 5-2.8 6.8A6.4 6.4 0 0 0 5.5 14.5 6.5 6.5 0 0 0 12 21Z" />);

/* ---------------------------------------------------------------- 时间 */
export const Clock3 = make("clock", <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5h4" /></>);
export const Timer = make("timer", <><circle cx="12" cy="13.5" r="7" /><path d="M12 13.5V10M10 3.5h4M18 7l1.5-1.5" /></>);
export const AlarmClock = make("alarm", <><circle cx="12" cy="13" r="7" /><path d="M12 9.5V13l2.5 1.5M4 5.5 6.5 3M20 5.5 17.5 3" /></>);
export const CalendarDays = make("calendar", <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9.5h16M8.5 3v4M15.5 3v4" /></>);
export const CalendarCheck = make("calendar-check", <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9.5h16M8.5 3v4M15.5 3v4M9 14.5l2 2 4-4" /></>);
export const CalendarClock = make("calendar-clock", <><path d="M20 10V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h4M4 9.5h16M8.5 3v4M15.5 3v4" /><circle cx="16.5" cy="16.5" r="4" /><path d="M16.5 14.8v1.7l1.2.8" /></>);
export const CalendarRange = CalendarDays;
export const Coffee = make("rest", <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5ZM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M11.5 3.5v2.5" />);
export const Moon = make("moon", <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" />);
export const Sun = make("sun", <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>);
export const SunMoon = make("theme", <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" /></>);
export const Contrast = SunMoon;

/* ---------------------------------------------------------------- 状态 */
export const Circle = make("circle", <circle cx="12" cy="12" r="8" />);
export const CircleHelp = make("help", <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.6a2.5 2.5 0 1 1 3.2 2.4c-.5.2-.8.6-.8 1.1v.6M12 16.8h.01" /></>);
export const TriangleAlert = make("alert", <path d="M12 4 2.8 19.5h18.4ZM12 10v4.5M12 17h.01" />);
export const ShieldAlert = make("shield-alert", <path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6ZM12 8.5v4.5M12 15.8h.01" />);
export const ShieldCheck = make("shield-check", <path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6ZM9 12l2 2 4-4.5" />);
export const WifiOff = make("offline", <path d="M2.5 8.5A14 14 0 0 1 8 5.3M12 5a14 14 0 0 1 9.5 3.5M5.5 12a9.5 9.5 0 0 1 4-2.2M15.5 10.5a9.5 9.5 0 0 1 3 1.5M9 15.5a4.5 4.5 0 0 1 6 0M12 19h.01M4 4l16 16" />);
export const BellRing = make("bell", <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5ZM10 20.5a2 2 0 0 0 4 0M3.5 7.5A9 9 0 0 1 6 4M20.5 7.5A9 9 0 0 0 18 4" />);
export const Gauge = make("gauge", <path d="M4.5 17a8.5 8.5 0 1 1 15 0M12 13.5l3.5-4M12 13.5h.01" />);
export const Database = make("data", <><ellipse cx="12" cy="6" rx="7" ry="2.5" /><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" /></>);
export const BarChart3 = make("chart", <path d="M5 20V11M10 20V5M15 20v-6M20 20V8M3.5 20.5h17" />);
export const UserRound = make("me", <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>);
export const Stethoscope = make("check-up", <path d="M6 3.5v5a4 4 0 0 0 8 0v-5M10 12.5v2a5 5 0 0 0 10 0v-2M20 12.5h.01" />);
export const History = make("history", <path d="M4.5 4.5v5h5M5 13a7.5 7.5 0 1 0 1.8-6.4L4.5 9.5M12 8v4.5l3 1.5" />);
export const ClipboardCopy = make("clip-copy", <path d="M9 4.5H6.5A1.5 1.5 0 0 0 5 6v13a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V6a1.5 1.5 0 0 0-1.5-1.5H15M9 3.5h6v2.5H9ZM9 13h6M12 10v6" />);
export const ClipboardPaste = make("clip-paste", <path d="M9 4.5H6.5A1.5 1.5 0 0 0 5 6v13a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V6a1.5 1.5 0 0 0-1.5-1.5H15M9 3.5h6v2.5H9ZM12 10v6.5M9.5 14l2.5 2.5 2.5-2.5" />);
export const HardDrive = make("drive", <><rect x="3.5" y="13" width="17" height="6.5" rx="1.5" /><path d="M5.5 13 8 5h8l2.5 8M16.5 16.3h.01" /></>);
export const ImageDown = make("image-down", <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="m3.5 16 5-5 4 4 2.5-2.5 5 5M15.5 8.5h.01" /></>);
export const FileText = make("file-text", <path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9ZM13.5 3.5V9H19M8.5 13h7M8.5 16.5h5" />);
export const KeyRound = make("key", <><circle cx="8" cy="15" r="4" /><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2" /></>);
export const Users = make("users", <><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14a6.5 6.5 0 0 1 3.5 6" /></>);
export const PanelLeft = make("panel", <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9.5 4.5v15" /></>);
export const Accessibility = make("a11y", <><circle cx="12" cy="4.5" r="1.6" /><path d="M5 8.5c2.3.7 4.6 1 7 1s4.7-.3 7-1M12 9.5v4.5M12 14l-3 6.5M12 14l3 6.5" /></>);
