import { EchoBusClient } from "./client";
import type { EchoBusOptions, RpcFunctionInfo } from "./types";

/**
 * EchoBus RPC client — discovers and calls remote functions.
 *
 * ```ts
 * const rpc = new RPCClient("ws://localhost:9000/ws", { apiKey: "eb_..." });
 * await rpc.connect();
 * const functions = await rpc.discover();
 * const result = await rpc.call("math.add", { a: 10, b: 20 });
 * ```
 */
export class RPCClient extends EchoBusClient {
  private _pendingCalls = new Map<
    string,
    { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private _callCounter = 0;

  constructor(url: string, options?: EchoBusOptions) {
    super(url, options);
  }

  /** Discover all available RPC functions across all connected executers */
  discover(): Promise<RpcFunctionInfo[]> {
    return new Promise((resolve, reject) => {
      const onRaw = (msg: any) => {
        if (msg.type === "RPC_FUNCTIONS") {
          this.off("raw", onRaw);
          clearTimeout(timer);
          resolve(msg.functions || []);
        }
      };

      this.on("raw", onRaw);
      this.send({ type: "RPC_DISCOVER" });

      const timer = setTimeout(() => {
        this.off("raw", onRaw);
        reject(new Error("Discover timed out"));
      }, 10000);
    });
  }

  /**
   * Call a remote function and await the result.
   *
   * @param functionName - Name of the function to call
   * @param args         - Arguments to pass to the function
   * @param timeout      - Timeout in ms (default: 30000)
   */
  call(functionName: string, args?: any, timeout = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = `rpc_${++this._callCounter}_${Date.now()}`;

      const timer = setTimeout(() => {
        this._pendingCalls.delete(requestId);
        reject(new Error(`RPC call '${functionName}' timed out after ${timeout}ms`));
      }, timeout);

      this._pendingCalls.set(requestId, { resolve, reject, timer });

      this.send({
        type: "RPC_CALL",
        requestId,
        function: functionName,
        args,
      });
    });
  }

  protected _handleMessage(msg: any): void {
    super._handleMessage(msg);

    if (msg.type === "RPC_RESPONSE" || msg.type === "RPC_ERROR") {
      const pending = this._pendingCalls.get(msg.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this._pendingCalls.delete(msg.requestId);

        if (msg.type === "RPC_ERROR" || msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve(msg.result);
        }
      }
    }
  }

  close(): void {
    for (const [, pending] of this._pendingCalls) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Client disconnected"));
    }
    this._pendingCalls.clear();
    super.close();
  }
}
