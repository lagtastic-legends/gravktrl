import * as fs from "node:fs";
import * as path from "node:path";
import { WebSocket } from "ws";
import { GravKtrlServer } from "../pc-daemon/src/server.js";
import { Win32AntigravityBridge } from "../pc-daemon/src/drivers/win32-antigravity-bridge.js";

async function runWindowsSuite() {
  console.log("==================================================================");
  console.log("  GRAVKTRL WINDOWS CONTROL & DUAL-MODE BRIDGE VERIFICATION SUITE  ");
  console.log("==================================================================");

  const TEST_PORT = 8791;
  const server = new GravKtrlServer(TEST_PORT);
  const timeoutTimer = setTimeout(() => {
    console.error("❌ [FATAL] Test timed out after 20 seconds");
    process.exit(1);
  }, 20000);

  const testFilePath = path.join(process.cwd(), "gravktrl-watcher-test.txt");

  try {
    // 1. Test Win32 Bridge process inspection & executable path resolution
    console.log("[1/6] Testing Win32 Antigravity Bridge process detection...");
    const win32Bridge = new Win32AntigravityBridge();
    const procInfo = await win32Bridge.getProcessInfo();
    console.log(`      Process check result: running=${procInfo.running}, mode=${procInfo.mode}`);
    const exePath = win32Bridge.findExecutablePath();
    console.log(`      Resolved executable path: ${exePath || "None (non-fatal on headless CI)"}`);

    // 2. Boot Test Server
    console.log(`[2/6] Booting GravKtrl daemon on test port ${TEST_PORT}...`);
    await server.start();
    const pin = server.getAuth().getPin();
    const formattedPin = server.getAuth().getFormattedPin();
    console.log(`      Daemon running with 6-Digit PIN: ${formattedPin}`);

    // 3. Test Desktop Control Center UI (GET /desktop)
    console.log("[3/6] Testing Frameless Desktop Control Center endpoint (GET /desktop)...");
    const desktopRes = await fetch(`http://127.0.0.1:${TEST_PORT}/desktop`);
    if (!desktopRes.ok) throw new Error(`GET /desktop returned HTTP status ${desktopRes.status}`);
    const desktopHtml = await desktopRes.text();
    if (!desktopHtml.includes("GravKtrl Windows") || !desktopHtml.includes(pin)) {
      throw new Error("Desktop HTML missing expected title or PIN display");
    }
    console.log("      GET /desktop returned 200 OK with valid Obsidian cyberpunk UI!");

    // 4. Test PIN Exchange to acquire Master Token
    console.log("[4/6] Exchanging PIN for 256-bit Master Token (POST /api/pair-pin)...");
    const pinRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/pair-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!pinRes.ok) throw new Error(`PIN exchange returned status ${pinRes.status}`);
    const pinData = await pinRes.json();
    if (!pinData.success || !pinData.masterToken) {
      throw new Error("PIN exchange failed: " + JSON.stringify(pinData));
    }
    const masterToken = pinData.masterToken;
    console.log("      Master Token received:", masterToken.slice(0, 16) + "...");

    // 5. Connect WebSocket & Subscribe to agent.fileModified
    console.log("[5/6] Connecting client WebSocket & testing live WorkspaceWatcher...");
    const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/?token=${masterToken}`);
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", (e) => reject(e));
    });

    let fileEventReceived = false;
    let receivedEventPayload: any = null;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.method === "agent.fileModified") {
          fileEventReceived = true;
          receivedEventPayload = msg.params;
        }
      } catch {}
    });

    // Write temporary file to trigger WorkspaceWatcher
    fs.writeFileSync(testFilePath, "GravKtrl live watcher test at " + Date.now(), "utf-8");

    // Wait up to 3 seconds for file change event to arrive
    for (let i = 0; i < 30; i++) {
      if (fileEventReceived) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    if (!fileEventReceived) {
      throw new Error("WorkspaceWatcher did not emit agent.fileModified notification within 3 seconds");
    }

    console.log(`      agent.fileModified received: [${receivedEventPayload.action}] ${receivedEventPayload.file}`);

    // 6. Test workspace.recentActivity JSON-RPC method
    console.log("[6/6] Testing JSON-RPC workspace.recentActivity...");
    const rpcPromise = new Promise<any>((resolve, reject) => {
      const id = 1001;
      const handler = (raw: any) => {
        try {
          const res = JSON.parse(raw.toString());
          if (res.id === id) {
            ws.removeListener("message", handler);
            resolve(res.result);
          }
        } catch {}
      };
      ws.on("message", handler);
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method: "workspace.recentActivity", params: {} }));
      setTimeout(() => reject(new Error("RPC workspace.recentActivity timed out")), 4000);
    });

    const recentResult = await rpcPromise;
    if (!recentResult || !Array.isArray(recentResult.recentFiles)) {
      throw new Error("Invalid workspace.recentActivity response: " + JSON.stringify(recentResult));
    }
    console.log(`      workspace.recentActivity verified: ${recentResult.recentFiles.length} file history entries`);

    // 7. Test conversation.list & conversation.getMessages JSON-RPC
    console.log("[7/7] Testing JSON-RPC conversation.list and conversation.getMessages...");
    const convListPromise = new Promise<any>((resolve, reject) => {
      const id = 1002;
      const handler = (raw: any) => {
        try {
          const res = JSON.parse(raw.toString());
          if (res.id === id) {
            ws.removeListener("message", handler);
            resolve(res.result);
          }
        } catch {}
      };
      ws.on("message", handler);
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method: "conversation.list", params: {} }));
      setTimeout(() => reject(new Error("RPC conversation.list timed out")), 4000);
    });

    const convList = await convListPromise;
    if (!convList || !Array.isArray(convList.projects)) {
      throw new Error("Invalid conversation.list response: " + JSON.stringify(convList));
    }
    console.log(`      conversation.list verified: ${convList.projects.length} project groups, activeId=${convList.activeConversationId || "none"}`);

    if (convList.activeConversationId) {
      const convMsgsPromise = new Promise<any>((resolve, reject) => {
        const id = 1003;
        const handler = (raw: any) => {
          try {
            const res = JSON.parse(raw.toString());
            if (res.id === id) {
              ws.removeListener("message", handler);
              resolve(res.result);
            }
          } catch {}
        };
        ws.on("message", handler);
        ws.send(JSON.stringify({ jsonrpc: "2.0", id, method: "conversation.getMessages", params: { conversationId: convList.activeConversationId, limit: 10 } }));
        setTimeout(() => reject(new Error("RPC conversation.getMessages timed out")), 4000);
      });

      const convMsgs = await convMsgsPromise;
      if (!convMsgs || !Array.isArray(convMsgs.messages)) {
        throw new Error("Invalid conversation.getMessages response: " + JSON.stringify(convMsgs));
      }
      console.log(`      conversation.getMessages verified: retrieved ${convMsgs.messages.length} messages for active conversation`);
    }

    ws.close();
    console.log("\n==================================================================");
    console.log("  ✓ ALL TESTS PASSED! GRAVKTRL WINDOWS APP & DUAL DRIVER ARE READY");
    console.log("==================================================================");
  } finally {
    clearTimeout(timeoutTimer);
    if (fs.existsSync(testFilePath)) {
      try {
        fs.unlinkSync(testFilePath);
      } catch {}
    }
    await server.stop();
  }
}

runWindowsSuite().catch((err) => {
  console.error("❌ Verification failed:", err);
  process.exit(1);
});
