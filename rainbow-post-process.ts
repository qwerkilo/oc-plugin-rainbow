const eps = 1 / 510;
const eps16 = 2;
const top = "▀".charCodeAt(0);
const tilt = (25 * Math.PI) / 180;
const dx = Math.cos(tilt);
const dy = Math.sin(tilt);
const pi = Math.PI;
const miss = 2;

export type RainbowColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export type RainbowTheme = {
  text: RainbowColor;
  textMuted: RainbowColor;
  primary: RainbowColor;
  accent: RainbowColor;
  secondary: RainbowColor;
  background: RainbowColor;
  backgroundPanel: RainbowColor;
  backgroundElement: RainbowColor;
  backgroundMenu: RainbowColor;
};

export type RainbowConfig = {
  fg: boolean;
  bg: boolean;
  speed: number;
  turns: number;
  glow: number;
};

export type RainbowBuffer = {
  width: number;
  height: number;
  buffers: {
    char: ArrayLike<number>;
    fg: Float32Array | Uint16Array;
    bg: Float32Array | Uint16Array;
  };
};

type ThemeCache = {
  ready: boolean;
  values: number[];
  palette: number[];
  paletteCount: number;
  bgMarks: number[];
};

const isUint16 = (buf: Float32Array | Uint16Array): buf is Uint16Array => {
  return buf instanceof Uint16Array;
};

const readColor = (buf: Float32Array | Uint16Array, slot: number): [number, number, number, number] => {
  if (isUint16(buf)) {
    return [buf[slot] / 255, buf[slot + 1] / 255, buf[slot + 2] / 255, buf[slot + 3] / 255];
  }
  return [buf[slot], buf[slot + 1], buf[slot + 2], buf[slot + 3]];
};

const writeColor = (buf: Float32Array | Uint16Array, slot: number, r: number, g: number, b: number) => {
  if (isUint16(buf)) {
    buf[slot] = Math.round(r * 255);
    buf[slot + 1] = Math.round(g * 255);
    buf[slot + 2] = Math.round(b * 255);
  } else {
    buf[slot] = r;
    buf[slot + 1] = g;
    buf[slot + 2] = b;
  }
};

const paintFull = (
  buf: Float32Array | Uint16Array,
  slot: number,
  palette: number[],
  paletteCount: number,
  phase: number,
) => {
  const pos = (phase - Math.floor(phase)) * paletteCount;
  const idx = Math.floor(pos);
  const gap = pos - idx;
  const base = idx * 3;
  const next = idx + 1 === paletteCount ? 0 : base + 3;
  const baseR = palette[base]!;
  const baseG = palette[base + 1]!;
  const baseB = palette[base + 2]!;
  const nextR = palette[next]!;
  const nextG = palette[next + 1]!;
  const nextB = palette[next + 2]!;
  const r = baseR + (nextR - baseR) * gap;
  const g = baseG + (nextG - baseG) * gap;
  const b = baseB + (nextB - baseB) * gap;

  writeColor(buf, slot, r, g, b);
};

const paintBlend = (
  buf: Float32Array | Uint16Array,
  slot: number,
  palette: number[],
  paletteCount: number,
  phase: number,
  amt: number,
) => {
  const pos = (phase - Math.floor(phase)) * paletteCount;
  const idx = Math.floor(pos);
  const gap = pos - idx;
  const base = idx * 3;
  const next = idx + 1 === paletteCount ? 0 : base + 3;
  const baseR = palette[base]!;
  const baseG = palette[base + 1]!;
  const baseB = palette[base + 2]!;
  const nextR = palette[next]!;
  const nextG = palette[next + 1]!;
  const nextB = palette[next + 2]!;
  const r = baseR + (nextR - baseR) * gap;
  const g = baseG + (nextG - baseG) * gap;
  const b = baseB + (nextB - baseB) * gap;
  const [prevR, prevG, prevB] = readColor(buf, slot);

  writeColor(buf, slot, prevR + (r - prevR) * amt, prevG + (g - prevG) * amt, prevB + (b - prevB) * amt);
};

const colorInt = (value: number) => Math.round(value * 255);

const colorKey = (r: number, g: number, b: number, a: number) => {
  return (((colorInt(r) * 256 + colorInt(g)) * 256 + colorInt(b)) * 256 + colorInt(a)) >>> 0;
};

const rgbKey = (r: number, g: number, b: number) => {
  return ((colorInt(r) * 256 + colorInt(g)) * 256 + colorInt(b)) >>> 0;
};

const colorChanged = (values: number[], offset: number, ink: RainbowColor) => {
  return (
    values[offset] !== ink.r ||
    values[offset + 1] !== ink.g ||
    values[offset + 2] !== ink.b ||
    values[offset + 3] !== ink.a
  );
};

