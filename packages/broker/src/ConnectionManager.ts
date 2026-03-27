import type { ServerWebSocket } from "bun";
import type { ConnectionInfo, RpcFunctionDef } from "./types";

export interface ClientData {
  id: string;
  remoteAddress: string;
  connectedAt: number;
  subscriptions: Set<string>;
  role: "default" | "executer";
  registeredFunctions: RpcFunctionDef[];
}

export class ConnectionManager {
  private connections = new Map<string, ServerWebSocket<ClientData>>();

  add(ws: ServerWebSocket<ClientData>): void {
    this.connections.set(ws.data.id, ws);
  }

  remove(id: string): void {
    this.connections.delete(id);
  }

  get(id: string): ServerWebSocket<ClientData> | undefined {
    return this.connections.get(id);
  }

  getAll(): Map<string, ServerWebSocket<ClientData>> {
    return this.connections;
  }

  get count(): number {
    return this.connections.size;
  }

  getInfo(): ConnectionInfo[] {
    const result: ConnectionInfo[] = [];
    for (const [id, ws] of this.connections) {
      result.push({
        id,
        remoteAddress: ws.data.remoteAddress,
        connectedAt: ws.data.connectedAt,
        subscriptions: Array.from(ws.data.subscriptions),
        role: ws.data.role,
        registeredFunctions: ws.data.registeredFunctions.map((f) => f.name),
      });
    }
    return result;
  }

  /** Find all executers that have a specific function registered */
  getExecutersForFunction(fnName: string): ServerWebSocket<ClientData>[] {
    const result: ServerWebSocket<ClientData>[] = [];
    for (const [, ws] of this.connections) {
      if (ws.data.role === "executer" && ws.data.registeredFunctions.some((f) => f.name === fnName)) {
        result.push(ws);
      }
    }
    return result;
  }

  /** Get all registered RPC functions across all executers */
  getAllRegisteredFunctions(): (import("./types").RpcFunctionDef & { executerId: string })[] {
    const result: (import("./types").RpcFunctionDef & { executerId: string })[] = [];
    for (const [id, ws] of this.connections) {
      if (ws.data.role === "executer") {
        for (const fn of ws.data.registeredFunctions) {
          result.push({ ...fn, executerId: id });
        }
      }
    }
    return result;
  }
}
