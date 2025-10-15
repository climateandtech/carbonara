/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2024 Carbonara team
 */

// JSON-RPC 2.0 Base Types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id?: string | number;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: JsonRpcError;
  id: string | number | null;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

// Carbonara-specific Types
export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Diagnostic {
  range: Range;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source?: string;
  code?: string | number;
}

export interface CompletionItem {
  label: string;
  kind: CompletionItemKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
}

export enum CompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
}

export interface RefactorAction {
  title: string;
  kind: string;
  edit?: WorkspaceEdit;
  command?: Command;
}

export interface WorkspaceEdit {
  changes: { [uri: string]: TextEdit[] };
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface Command {
  title: string;
  command: string;
  arguments?: any[];
}

// Carbonara RPC Method Definitions
export interface CarbonaraRpcMethods {
  // Analysis Methods
  'carbonara/analyze': {
    params: { uri: string; content?: string };
    result: { diagnostics: Diagnostic[] };
  };
  
  'carbonara/getCompletions': {
    params: { uri: string; position: Position; context?: any };
    result: { items: CompletionItem[] };
  };
  
  'carbonara/getRefactorActions': {
    params: { uri: string; range: Range };
    result: { actions: RefactorAction[] };
  };
  
  'carbonara/executeRefactor': {
    params: { uri: string; action: string; args?: any };
    result: { edit?: WorkspaceEdit };
  };
  
  // File Management
  'carbonara/openFile': {
    params: { uri: string };
    result: { success: boolean };
  };
  
  'carbonara/closeFile': {
    params: { uri: string };
    result: { success: boolean };
  };
  
  'carbonara/saveFile': {
    params: { uri: string; content: string };
    result: { success: boolean };
  };
  
  // Server Management
  'carbonara/initialize': {
    params: { clientInfo: { name: string; version: string } };
    result: { capabilities: ServerCapabilities };
  };
  
  'carbonara/shutdown': {
    params: {};
    result: null;
  };
}

export interface ServerCapabilities {
  completionProvider?: boolean;
  diagnosticProvider?: boolean;
  refactorProvider?: boolean;
  documentFormattingProvider?: boolean;
}

// Notification Types (server -> client)
export interface CarbonaraNotifications {
  'carbonara/diagnosticsChanged': {
    params: { uri: string; diagnostics: Diagnostic[] };
  };
  
  'carbonara/progressUpdate': {
    params: { token: string; progress: number; message?: string };
  };
}

// Helper Types
export type CarbonaraMethodNames = keyof CarbonaraRpcMethods;
export type CarbonaraNotificationNames = keyof CarbonaraNotifications;

export type RequestFor<T extends CarbonaraMethodNames> = JsonRpcRequest & {
  method: T;
  params: CarbonaraRpcMethods[T]['params'];
};

export type ResponseFor<T extends CarbonaraMethodNames> = JsonRpcResponse & {
  result: CarbonaraRpcMethods[T]['result'];
};

export type NotificationFor<T extends CarbonaraNotificationNames> = JsonRpcNotification & {
  method: T;
  params: CarbonaraNotifications[T]['params'];
};

// Transport Types
export interface TransportOptions {
  type: 'tcp' | 'stdio' | 'websocket' | 'http';
  host?: string;
  port?: number;
  path?: string;
}

export interface ClientOptions {
  transport: TransportOptions;
  timeout?: number;
  retries?: number;
}

// Error Codes (JSON-RPC standard + Carbonara-specific)
export enum ErrorCodes {
  // JSON-RPC standard errors
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  
  // Carbonara-specific errors
  FileNotFound = -32001,
  AnalysisError = -32002,
  RefactorError = -32003,
  ServerNotInitialized = -32004,
  ServerShuttingDown = -32005,
} 