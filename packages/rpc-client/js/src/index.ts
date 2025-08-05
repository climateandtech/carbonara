import WebSocket from "ws";
import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  CarbonaraRpcMethods,
  CarbonaraMethodNames,
  CarbonaraNotifications,
  CarbonaraNotificationNames,
  TransportOptions,
  ClientOptions,
  ErrorCodes,
} from "@carbonara/rpc-protocol";

export interface CarbonaraClientEvents {
  notification: (notification: JsonRpcNotification) => void;
  error: (error: Error) => void;
  connected: () => void;
  disconnected: () => void;
}

export class CarbonaraClient {
  private options: ClientOptions;
  private ws?: WebSocket;
  private nextId = 1;
  private pendingRequests = new Map<
    string | number,
    {
      resolve: (result: any) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private eventListeners = new Map<keyof CarbonaraClientEvents, Function[]>();
  private isConnected = false;

  constructor(options: ClientOptions) {
    this.options = {
      timeout: 30000,
      retries: 3,
      ...options,
    };
  }

  // Event handling
  public on<K extends keyof CarbonaraClientEvents>(
    event: K,
    listener: CarbonaraClientEvents[K],
  ): this {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
    return this;
  }

  public off<K extends keyof CarbonaraClientEvents>(
    event: K,
    listener: CarbonaraClientEvents[K],
  ): this {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }

  private emit<K extends keyof CarbonaraClientEvents>(
    event: K,
    ...args: Parameters<CarbonaraClientEvents[K]>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // Connection management
  public async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    switch (this.options.transport.type) {
      case "websocket":
        await this.connectWebSocket();
        break;
      case "tcp":
        await this.connectTcp();
        break;
      case "http":
        // HTTP doesn't maintain persistent connections
        this.isConnected = true;
        this.emit("connected");
        break;
      default:
        throw new Error(
          `Unsupported transport type: ${this.options.transport.type}`,
        );
    }
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { host = "localhost", port = 3000 } = this.options.transport;
      const url = `ws://${host}:${port}`;

      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        this.isConnected = true;
        this.emit("connected");
        resolve();
      });

      this.ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          this.emit("error", new Error("Failed to parse message"));
        }
      });

      this.ws.on("close", () => {
        this.isConnected = false;
        this.emit("disconnected");
        this.rejectPendingRequests(new Error("Connection closed"));
      });

      this.ws.on("error", (error) => {
        this.emit("error", error);
        reject(error);
      });
    });
  }

  private async connectTcp(): Promise<void> {
    throw new Error("TCP transport not implemented yet");
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    this.isConnected = false;
    this.rejectPendingRequests(new Error("Client disconnected"));
  }

  // RPC method calls
  public async call<T extends CarbonaraMethodNames>(
    method: T,
    params: CarbonaraRpcMethods[T]["params"],
  ): Promise<CarbonaraRpcMethods[T]["result"]> {
    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
      id,
    };

    if (this.options.transport.type === "http") {
      return this.callHttp(request);
    }

    if (!this.isConnected) {
      throw new Error("Client not connected");
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for method: ${method}`));
      }, this.options.timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });

      if (this.ws) {
        this.ws.send(JSON.stringify(request));
      } else {
        reject(new Error("No active connection"));
      }
    });
  }

  private async callHttp(request: JsonRpcRequest): Promise<any> {
    const {
      host = "localhost",
      port = 3000,
      path = "/rpc",
    } = this.options.transport;
    const url = `http://${host}:${port}${path}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const rpcResponse: JsonRpcResponse = await response.json();

    if (rpcResponse.error) {
      throw new Error(`RPC error: ${rpcResponse.error.message}`);
    }

    return rpcResponse.result;
  }

  // Notification sending
  public notify<T extends CarbonaraNotificationNames>(
    method: T,
    params: CarbonaraNotifications[T]["params"],
  ): void {
    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(notification));
    }
  }

  // Message handling
  private handleMessage(message: JsonRpcResponse | JsonRpcNotification): void {
    if ("id" in message && message.id !== undefined) {
      // This is a response
      this.handleResponse(message as JsonRpcResponse);
    } else {
      // This is a notification
      this.handleNotification(message as JsonRpcNotification);
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    if (response.id === null) {
      console.warn("Received response with null ID");
      return;
    }

    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.warn("Received response for unknown request ID:", response.id);
      return;
    }

    this.pendingRequests.delete(response.id);
    clearTimeout(pending.timer);

    if (response.error) {
      pending.reject(new Error(`RPC Error: ${response.error.message}`));
    } else {
      pending.resolve(response.result);
    }
  }

  private handleNotification(notification: JsonRpcNotification): void {
    this.emit("notification", notification);
  }

  private rejectPendingRequests(error: Error): void {
    this.pendingRequests.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(error);
    });
    this.pendingRequests.clear();
  }

  // Convenience methods for common operations
  public async initialize(clientInfo: { name: string; version: string }) {
    return this.call("carbonara/initialize", { clientInfo });
  }

  public async analyze(uri: string, content?: string) {
    return this.call("carbonara/analyze", { uri, content });
  }

  public async getCompletions(
    uri: string,
    position: { line: number; character: number },
    context?: any,
  ) {
    return this.call("carbonara/getCompletions", { uri, position, context });
  }

  public async getRefactorActions(uri: string, range: any) {
    return this.call("carbonara/getRefactorActions", { uri, range });
  }

  public async executeRefactor(uri: string, action: string, args?: any) {
    return this.call("carbonara/executeRefactor", { uri, action, args });
  }

  public async openFile(uri: string) {
    return this.call("carbonara/openFile", { uri });
  }

  public async closeFile(uri: string) {
    return this.call("carbonara/closeFile", { uri });
  }

  public async saveFile(uri: string, content: string) {
    return this.call("carbonara/saveFile", { uri, content });
  }

  public async shutdown() {
    return this.call("carbonara/shutdown", {});
  }

  // Status
  public get connected(): boolean {
    return this.isConnected;
  }
}

// Factory functions for common configurations
export function createHttpClient(
  host = "localhost",
  port = 3000,
): CarbonaraClient {
  return new CarbonaraClient({
    transport: { type: "http", host, port },
  });
}

export function createWebSocketClient(
  host = "localhost",
  port = 3000,
): CarbonaraClient {
  return new CarbonaraClient({
    transport: { type: "websocket", host, port },
  });
}

export function createTcpClient(
  host = "localhost",
  port = 3001,
): CarbonaraClient {
  return new CarbonaraClient({
    transport: { type: "tcp", host, port },
  });
}
