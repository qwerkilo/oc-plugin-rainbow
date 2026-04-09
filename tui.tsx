/** @jsxImportSource @opentui/solid */
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import type { TuiPlugin, TuiPluginModule, TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import { createSignal } from "solid-js";
import {
  SettingsDialog,
  createSettingKey,
  type Field,
  type NumberField,
  type SettingsState,
  type ToggleField,
} from "./settings-dialog";

const id = "tui-rainbow";
const eps = 1 / 510;
const speed = 0.008;
const turns = 3;
const glow = 0.05;
const top = "▀".charCodeAt(0);
const tilt = (25 * Math.PI) / 180;
const dx = Math.cos(tilt);
const dy = Math.sin(tilt);

type Api = Parameters<TuiPlugin>[0];
type Cfg = SettingsState;

const setting = createSettingKey(id);

const clamp = (value: number, min: number, max: number) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const num = (value: unknown, fallback: number) => {
  if (typeof value !== "number") return fallback;
  return value;
};

const bool = (value: unknown, fallback: boolean) => {
  if (typeof value !== "boolean") return fallback;
  return value;
};

const eq = (a: number, b: number) => Math.abs(a - b) <= eps;

const same = (ink: RGBA, r: number, g: number, b: number) => {
  return eq(ink.r, r) && eq(ink.g, g) && eq(ink.b, b);
};

const mix = (a: RGBA, b: RGBA, t: number) => {
  return RGBA.fromValues(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
    a.a + (b.a - a.a) * t,
  );
};

const uniq = (list: RGBA[]) => {
  const seen = new Set<string>();
  return list.filter((ink) => {
    const key = ink.toInts().join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const hit = (list: RGBA[], r: number, g: number, b: number) => {
  return list.some((ink) => same(ink, r, g, b));
};

const paint = (buf: Float32Array, slot: number, list: RGBA[], step: number, amt: number) => {
  const pos = (((step % 1) + 1) % 1) * list.length || 0;
  const idx = Math.floor(pos);
  const gap = pos - idx;
  const a = list[idx];
  const z = list[(idx + 1) % list.length];
  const r = a.r + (z.r - a.r) * gap;
  const g = a.g + (z.g - a.g) * gap;
  const b = a.b + (z.b - a.b) * gap;

  buf[slot] = buf[slot] + (r - buf[slot]) * amt;
  buf[slot + 1] = buf[slot + 1] + (g - buf[slot + 1]) * amt;
  buf[slot + 2] = buf[slot + 2] + (b - buf[slot + 2]) * amt;
};

const anim = (cfg: Cfg) => {
  return cfg.speed > 0 && (cfg.fg || (cfg.bg && cfg.glow > 0));
};

const cfg = (opts: Record<string, unknown> | undefined): Cfg => {
  return {
    fg: bool(opts?.fg, true),
    bg: bool(opts?.bg, true),
    speed: clamp(num(opts?.speed, speed), 0, 0.03),
    turns: clamp(num(opts?.turns, turns), 0.25, 8),
    glow: clamp(num(opts?.glow, glow), 0, 0.15),
  };
};

const load = (api: Api, value: Cfg): Cfg => {
  return {
    fg: bool(api.kv.get(setting.fg, value.fg), value.fg),
    bg: bool(api.kv.get(setting.bg, value.bg), value.bg),
    speed: clamp(num(api.kv.get(setting.speed, value.speed), value.speed), 0, 0.03),
    turns: clamp(num(api.kv.get(setting.turns, value.turns), value.turns), 0.25, 8),
    glow: clamp(num(api.kv.get(setting.glow, value.glow), value.glow), 0, 0.15),
  };
};

const pick = (theme: TuiThemeCurrent) => {
  const list = uniq([
    mix(theme.text, theme.primary, 0.4),
    theme.primary,
    mix(theme.primary, theme.accent, 0.5),
    theme.accent,
    mix(theme.accent, theme.secondary, 0.5),
    theme.secondary,
    mix(theme.secondary, theme.textMuted, 0.35),
  ]);

  if (list.length) return list;
  return [theme.primary];
};

const post = (theme: () => TuiThemeCurrent, value: () => Cfg) => {
  let time = 0;

  return (buffer: OptimizedBuffer, delta: number) => {
    const cfg = value();
    if (!cfg.fg && (!cfg.bg || !cfg.glow)) return;
    time += delta * cfg.speed;

    const skin = theme();
    const list = pick(skin);
    const bgmark = uniq([
      skin.background,
      skin.backgroundPanel,
      skin.backgroundElement,
      skin.backgroundMenu,
    ]);
    const fgmark = [skin.text, skin.textMuted];
    const span = Math.max(1, buffer.width * dx + buffer.height * dy);
    const fg = buffer.buffers.fg;
    const bg = buffer.buffers.bg;
    const char = buffer.buffers.char;
    const blur = Math.max(0.5, cfg.turns * 0.55);

    for (let y = 0; y < buffer.height; y++) {
      for (let x = 0; x < buffer.width; x++) {
        const cell = y * buffer.width + x;
        const slot = cell * 4;
        const r = fg[slot];
        const g = fg[slot + 1];
        const b = fg[slot + 2];
        const step = ((x * dx + y * dy) / span) * cfg.turns + time * 0.1;
        if (cfg.fg && hit(fgmark, r, g, b)) {
          paint(fg, slot, list, step, 1);
        }

        if (!cfg.bg || !cfg.glow) continue;

        const br = bg[slot];
        const bgg = bg[slot + 1];
        const bb = bg[slot + 2];
        if (!hit(bgmark, br, bgg, bb)) continue;

        const haze = ((x * dx + y * dy) / span) * blur + time * 0.04 + 0.17;
        const rise = Math.sin((((haze % 1) + 1) % 1) * Math.PI);
        const amt = cfg.glow * (0.35 + 0.65 * rise * rise);
        paint(bg, slot, list, haze, amt);

        if (char[cell] === top && hit(bgmark, r, g, b)) {
          paint(fg, slot, list, haze, amt);
        }
      }
    }
  };
};

const tui: TuiPlugin = async (api, options) => {
  if (options?.enabled === false) return;

  const [value, setValue] = createSignal(load(api, cfg(options)));
  const apply = post(() => api.theme.current, value);
  let live = false;

  const sync = (cfg = value()) => {
    const next = anim(cfg);
    if (next && !live) {
      api.renderer.requestLive();
      live = true;
      return;
    }
    if (!next && live) {
      api.renderer.dropLive();
      live = false;
    }
  };

  const save = <K extends Field>(key: K, next: Cfg[K]) => {
    const prev = value();
    if (prev[key] === next) return;
    const state = { ...prev, [key]: next } as Cfg;
    setValue(state);
    api.kv.set(setting[key], next);
    sync(state);
  };

  const flip = (key: ToggleField) => {
    save(key, !value()[key]);
  };

  const tune = (key: NumberField, dir: -1 | 1) => {
    const step = key === "speed" ? 0.001 : key === "turns" ? 0.25 : 0.01;
    const min = key === "speed" ? 0 : key === "turns" ? 0.25 : 0;
    const max = key === "speed" ? 0.03 : key === "turns" ? 8 : 0.15;
    const digits = key === "speed" ? 3 : 2;
    save(key, Number(clamp(value()[key] + step * dir, min, max).toFixed(digits)));
  };

  const show = () => {
    api.ui.dialog.setSize("medium");
    api.ui.dialog.replace(() => <SettingsDialog api={api} value={value} flip={flip} tune={tune} />);
  };

  api.renderer.addPostProcessFn(apply);
  sync();

  api.command.register(() => [
    {
      title: "Rainbow settings",
      value: `${id}.settings`,
      category: "Plugin",
      slash: {
        name: "rainbow-settings",
      },
      onSelect() {
        show();
      },
    },
  ]);

  api.lifecycle.onDispose(() => {
    api.renderer.removePostProcessFn(apply);
    if (live) {
      api.renderer.dropLive();
      live = false;
    }
  });
};

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
};

export default plugin;
