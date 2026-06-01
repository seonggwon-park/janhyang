# 잔향

감정으로 남기는 음악 기록장.

잔향은 음악을 듣고 남은 감정을 조용히 기록하는 작은 웹 앱입니다. 곡을 검색하거나 직접 입력하고, 감정 태그와 짧은 메모를 남길 수 있습니다.

## 첫 버전 범위

- 홈
- 음악 로그 작성
- iTunes Search API 기반 곡 검색
- 직접 곡 입력
- 감정 태그
- 내 로그 목록
- 로그 상세

## 제외한 것

- 음악 스트리밍
- 추천
- 플레이리스트 생성
- 좋아요, 댓글, 팔로우, 랭킹

## 실행

Supabase 프로젝트를 먼저 연결해야 합니다.

1. Supabase 프로젝트를 만듭니다.
2. Supabase SQL editor에서 `supabase/schema.sql`을 실행합니다.
3. `.env.example`을 참고해 `.env`를 만들거나 실행 환경에 변수를 설정합니다.
4. 로컬 서버를 실행합니다.

필요한 환경 변수:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

서버 쓰기에는 `SUPABASE_SERVICE_ROLE_KEY`를 우선 사용합니다. 이 값은 브라우저에 노출하지 말고 서버 환경 변수로만 설정하세요.

```bash
npm run dev
```

기본 주소는 `http://localhost:3000`입니다. 포트를 바꾸려면 `PORT=4000 npm run dev`처럼 실행합니다.

## Vercel 배포

`api/index.js`가 Vercel 서버리스 함수 진입점입니다. `src/server.js`는 로컬 개발 서버를 시작할 때만 `listen()`을 호출하고, Vercel에서는 기본 export 함수가 요청을 처리합니다.

Vercel 프로젝트 환경 변수에 아래 값을 설정하세요.

```bash
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Vercel 설정에서 `src/server.js` 또는 `src/server.mjs`를 함수 진입점으로 직접 지정하지 마세요. 이 프로젝트는 `vercel.json`의 rewrite로 `/api/*` 요청을 `api/index.js`에 연결하고, `/logs/*` 같은 프론트엔드 경로는 `public/index.html`로 되돌립니다.

## 확인

```bash
npm run build
npm run typecheck
npm run lint
npm test
```

## 데이터

곡과 잔향 기록은 Supabase의 `songs`, `music_logs` 테이블에 저장됩니다. iTunes에서 선택한 곡은 `external_source + external_id`로 재사용해 중복 저장을 피하고, 직접 입력한 곡은 수동 곡으로 저장됩니다.
