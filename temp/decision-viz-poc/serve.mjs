// 미리보기 전용 초소형 정적 서버. 빌드된 HTML 을 "/" 로 서빙한다.
// 파일 지정:  node serve.mjs [file.html]   (또는 VIZ_FILE 환경변수). 기본 decision-D-001.html
// 보안: 기본 127.0.0.1 만 바인딩(로컬 전용), 서빙 파일은 폴더 내 .html 로 제한.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 4178;
const host = process.env.HOST || '127.0.0.1';
const reqFile = process.argv[2] || process.env.VIZ_FILE || 'decision-D-001.html';

// 폴더(here) 밖·비 .html 거부
function resolveSafe(p) {
  const r = path.resolve(here, p);
  if (r !== path.resolve(here) && !r.startsWith(path.resolve(here) + path.sep)) throw new Error(`경로 이탈 거부: ${p}`);
  if (path.extname(r).toLowerCase() !== '.html') throw new Error(`.html 만 허용: ${p}`);
  return r;
}
const filePath = resolveSafe(reqFile); // 시작 시 1회 검증(실패하면 즉시 종료)

http.createServer((req, res) => {
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(port, host, () => console.log('viz preview on http://' + host + ':' + port + '/  (' + reqFile + ')'));
