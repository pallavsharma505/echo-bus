import { EchoBusClient } from "./client";
import type { EchoBusOptions, RpcFunctionDef, RpcFunctionRegistration } from "./types";

/**
 * EchoBus executer — registers and handles RPC functions.
 *
 * ```ts
 * const exec = new Executer("ws://localhost:9000/ws", { apiKey: "eb_..." });
 * await exec.connect();
 * await exec.register([{
 *   name: "math.add",
 *   handler: (args) => args.a + args.b,
 *   params: { a: { type: "number", required: true }, b: { type: "number", required: true } },
 * }]);
 * ```
 */
export class Executer extends EchoBusClient {
  private _handlers = new Map<string, (args: any) => any | Promise<any>>();
  private _functionDefs: RpcFunctionDef[] = [];

  constructor(url: string, options?: EchoBusOptions) {
    super(url, options);
  }

  /**
   * Register one or more RPC functions.
   * Returns the number of functions registered by the broker.
   */
  register(functions: RpcFunctionRegistration[]): Promise<number> {
    return new Promise((resolve, reject) => {
      // Store handlers locally
      const defs: RpcFunctionDef[] = [];
      for (const fn of functions) {
        const { handler, ...def } = fn;
        this._handlers.set(fn.name, handler);
        defs.push(def);
      }
      this._functionDefs = defs;

      const onRaw = (msg: any) => {
        if (msg.type === "RPC_REGISTERED") {
          this.off("raw", onRaw);
          clearTimeout(timer);
          resolve(msg.count);
        } else if (msg.type === "ERROR") {
          this.off("raw", onRaw);
          clearTimeout(timer);
          reject(new Error(msg.message));
        }
      };

      this.on("raw", onRaw);
      this.send({ type: "RPC_REGISTER", functions: defs });

      const timer = setTimeout(() => {
        this.off("raw", onRaw);
        reject(new Error("Register timed out"));
      }, 5000);
    });
  }

  /** Re-register functions after reconnect */
  protected _onConnected(): void {
    if (this._functionDefs.length > 0) {
      this.send({ type: "RPC_REGISTER", functions: this._functionDefs });
    }
  }

  protected _handleMessage(msg: any): void {
    super._handleMessage(msg);

    if (msg.type === "RPC_CALL") {
      this._handleRpcCall(msg);
    }
  }

  private async _handleRpcCall(msg: any): Promise<void> {
    const handler = this._handlers.get(msg.function);
    if (!handler) {
      this.send({
        type: "RPC_RESPONSE",
        requestId: msg.requestId,
        callerId: msg.callerId,
        error: `Function '${msg.function}' not registered locally`,
      });
      return;
    }

    try {
      const result = await handler(msg.args);
      this.send({
        type: "RPC_RESPONSE",
        requestId: msg.requestId,
        callerId: msg.callerId,
        result,
      });
    } catch (e: any) {
      this.send({
        type: "RPC_RESPONSE",
        requestId: msg.requestId,
        callerId: msg.callerId,
        error: e.message || String(e),
      });
    }
  }
}
