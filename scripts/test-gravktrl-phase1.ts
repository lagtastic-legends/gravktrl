setTimeout(() => { console.error("TIMEOUT"); process.exit(1); }, 15000).unref();

import { GravKtrlServer } from "../pc-daemon/src/server.js";
import { validateCommandSafety } from "../pc-daemon/src/command-guard.js";
import { WebSocket } from "ws";

async function runPhase1Verification() {
  console.log("=================================================");
  console.log("  GRAVKTRL PHASE 1 AUTOMATED VERIFICATION SUITE  ");
  console.log("=================================================");

  // 1. Assert Command Guard validation
  console.log("\n[TEST 1] Verifying Destructive Command Guard...");
  const blocked1 = validateCommandSafety("rm -rf /");
  if (blocked1.allowed || blocked1.riskLevel !== "blocked") {
    throw new Error(`Failed: 'rm -rf /' was not blocked! Result: ${JSON.stringify(blocked1)}`);
  }
  console.log("  ✓ 'rm -rf /' successfully blocked (risk: blocked)");

  const blocked2 = validateCommandSafety("Remove-Item -Recurse -Force C:\\");
  if (blocked2.allowed || blocked2.riskLevel !== "blocked") {
    throw new Error(`Failed: 'Remove-Item -Recurse -Force C:\\' was not blocked! Result: ${JSON.stringify(blocked2)}`);
  }
  console.log("  ✓ 'Remove-Item -Recurse -Force C:\\' successfully blocked (risk: blocked)");

  const safe1 = validateCommandSafety("git status");
  if (!safe1.allowed) {
    throw new Error(`Failed: 'git status' was incorrectly blocked! Result: ${JSON.stringify(safe1)}`);
  }
  console.log("  ✓ 'git status' successfully allowed (risk: safe)");

  // 2. Start PC Daemon on ephemeral port 0
  console.log("\n[TEST 2] Booting GravKtrl Daemon on ephemeral port 0...");
  const server = new GravKtrlServer(0);
  await server.start();
  const port = server.getPort();
  console.log(`  ✓ Daemon active on ephemeral port: ${port}`);

  try {
    // 3. Test GET /api/discover
    console.log("\n[TEST 3] Testing GET /api/discover...");
    const discRes = await fetch(`http://127.0.0.1:${port}/api/discover`);
    if (!discRes.ok) throw new Error(`GET /api/discover returned status ${discRes.status}`);
    const discData = await discRes.json();
    if (discData.service !== "gravktrl-daemon") {
      throw new Error(`Expected service 'gravktrl-daemon', got: ${discData.service}`);
    }
    if (!discData.hostname || !discData.lanIp) {
      throw new Error(`Missing hostname or lanIp: ${JSON.stringify(discData)}`);
    }
    console.log(`  ✓ Discovery beacon verified (service: ${discData.service}, host: ${discData.hostname}, IP: ${discData.lanIp})`);

    // 4. Test POST /api/pair with invalid PIN (must reject with 401)
    console.log("\n[TEST 4] Testing POST /api/pair with invalid PIN (expecting 401)...");
    const badPairRes = await fetch(`http://127.0.0.1:${port}/api/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "000000", deviceName: "Test Device" }),
    });
    if (badPairRes.status !== 401) {
      throw new Error(`Expected status 401 on bad PIN, got: ${badPairRes.status}`);
    }
    const badPairData = await badPairRes.json();
    if (badPairData.success !== false) {
      throw new Error(`Expected success: false, got: ${JSON.stringify(badPairData)}`);
    }
    console.log("  ✓ Invalid PIN correctly rejected with status 401");

    // 5. Test POST /api/pair with valid PIN
    console.log("\n[TEST 5] Testing POST /api/pair with valid PIN...");
    const validPin = server.getAuthPairing().getPin();
    const goodPairRes = await fetch(`http://127.0.0.1:${port}/api/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: validPin, deviceName: "Test Device" }),
    });
    if (!goodPairRes.ok) {
      throw new Error(`Expected status 200 on good PIN, got: ${goodPairRes.status}`);
    }
    const goodPairData = await goodPairRes.json();
    if (!goodPairData.success || !goodPairData.token) {
      throw new Error(`Pairing failed to return session token: ${JSON.stringify(goodPairData)}`);
    }
    if (goodPairData.token.length !== 64) {
      throw new Error(`Expected 64-char (256-bit) session token, got length: ${goodPairData.token.length}`);
    }
    console.log(`  ✓ Valid PIN exchanged for 256-bit token (${goodPairData.token.slice(0, 8)}...${goodPairData.token.slice(-8)})`);

    const sessionToken = goodPairData.token;

    // 6. Test WebSocket JSON-RPC 2.0 with session token
    console.log("\n[TEST 6] Testing Authenticated WebSocket JSON-RPC 2.0...");
    const ws = new WebSocket(`ws://127.0.0.1:${port}?token=${sessionToken}`);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WebSocket connection timeout")), 4000);
      ws.on("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      ws.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    console.log("  ✓ WebSocket connected and authenticated");

    // Helper for JSON-RPC over WS
    function sendRpc(method: string, params: Record<string, unknown> = {}): Promise<any> {
      return new Promise((resolve, reject) => {
        const id = `rpc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const timer = setTimeout(() => {
          ws.off("message", handler);
          reject(new Error(`Timeout waiting for RPC response: ${method}`));
        }, 5000);

        const handler = (data: Buffer | string) => {
          try {
            const parsed = JSON.parse(data.toString("utf-8"));
            if (parsed.id === id) {
              clearTimeout(timer);
              ws.off("message", handler);
              if (parsed.error) reject(new Error(parsed.error.message));
              else resolve(parsed.result);
            }
          } catch {}
        };

        ws.on("message", handler);
        ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      });
    }

    // 7. Test system.ping
    console.log("\n[TEST 7] Testing JSON-RPC system.ping...");
    const pingRes = await sendRpc("system.ping");
    if (!pingRes.pong || !pingRes.timestamp) {
      throw new Error(`Invalid ping response: ${JSON.stringify(pingRes)}`);
    }
    console.log(`  ✓ system.ping responded (pong: ${pingRes.pong}, timestamp: ${pingRes.timestamp})`);

    // 8. Test system.metrics
    console.log("\n[TEST 8] Testing JSON-RPC system.metrics...");
    const metricsRes = await sendRpc("system.metrics");
    if (!metricsRes.cpuCount || !metricsRes.platform || metricsRes.totalMemory === undefined) {
      throw new Error(`Invalid metrics response: ${JSON.stringify(metricsRes)}`);
    }
    console.log(`  ✓ system.metrics verified (CPU cores: ${metricsRes.cpuCount}, platform: ${metricsRes.platform}, RAM: ${Math.round(metricsRes.totalMemory / 1024 / 1024 / 1024)}GB)`);

    // 9. Test antigravity.setRemoteUrl and antigravity.getRemoteConfig
    console.log("\n[TEST 9] Testing Antigravity Remote Control Bridge...");
    const testUrl = "https://antigravity.google.com/remote?instance=inst_test_12345";
    const setRemoteRes = await sendRpc("antigravity.setRemoteUrl", { url: testUrl });
    if (!setRemoteRes.success || setRemoteRes.remoteUrl !== testUrl) {
      throw new Error(`antigravity.setRemoteUrl failed: ${JSON.stringify(setRemoteRes)}`);
    }
    const getRemoteRes = await sendRpc("antigravity.getRemoteConfig");
    if (getRemoteRes.remoteUrl !== testUrl) {
      throw new Error(`antigravity.getRemoteConfig mismatch: ${JSON.stringify(getRemoteRes)}`);
    }
    console.log("  ✓ Antigravity Remote Control URL stored and retrieved successfully");

    // 10. Test terminal.exec (echo gravktrl-ok)
    console.log("\n[TEST 10] Testing JSON-RPC terminal.exec ('echo gravktrl-ok')...");
    const termRes = await sendRpc("terminal.exec", { command: "echo gravktrl-ok" });
    if (!termRes.allowed || termRes.exitCode !== 0) {
      throw new Error(`terminal.exec failed: ${JSON.stringify(termRes)}`);
    }
    if (!termRes.output.includes("gravktrl-ok")) {
      throw new Error(`terminal.exec output missing 'gravktrl-ok': ${termRes.output}`);
    }
    console.log(`  ✓ terminal.exec executed safely with output: '${termRes.output.trim()}'`);

    // Close WebSocket
    ws.close();
  } finally {
    // 11. Clean shutdown of server
    console.log("\n[CLEANUP] Stopping daemon...");
    await server.stop();
    console.log("  ✓ Daemon stopped cleanly");
  }

  console.log("\n=================================================");
  console.log("  ALL GRAVKTRL PHASE 1 CHECKS PASSED (100% OK)   ");
  console.log("=================================================\n");
  process.exit(0);
}

runPhase1Verification().catch((err) => {
  console.error("\n❌ PHASE 1 VERIFICATION FAILED:", err);
  process.exit(1);
});
