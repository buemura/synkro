import type { TransportManager } from "@synkro/core";
import type { Message } from "../llm/types.js";
import type { AgentMemory } from "./memory.js";

export type ConversationMemoryOptions = {
  transport: TransportManager;
  maxMessages?: number | undefined;
  ttlSeconds?: number | undefined;
};

export class ConversationMemory implements AgentMemory {
  private readonly transport: TransportManager;
  private readonly maxMessages: number;
  private readonly ttlSeconds: number;

  constructor(options: ConversationMemoryOptions) {
    this.transport = options.transport;
    this.maxMessages = options.maxMessages ?? 100;
    this.ttlSeconds = options.ttlSeconds ?? 86400; // 24 hours
  }

  async addMessage(agentId: string, runId: string, message: Message): Promise<void> {
    const key = this.key(agentId, runId);
    await this.transport.pushToList(key, JSON.stringify(message));
    // Set TTL on first message by using setCache as a side-channel
    await this.transport.setCache(`${key}:ttl`, "1", this.ttlSeconds);
  }

  async getMessages(agentId: string, runId: string): Promise<Message[]> {
    const key = this.key(agentId, runId);
    const raw = await this.transport.getListRange(key, 0, this.maxMessages - 1);
    return raw.map((item) => JSON.parse(item) as Message);
  }

  async clear(agentId: string, runId: string): Promise<void> {
    const key = this.key(agentId, runId);
    await this.transport.deleteKey(key);
    await this.transport.deleteCache(`${key}:ttl`);
  }

  private key(agentId: string, runId: string): string {
    return `synkro:agent:memory:${agentId}:${runId}`;
  }
}
