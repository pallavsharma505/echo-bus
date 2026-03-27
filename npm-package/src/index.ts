// ── Main Client ──────────────────────────────────────────────────────
export { EchoBus } from "./echobus";

// ── Focused Clients ──────────────────────────────────────────────────
export { Publisher } from "./publisher";
export { Consumer } from "./consumer";
export { Executer } from "./executer";
export { RPCClient } from "./rpc-client";

// ── Supporting Classes ───────────────────────────────────────────────
export { EchoBusClient } from "./client";
export { Stream } from "./stream";

// ── Utilities ────────────────────────────────────────────────────────
export { topicMatches } from "./topic-matcher";

// ── Types ────────────────────────────────────────────────────────────
export type {
  EchoBusOptions,
  PublishOptions,
  ReceivedMessage,
  MessageHandler,
  StreamStartEvent,
  StreamDataEvent,
  StreamEndEvent,
  RpcParamDef,
  RpcReturnDef,
  RpcFunctionDef,
  RpcFunctionRegistration,
  RpcFunctionInfo,
  EchoBusEvents,
} from "./types";
