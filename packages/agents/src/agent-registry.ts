import type { Agent } from "./agent.js";

export class AgentRegistry {
  private readonly agents = new Map<string, Agent>();

  register(agent: Agent): void {
    if (this.agents.has(agent.name)) {
      throw new Error(`Agent "${agent.name}" is already registered`);
    }
    this.agents.set(agent.name, agent);
  }

  get(name: string): Agent | undefined {
    return this.agents.get(name);
  }

  has(name: string): boolean {
    return this.agents.has(name);
  }

  list(): Agent[] {
    return Array.from(this.agents.values());
  }
}
