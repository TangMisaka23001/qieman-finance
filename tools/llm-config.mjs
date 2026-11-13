/**
 * 统一的 LLM 网关配置与凭据读取。
 *
 * 敏感信息（API Key、内部网关地址）一律通过环境变量注入，不要写进代码或提交到版本库：
 *   export LLM_API_KEY='<你的 key>'
 *   export LLM_BASE_URL='https://your-gateway/v1'   # 可选，默认见下
 *   export LLM_MODEL='your-model'                   # 可选
 *
 * 为兼容本地开发，若设置了 LLM_API_KEY_CRED_FILE，则从该 yaml 文件里读取
 * `NEWAPI_API_KEY:` 字段（仅在本机使用，文件本身不入库）。
 */
import fs from 'node:fs';

export const BASE_URL =
  process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
export const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

export function readApiKey() {
  if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY;
  const credFile = process.env.LLM_API_KEY_CRED_FILE;
  if (credFile && fs.existsSync(credFile)) {
    const raw = fs.readFileSync(credFile, 'utf8');
    const m = raw.match(/NEWAPI_API_KEY:\s*(\S+)/);
    if (m) return m[1];
  }
  throw new Error(
    '找不到 LLM API Key。请设置环境变量 LLM_API_KEY（可选 LLM_BASE_URL / LLM_MODEL）。'
  );
}
