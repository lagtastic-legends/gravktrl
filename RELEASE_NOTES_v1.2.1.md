# 🚀 GravKtrl v1.2.1 — Live Antigravity Output Streaming & Native Conversation Drawer

GravKtrl v1.2.1 resolves both critical user needs:
1. **Real-Time Antigravity Output Streaming**: The mobile app now streams the actual responses, markdown formatting, code blocks, and internal thinking processes directly from Google Antigravity in real-time, whether running in Win32 or CDP mode.
2. **Native Conversation Drawer**: A 1:1 replica of the Google Antigravity sidebar, grouping conversations by project (`gravktrl`, `omni-tool`, `portfolio`, etc.) with relative timestamps (`3m`, `2d`, `1mo`), active conversation indicators, and "+ New Conversation" capabilities.

---

### ✨ What's New in v1.2.1

1. **Antigravity Live Transcript Watcher (`AntigravityConversationManager`):**
   - Automatically tracks the active Antigravity session transcript (`transcript.jsonl`) on disk using fast byte-offset tailing.
   - When Gemini 3.8 Flash responds, chunks and thoughts stream live into the GravKtrl mobile chat console without needing CDP port 9222.
   - Supports markdown parsing, formatted code blocks with 1-tap clipboard copy, and expandable "Thinking Process" accordions.

2. **Antigravity Conversation Drawer (Matching Desktop UI 1:1):**
   - Direct header dropdown `[💬 Conversation Title ▾]` to open the Silk Neomorphic Conversation Drawer.
   - **Projects Tree**: Collapsible folders for every Antigravity project workspace (`gravktrl`, `omni-tool`, `portfolio`, etc.).
   - **Conversation Switching**: 1-tap switching between conversations with immediate chat history loading.
   - **+ New Conversation**: Instantly start a new conversation session on your PC directly from your phone.
   - **Instant Search/Filter**: Filter through all historical conversations by title or project name.

3. **Performance & Reliability:**
   - Zero external dependencies: leverages Node.js built-in `node:sqlite` for reading `conversation_summaries.db`.
   - 100% automated test coverage across Windows Win32 bridge, E2E JSON-RPC suite, and conversation management.

---

### 📦 Release Assets
- `GravKtrl-v1.2.1.apk`: Compiled Android application package for phones, foldables, and tablets.
- `GravKtrl-Windows.bat`: 1-Click native Windows PC daemon launcher.
