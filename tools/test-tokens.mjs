#!/usr/bin/env node
/** 测试：提高 max_tokens / 降低 reasoning 消耗，能否消除 finish=length 空响应。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const key = (() => {
  if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY;
  const credFile = process.env.LLM_API_KEY_CRED_FILE;
  if (credFile && fs.existsSync(credFile)) {
    const m = fs.readFileSync(credFile, 'utf8').match(/NEWAPI_API_KEY:\s*(\S+)/);
    if (m) return m[1];
  }
  throw new Error('找不到 LLM API Key。请设置环境变量 LLM_API_KEY。');
})();
const BASE = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';

const longText = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'markdown', '56665.md'),
  'utf8'
).slice(0, 3000);

const VARIANTS = [
  { name: 'max_tokens=4000 (当前)', body: { max_tokens: 4000 } },
  { name: 'max_tokens=12000', body: { max_tokens: 12000 } },
  { name: 'max_tokens=12000 + reasoning_effort=low', body: { max_tokens: 12000, reasoning_effort: 'low' } },
  { name: 'max_tokens=12000 + thinking off', body: { max_tokens: 12000, extra_body: { thinking: { type: 'disabled' } } } },
  { name: 'max_tokens=20000', body: { max_tokens: 20000 } },
];

for (const v of VARIANTS) {
  const results = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'MiniMax',
          messages: [
            { role: 'system', content: '只输出 JSON 对象 {"a":"b"}，不要其他内容。' },
            { role: 'user', content: longText },
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' },
          ...v.body,
        }),
        signal: AbortSignal.timeout(180000),
      });
      const j = await res.json();
      const msg = j?.choices?.[0]?.message ?? {};
      results.push({
        finish: j?.choices?.[0]?.finish_reason,
        contentLen: (msg.content || '').length,
        reasoningLen: (msg.reasoning_content || '').length,
        ms: Date.now() - t0,
        usage: j?.usage?.completion_tokens,
      });
    } catch (e) {
      results.push({ finish: 'ERR', contentLen: 0, reasoningLen: 0, ms: Date.now() - t0, usage: 0, err: e.message.slice(0, 60) });
    }
  }
  const ok = results.filter((r) => r.contentLen > 0).length;
  console.log(`${v.name.padEnd(46)} ok=${ok}/3  ${results.map((r) => `${r.finish}/c${r.contentLen}/r${r.reasoningLen}/${r.ms}ms`).join('  ')}`);
}
