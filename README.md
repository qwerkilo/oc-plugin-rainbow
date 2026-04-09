# oc-plugin-rainbow

Theme-aware rainbow post-processing for the OpenCode TUI.

It adds:

- animated foreground color bands for neutral text
- optional animated background tint for neutral surfaces
- a built-in settings dialog for toggling and tuning the effect live

## Local use

Point a TUI config at the package directory:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["../../oc-plugin-rainbow"]
}
```

The package exports its TUI entry at `./tui` and provides default config via `package.json`.
