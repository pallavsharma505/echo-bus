import React, { useState, useRef, useCallback, useEffect } from "react";

interface LogEntry {
  time: string;
  source: string;
  direction: "sent" | "received" | "system";
  message: string;
}

interface ConsumerInstance {
  id: number;
  topic: string;
  ws: WebSocket | null;
  connected: boolean;
  messageCount: number;
}

interface RpcFunction {
  name: string;
  description: string;
  handler: string; // JS code that will be eval'd
}

interface ExecuterInstance {
  ws: WebSocket | null;
  connected: boolean;
  functions: RpcFunction[];
  callCount: number;
}

const COLORS = ["#2196f3", "#4caf50", "#ff9800", "#9c27b0", "#00bcd4", "#e91e63", "#795548", "#607d8b"];

function getWsBrokerUrl(): string {
  const host = window.location.hostname || "localhost";
  return `ws://${host}:9000/ws`;
}

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 });
}

// Styles
const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 8, padding: "20px 24px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)", marginBottom: 20,
};
const inputStyle: React.CSSProperties = {
  padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" as const,
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 20px", background: "#2196f3", color: "#fff", border: "none",
  borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600,
};
const btnSuccess: React.CSSProperties = { ...btnPrimary, background: "#4caf50" };
const btnDanger: React.CSSProperties = { ...btnPrimary, background: "#f44336" };
const btnWarning: React.CSSProperties = { ...btnPrimary, background: "#ff9800" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "#888", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 4 };

const DEFAULT_EXECUTER_FUNCTIONS: RpcFunction[] = [
  { name: "add", description: "Add two numbers", handler: "return args.a + args.b;" },
  { name: "greet", description: "Returns a greeting", handler: 'return `Hello, ${args.name}!`;' },
];

