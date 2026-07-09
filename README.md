# AI Recipe (airecipe)

AI 셰프가 레시피·식단·영양 정보를 생성해주는 단일 페이지 웹앱입니다.
정적 `index.html` 하나로 동작하며, AI 호출은 Vercel 서버리스 함수(`api/generate.js`)를 통해 프록시합니다.

## 키 보관 방식 (중요)

- API 키는 **코드나 저장소에 절대 넣지 않습니다.** 키 값은 **Vercel 프로젝트 환경변수에만** 저장됩니다.
- 브라우저는 같은 도메인의 `/api/generate` 만 호출하고, Vercel 함수가 서버 측에서 키로 Google Gemini를 부릅니다.
- 따라서 키는 브라우저 번들이나 네트워크 응답에 절대 노출되지 않습니다.

```
브라우저(index.html) → POST /api/generate → Vercel 함수(process.env.GEMINI_API_KEY) → Google Gemini
```

## Vercel 배포

1. 이 저장소를 Vercel에 임포트합니다. (빌드 과정 없는 정적 사이트 + `api/` 서버리스 함수로 자동 인식됩니다.)
2. Vercel 프로젝트 → **Settings → Environment Variables** 에 다음을 추가합니다:
   - `GEMINI_API_KEY` — Google AI Studio 키 (https://aistudio.google.com/apikey)
   - (선택) `GEMINI_MODEL` — 기본값 `gemma-4-31b-it`
   - Environments: **Production** 과 **Preview** 모두 체크
3. 배포하면 끝. `index.html` 은 정적으로 서빙되고 `/api/generate` 는 함수로 동작합니다.

> 여러 앱에서 같은 키를 재사용하고 싶다면, Vercel 팀 설정의 **Shared Environment Variables** 로 키를 한 번만 만들고 각 프로젝트에 연결하면 매번 다시 입력할 필요가 없습니다.

## 로컬 개발

정적 페이지만 열어도 UI는 보이지만 AI 호출(`/api/generate`)을 로컬에서 쓰려면 Vercel CLI가 필요합니다.

```bash
cp .env.example .env.local   # .env.local 에 실제 키 입력 (git에 커밋 안 됨)
npx vercel dev               # /api/generate 를 로컬에서 실행
```
