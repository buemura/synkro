import type { Message } from "../llm/types.js";

export interface AgentMemory {
  addMessage(agentId: string, runId: string, message: Message): Promise<void>;
  getMessages(agentId: string, runId: string): Promise<Message[]>;
  clear(agentId: string, runId: string): Promise<void>;
}