const storeColor = (values: number[], offset: number, ink: RainbowColor) => {
  values[offset] = ink.r;
  values[offset + 1] = ink.g;
  values[offset + 2] = ink.b;
  values[offset + 3] = ink.a;
};

const mixChannel = (a: number, b: number, t: number) => a + (b - a) * t;

const addPalette = (
  palette: number[],
  seen: Set<number>,
  r: number,
  g: number,
  b: number,
  a: number,
) => {
  const key = colorKey(r, g, b, a);
  if (seen.has(key)) return;
  seen.add(key);
  palette.push(r, g, b);
};

const addPaletteMix = (
  palette: number[],
  seen: Set<number>,
  a: RainbowColor,
  b: RainbowColor,
  t: number,
) => {
  addPalette(
    palette,
    seen,
    mixChannel(a.r, b.r, t),
    mixChannel(a.g, b.g, t),
    mixChannel(a.b, b.b, t),
    mixChannel(a.a, b.a, t),
  );
};

const addBgMark = (marks: number[], seen: Set<number>, ink: RainbowColor) => {
  const key = rgbKey(ink.r, ink.g, ink.b);
  if (seen.has(key)) return;
  seen.add(key);
  marks.push(ink.r, ink.g, ink.b);
};

const syncThemeCache = (cache: ThemeCache, theme: RainbowTheme) => {
  if (
    cache.ready &&
    !colorChanged(cache.values, 0, theme.text) &&
    !colorChanged(cache.values, 4, theme.textMuted) &&
    !colorChanged(cache.values, 8, theme.primary) &&
    !colorChanged(cache.values, 12, theme.accent) &&
    !colorChanged(cache.values, 16, theme.secondary) &&
    !colorChanged(cache.values, 20, theme.background) &&
    !colorChanged(cache.values, 24, theme.backgroundPanel) &&
    !colorChanged(cache.values, 28, theme.backgroundElement) &&
    !colorChanged(cache.values, 32, theme.backgroundMenu)
  ) {
    return;
  }

  storeColor(cache.values, 0, theme.text);
  storeColor(cache.values, 4, theme.textMuted);
  storeColor(cache.values, 8, theme.primary);
  storeColor(cache.values, 12, theme.accent);
  storeColor(cache.values, 16, theme.secondary);
  storeColor(cache.values, 20, theme.background);
  storeColor(cache.values, 24, theme.backgroundPanel);
  storeColor(cache.values, 28, theme.backgroundElement);
  storeColor(cache.values, 32, theme.backgroundMenu);

  const paletteSeen = new Set<number>();
  const palette: number[] = [];
  addPaletteMix(palette, paletteSeen, theme.text, theme.primary, 0.4);
  addPalette(
    palette,
    paletteSeen,
    theme.primary.r,
    theme.primary.g,
    theme.primary.b,
    theme.primary.a,
  );
  addPaletteMix(palette, paletteSeen, theme.primary, theme.accent, 0.5);
  addPalette(palette, paletteSeen, theme.accent.r, theme.accent.g, theme.accent.b, theme.accent.a);
  addPaletteMix(palette, paletteSeen, theme.accent, theme.secondary, 0.5);
  addPalette(
    palette,
    paletteSeen,
    theme.secondary.r,
    theme.secondary.g,
    theme.secondary.b,
    theme.secondary.a,
  );
  addPaletteMix(palette, paletteSeen, theme.secondary, theme.textMuted, 0.35);

  if (!palette.length) {
    palette.push(theme.primary.r, theme.primary.g, theme.primary.b);
  }

  const bgSeen = new Set<number>();
  const bgMarks: number[] = [];
  addBgMark(bgMarks, bgSeen, theme.background);
  addBgMark(bgMarks, bgSeen, theme.backgroundPanel);
  addBgMark(bgMarks, bgSeen, theme.backgroundElement);
  addBgMark(bgMarks, bgSeen, theme.backgroundMenu);

  cache.ready = true;
  cache.palette = palette;
  cache.paletteCount = palette.length / 3;
  cache.bgMarks = bgMarks;
};

const matchColor = (r: number, g: number, b: number, tr: number, tg: number, tb: number, tolerance: number) => {
  return Math.abs(r - tr) <= tolerance && Math.abs(g - tg) <= tolerance && Math.abs(b - tb) <= tolerance;
};

const epsForBuf = (buf: Float32Array | Uint16Array) => (isUint16(buf) ? eps16 : eps);

