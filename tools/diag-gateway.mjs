#!/usr/bin/env node
/** 网关诊断：检查各模型的响应耗时、空内容率、finish_reason。不打印任何密钥。 */
import fs from 'node:fs';

const BASE_URL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
const key = (() => {
  if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY;
  const credFile = process.env.LLM_API_KEY_CRED_FILE;
  if (credFile && fs.existsSync(credFile)) {
    const m = fs.readFileSync(credFile, 'utf8').match(/NEWAPI_API_KEY:\s*(\S+)/);
    if (m) return m[1];
  }
  throw new Error('找不到 LLM API Key。请设置环境变量 LLM_API_KEY。');
})();
const MODELS = (process.env.LLM_FALLBACK_MODELS || 'gpt-4o-mini')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const N = Number(process.argv[2] || 3);

const stats = {};
for (const m of MODELS) stats[m] = { n: 0, empty: 0, ms: [], len: 0, finish: {} };

for (let i = 0; i < N; i++) {
  for (const model of MODELS) {
    const t0 = Date.now();
    let out = { finish: '?', len: 0, err: null };
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: '只回复两个字：你好' }],
          temperature: 0.2,
          max_tokens: 2000,
        }),
        signal: AbortSignal.timeout(180000),
      });
      const j = await res.json();
      const msg = j?.choices?.[0]?.message ?? {};
      out = {
        finish: j?.choices?.[0]?.finish_reason ?? '?',
        len: (msg.content || '').length,
        err: res.ok ? null : `HTTP ${res.status}`,
      };
    } catch (e) {
      out.err = String(e.message || e).slice(0, 80);
    }
    const s = stats[model];
    s.n++;
    s.ms.push(Date.now() - t0);
    if (!out.len) s.empty++;
    s.len += out.len;
    s.finish[out.finish] = (s.finish[out.finish] || 0) + 1;
    if (out.err) console.log(`  ${model} err: ${out.err}`);
  }
  console.log(`--- round ${i + 1} done`);
}

for (const [m, s] of Object.entries(stats)) {
  s.ms.sort((a, b) => a - b);
  const med = s.ms[Math.floor(s.ms.length / 2)];
  console.log(
    `${m.padEnd(24)} n=${s.n} empty=${s.empty}/${s.n} avgOutChars=${Math.round(s.len / s.n)} ` +
      `medianMs=${med} min=${s.ms[0]} max=${s.ms[s.ms.length - 1]} finish=${JSON.stringify(s.finish)}`
  );
}
