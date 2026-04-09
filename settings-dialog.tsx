/** @jsxImportSource @opentui/solid */
import { useKeyboard } from "@opentui/solid";
import type { TuiPlugin } from "@opencode-ai/plugin/tui";
import { createMemo, createSignal } from "solid-js";

type Api = Parameters<TuiPlugin>[0];

export type SettingsState = {
  fg: boolean;
  bg: boolean;
  speed: number;
  turns: number;
  glow: number;
};

export type ToggleField = "fg" | "bg";
export type NumberField = "speed" | "turns" | "glow";
export type Field = ToggleField | NumberField;

type Row = {
  key: Field;
  title: string;
  description: string;
  category: string;
  kind: "toggle" | "number";
  step?: number;
  min?: number;
  max?: number;
  digits?: number;
};

const rows: Row[] = [
  {
    key: "fg",
    title: "Foreground effect",
    description: "Animate neutral text colors",
    category: "Effects",
    kind: "toggle",
  },
  {
    key: "bg",
    title: "Background effect",
    description: "Animate neutral background surfaces",
    category: "Effects",
    kind: "toggle",
  },
  {
    key: "speed",
    title: "Animation speed",
    description: "Controls how quickly the color band moves",
    category: "Motion",
    kind: "number",
    step: 0.001,
    min: 0,
    max: 0.03,
    digits: 3,
  },
  {
    key: "turns",
    title: "Band count",
    description: "Controls how many diagonal bands span the screen",
    category: "Motion",
    kind: "number",
    step: 0.25,
    min: 0.25,
    max: 8,
    digits: 2,
  },
  {
    key: "glow",
    title: "Background strength",
    description: "Intensity of the background color wash",
    category: "Surface",
    kind: "number",
    step: 0.01,
    min: 0,
    max: 0.15,
    digits: 2,
  },
];

export const settingByField = Object.fromEntries(rows.map((item) => [item.key, item])) as Record<
  Field,
  Row
>;

export const createSettingKey = (id: string) => {
  return {
    fg: `${id}.setting.fg`,
    bg: `${id}.setting.bg`,
    speed: `${id}.setting.speed`,
    turns: `${id}.setting.turns`,
    glow: `${id}.setting.glow`,
  } as const;
};

const field = (value: unknown): Field | undefined => {
  if (
    value === "fg" ||
    value === "bg" ||
    value === "speed" ||
    value === "turns" ||
    value === "glow"
  )
    return value;
};

const status = (value: boolean) => {
  return value ? "ON" : "OFF";
};

const metric = (value: SettingsState, key: NumberField) => {
  return value[key].toFixed(settingByField[key].digits ?? 0);
};

export const SettingsDialog = (props: {
  api: Api;
  value: () => SettingsState;
  flip: (key: ToggleField) => void;
  tune: (key: NumberField, dir: -1 | 1) => void;
}) => {
  const [cur, setCur] = createSignal<Field>(rows[0]?.key ?? "fg");
  const theme = createMemo(() => props.api.theme.current);
  const current = createMemo(() => settingByField[cur()] ?? settingByField.fg);
  const options = createMemo(() => {
    const value = props.value();
    return rows.map((item) => {
      const footer = item.kind === "toggle" ? status(value[item.key]) : metric(value, item.key);
      return {
        title: item.title,
        value: item.key,
        description: item.description,
        category: item.category,
        footer,
      };
    });
  });

  useKeyboard((evt) => {
    const item = current();
    if (!item) return;

    if (evt.name === "space" && item.kind === "toggle") {
      evt.preventDefault();
      evt.stopPropagation();
      props.flip(item.key);
      return;
    }

    if (evt.name !== "left" && evt.name !== "right") return;
    evt.preventDefault();
    evt.stopPropagation();
    if (item.kind === "toggle") {
      props.flip(item.key);
      return;
    }
    props.tune(item.key, evt.name === "left" ? -1 : 1);
  });

  return (
    <box flexDirection="column">
      <props.api.ui.DialogSelect
        title="Rainbow settings"
        placeholder="Filter settings"
        options={options()}
        current={cur()}
        onMove={(item) => {
          const next = field(item.value);
          if (!next) return;
          setCur(next);
        }}
        onSelect={(item) => {
          const next = field(item.value);
          if (!next) return;
          setCur(next);
          if (settingByField[next].kind === "toggle") {
            props.flip(next);
          }
        }}
      />
      <box
        paddingRight={2}
        paddingLeft={4}
        flexDirection="row"
        gap={2}
        paddingTop={1}
        paddingBottom={1}
        flexShrink={0}
      >
        <text>
          <span style={{ fg: theme().text }}>
            <b>toggle</b>{" "}
          </span>
          <span style={{ fg: theme().textMuted }}>space enter left/right</span>
        </text>
        <text>
          <span style={{ fg: theme().text }}>
            <b>adjust</b>{" "}
          </span>
          <span style={{ fg: theme().textMuted }}>left/right</span>
        </text>
        <text>
          <span style={{ fg: theme().text }}>
            <b>speed</b>{" "}
          </span>
          <span style={{ fg: theme().textMuted }}>0 stops animation</span>
        </text>
        <text>
          <span style={{ fg: theme().text }}>
            <b>tint</b>{" "}
          </span>
          <span style={{ fg: theme().textMuted }}>0 keeps backgrounds unchanged</span>
        </text>
      </box>
    </box>
  );
};