const applyBoth = (
  buffer: RainbowBuffer,
  palette: number[],
  paletteCount: number,
  fgStep: number,
  fgRow: number,
  fgShift: number,
  bgStep: number,
  bgRow: number,
  bgShift: number,
  glow: number,
  textR: number,
  textG: number,
  textB: number,
  mutedR: number,
  mutedG: number,
  mutedB: number,
  bg0r: number,
  bg0g: number,
  bg0b: number,
  bg1r: number,
  bg1g: number,
  bg1b: number,
  bg2r: number,
  bg2g: number,
  bg2b: number,
  bg3r: number,
  bg3g: number,
  bg3b: number,
) => {
  const width = buffer.width;
  const height = buffer.height;
  const fg = buffer.buffers.fg;
  const bg = buffer.buffers.bg;
  const char = buffer.buffers.char;
  const fgEps = epsForBuf(fg);
  const bgEps = epsForBuf(bg);

  for (let y = 0, cell = 0, slot = 0; y < height; y++) {
    let fgPhase = y * fgRow + fgShift;
    let bgPhase = y * bgRow + bgShift;

    for (let x = 0; x < width; x++, cell++, slot += 4) {
      const [r, g, b] = readColor(fg, slot);

      if (
        matchColor(r, g, b, textR, textG, textB, fgEps) ||
        matchColor(r, g, b, mutedR, mutedG, mutedB, fgEps)
      ) {
        paintFull(fg, slot, palette, paletteCount, fgPhase);
      }

      const [br, bgg, bb] = readColor(bg, slot);
      const matchBg =
        matchColor(br, bgg, bb, bg0r, bg0g, bg0b, bgEps) ||
        matchColor(br, bgg, bb, bg1r, bg1g, bg1b, bgEps) ||
        matchColor(br, bgg, bb, bg2r, bg2g, bg2b, bgEps) ||
        matchColor(br, bgg, bb, bg3r, bg3g, bg3b, bgEps);

      if (matchBg) {
        const rise = Math.sin((bgPhase - Math.floor(bgPhase)) * pi);
        const amt = glow * (0.35 + 0.65 * rise * rise);
        paintBlend(bg, slot, palette, paletteCount, bgPhase, amt);

        if (
          char[cell] === top &&
          (matchColor(r, g, b, bg0r, bg0g, bg0b, fgEps) ||
            matchColor(r, g, b, bg1r, bg1g, bg1b, fgEps) ||
            matchColor(r, g, b, bg2r, bg2g, bg2b, fgEps) ||
            matchColor(r, g, b, bg3r, bg3g, bg3b, fgEps))
        ) {
          paintBlend(fg, slot, palette, paletteCount, bgPhase, amt);
        }
      }

      fgPhase += fgStep;
      bgPhase += bgStep;
    }
  }
};

const applyFgOnly = (
  buffer: RainbowBuffer,
  palette: number[],
  paletteCount: number,
  fgStep: number,
  fgRow: number,
  fgShift: number,
  textR: number,
  textG: number,
  textB: number,
  mutedR: number,
  mutedG: number,
  mutedB: number,
) => {
  const width = buffer.width;
  const height = buffer.height;
  const fg = buffer.buffers.fg;
  const fgEps = epsForBuf(fg);

  for (let y = 0, slot = 0; y < height; y++) {
    let fgPhase = y * fgRow + fgShift;

    for (let x = 0; x < width; x++, slot += 4) {
      const [r, g, b] = readColor(fg, slot);
      if (
        matchColor(r, g, b, textR, textG, textB, fgEps) ||
        matchColor(r, g, b, mutedR, mutedG, mutedB, fgEps)
      ) {
        paintFull(fg, slot, palette, paletteCount, fgPhase);
      }
      fgPhase += fgStep;
    }
  }
};

