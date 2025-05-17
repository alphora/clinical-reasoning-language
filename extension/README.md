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
Then open any `.crl` file — it will highlight automatically.

## Install locally in Cursor

- Ctrl+Shift+P → `Developer: Install Extension From Location`
- browse to `/extension`

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

## 🎨 Optional: Enable Colorized Highlighting
Add the following to your `settings.json` (via Ctrl+Shift+P → Preferences: Open Settings (JSON)):

```json
"editor.tokenColorCustomizations": {
  "textMateRules": [
    {
      "scope": "entity.name.type.crl",
      "settings": {
        "foreground": "#C586C0",
        "fontStyle": "bold"
      }
    },
    {
      "scope": "keyword.control.flow.crl",
      "settings": {
        "foreground": "#569CD6",
        "fontStyle": "bold"
      }
    },
    {
      "scope": "keyword.control.structure.crl",
      "settings": {
        "foreground": "#4EC9B0",
        "fontStyle": "bold"
      }
    },
    {
      "scope": "variable.language.element.crl",
      "settings": {
        "foreground": "#9CDCFE"
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
      "scope": "string.quoted.backtick.crl",
      "settings": {
        "foreground": "#DCDCAA"
      }
    }
  ]
}
```
