/** 阅读区背景主题（与 appStore.readerBackground 一致） */
export type ReaderBackgroundId =
  | "default"
  | "eye"
  | "gray"
  | "warm"
  | "dark";

/** 页面画布外侧「相框」色（.pdf-viewer） */
export const READER_OUTER_BG: Record<ReaderBackgroundId, string> = {
  default: "#4a4d50",
  eye: "#4d564d",
  gray: "#525252",
  warm: "#504d48",
  dark: "#141618",
};

/** EmbedPDF 视口背景（页与页之间空隙） */
export const READER_VIEWPORT_BG: Record<ReaderBackgroundId, string> = {
  default: "#f1f3f5",
  eye: "#c8e6c9",
  gray: "#d4d4d4",
  warm: "#f2ebe0",
  dark: "#2d3238",
};

export const READER_THEME_OPTIONS: {
  value: ReaderBackgroundId;
  label: string;
}[] = [
  { value: "default", label: "默认" },
  { value: "eye", label: "护眼绿" },
  { value: "gray", label: "浅灰" },
  { value: "warm", label: "暖色纸" },
  { value: "dark", label: "暗色" },
];
