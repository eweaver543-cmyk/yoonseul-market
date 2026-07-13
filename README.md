# Yoonseul Market

윤슬마켓 쇼핑몰 + 관리자 백오피스 통합 서버입니다.

## 주요 기능

- 사용자 쇼핑몰: 상품 목록, 브랜드 필터, 상품 상세, 장바구니, 찜하기, 주문/결제, 마이페이지
- 관리자 페이지: 브랜드/카테고리/상품/주문/회원/리뷰/배너/프로모션/문의/결제 수단 관리
- 이미지 업로드: 로컬/실서버 공통 `multipart/form-data` 업로드
- 이미지 최적화: 서버에서 `sharp`로 WebP 자동 변환, 최대 가로폭/품질 환경변수 제어
- 업로드 이미지 보관: `/uploads/products/...` URL로 쇼핑몰/상세페이지에 안전하게 렌더링
- 관리자 동시 로그인: 같은 관리자 계정으로 여러 PC/브라우저에서 동시 작업 가능

## 로컬 실행

```bash
npm install
npm start
```

주소:

- 홈페이지: http://localhost:3000
- 관리자: http://localhost:3000/admin
- 헬스체크: http://localhost:3000/api/health

관리자 계정은 코드에 저장하지 않습니다. 실행 전에 반드시 환경변수로 설정하세요.

## 필수 환경변수

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

ADMIN_EMAIL=your-admin@example.com
ADMIN_PASSWORD=use-a-long-unique-password
ADMIN_SESSION_SECRET=use-at-least-32-random-characters-here
ADMIN_SESSION_TTL_HOURS=24

MAX_BODY_MB=120
MAX_UPLOAD_MB=80
IMAGE_MAX_WIDTH=1800
IMAGE_WEBP_QUALITY=82

DATA_DIR=/data/yoonseul/data
UPLOAD_DIR=/data/yoonseul/uploads
```

## Zeabur 배포 요약

1. 이 폴더를 GitHub 저장소에 push합니다.
2. Zeabur에서 `New Project` → `Deploy from GitHub`를 선택합니다.
3. 윤슬마켓 GitHub 저장소를 연결합니다.
4. 환경변수를 `.env.example` 기준으로 입력합니다.
5. 가능하면 Zeabur Volume을 추가하고 아래 경로에 연결합니다.
   - `/data/yoonseul/data`
   - `/data/yoonseul/uploads`
6. 배포 후 `/api/health`가 `ok: true`를 반환하면 정상입니다.

## 이미지 업로드 구조

- 브라우저의 `C:\fakepath\...` 값은 저장하지 않습니다.
- 관리자 페이지에서 이미지 파일을 선택하면 서버 API `/api/admin/uploads`로 업로드됩니다.
- 서버가 이미지를 WebP로 압축/최적화한 뒤 `/uploads/products/파일명.webp` 경로를 반환합니다.
- 상품 데이터에는 로컬 파일 경로가 아니라 이 URL만 저장됩니다.
- 따라서 로컬과 Zeabur 실서버 모두 같은 방식으로 이미지가 표시됩니다.

## 배포 파일

- `Dockerfile`: Docker 기반 Zeabur 배포용
- `zbpack.json`: Zeabur Node 빌드/시작 명령 고정용
- `.env.example`: Zeabur 환경변수 복사용
- `.dockerignore`: 빌드 제외 파일 관리
- `.gitignore`: Git 제외 파일 관리

## GitHub 푸시 예시

```bash
git init
git add .
git commit -m "Deploy Yoonseul Market"
git branch -M main
git remote add origin https://github.com/YOUR_ID/YOUR_REPOSITORY.git
git push -u origin main
```