export function TestPage() {
  // --- State ---
  const [apiKey, setApiKey] = useState("");
  const [brokerUrl, setBrokerUrl] = useState(getWsBrokerUrl);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLPreElement>(null);

  // Token auth
  const [useTokenAuth, setUseTokenAuth] = useState(false);

  // Publisher
  const [pubWs, setPubWs] = useState<WebSocket | null>(null);
  const [pubConnected, setPubConnected] = useState(false);
  const [pubTopic, setPubTopic] = useState("test.messages");
  const [pubPayload, setPubPayload] = useState('{\n  "hello": "world",\n  "timestamp": 0\n}');
  const [requireAck, setRequireAck] = useState(false);

  // Consumers
  const [consumers, setConsumers] = useState<ConsumerInstance[]>([]);
  const [newConsumerTopic, setNewConsumerTopic] = useState("test.messages");
  const nextConsumerId = useRef(1);
  const consumersRef = useRef(consumers);
  consumersRef.current = consumers;

  // Executer
  const [executer, setExecuter] = useState<ExecuterInstance>({
    ws: null, connected: false, functions: DEFAULT_EXECUTER_FUNCTIONS, callCount: 0,
  });
  const executerRef = useRef(executer);
  executerRef.current = executer;
  const [newFnName, setNewFnName] = useState("");
  const [newFnDesc, setNewFnDesc] = useState("");
  const [newFnHandler, setNewFnHandler] = useState('return args.x * 2;');

  // RPC Caller (producer-side)
  const [rpcFn, setRpcFn] = useState("");
  const [rpcArgs, setRpcArgs] = useState('{ "a": 5, "b": 3 }');
  const [discoveredFns, setDiscoveredFns] = useState<any[]>([]);

  // Streaming
  const [streamTopic, setStreamTopic] = useState("data.stream");
  const [streamInterval, setStreamInterval] = useState(200);
  const [streamPayloadTemplate, setStreamPayloadTemplate] = useState('{ "value": {{seq}}, "ts": {{ts}} }');
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [streamSeq, setStreamSeq] = useState(0);
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Logging ---
  const addLog = useCallback((source: string, direction: LogEntry["direction"], message: string) => {
    setLogs((prev) => {
      const next = [...prev, { time: timestamp(), source, direction, message }];
      return next.length > 500 ? next.slice(-500) : next;
    });
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  // --- Token Generation ---
  const API_BASE = import.meta.env.DEV ? "/api" : "";

  const buildWsUrl = useCallback(async () => {
    if (useTokenAuth && apiKey) {
      // Generate a fresh single-use token for each connection
      try {
        const res = await fetch(`${API_BASE}/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey, options: { ttl: 60 } }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Token generation failed");
        }
        const data = await res.json();
        addLog("System", "system", `🔐 Token generated for connection (expires in ${data.expiresIn}s)`);
        return `${brokerUrl}?token=${encodeURIComponent(data.token)}`;
      } catch (e: any) {
        addLog("System", "system", `❌ Token error: ${e.message}`);
        return brokerUrl; // fallback — will likely fail auth
      }
    }
    if (apiKey) {
      return `${brokerUrl}?apiKey=${encodeURIComponent(apiKey)}`;
    }
    return brokerUrl;
  }, [brokerUrl, apiKey, useTokenAuth, addLog, API_BASE]);

  // --- Publisher ---
  const connectPublisher = useCallback(async () => {
    const url = await buildWsUrl();
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setPubConnected(true);
      addLog("Publisher", "system", `Connected to ${brokerUrl}`);
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "RPC_FUNCTIONS") {
        setDiscoveredFns(msg.functions);
        addLog("Publisher", "received", `RPC_FUNCTIONS: ${msg.functions.length} function(s) available`);
      } else if (msg.type === "RPC_RESPONSE") {
        addLog("Publisher", "received", `RPC_RESPONSE [${msg.requestId}] result=${JSON.stringify(msg.result)}`);
      } else if (msg.type === "RPC_ERROR") {
        addLog("Publisher", "received", `RPC_ERROR [${msg.requestId}] ${msg.error}`);
      } else {
        addLog("Publisher", "received", JSON.stringify(msg));
      }
    };
    ws.onclose = () => {
      setPubConnected(false);
      setDiscoveredFns([]);
      addLog("Publisher", "system", "Disconnected");
    };
    ws.onerror = () => {
      addLog("Publisher", "system", "❌ Connection error");
    };

    setPubWs(ws);
  }, [buildWsUrl, addLog]);

  const disconnectPublisher = useCallback(() => {
    pubWs?.close();
    setPubWs(null);
    setPubConnected(false);
    setDiscoveredFns([]);
  }, [pubWs]);

  const publishMessage = useCallback(() => {
    if (!pubWs || pubWs.readyState !== WebSocket.OPEN) return;
    let payload: unknown;
    try {
      let raw = pubPayload;
      raw = raw.replace(/"timestamp"\s*:\s*0/, `"timestamp": ${Date.now()}`);
      payload = JSON.parse(raw);
    } catch {
      addLog("Publisher", "system", "❌ Invalid JSON payload");
      return;
    }
    const msg: any = { type: "PUBLISH", topic: pubTopic, payload };
    if (requireAck) {
      msg.requireAck = true;
      msg.messageId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    pubWs.send(JSON.stringify(msg));
    addLog("Publisher", "sent", `PUBLISH → "${pubTopic}" ${JSON.stringify(payload)}`);
  }, [pubWs, pubTopic, pubPayload, requireAck, addLog]);

  // --- RPC Discover & Call (from publisher) ---
  const discoverFunctions = useCallback(() => {
    if (!pubWs || pubWs.readyState !== WebSocket.OPEN) return;
    pubWs.send(JSON.stringify({ type: "RPC_DISCOVER" }));
    addLog("Publisher", "sent", "RPC_DISCOVER");
  }, [pubWs, addLog]);

  const callRpcFunction = useCallback(() => {
    if (!pubWs || pubWs.readyState !== WebSocket.OPEN) return;
    let args: unknown;
    try {
      args = JSON.parse(rpcArgs);
    } catch {
      addLog("Publisher", "system", "❌ Invalid JSON args");
      return;
    }
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    pubWs.send(JSON.stringify({ type: "RPC_CALL", requestId, function: rpcFn, args }));
    addLog("Publisher", "sent", `RPC_CALL → ${rpcFn}(${JSON.stringify(args)}) [${requestId}]`);
  }, [pubWs, rpcFn, rpcArgs, addLog]);

  // --- Consumers ---
  const addConsumer = useCallback(async () => {
    const id = nextConsumerId.current++;
    const topic = newConsumerTopic;
    const url = await buildWsUrl();
    const ws = new WebSocket(url);
    const name = `Consumer-${id}`;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "SUBSCRIBE", topic, id: `test-sub-${id}` }));
      addLog(name, "sent", `SUBSCRIBE → "${topic}"`);
      setConsumers((prev) => prev.map((c) => c.id === id ? { ...c, connected: true } : c));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "SUBSCRIBED") {
        addLog(name, "received", `SUBSCRIBED to "${msg.topic}"`);
      } else if (msg.type === "MESSAGE") {
        addLog(name, "received", `MESSAGE ← "${msg.topic}" ${JSON.stringify(msg.payload)}`);
        setConsumers((prev) => prev.map((c) => c.id === id ? { ...c, messageCount: c.messageCount + 1 } : c));
      } else if (msg.type === "STREAM_START") {
        addLog(name, "received", `STREAM_START ← "${msg.topic}" stream=${msg.streamId}`);
        setConsumers((prev) => prev.map((c) => c.id === id ? { ...c, messageCount: c.messageCount + 1 } : c));
      } else if (msg.type === "STREAM_DATA") {
        addLog(name, "received", `STREAM_DATA ← [${msg.sequence}] ${JSON.stringify(msg.payload)}`);
        setConsumers((prev) => prev.map((c) => c.id === id ? { ...c, messageCount: c.messageCount + 1 } : c));
      } else if (msg.type === "STREAM_END") {
        addLog(name, "received", `STREAM_END ← stream=${msg.streamId}`);
      } else {
        addLog(name, "received", JSON.stringify(msg));
      }
    };
    ws.onclose = () => {
      addLog(name, "system", "Disconnected");
      setConsumers((prev) => prev.map((c) => c.id === id ? { ...c, connected: false, ws: null } : c));
    };
    ws.onerror = () => {
      addLog(name, "system", "❌ Connection error");
    };

    setConsumers((prev) => [...prev, { id, topic, ws, connected: false, messageCount: 0 }]);
  }, [buildWsUrl, newConsumerTopic, addLog]);

  const removeConsumer = useCallback((id: number) => {
    setConsumers((prev) => {
      const target = prev.find((c) => c.id === id);
      target?.ws?.close();
      return prev.filter((c) => c.id !== id);
    });
  }, []);

  // --- Executer ---
  const connectExecuter = useCallback(async () => {
    const url = await buildWsUrl();
    const ws = new WebSocket(url);

    ws.onopen = () => {
      // Register functions
      const fnDefs = executerRef.current.functions.map((f) => ({
        name: f.name,
        description: f.description,
      }));
      ws.send(JSON.stringify({ type: "RPC_REGISTER", functions: fnDefs }));
      addLog("Executer", "sent", `RPC_REGISTER (${fnDefs.length} functions: ${fnDefs.map((f) => f.name).join(", ")})`);
      setExecuter((prev) => ({ ...prev, connected: true, ws }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === "RPC_REGISTERED") {
        addLog("Executer", "received", `RPC_REGISTERED — ${msg.count} function(s)`);
      } else if (msg.type === "RPC_CALL") {
        addLog("Executer", "received", `RPC_CALL ← ${msg.function}(${JSON.stringify(msg.args)}) [${msg.requestId}]`);

        // Find handler and execute
        const fnDef = executerRef.current.functions.find((f) => f.name === msg.function);
        let result: unknown;
        let error: string | undefined;

        if (!fnDef) {
          error = `Unknown function: ${msg.function}`;
        } else {
          try {
            const handlerFn = new Function("args", fnDef.handler);
            result = handlerFn(msg.args ?? {});
          } catch (e: any) {
            error = String(e?.message ?? e);
          }
        }

        const response: any = { type: "RPC_RESPONSE", requestId: msg.requestId };
        if (error) {
          response.error = error;
        } else {
          response.result = result;
        }

        ws.send(JSON.stringify(response));
        addLog("Executer", "sent", `RPC_RESPONSE [${msg.requestId}] ${error ? `error="${error}"` : `result=${JSON.stringify(result)}`}`);
        setExecuter((prev) => ({ ...prev, callCount: prev.callCount + 1 }));
      } else {
        addLog("Executer", "received", JSON.stringify(msg));
      }
    };

    ws.onclose = () => {
      addLog("Executer", "system", "Disconnected");
      setExecuter((prev) => ({ ...prev, connected: false, ws: null }));
    };
    ws.onerror = () => {
      addLog("Executer", "system", "❌ Connection error");
    };

    setExecuter((prev) => ({ ...prev, ws }));
  }, [buildWsUrl, addLog]);

  const disconnectExecuter = useCallback(() => {
    executer.ws?.close();
    setExecuter((prev) => ({ ...prev, ws: null, connected: false, callCount: 0 }));
  }, [executer.ws]);

  const addFunction = useCallback(() => {
    if (!newFnName.trim()) return;
    setExecuter((prev) => ({
      ...prev,
      functions: [...prev.functions, { name: newFnName.trim(), description: newFnDesc.trim(), handler: newFnHandler }],
    }));
    setNewFnName("");
    setNewFnDesc("");
    setNewFnHandler('return args.x * 2;');
  }, [newFnName, newFnDesc, newFnHandler]);

  const removeFunction = useCallback((name: string) => {
    setExecuter((prev) => ({
      ...prev,
      functions: prev.functions.filter((f) => f.name !== name),
    }));
  }, []);

  // --- Streaming ---
  const startStream = useCallback(() => {
    if (!pubWs || pubWs.readyState !== WebSocket.OPEN) return;
    const streamId = `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    pubWs.send(JSON.stringify({ type: "STREAM_START", streamId, topic: streamTopic, metadata: { interval: streamInterval } }));
    addLog("Stream", "sent", `STREAM_START → "${streamTopic}" [${streamId}]`);

    setActiveStreamId(streamId);
    setStreamSeq(0);
    let seq = 0;

    const timer = setInterval(() => {
      if (!pubWs || pubWs.readyState !== WebSocket.OPEN) {
        clearInterval(timer);
        return;
      }
      let payloadStr = streamPayloadTemplate
        .replace(/\{\{seq\}\}/g, String(seq))
        .replace(/\{\{ts\}\}/g, String(Date.now()));
      let payload: unknown;
      try {
        payload = JSON.parse(payloadStr);
      } catch {
        payload = payloadStr;
      }
      pubWs.send(JSON.stringify({ type: "STREAM_DATA", streamId, payload, sequence: seq }));
      addLog("Stream", "sent", `STREAM_DATA [${seq}] ${JSON.stringify(payload)}`);
      seq++;
      setStreamSeq(seq);
    }, streamInterval);

    streamTimerRef.current = timer;
  }, [pubWs, streamTopic, streamInterval, streamPayloadTemplate, addLog]);

  const stopStream = useCallback(() => {
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    if (pubWs && pubWs.readyState === WebSocket.OPEN && activeStreamId) {
      pubWs.send(JSON.stringify({ type: "STREAM_END", streamId: activeStreamId }));
      addLog("Stream", "sent", `STREAM_END [${activeStreamId}]`);
    }
    setActiveStreamId(null);
    setStreamSeq(0);
  }, [pubWs, activeStreamId, addLog]);

  const disconnectAll = useCallback(() => {
    stopStream();
    disconnectPublisher();
    disconnectExecuter();
    consumers.forEach((c) => c.ws?.close());
    setConsumers([]);
    addLog("System", "system", "All connections closed");
  }, [stopStream, disconnectPublisher, disconnectExecuter, consumers, addLog]);

  const clearLogs = useCallback(() => setLogs([]), []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
      pubWs?.close();
      executerRef.current.ws?.close();
      consumersRef.current.forEach((c) => c.ws?.close());
    };
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: "#222" }}>Test Playground</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>
            Connect as publisher, consumer, or executer to test message routing and RPC in real-time.
          </p>
        </div>
        <button onClick={disconnectAll} style={btnDanger}>Disconnect All</button>
      </div>

      {/* Connection Settings */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 14px", fontSize: 16 }}>⚙️ Connection Settings</h3>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 300px" }}>
            <label style={labelStyle}>Broker URL</label>
            <input
              type="text" value={brokerUrl}
              onChange={(e) => setBrokerUrl(e.target.value)}
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>
          <div style={{ flex: "1 1 300px" }}>
            <label style={labelStyle}>API Key {useTokenAuth ? "(used server-side to generate token)" : "(sent directly)"}</label>
            <input
              type="password" value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="eb_..."
              style={{ ...inputStyle, width: "100%", fontFamily: "monospace" }}
            />
          </div>
        </div>

        {/* Token Auth Toggle */}
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "#555" }}>
            <input
              type="checkbox" checked={useTokenAuth}
              onChange={(e) => setUseTokenAuth(e.target.checked)}
            />
            🔐 Use Connection Tokens (recommended for browser clients)
          </label>
        </div>

        {useTokenAuth && (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "#999", lineHeight: 1.5 }}>
            <strong>How it works:</strong> Your API key stays on the server. A short-lived, single-use token is generated
            via <code>POST /auth/token</code> and used for the WebSocket connection. Each connection needs a fresh token.
            {" "}In a real app, your backend would call this endpoint — the API key would never reach the browser.
          </p>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Publisher Panel */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>📤 Publisher / RPC Caller</h3>
            <span style={{
              padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
              background: pubConnected ? "#e8f5e9" : "#ffebee",
              color: pubConnected ? "#2e7d32" : "#c62828",
            }}>
              {pubConnected ? "● Connected" : "● Disconnected"}
            </span>
          </div>

          {!pubConnected ? (
            <button onClick={connectPublisher} style={btnPrimary}>Connect Publisher</button>
          ) : (
            <div>
              {/* Pub/Sub Section */}
              <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #eee" }}>
                <h4 style={{ margin: "0 0 10px", fontSize: 13, color: "#666", textTransform: "uppercase", letterSpacing: 1 }}>Pub/Sub</h4>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Topic</label>
                  <input
                    type="text" value={pubTopic}
                    onChange={(e) => setPubTopic(e.target.value)}
                    style={{ ...inputStyle, width: "100%" }}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Payload (JSON)</label>
                  <textarea
                    value={pubPayload}
                    onChange={(e) => setPubPayload(e.target.value)}
                    rows={4}
                    style={{
                      ...inputStyle, width: "100%", fontFamily: "monospace", fontSize: 13,
                      resize: "vertical" as const, lineHeight: 1.5,
                    }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <button onClick={publishMessage} style={btnSuccess}>Send Message</button>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#666", cursor: "pointer" }}>
                    <input type="checkbox" checked={requireAck} onChange={(e) => setRequireAck(e.target.checked)} />
                    Require ACK
                  </label>
                </div>
              </div>

              {/* RPC Caller Section */}
              <div style={{ marginBottom: 12 }}>
                <h4 style={{ margin: "0 0 10px", fontSize: 13, color: "#666", textTransform: "uppercase", letterSpacing: 1 }}>RPC Caller</h4>
                <button onClick={discoverFunctions} style={{ ...btnPrimary, marginBottom: 12, background: "#9c27b0" }}>
                  🔍 Discover Functions
                </button>
                {discoveredFns.length > 0 && (
                  <div style={{ marginBottom: 12, fontSize: 12, color: "#666" }}>
                    Available: {discoveredFns.map((f: any) => (
                      <button
                        key={f.name}
                        onClick={() => setRpcFn(f.name)}
                        style={{
                          margin: "0 4px 4px 0", padding: "2px 8px", border: "1px solid #9c27b0",
                          background: rpcFn === f.name ? "#9c27b0" : "transparent",
                          color: rpcFn === f.name ? "#fff" : "#9c27b0",
                          borderRadius: 3, cursor: "pointer", fontSize: 12,
                        }}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    type="text" value={rpcFn}
                    onChange={(e) => setRpcFn(e.target.value)}
                    placeholder="Function name"
                    style={{ ...inputStyle, flex: "0 0 160px" }}
                  />
                  <input
                    type="text" value={rpcArgs}
                    onChange={(e) => setRpcArgs(e.target.value)}
                    placeholder='{ "a": 5, "b": 3 }'
                    style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: 13 }}
                  />
                </div>
                <button
                  onClick={callRpcFunction}
                  disabled={!rpcFn}
                  style={{ ...btnWarning, opacity: rpcFn ? 1 : 0.5 }}
                >
                  ⚡ Call Function
                </button>
              </div>

              <button onClick={disconnectPublisher} style={{ ...btnDanger, background: "#999", marginTop: 8 }}>
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Consumers Panel */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>📥 Consumers ({consumers.length})</h3>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input
              type="text" value={newConsumerTopic}
              onChange={(e) => setNewConsumerTopic(e.target.value)}
              placeholder="Topic to subscribe..."
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={addConsumer} style={btnPrimary}>+ Add Consumer</button>
          </div>

          {consumers.length === 0 ? (
            <p style={{ color: "#999", fontSize: 13, margin: 0 }}>
              No consumers yet. Add one to start receiving messages.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
              {consumers.map((c, idx) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", background: "#fafafa", borderRadius: 6,
                    borderLeft: `3px solid ${COLORS[idx % COLORS.length]}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Consumer-{c.id}</span>
                    <code style={{ fontSize: 12, background: "#e3f2fd", padding: "2px 8px", borderRadius: 3 }}>
                      {c.topic}
                    </code>
                    <span style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 10,
                      background: c.connected ? "#e8f5e9" : "#ffebee",
                      color: c.connected ? "#2e7d32" : "#c62828",
                    }}>
                      {c.connected ? "● Connected" : "● Disconnected"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, color: "#666" }}>
                      {c.messageCount} msg{c.messageCount !== 1 ? "s" : ""}
                    </span>
                    <button
                      onClick={() => removeConsumer(c.id)}
                      style={{
                        padding: "2px 8px", background: "transparent", color: "#f44336",
                        border: "1px solid #f44336", borderRadius: 3, cursor: "pointer", fontSize: 11,
                      }}
                    >
                      ✕ Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Executer Panel — full width */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>⚙️ RPC Executer</h3>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#666" }}>{executer.callCount} call(s) handled</span>
            <span style={{
              padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
              background: executer.connected ? "#e8f5e9" : "#ffebee",
              color: executer.connected ? "#2e7d32" : "#c62828",
            }}>
              {executer.connected ? "● Connected" : "● Disconnected"}
            </span>
          </div>
        </div>

        <p style={{ fontSize: 13, color: "#888", margin: "0 0 14px" }}>
          Register functions below, then connect. When a producer calls a function, the handler code runs automatically.
          The handler receives <code>args</code> as input and should <code>return</code> the result.
        </p>

        {/* Registered functions list */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Registered Functions</label>
          {executer.functions.length === 0 ? (
            <p style={{ color: "#999", fontSize: 13, margin: "4px 0" }}>No functions registered yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
              {executer.functions.map((fn) => (
                <div
                  key={fn.name}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", background: "#fafafa", borderRadius: 6,
                    borderLeft: "3px solid #ff9800",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{fn.name}</span>
                    <span style={{ fontSize: 12, color: "#888" }}>{fn.description}</span>
                    <code style={{ fontSize: 11, background: "#fff3e0", padding: "2px 8px", borderRadius: 3, color: "#e65100" }}>
                      {fn.handler.length > 40 ? fn.handler.slice(0, 40) + "..." : fn.handler}
                    </code>
                  </div>
                  <button
                    onClick={() => removeFunction(fn.name)}
                    disabled={executer.connected}
                    style={{
                      padding: "2px 8px", background: "transparent", color: executer.connected ? "#ccc" : "#f44336",
                      border: `1px solid ${executer.connected ? "#ccc" : "#f44336"}`, borderRadius: 3,
                      cursor: executer.connected ? "not-allowed" : "pointer", fontSize: 11,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add function form */}
        {!executer.connected && (
          <div style={{ marginBottom: 14, padding: 14, background: "#f9f9f9", borderRadius: 6 }}>
            <label style={labelStyle}>Add Function</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                type="text" value={newFnName} onChange={(e) => setNewFnName(e.target.value)}
                placeholder="Function name" style={{ ...inputStyle, flex: "0 0 140px" }}
              />
              <input
                type="text" value={newFnDesc} onChange={(e) => setNewFnDesc(e.target.value)}
                placeholder="Description" style={{ ...inputStyle, flex: 1 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text" value={newFnHandler} onChange={(e) => setNewFnHandler(e.target.value)}
                placeholder="return args.x * 2;"
                style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: 13 }}
              />
              <button onClick={addFunction} disabled={!newFnName.trim()} style={{ ...btnWarning, opacity: newFnName.trim() ? 1 : 0.5 }}>
                + Add
              </button>
            </div>
            <p style={{ fontSize: 11, color: "#aaa", margin: "6px 0 0" }}>
              Handler receives <code>args</code> (the call arguments). Example: <code>return args.a + args.b;</code>
            </p>
          </div>
        )}

        {/* Connect/Disconnect */}
        {!executer.connected ? (
          <button
            onClick={connectExecuter}
            disabled={executer.functions.length === 0}
            style={{ ...btnWarning, opacity: executer.functions.length > 0 ? 1 : 0.5 }}
          >
            Connect Executer ({executer.functions.length} functions)
          </button>
        ) : (
          <button onClick={disconnectExecuter} style={{ ...btnDanger, background: "#999" }}>
            Disconnect Executer
          </button>
        )}
      </div>

      {/* Streaming Publisher Panel — full width */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>🌊 Streaming Publisher</h3>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {activeStreamId && (
              <span style={{ fontSize: 12, color: "#666" }}>{streamSeq} chunks sent</span>
            )}
            <span style={{
              padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
              background: activeStreamId ? "#e8f5e9" : "#f5f5f5",
              color: activeStreamId ? "#2e7d32" : "#999",
            }}>
              {activeStreamId ? "● Streaming" : "● Idle"}
            </span>
          </div>
        </div>

        <p style={{ fontSize: 13, color: "#888", margin: "0 0 14px" }}>
          Start a data stream on a topic. Subscribers will receive <code>STREAM_START</code>, sequenced <code>STREAM_DATA</code> chunks,
          and <code>STREAM_END</code>. Requires the publisher to be connected above.
        </p>

        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={labelStyle}>Topic</label>
            <input
              type="text" value={streamTopic}
              onChange={(e) => setStreamTopic(e.target.value)}
              disabled={!!activeStreamId}
              style={{ ...inputStyle, width: "100%", opacity: activeStreamId ? 0.6 : 1 }}
            />
          </div>
          <div style={{ flex: "0 0 120px" }}>
            <label style={labelStyle}>Interval (ms)</label>
            <input
              type="number" value={streamInterval}
              onChange={(e) => setStreamInterval(Math.max(10, parseInt(e.target.value) || 200))}
              disabled={!!activeStreamId}
              min={10} step={50}
              style={{ ...inputStyle, width: "100%", opacity: activeStreamId ? 0.6 : 1 }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Payload Template <span style={{ textTransform: "none", letterSpacing: 0, color: "#bbb" }}>
            — use {"{{seq}}"} for sequence, {"{{ts}}"} for timestamp
          </span></label>
          <input
            type="text" value={streamPayloadTemplate}
            onChange={(e) => setStreamPayloadTemplate(e.target.value)}
            disabled={!!activeStreamId}
            style={{ ...inputStyle, width: "100%", fontFamily: "monospace", fontSize: 13, opacity: activeStreamId ? 0.6 : 1 }}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {!activeStreamId ? (
            <button
              onClick={startStream}
              disabled={!pubConnected}
              style={{ ...btnSuccess, opacity: pubConnected ? 1 : 0.5 }}
            >
              ▶ Start Stream
            </button>
          ) : (
            <button onClick={stopStream} style={btnDanger}>
              ■ Stop Stream
            </button>
          )}
          {!pubConnected && !activeStreamId && (
            <span style={{ fontSize: 12, color: "#999", alignSelf: "center" }}>
              Connect the publisher first ↑
            </span>
          )}
        </div>
      </div>

      {/* Log Panel */}
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 20px", borderBottom: "1px solid #eee",
        }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>📝 Live Traffic Log</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#999" }}>{logs.length} entries</span>
            <button onClick={clearLogs} style={{
              padding: "4px 12px", background: "#eee", color: "#666",
              border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12,
            }}>
              Clear
            </button>
          </div>
        </div>
        <pre
          ref={logRef}
          style={{
            margin: 0, padding: 16, background: "#1e1e2e", color: "#cdd6f4",
            fontSize: 12, fontFamily: "'Fira Code', 'Cascadia Code', monospace",
            lineHeight: 1.7, height: 320, overflowY: "auto", overflowX: "auto",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}
        >
          {logs.length === 0 ? (
            <span style={{ color: "#6c7086" }}>
              {"// Connect a publisher and consumers, then send messages.\n// All traffic will appear here in real-time.\n"}
            </span>
          ) : (
            logs.map((entry, i) => {
              let color = "#6c7086";
              let arrow = " ";
              if (entry.direction === "sent") { color = "#89b4fa"; arrow = "▶"; }
              else if (entry.direction === "received") { color = "#a6e3a1"; arrow = "◀"; }
              else { color = "#f9e2af"; arrow = "●"; }

              return (
                <span key={i}>
                  <span style={{ color: "#6c7086" }}>{entry.time}</span>
                  {" "}
                  <span style={{ color }}>{arrow}</span>
                  {" "}
                  <span style={{ color: "#cba6f7", fontWeight: 600 }}>[{entry.source}]</span>
                  {" "}
                  <span style={{ color }}>{entry.message}</span>
                  {"\n"}
                </span>
              );
            })
          )}
        </pre>
      </div>
    </div>
  );
}
