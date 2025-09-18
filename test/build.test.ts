import { execSync } from "child_process";
import { describe, test, expect } from "vitest";

describe("Build process", () => {
  test("should run npm run build successfully", () => {
    expect(() => {
      execSync("npm run build", { stdio: "pipe" });
    }).not.toThrowError();
  });
});
