export default {
  async fetch(request, env) {
    // 测试环境变量是否可用
    const baseId = env.AIRTABLE_BASE_ID || "NOT_SET";
    
    // 如果是请求 /api/config，返回配置状态
    const url = new URL(request.url);
    if (url.pathname === '/api/config') {
      return new Response(JSON.stringify({
        worker: "active",
        airtable_base_id_configured: baseId !== "NOT_SET",
        base_id_value: baseId === "NOT_SET" ? null : baseId.substring(0, 10) + "..."
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 其他请求返回提示
    return new Response(`Worker is running! Airtable Base ID is ${baseId === "NOT_SET" ? "NOT configured" : "configured"}`, {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}