const applyBgOnly = (
  buffer: RainbowBuffer,
  palette: number[],
  paletteCount: number,
  bgStep: number,
  bgRow: number,
  bgShift: number,
  glow: number,
  bg0r: number,
  bg0g: number,
  bg0b: number,
  bg1r: number,
  bg1g: number,
  bg1b: number,
  bg2r: number,
  bg2g: number,
  bg2b: number,
  bg3r: number,
  bg3g: number,
  bg3b: number,
) => {
  const width = buffer.width;
  const height = buffer.height;
  const fg = buffer.buffers.fg;
  const bg = buffer.buffers.bg;
  const char = buffer.buffers.char;
  const bgEps = epsForBuf(bg);
  const fgEps = epsForBuf(fg);

  for (let y = 0, cell = 0, slot = 0; y < height; y++) {
    let bgPhase = y * bgRow + bgShift;

    for (let x = 0; x < width; x++, cell++, slot += 4) {
      const [r, g, b] = readColor(fg, slot);
      const [br, bgg, bb] = readColor(bg, slot);
      const matchBg =
        matchColor(br, bgg, bb, bg0r, bg0g, bg0b, bgEps) ||
        matchColor(br, bgg, bb, bg1r, bg1g, bg1b, bgEps) ||
        matchColor(br, bgg, bb, bg2r, bg2g, bg2b, bgEps) ||
        matchColor(br, bgg, bb, bg3r, bg3g, bg3b, bgEps);

      if (matchBg) {
        const rise = Math.sin((bgPhase - Math.floor(bgPhase)) * pi);
        const amt = glow * (0.35 + 0.65 * rise * rise);
        paintBlend(bg, slot, palette, paletteCount, bgPhase, amt);

        if (
          char[cell] === top &&
          (matchColor(r, g, b, bg0r, bg0g, bg0b, fgEps) ||
            matchColor(r, g, b, bg1r, bg1g, bg1b, fgEps) ||
            matchColor(r, g, b, bg2r, bg2g, bg2b, fgEps) ||
            matchColor(r, g, b, bg3r, bg3g, bg3b, fgEps))
        ) {
          paintBlend(fg, slot, palette, paletteCount, bgPhase, amt);
        }
      }

      bgPhase += bgStep;
    }
  }
};

export const createRainbowPostProcess = (theme: () => RainbowTheme, value: () => RainbowConfig) => {
  let time = 0;
  const cache: ThemeCache = {
    ready: false,
    values: new Array(36).fill(0),
    palette: [0, 0, 0],
    paletteCount: 1,
    bgMarks: [],
  };

  return (buffer: RainbowBuffer, delta: number) => {
    const cfg = value();
    const useFg = cfg.fg;
    const useBg = cfg.bg && cfg.glow > 0;
    if (!useFg && !useBg) return;

    time += delta * cfg.speed;

    const skin = theme();
    syncThemeCache(cache, skin);

    const textR = skin.text.r;
    const textG = skin.text.g;
    const textB = skin.text.b;
    const mutedR = skin.textMuted.r;
    const mutedG = skin.textMuted.g;
    const mutedB = skin.textMuted.b;

    const bgMarks = cache.bgMarks;
    const bg0r = bgMarks[0] ?? miss;
    const bg0g = bgMarks[1] ?? miss;
    const bg0b = bgMarks[2] ?? miss;
    const bg1r = bgMarks[3] ?? miss;
    const bg1g = bgMarks[4] ?? miss;
    const bg1b = bgMarks[5] ?? miss;
    const bg2r = bgMarks[6] ?? miss;
    const bg2g = bgMarks[7] ?? miss;
    const bg2b = bgMarks[8] ?? miss;
    const bg3r = bgMarks[9] ?? miss;
    const bg3g = bgMarks[10] ?? miss;
    const bg3b = bgMarks[11] ?? miss;

    const invSpan = 1 / Math.max(1, buffer.width * dx + buffer.height * dy);
    const fgStep = dx * invSpan * cfg.turns;
    const fgRow = dy * invSpan * cfg.turns;
    const fgShift = time * 0.1;
    const blur = Math.max(0.5, cfg.turns * 0.55);
    const bgStep = dx * invSpan * blur;
    const bgRow = dy * invSpan * blur;
    const bgShift = time * 0.04 + 0.17;
    const palette = cache.palette;
    const paletteCount = cache.paletteCount;

    if (useFg && useBg) {
      applyBoth(
        buffer,
        palette,
        paletteCount,
        fgStep,
        fgRow,
        fgShift,
        bgStep,
        bgRow,
        bgShift,
        cfg.glow,
        textR,
        textG,
        textB,
        mutedR,
        mutedG,
        mutedB,
        bg0r,
        bg0g,
        bg0b,
        bg1r,
        bg1g,
        bg1b,
        bg2r,
        bg2g,
        bg2b,
        bg3r,
        bg3g,
        bg3b,
      );
      return;
    }

    if (useFg) {
      applyFgOnly(
        buffer,
        palette,
        paletteCount,
        fgStep,
        fgRow,
        fgShift,
        textR,
        textG,
        textB,
        mutedR,
        mutedG,
        mutedB,
      );
      return;
    }

    applyBgOnly(
      buffer,
      palette,
      paletteCount,
      bgStep,
      bgRow,
      bgShift,
      cfg.glow,
      bg0r,
      bg0g,
      bg0b,
      bg1r,
      bg1g,
      bg1b,
      bg2r,
      bg2g,
      bg2b,
      bg3r,
      bg3g,
      bg3b,
    );
  };
};
