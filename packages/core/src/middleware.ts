import type { MiddlewareCtx, MiddlewareFunction } from "./types.js";

export function composeMiddleware(
  middlewares: MiddlewareFunction[],
): (ctx: MiddlewareCtx, handler: () => Promise<void>) => Promise<void> {
  if (middlewares.length === 0) {
    return (_ctx, handler) => handler();
  }

  return (ctx, handler) => {
    let index = -1;

    function dispatch(i: number): Promise<void> {
      if (i <= index) {
        return Promise.reject(new Error("next() called multiple times"));
      }
      index = i;

      if (i === middlewares.length) {
        return handler();
      }

      return middlewares[i]!(ctx, () => dispatch(i + 1));
    }

    return dispatch(0);
  };
}
