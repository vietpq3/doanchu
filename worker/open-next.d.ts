// Worker do OpenNext sinh ra lúc build (.open-next/worker.js, không có trong git): khai báo phần ta dùng để typecheck được khi chưa build.
declare module '*/.open-next/worker.js' {
  const handler: { fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> };
  export default handler;
  export const DOQueueHandler: unknown;
  export const DOShardedTagCache: unknown;
  export const BucketCachePurge: unknown;
}
