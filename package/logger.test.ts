import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger, setDebug } from "./logger.js";

describe("Logger", () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setDebug(false);
  });

  describe("debug", () => {
    it("should not log when debug is disabled", () => {
      setDebug(false);
      logger.debug("test message");
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it("should log when debug is enabled", () => {
      setDebug(true);
      logger.debug("test message");
      expect(debugSpy).toHaveBeenCalledWith("test message");
    });

    it("should pass multiple arguments", () => {
      setDebug(true);
      logger.debug("msg", { key: "value" });
      expect(debugSpy).toHaveBeenCalledWith("msg", { key: "value" });
    });
  });

  describe("warn", () => {
    it("should not log when debug is disabled", () => {
      setDebug(false);
      logger.warn("warning");
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("should log when debug is enabled", () => {
      setDebug(true);
      logger.warn("warning");
      expect(warnSpy).toHaveBeenCalledWith("warning");
    });
  });

  describe("error", () => {
    it("should always log regardless of debug flag", () => {
      setDebug(false);
      logger.error("error message");
      expect(errorSpy).toHaveBeenCalledWith("error message");
    });

    it("should log with debug enabled too", () => {
      setDebug(true);
      logger.error("error message");
      expect(errorSpy).toHaveBeenCalledWith("error message");
    });
  });
});
