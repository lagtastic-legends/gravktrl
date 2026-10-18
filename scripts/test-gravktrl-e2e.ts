import * as fs from "node:fs";
import * as path from "node:path";
import { GravKtrlServer } from "../pc-daemon/src/server.js";
import { WebSocket } from "ws";

async function runE2eTest() {
  console.log("==================================================================");
  console.log("  GRAVKTRL E2E VERIFICATION SUITE — ZERO-TYPING & FOLDABLE READY  ");
  console.log("==================================================================");

  const TEST_PORT = 8789;
  const server = new GravKtrlServer(TEST_PORT);

  // Set 15-second safety timeout
  const timeoutTimer = setTimeout(() => {
    console.error("❌ [FATAL] Test timed out after 15 seconds");
    process.exit(1);
  }, 15000);

  try {
    // 1. Boot Server
    console.log("[1/7] Booting test daemon on port", TEST_PORT);
    await server.start();
    const pin = server.getAuth().getPin();
    console.log(`      6-Digit Quick PIN generated: ${server.getAuth().getFormattedPin()}`);

    // 2. Test Wi-Fi Radar Discovery Beacon: GET /api/discover
    console.log("[2/7] Testing HTTP Discovery Beacon (GET /api/discover)...");
    const discoverRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/discover`);
    if (!discoverRes.ok) throw new Error("GET /api/discover returned status " + discoverRes.status);
    const beacon = await discoverRes.json();
    if (!beacon.name || !beacon.lanIp || beacon.port !== TEST_PORT) {
      throw new Error("Invalid beacon payload: " + JSON.stringify(beacon));
    }
    console.log(`      Beacon verified: Host=${beacon.name}, LAN=${beacon.lanIp}:${beacon.port}`);

    // 3. Test 6-Digit Quick PIN Exchange: POST /api/pair-pin
    console.log("[3/7] Testing 6-Digit PIN Exchange (POST /api/pair-pin)...");
    const pinRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/pair-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });

    if (!pinRes.ok) throw new Error("POST /api/pair-pin returned status " + pinRes.status);
    const pinData = await pinRes.json();
    if (!pinData.success || !pinData.masterToken || pinData.masterToken.length !== 64) {
      throw new Error("PIN exchange failed to return 256-bit master token");
    }
    console.log("      PIN exchange successful! Received masterToken:", pinData.masterToken.slice(0, 16) + "...");
    const masterToken = pinData.masterToken;

    // 4. Connect Client WebSocket using Master Token
    console.log("[4/7] Connecting client WebSocket using exchanged Master Token...");
    const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/?token=${masterToken}`);

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", (e) => reject(e));
    });
    console.log("      WebSocket connected and authenticated successfully");

    // Helper to send RPC calls
    let rpcId = 1;
    const sendRpc = (method: string, params: Record<string, unknown> = {}): Promise<any> => {
      return new Promise((resolve, reject) => {
        const id = rpcId++;
        const onMsg = (data: Buffer | string) => {
          try {
            const parsed = JSON.parse(data.toString());
            if (parsed.id === id) {
              ws.removeListener("message", onMsg);
              if (parsed.error) reject(new Error(parsed.error.message));
              else resolve(parsed.result);
            }
          } catch {}
        };
        ws.on("message", onMsg);
        ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      });
    };

    // 5. Test Telemetry & Workspace
    console.log("[5/7] Testing system.ping and workspace.list...");
    const pingRes = await sendRpc("system.ping");
    if (!pingRes.pong) throw new Error("system.ping failed");

    const wsRes = await sendRpc("workspace.list");
    if (!Array.isArray(wsRes.workspaces)) throw new Error("workspace.list failed");
    console.log(`      Verified: activeWorkspace=${pingRes.activeWorkspace}, count=${wsRes.workspaces.length}`);

    // 6. Test Live PowerShell Execution with streaming stdout
    console.log("[6/7] Testing terminal.execute with live stdout streaming...");
    let capturedStdout = "";
    ws.on("message", (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.method === "terminal.output" && msg.params?.chunk) {
          capturedStdout += msg.params.chunk;
        }
      } catch {}
    });

    const execRes = await sendRpc("terminal.execute", {
      command: 'Write-Output "GRAVKTRL_FOLDABLE_READY"',
    });

    if (execRes.status !== "started") throw new Error("terminal.execute failed to start");

    // Wait for output
    const waitStart = Date.now();
    while (!capturedStdout.includes("GRAVKTRL_FOLDABLE_READY") && Date.now() - waitStart < 4000) {
      await new Promise((r) => setTimeout(r, 100));
    }

    if (!capturedStdout.includes("GRAVKTRL_FOLDABLE_READY")) {
      throw new Error(`Expected stdout 'GRAVKTRL_FOLDABLE_READY', got: ${capturedStdout}`);
    }
    console.log("      Captured live stdout stream:", capturedStdout.trim());

    // 7. Test Destructive Command Guard Interception & Approval
    console.log("[7/7] Testing Destructive Safety Guard interception & approval...");
    let approvalReceived: any = null;
    ws.on("message", (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.method === "approval.required") {
          approvalReceived = msg.params;
        }
      } catch {}
    });

    const dangerousRes = await sendRpc("terminal.execute", {
      command: "rm -rf ./fake-temporary-test-folder",
    });

    if (dangerousRes.status !== "approval_required") {
      throw new Error("Destructive command was not intercepted!");
    }
    console.log("      Interception verified! Reason:", dangerousRes.riskReason);

    const waitAppr = Date.now();
    while (!approvalReceived && Date.now() - waitAppr < 2000) {
      await new Promise((r) => setTimeout(r, 100));
    }

    if (!approvalReceived) throw new Error("Did not receive approval.required event");

    const approveRes = await sendRpc("terminal.approve", {
      approvalId: dangerousRes.executionId,
    });
    if (approveRes.status !== "started") throw new Error("terminal.approve failed");
    console.log("      Approved execution spawned successfully!");

    // 8. Test Git Engine Driver
    console.log("[8/9] Testing git.status and git.diff...");
    const gitStatusRes = await sendRpc("git.status");
    if (!gitStatusRes || !gitStatusRes.branch) throw new Error("git.status failed to return branch");
    console.log(`      Git branch verified: "${gitStatusRes.branch}", clean=${gitStatusRes.clean}`);

    const gitDiffRes = await sendRpc("git.diff");
    if (typeof gitDiffRes.diff !== "string") throw new Error("git.diff failed");
    console.log(`      Git diff retrieved successfully (${gitDiffRes.diff.length} bytes)`);

    // 9. Test Agent Prompt Fallback Queue & Clipboard
    console.log("[9/9] Testing agent.sendPrompt fallback queue (CDP port 9222 offline test)...");
    const testPromptText = "GRAVKTRL_E2E_VERIFICATION_TEST_PROMPT_" + Date.now();
    const promptRes = await sendRpc("agent.sendPrompt", { prompt: testPromptText });
    if (!promptRes.success) throw new Error("agent.sendPrompt failed: " + JSON.stringify(promptRes));
    console.log(`      agent.sendPrompt mode: ${promptRes.mode}, message: ${promptRes.message.slice(0, 60)}...`);

    const inboxFile = path.join(process.cwd(), ".antigravity", "GRAVKTRL_INBOX.md");
    if (!fs.existsSync(inboxFile)) {
      throw new Error("Fallback inbox file was not created: " + inboxFile);
    }
    const inboxContent = fs.readFileSync(inboxFile, "utf-8");
    if (!inboxContent.includes(testPromptText)) {
      throw new Error("Inbox file does not contain test prompt!");
    }
    console.log("      Verified prompt recorded in .antigravity/GRAVKTRL_INBOX.md!");

    // Clean shutdown
    ws.close();
    await server.stop();
    clearTimeout(timeoutTimer);

    console.log("==================================================================");
    console.log("  ✅ ALL GRAVKTRL TESTS PASSED (ZERO-TYPING & FOLDABLE VERIFIED)  ");
    console.log("==================================================================");
    process.exit(0);
  } catch (err) {
    console.error("❌ [E2E FAILURE]:", err);
    await server.stop();
    clearTimeout(timeoutTimer);
    process.exit(1);
  }
}

runE2eTest();
