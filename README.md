# oc-plugin-rainbow

Theme-aware rainbow post-processing for the OpenCode TUI.

![Rainbow stripe preview](https://raw.githubusercontent.com/qwerkilo/oc-plugin-rainbow/main/assets/rainbow-stripe.svg)

It adds:

- animated foreground color bands for neutral text
- optional animated background tint for neutral surfaces
- a built-in settings dialog for toggling and tuning the effect live

## Installation

### 从 GitHub 安装

```bash
git clone https://github.com/qwerkilo/oc-plugin-rainbow.git
```

然后在 `tui.json` 中添加：

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    [
      "path/to/oc-plugin-rainbow",
      {
        "enabled": true
      }
    ]
  ]
}
```

### 从 CLI 安装（需先发布到 npm）

```bash
opencode plugin oc-plugin-rainbow
```

或从 OpenCode 命令面板安装：

1. 按 `Ctrl+P`
2. 选择 `Install Plugin`
3. 输入 `oc-plugin-rainbow`

Requires OpenCode `>=1.15.0`。

## Options

Plugin options can be configured via the `tui.json` config file.

### TUI

- `enabled` (`boolean`, default `true`)
- `fg` (`boolean`, default `true`): animate neutral text colors
- `bg` (`boolean`, default `true`): animate neutral background surfaces
- `speed` (`number`, default `0.008`, range `0`-`0.03`)
- `turns` (`number`, default `3`, range `0.25`-`8`)
- `glow` (`number`, default `0.05`, range `0`-`0.15`)
- `keybinds.logo_splash` (`string`, default `ctrl+shift+r`): trigger the white-flash logo route

Example:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    [
      "oc-plugin-rainbow",
      {
        "enabled": true,
        "fg": true,
        "bg": true,
        "speed": 0.008,
        "turns": 3,
        "glow": 0.05
      }
    ]
  ]
}
```

Open `Rainbow settings` from the command palette or run `/rainbow-settings` to tune the effect live. Those changes are stored locally per user.

## Local use

Point a TUI config at the package directory:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["../../oc-plugin-rainbow", { "enabled": true }]]
}
```

The package exports its TUI entry at `./tui` and provides default config via `package.json`.
