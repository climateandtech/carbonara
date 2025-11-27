/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2025 Carbonara team
 */

import * as vscode from "vscode";
import { BadgeColor } from "@carbonara/core";

/**
 * Decoration provider for colored circle badges
 * Shows small filled circles (not 3D emojis) based on metric thresholds
 */
export class BadgeDecorationProvider implements vscode.FileDecorationProvider {
  private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  private badgeMap: Map<string, BadgeColor> = new Map();

  /**
   * Set badge color for a URI
   */
  setBadge(uri: vscode.Uri, color: BadgeColor): void {
    if (color === "none") {
      this.badgeMap.delete(uri.toString());
    } else {
      this.badgeMap.set(uri.toString(), color);
    }
    this._onDidChangeFileDecorations.fire(uri);
  }

  /**
   * Clear badge for a URI
   */
  clearBadge(uri: vscode.Uri): void {
    this.badgeMap.delete(uri.toString());
    this._onDidChangeFileDecorations.fire(uri);
  }

  /**
   * Clear all badges
   */
  clearAll(): void {
    this.badgeMap.clear();
    this._onDidChangeFileDecorations.fire(undefined);
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    // Only decorate carbonara-badge URIs
    if (uri.scheme !== "carbonara-badge") {
      return undefined;
    }

    const color = this.badgeMap.get(uri.toString());
    if (!color || color === "none") {
      return undefined;
    }

    // Use filled circle character (●) instead of emoji
    // Smaller and not 3D
    const badge = "●";
    
    // Map colors to VSCode theme colors
    let colorTheme: vscode.ThemeColor | string;
    switch (color) {
      case "green":
        colorTheme = new vscode.ThemeColor("charts.green");
        break;
      case "yellow":
        colorTheme = new vscode.ThemeColor("charts.yellow");
        break;
      case "orange":
        colorTheme = new vscode.ThemeColor("charts.orange");
        break;
      case "red":
        colorTheme = new vscode.ThemeColor("charts.red");
        break;
      default:
        return undefined;
    }

    return {
      badge,
      color: colorTheme,
      tooltip: this.getTooltip(color),
    };
  }

  private getTooltip(color: BadgeColor): string {
    switch (color) {
      case "green":
        return "Excellent - Below threshold";
      case "yellow":
        return "Good - Within acceptable range";
      case "orange":
        return "Moderate - Above average";
      case "red":
        return "High - Significantly above threshold";
      default:
        return "";
    }
  }

  refresh(): void {
    this._onDidChangeFileDecorations.fire(undefined);
  }
}



