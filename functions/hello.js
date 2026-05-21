export function onRequest(context) {
  // 尝试读取环境变量（即使没有也会触发面板显示）
  const testVar = context.env.TEST_VAR || "no var";
  return new Response(`Worker active, env test: ${testVar}`);
}