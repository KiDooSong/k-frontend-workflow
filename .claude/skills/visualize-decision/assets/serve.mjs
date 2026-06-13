// 미리보기 전용 초소형 정적 서버. 빌드된 HTML 을 "/" 로 서빙한다.
// 파일 지정:  node serve.mjs [file.html]   (또는 VIZ_FILE 환경변수). 기본 examples/decision-D-001.html
// 보안: 기본 127.0.0.1 만 바인딩(로컬 전용), 서빙 파일은 엔진 examples/ 또는 docs/frontend-workflow/_viz/ 안의 .html 로 제한.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGuard } from './path-guard.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const port = Number(process.env.PORT) || 4178;
// 기본 로컬 전용. 외부 바인딩은 명시 옵트인(ALLOW_EXTERNAL=1)일 때만 허용한다.
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const host = process.env.HOST || '127.0.0.1';
if (!LOOPBACK.has(host) && process.env.ALLOW_EXTERNAL !== '1')
  throw new Error(`외부 바인딩 거부: HOST=${host} (로컬 전용). 외부 노출이 꼭 필요하면 ALLOW_EXTERNAL=1 로 명시.`);
const reqFile = process.argv[2] || process.env.VIZ_FILE || 'examples/decision-D-001.html';

// build.mjs 와 동일 가드(path-guard.mjs): examples/ 또는 .../docs/frontend-workflow/_viz 안의 .html 만.
const { safePath: resolveSafe } = makeGuard(root, here);
resolveSafe(reqFile, ['.html']); // 시작 시 1회 검증(실패하면 즉시 종료)

http.createServer((req, res) => {
  try {
    const safe = resolveSafe(reqFile, ['.html']); // 매 요청 재검증(TOCTOU: 그 사이 symlink 교체 차단)
    const html = fs.readFileSync(safe, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(port, host, () => console.log('viz preview on http://' + host + ':' + port + '/  (' + reqFile + ')'));
