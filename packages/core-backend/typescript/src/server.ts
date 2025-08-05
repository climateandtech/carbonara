import express from "express";
import { createServer } from "http";
import WebSocket from "ws";
import cors from "cors";
import bodyParser from "body-parser";
import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  CarbonaraRpcMethods,
  ErrorCodes,
  ServerCapabilities,
  Diagnostic,
  CompletionItem,
  CompletionItemKind,
} from "@carbonara/rpc-protocol";

export class CarbonaraServer {
  private app: express.Application;
  private server: any;
  private wss!: WebSocket.Server;
  private port: number;
  private clients: Set<WebSocket> = new Set();

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.server = createServer(this.app);
    this.setupWebSocket();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(bodyParser.json());
  }

  private setupRoutes() {
    // Health check
    this.app.get("/health", (req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // JSON-RPC over HTTP
    this.app.post("/rpc", async (req, res) => {
      try {
        const request = req.body as JsonRpcRequest;
        const response = await this.handleRpcRequest(request);
        res.json(response);
      } catch (error) {
        const errorResponse: JsonRpcResponse = {
          jsonrpc: "2.0",
          error: {
            code: ErrorCodes.InternalError,
            message: "Internal server error",
            data: error instanceof Error ? error.message : String(error),
          },
          id: null,
        };
        res.status(500).json(errorResponse);
      }
    });
  }

  private setupWebSocket() {
    this.wss = new WebSocket.Server({ server: this.server });

    this.wss.on("connection", (ws) => {
      console.log("WebSocket client connected");
      this.clients.add(ws);

      ws.on("message", async (data) => {
        try {
          const request = JSON.parse(data.toString()) as JsonRpcRequest;
          const response = await this.handleRpcRequest(request);
          ws.send(JSON.stringify(response));
        } catch (error) {
          const errorResponse: JsonRpcResponse = {
            jsonrpc: "2.0",
            error: {
              code: ErrorCodes.ParseError,
              message: "Parse error",
            },
            id: null,
          };
          ws.send(JSON.stringify(errorResponse));
        }
      });

      ws.on("close", () => {
        console.log("WebSocket client disconnected");
        this.clients.delete(ws);
      });
    });
  }

  private async handleRpcRequest(
    request: JsonRpcRequest,
  ): Promise<JsonRpcResponse> {
    console.log(`RPC Request: ${request.method}`, request.params);

    try {
      let result: any;

      switch (request.method) {
        case "carbonara/initialize":
          result = await this.handleInitialize(request.params);
          break;

        case "carbonara/analyze":
          result = await this.handleAnalyze(request.params);
          break;

        case "carbonara/getCompletions":
          result = await this.handleGetCompletions(request.params);
          break;

        case "carbonara/getRefactorActions":
          result = await this.handleGetRefactorActions(request.params);
          break;

        case "carbonara/executeRefactor":
          result = await this.handleExecuteRefactor(request.params);
          break;

        case "carbonara/openFile":
          result = await this.handleOpenFile(request.params);
          break;

        case "carbonara/closeFile":
          result = await this.handleCloseFile(request.params);
          break;

        case "carbonara/saveFile":
          result = await this.handleSaveFile(request.params);
          break;

        case "carbonara/shutdown":
          result = await this.handleShutdown(request.params);
          break;

        default:
          throw new Error(`Method not found: ${request.method}`);
      }

      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        result,
        id: request.id || null,
      };

      return response;
    } catch (error) {
      const errorResponse: JsonRpcResponse = {
        jsonrpc: "2.0",
        error: {
          code: ErrorCodes.InternalError,
          message: error instanceof Error ? error.message : "Unknown error",
          data: error instanceof Error ? error.stack : undefined,
        },
        id: request.id || null,
      };

      return errorResponse;
    }
  }

  // RPC Method Implementations
  private async handleInitialize(
    params: any,
  ): Promise<{ capabilities: ServerCapabilities }> {
    const clientInfo = params.clientInfo;
    console.log(
      `Client initialized: ${clientInfo.name} v${clientInfo.version}`,
    );

    return {
      capabilities: {
        completionProvider: true,
        diagnosticProvider: true,
        refactorProvider: true,
        documentFormattingProvider: false,
      },
    };
  }

  private async handleAnalyze(
    params: any,
  ): Promise<{ diagnostics: Diagnostic[] }> {
    const { uri, content } = params;

    // Mock analysis - replace with actual analysis logic
    const diagnostics: Diagnostic[] = [];

    if (content && content.includes("TODO")) {
      diagnostics.push({
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 4 },
        },
        message: "TODO comment found",
        severity: "info",
        source: "carbonara",
      });
    }

    console.log(`Analyzed ${uri}: ${diagnostics.length} diagnostics`);
    return { diagnostics };
  }

  private async handleGetCompletions(
    params: any,
  ): Promise<{ items: CompletionItem[] }> {
    const { uri, position } = params;

    // Mock completions - replace with actual completion logic
    const items: CompletionItem[] = [
      {
        label: "console.log",
        kind: CompletionItemKind.Method,
        detail: "Log to console",
        insertText: "console.log($1)",
        sortText: "0001",
      },
      {
        label: "function",
        kind: CompletionItemKind.Keyword,
        detail: "Function declaration",
        insertText: "function ${1:name}($2) {\n  $3\n}",
        sortText: "0002",
      },
    ];

    console.log(
      `Completions for ${uri} at ${position.line}:${position.character}: ${items.length} items`,
    );
    return { items };
  }

  private async handleGetRefactorActions(
    params: any,
  ): Promise<{ actions: any[] }> {
    const { uri, range } = params;
    console.log(`Refactor actions for ${uri}`, range);
    return { actions: [] };
  }

  private async handleExecuteRefactor(params: any): Promise<{ edit?: any }> {
    const { uri, action, args } = params;
    console.log(`Execute refactor ${action} on ${uri}`, args);
    return {};
  }

  private async handleOpenFile(params: any): Promise<{ success: boolean }> {
    const { uri } = params;
    console.log(`Open file: ${uri}`);
    return { success: true };
  }

  private async handleCloseFile(params: any): Promise<{ success: boolean }> {
    const { uri } = params;
    console.log(`Close file: ${uri}`);
    return { success: true };
  }

  private async handleSaveFile(params: any): Promise<{ success: boolean }> {
    const { uri, content } = params;
    console.log(`Save file: ${uri} (${content?.length || 0} chars)`);
    return { success: true };
  }

  private async handleShutdown(params: any): Promise<null> {
    console.log("Server shutdown requested");
    setTimeout(() => {
      process.exit(0);
    }, 1000);
    return null;
  }

  // Notification methods (server -> client)
  public sendNotification(method: string, params: any) {
    const notification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    const message = JSON.stringify(notification);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`🚀 Carbonara server running on port ${this.port}`);
        console.log(`📡 HTTP RPC endpoint: http://localhost:${this.port}/rpc`);
        console.log(`🔌 WebSocket endpoint: ws://localhost:${this.port}`);
        resolve();
      });
    });
  }

  public stop(): void {
    this.server.close();
    this.wss.close();
  }
}
