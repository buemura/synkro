import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger, logger, setDebug } from "./logger.js";

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
    it("should always log regardless of debug flag", () => {
      setDebug(false);
      logger.warn("warning");
      expect(warnSpy).toHaveBeenCalledWith("warning");
    });

    it("should log with debug enabled too", () => {
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

describe("Logger class", () => {
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
  });

  it("should not log debug when debugEnabled is false", () => {
    const log = new Logger(false);
    log.debug("hidden");
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("should log debug when debugEnabled is true", () => {
    const log = new Logger(true);
    log.debug("visible");
    expect(debugSpy).toHaveBeenCalledWith("visible");
  });

  it("should default debugEnabled to false", () => {
    const log = new Logger();
    log.debug("hidden");
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("should always log warn and error regardless of debug flag", () => {
    const log = new Logger(false);
    log.warn("warning");
    log.error("error");
    expect(warnSpy).toHaveBeenCalledWith("warning");
    expect(errorSpy).toHaveBeenCalledWith("error");
  });

  it("should isolate debug state between instances", () => {
    const logA = new Logger(true);
    const logB = new Logger(false);

    logA.debug("from A");
    logB.debug("from B");

    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledWith("from A");
  });
});
