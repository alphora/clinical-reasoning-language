# CRL Language Support for VS Code

This extension adds syntax highlighting and language basics for `.crl` files written in the Clinical Reasoning Language (CRL).

## ✨ Features
- Syntax highlighting for CRL-specific keywords
- Support for `.crl` file extension
- Comment support (`//` and `/* */`)

## 📦 Directory Structure
```
extension/
├── package.json
├── language-configuration.json
├── syntaxes/
│   └── crl.tmLanguage.json
```

## 🛠 Build the Extension
This project uses [vsce](https://github.com/microsoft/vsce) to package the VS Code extension.

### Install `vsce` globally:
```bash
npm install -g vsce
```

### Build the `.vsix` package
From the root of your repo:
```bash
npm run package:extension
```
This runs:
```bash
cd extension && vsce package
```
It produces a `.vsix` file like `crl-language-support-0.0.1.vsix`.

## 🧪 Install Locally in VS Code
```bash
code --install-extension extension/crl-language-support-0.0.1.vsix
```
Then configure your editor settings (see [Configuration](#configuration) below). Without the recommended `settings.json` entries, highlighting may not apply as expected.

## Install locally in Cursor

- Ctrl+Shift+P → `Developer: Install Extension From Location`
- browse to `/extension`

After installation, add the [Configuration](#configuration) settings below.

## 🚀 Publish to VS Code Marketplace

1. [Create a publisher account](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
2. Login with `vsce`:
   ```bash
   vsce login your-publisher-id
   ```
3. Publish:
   ```bash
   vsce publish
   ```

## ⚙️ Configuration

Use **Preferences: Open User Settings (JSON)** (Ctrl+Shift+P) and merge the following into your `settings.json`. CRL highlighting as described here depends on **both** the `files.associations` entry and the `editor.tokenColorCustomizations` block below.

### 1. File association (required)

Map `*.crl` to the Markdown language mode so the editor loads the correct TextMate grammar and highlighting:

```json
"files.associations": {
  "*.crl": "markdown"
}
```

### 2. Colorized highlighting (required)

Add `editor.tokenColorCustomizations` so CRL scopes use distinct colors:

```json
"editor.tokenColorCustomizations": {
  "textMateRules": [
    {
      "scope": "entity.name.type.crl",
      "settings": {
        "foreground": "#9CDCFE",
        "fontStyle": "bold"
      }
    },
    {
      "scope": "keyword.control.flow.crl",
      "settings": {
        "foreground": "#569CD6"
      }
    },
    {
      "scope": "keyword.control.structure.crl",
      "settings": {
        "foreground": "#C586C0"
      }
    },
    {
      "scope": "keyword.operator.logical.crl",
      "settings": {
        "foreground": "#D16969",
        "fontStyle": "bold"
      }
    },
    {
      "scope": "variable.language.element.crl",
      "settings": {
        "foreground": "#569CD6"
      }
    },
    {
      "scope": "comment.line.double-slash.crl",
      "settings": {
        "foreground": "#6A9955",
        "fontStyle": "italic"
      }
    },
    {
      "scope": "string.quoted.double.crl",
      "settings": {
        "foreground": "#CE9178"
      }
    },
    {
      "scope": "comment.block.crl",
      "settings": {
        "foreground": "#6A9955"
      }
    },
    {
      "scope": "string.quoted.backtick.crl",
      "settings": {
        "foreground": "#DCDCAA"
      }
    }
  ]
}
```

### Combined example

If you prefer a single paste, your `settings.json` can include both keys in one object (omit or merge with any existing top-level keys you already have):

```json
{
  "files.associations": {
    "*.crl": "markdown"
  },
  "editor.tokenColorCustomizations": {
    "textMateRules": [
      {
        "scope": "entity.name.type.crl",
        "settings": { "foreground": "#9CDCFE", "fontStyle": "bold" }
      },
      {
        "scope": "keyword.control.flow.crl",
        "settings": { "foreground": "#569CD6" }
      },
      {
        "scope": "keyword.control.structure.crl",
        "settings": { "foreground": "#C586C0" }
      },
      {
        "scope": "keyword.operator.logical.crl",
        "settings": { "foreground": "#D16969", "fontStyle": "bold" }
      },
      {
        "scope": "variable.language.element.crl",
        "settings": { "foreground": "#569CD6" }
      },
      {
        "scope": "comment.line.double-slash.crl",
        "settings": { "foreground": "#6A9955", "fontStyle": "italic" }
      },
      {
        "scope": "string.quoted.double.crl",
        "settings": { "foreground": "#CE9178" }
      },
      {
        "scope": "comment.block.crl",
        "settings": { "foreground": "#6A9955" }
      },
      {
        "scope": "string.quoted.backtick.crl",
        "settings": { "foreground": "#DCDCAA" }
      }
    ]
  }
}
```
