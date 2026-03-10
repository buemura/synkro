import { InMemoryManager } from "../in-memory.js";
import { transportContractTests } from "./transport-contract.js";

transportContractTests("InMemoryManager", () => new InMemoryManager());
