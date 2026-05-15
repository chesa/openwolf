type MessageHandler = (msg: any) => void;

export class WolfClient {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];
  private reconnectTimer: number | null = null;
  private url: string;

  constructor(url?: string, token?: string) {
    const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
    const base = url || `${wsProtocol}//${location.host}/ws`;
    // Append the session token so the server's verifyClient can authenticate
    // the WebSocket upgrade. The token is read from sessionStorage (seeded by
    // main.tsx from the URL param on first load).
    this.url = token ? `${base}?token=${encodeURIComponent(token)}` : base;
  }

  connect(): void {
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          for (const handler of this.handlers) handler(msg);
        } catch { /* ignore parse errors */ }
      };
      this.ws.onclose = () => {
        this.scheduleReconnect();
      };
      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler);
    };
  }

  send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
