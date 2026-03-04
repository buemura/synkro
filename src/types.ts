export type ConfigHandler = {
  type: string;
  handler: string;
};

export type Config = {
  events: ConfigHandler[];
};

export type HandlerCtx = {
  requestId: string;
  payload: unknown;
};

export type HandlerFunction = (ctx: HandlerCtx) => void | Promise<void>;
