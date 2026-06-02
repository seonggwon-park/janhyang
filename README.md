# 잔향

감정으로 남기는 음악 기록장.

잔향은 마음에 오래 남은 노래와 그 순간의 감정을 기록하는 작은 개인 음악 다이어리입니다. 짧은 감정은 잔향으로, 더 긴 감상은 여음으로 남깁니다. 노래는 iTunes Search API로 검색하거나 직접 입력할 수 있고, 저장된 기록은 로그인한 사용자 본인에게만 보입니다.

## 첫 버전 범위

- 홈
- 이메일/비밀번호 로그인과 회원가입
- 짧은 잔향 작성
- 긴 여음 작성
- iTunes Search API 기반 곡 검색
- 직접 곡 입력
- 감정 태그
- 내 잔향 목록
- 내 여음 목록
- 잔향 상세
- 여음 상세

## 제외한 것

- 음악 스트리밍
- 추천
- 플레이리스트 생성
- 좋아요, 댓글, 팔로워, 랭킹
- 재생 UI

## Supabase 설정

1. Supabase 프로젝트를 만듭니다.
2. Authentication > Providers에서 Email provider를 켭니다.
3. Supabase SQL editor에서 `supabase/schema.sql`을 실행합니다.
4. `.env.example`을 참고해 `.env` 또는 배포 환경 변수에 값을 설정합니다.
5. 로컬 서버를 실행합니다.

필요한 환경 변수:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY`는 서버에서만 사용합니다. 브라우저 코드나 공개 클라이언트에 노출하지 마세요.

```bash
npm run dev
```

기본 주소는 `http://localhost:3000`입니다. 포트를 바꾸려면 `PORT=4000 npm run dev`처럼 실행합니다.

## Auth와 데이터 소유권

`music_logs`와 `music_reflections`에는 `user_id`가 있으며 Supabase Auth의 `auth.users(id)`를 참조합니다. 새 잔향과 여음은 서버가 현재 access token을 확인한 뒤 해당 사용자의 `user_id`로 저장합니다.

두 사용자 기록 테이블에는 RLS가 켜져 있고, 인증된 사용자는 자기 `user_id`와 일치하는 기록만 select, insert, update, delete 할 수 있습니다. `songs`는 사용자별 감상이 아니라 공유 곡 메타데이터로 유지합니다.

이미 배포된 DB에 `user_id` 없는 기존 잔향이 있다면 스키마 실행 후 RLS 때문에 보이지 않습니다. 가짜 사용자 id를 만들지 말고, 필요한 경우 실제 사용자에게 수동으로 이관하거나 삭제한 뒤 `user_id`를 `not null`로 강제하세요.

## Vercel 배포

`api/index.js`가 Vercel 서버리스 함수 진입점입니다. `src/server.js`는 로컬 개발 서버로 직접 실행될 때만 `listen()`을 호출하고, Vercel에서는 기본 export 함수가 요청을 처리합니다.

Vercel 프로젝트 환경 변수에 아래 값을 설정하세요.

```bash
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Vercel 설정에서 `src/server.js` 또는 `src/server.mjs`를 함수 진입점으로 직접 지정하지 마세요. `vercel.json`이 `/api/*` 요청은 `api/index.js`로, `/logs/*`, `/reflections/*`, `/records`, `/login`, `/signup` 같은 프론트엔드 라우트는 `public/index.html`로 연결합니다.

## 확인

```bash
npm run build
npm run typecheck
npm run lint
npm test
```

## 데이터

곡 메타데이터는 Supabase `songs` 테이블에 저장됩니다. iTunes에서 선택한 곡은 `external_source + external_id`로 재사용해 중복 저장을 피하고, 직접 입력한 곡은 수동 곡으로 저장합니다. 짧은 잔향은 `music_logs`, 긴 여음은 `music_reflections` 테이블에 사용자별로 저장됩니다.
