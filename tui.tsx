/** @jsxImportSource @opentui/solid */
import type { OptimizedBuffer } from "@opentui/core";
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createSignal } from "solid-js";
import { createRainbowPostProcess } from "./rainbow-post-process";
import {
  SettingsDialog,
  createSettingKey,
  type Field,
  type NumberField,
  type SettingsState,
  type ToggleField,
} from "./settings-dialog";

const id = "tui-rainbow";
const speed = 0.008;
const turns = 3;
const glow = 0.05;

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

const tui: TuiPlugin = async (api, options) => {
  if (options?.enabled === false) return;

  const [value, setValue] = createSignal(load(api, cfg(options)));
  const apply: (buffer: OptimizedBuffer, delta: number) => void = createRainbowPostProcess(
    () => api.theme.current,
    value,
  );
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
