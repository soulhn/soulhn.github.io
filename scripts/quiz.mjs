// 글 → 퀴즈 생성기 (생성은 자동, 발행은 사람 검수 후 커밋)
// 사용: OPENAI_API_KEY=... node scripts/quiz.mjs <slug> [slug...]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error('OPENAI_API_KEY 환경변수가 필요합니다.'); process.exit(1); }

const slugs = process.argv.slice(2);
if (!slugs.length) { console.error('사용법: node scripts/quiz.mjs <slug> [slug...]'); process.exit(1); }

const PROMPT = `당신은 교육 콘텐츠 출제자다. 아래 글을 읽고 독자의 이해를 확인하는 사지선다 퀴즈 3문항을 만들어라.
규칙:
- 글에 실제로 있는 내용만 출제 (외부 지식 금지)
- 오답 보기는 그럴듯하게 — 흔한 오해를 반영
- 각 문항에 한 문장 해설 포함
- 반드시 아래 JSON 형식만 출력:
{"quiz":[{"question":"...","choices":["...","...","...","..."],"answer":0,"explain":"..."}]}`;

function validate(data) {
  if (!Array.isArray(data?.quiz) || data.quiz.length !== 3) return '문항 수 ≠ 3';
  for (const q of data.quiz) {
    if (typeof q.question !== 'string' || !q.question) return 'question 누락';
    if (!Array.isArray(q.choices) || q.choices.length !== 4) return '보기 수 ≠ 4';
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) return 'answer 범위 오류';
    if (typeof q.explain !== 'string' || !q.explain) return 'explain 누락';
  }
  return null;
}

async function generate(slug) {
  const md = readFileSync(resolve(ROOT, `src/content/blog/${slug}.md`), 'utf-8');
  const body = md.replace(/^---[\s\S]*?---\n/, '');
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: body },
        ],
      }),
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    const data = JSON.parse((await res.json()).choices[0].message.content);
    const err = validate(data);
    if (!err) return data.quiz;
    console.warn(`  ⚠️ ${slug} 검증 실패(${err}) — 재시도 ${attempt}/2`);
  }
  throw new Error(`${slug}: 2회 시도 모두 검증 실패`);
}

mkdirSync(resolve(ROOT, 'src/data/quiz'), { recursive: true });
for (const slug of slugs) {
  const quiz = await generate(slug);
  const out = resolve(ROOT, `src/data/quiz/${slug}.json`);
  writeFileSync(out, JSON.stringify(quiz, null, 2) + '\n', 'utf-8');
  console.log(`✅ ${slug}: 3문항 생성 → src/data/quiz/${slug}.json (검수 후 커밋하세요)`);
}
