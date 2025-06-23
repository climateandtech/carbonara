# Carbonara - Multi-Editor Plugin Architecture

A monorepo containing a multi-editor plugin architecture with JSON-RPC for seamless integration across different code editors and platforms.

## 🧱 Architecture Overview

```
+-------------------+       +------------------------+        +--------------------+
| VS Code Plugin    | <---> |                        | <----> | JetBrains Plugin   |
| (Native UI + API) |       |                        |        | (Kotlin Plugin)    |
+-------------------+       |                        |        +--------------------+
                            |                        |
+-------------------+       |                        |        +--------------------+
| Vim/Neovim Plugin | <---> |     JSON-RPC Layer     | <----> | Emacs Plugin       |
| (Lua/Python/CLI)  |       |     (Transport/API)    |        | (Elisp Client)     |
+-------------------+       |                        |        +--------------------+
                            |                        |
                            |                        | <----> +--------------------+
+-------------------+       |                        |        | Svelte Web UI      |
| CLI Tool (Debug)  | <---->|                        |        | (Browser App)      |
+-------------------+       +------------------------+        +--------------------+
                                     |
                                     v
                          +---------------------------+
                          | Core Backend Logic        |
                          | (Analysis, Models, etc.)  |
                          +---------------------------+
```

## 📁 Project Structure

```
carbonara/
├── packages/                    # Shared libraries and core services
│   ├── core-backend/           # Core backend logic (Python/TypeScript)
│   ├── rpc-protocol/           # JSON-RPC protocol definitions
│   ├── rpc-client/             # Client libraries for different languages
│   └── cli/                    # CLI tool for debugging and automation
├── apps/                       # Applications
│   └── web-ui/                 # Svelte web application
├── plugins/                    # Editor plugins
│   ├── vscode/                 # VS Code extension
│   ├── jetbrains/              # JetBrains plugin (Kotlin)
│   ├── vim/                    # Vim/Neovim plugin
│   └── emacs/                  # Emacs plugin
├── docs/                       # Documentation
└── tools/                      # Development tools and scripts
```

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm run setup
   ```

2. **Start the backend server:**
   ```bash
   npm run start:backend
   ```

3. **Start the web UI (development):**
   ```bash
   npm run start:web
   ```

4. **Build all packages:**
   ```bash
   npm run build
   ```

## 🔧 Development

### Backend Development
- **Python**: Use `packages/core-backend/python/` for Python services
- **TypeScript**: Use `packages/core-backend/typescript/` for TypeScript services

### Frontend Development
- **Svelte Web UI**: Located in `apps/web-ui/`
- **Editor Plugins**: Each editor has its own plugin in `plugins/`

### Testing
```bash
npm run test
```

### Linting
```bash
npm run lint
```

## 📚 Documentation

- [JSON-RPC Protocol](./docs/protocol.md)
- [Backend API](./docs/backend-api.md)
- [Plugin Development](./docs/plugin-development.md)
- [Deployment Guide](./docs/deployment.md)

## 🤝 Contributing

Please read our [Contributing Guide](./CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details. 