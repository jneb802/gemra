# Feature 30: Configuration Schema Validation and Migration

## Overview
Implement robust configuration management with JSON Schema validation, automatic migration from legacy formats, and helpful error messages to prevent misconfiguration and ensure smooth upgrades across versions, improving user experience and reducing support burden.

## Problem
Currently, configuration is likely a simple JSON file with no validation:
- User typos cause silent failures (keys ignored)
- Version upgrades may break config without clear error
- No migration path from old layout to new
- No documentation of available options in-app
- Users must manually edit JSON (error-prone)

## Proposed Solution

### 1. JSON Schema Definition

Define a full JSON Schema (draft 07 or later) for config:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Gemra Configuration",
  "type": "object",
  "properties": {
    "font": { ... },
    "colors": { ... },
    "keybindings": { ... }
  },
  "required": [],
  "additionalProperties": false
}
```

Store schema in repo (`config_schema.json`) or embed in binary.

### 2. Validation on Load

When reading config file:
```zig
const config_data = try std.fs.cwd().readFileAlloc(allocator, config_path, max_size);
const config = try std.json.parseFromSlice(Config, allocator, config_data, .{ .validate = true });
// .validate = true uses JSON Schema if provided
```

But std.json doesn't support JSON Schema validation directly. Need external lib or custom validation.

Options:
- Use `json-schema` Zig package if exists
- Write custom validator (labour)
- Use `jsonschema` CLI? No.

Simpler: Use `std.json` and manually check required fields and types on parsed value. Since schema not huge, we can write validation code.

Define `Config` struct with all fields, then after parse, call `validateConfig(conf)` to check types, value ranges, mutually exclusive options, etc. Provide errors with line/field location.

### 3. Error Reporting

Present errors nicely:
- CLI: `error: Invalid config at line 42, key "font.size": expected number but found string`
- GUI: Show error dialog on startup with details and option to open config file

Do not crash. On validation failure:
- Log error
- Fall back to built-in defaults
- Possibly create backup of corrupted file

### 4. Migration System

When app version changes, config format may change. Need to migrate user's old config.

Version field in config:
```json
{
  "version": 1,
  "font": { ... }
}
```

On load:
1. Parse config as generic JSON (without strict schema)
2. Check `version`; if missing or older than current version, run migration steps
3. Migrations are functions that transform parsed JSON tree
4. After migration, save new config (with updated version)
5. Then validate and parse to strict struct

**Migration steps** are incremental:
- `migrate_v1_to_v2(old) => new`: rename `"colorscheme"` to `"theme"`
- `migrate_v2_to_v3`: split `"keybindings"` from simple object to array of objects with `key`, `action`, `description`
- etc.

We store migration functions in `src/config/migrations.zig` indexed by version.

### 5. Configuration Discovery

Multiple config locations (Unix):
- `~/.config/gemra/config.json` (XDG)
- `~/.gemrarc` (legacy)
- `$GEMRA_CONFIG` env var override

Search order:
1. Env var if set
2. XDG config dir (`xdg-config-home` or `~/.config/gemra/config.json`)
3. Legacy path

If none exists, copy built-in `default_config.json` to location.

### 6. Default Config Template

Provide a well-commented, canonical config file with defaults. Could be human-readable:
```json
{
  // Font configuration
  "font": {
    "family": "Fira Code",
    "size": 14.0,
    // ...
  },

  // Color scheme (inline colors or theme reference)
  "colors": {
    "foreground": "#c0caf5",
    "background": "#1a1b26"
  },

  // Keybindings (object: "ctrl+shift+t": "new_tab")
  "keybindings": {}

  // ...
}
```

### 7. Linter / Check Command

CLI command: `gemra --check-config` (or `gemra doctor`)
- Validates config file
- Runs migrations if needed
- Prints suggestions (deprecated keys, better defaults)
- Exit code 0 if OK, >0 if errors

### 8. Editor Integration

Optionally generate `config.json` with comments? JSON doesn't support comments. Could use JSONC (like VSCode) or TOML instead.

But currently likely JSON.

Alternative: Support TOML as alternative format? Might be easier for humans (comments, tables). Could add via `toml` dependency.

But to keep simple: JSON without comments, but provide annotated default file with `"key": value // comment`? Not valid JSON though. Could ship separate `config.example.json` with comments as separate file; main config silent.

### 9. Configuration UI (Future)

Maybe we could add an in-app settings window (like many terminals have). But that's large.

### 10. Implementation Plan

1. Define `Config` struct with all known fields, nested structs
2. Write `validate(conf: &Config) !void` that checks each field:
   - `font.size` > 0
   - `colors.palette` length 16 if present
   - `keybindings` keys match known actions (warn on unknown)
3. Write migration functions: `migrate(map: *std.json.Value) !void`
4. Load logic with try/catch:
```zig
const raw = try readConfigFile(path);
var tree = try std.json.parseFromSlice(std.json.Value, allocator, raw, .{});
defer tree.deinit();

const version = tree.value.get("version") orelse 0;
if (version < CURRENT_VERSION) {
    try migrate(&tree, version);
}
const config = try std.json.parseFromLeaves(Config, allocator, tree.value, .{});
try validate(&config);
```
5. On validation error, print user-friendly message; fall back to defaults
6. Add tests: invalid config types, missing required fields, migration cases

### 11. Testing

- Missing required field → error
- Wrong type (string instead of number) → error
- Unknown key → error if additionalProperties=false; else warn if allowed
- Migration from v1 to v2 transforms correctly
- Round-trip: default config → roundtrip JSON parse → same struct

### 12. Documentation

- Document config schema in README with examples
- List all options with defaults
- Provide migration guide when options change

### 13. Future Features

- `gemra config get font.size` / `set` CLI (like `git config`)
- Config schema auto-update from remote? Not needed.
- Config watcher: auto-reload config on file changes (like feature 17) with validation

### 14. Alternatives

- Use HCL (HashiCorp Configuration Language) for human-friendly format with comments
- Use YAML (but whitespace sensitive)
- Keep JSON but add a comments library? Complex.

We'll stick with JSON.

### 15. Scope

Feature is about ensuring config reliability. Not glamorous but essential for production-quality app.

## Conclusion
Configuration validation and migration is foundational for robust user experience. Implement after many features are stable, as schema will evolve.

This is feature 30 completing the set.
