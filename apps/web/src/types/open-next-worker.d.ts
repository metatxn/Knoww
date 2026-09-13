declare module "*.open-next/worker.js" {
  const worker: {
    fetch(
      request: Request,
      env: unknown,
      ctx: ExecutionContext
    ): Response | Promise<Response>;
  };
  export default worker;
}
