import { AntigravityConversationManager } from "../pc-daemon/src/drivers/antigravity-conversation-manager.js";

const manager = new AntigravityConversationManager();
const result = manager.listProjectsAndConversations();

console.log("Active Conversation ID:", result.activeConversationId);
console.log("Projects Count:", result.projects.length);

for (const proj of result.projects) {
  console.log(`\n📂 Project: [${proj.name}] (path: ${proj.workspacePath || "none"})`);
  for (const conv of proj.conversations) {
    console.log(`   • [${conv.relativeTime}] ${conv.title.slice(0, 45)} (ID: ${conv.id}, Active: ${conv.isActive})`);
  }
}

if (result.activeConversationId) {
  console.log(`\nLoading messages for active conversation (${result.activeConversationId}):`);
  const messages = manager.getConversationMessages(result.activeConversationId, 5);
  console.log(`Fetched ${messages.length} messages.`);
  for (const m of messages) {
    console.log(`[${m.sender.toUpperCase()}] ${m.text.slice(0, 80)}`);
  }
}

manager.dispose();
console.log("\n✓ AntigravityConversationManager test passed successfully!");
