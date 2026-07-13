# 윤슬마켓 Zeabur 실서버 배포 가이드

## 1. GitHub 저장소 준비

현재 폴더가 Git 저장소가 아니라면 아래 명령을 실행합니다.

```bash
git init
git add .
git commit -m "Initial Yoonseul Market production deploy"
git branch -M main
git remote add origin https://github.com/YOUR_ID/YOUR_REPOSITORY.git
git push -u origin main
```

이미 GitHub 저장소가 있다면 `remote add origin`의 URL만 실제 저장소 주소로 바꾸면 됩니다.

## 2. Zeabur 프로젝트 연결

1. Zeabur Dashboard 접속
2. `New Project`
3. `Deploy from GitHub`
4. 윤슬마켓 GitHub 저장소 선택
5. Root Directory는 기본값 `.` 유지
6. Zeabur가 Dockerfile 또는 Node.js 설정을 감지하여 배포합니다.

## 3. Zeabur 환경변수

Zeabur 서비스의 Variables에 아래 값을 입력합니다.

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

ADMIN_EMAIL=eweaver543@gmail.com
ADMIN_PASSWORD=aa030456
ADMIN_SESSION_SECRET=please-change-this-to-a-long-random-secret
ADMIN_SESSION_TTL_HOURS=24

MAX_BODY_MB=120
MAX_UPLOAD_MB=80
IMAGE_MAX_WIDTH=1800
IMAGE_WEBP_QUALITY=82

DATA_DIR=/data/yoonseul/data
UPLOAD_DIR=/data/yoonseul/uploads
```

`ADMIN_SESSION_SECRET`는 반드시 길고 랜덤한 문자열로 바꾸는 것을 권장합니다.

## 4. 이미지/DB 영구 저장 볼륨 설정

상품 이미지와 DB를 컨테이너 재배포 후에도 유지하려면 Zeabur Volume을 연결하세요.

권장 Mount Path:

```text
/data/yoonseul
```

앱 내부 사용 경로:

```text
DATA_DIR=/data/yoonseul/data
UPLOAD_DIR=/data/yoonseul/uploads
```

처음 배포 시 GitHub에 포함된 `data/db.json`과 `public/uploads/products` 이미지로 시작할 수 있습니다. 이후 관리자에서 새로 업로드한 이미지는 `UPLOAD_DIR`에 저장됩니다.

## 5. 배포 확인 주소

배포 완료 후 아래 주소를 확인합니다.

```text
https://YOUR-ZEABUR-DOMAIN/api/health
```

정상 응답 예:

```json
{
  "ok": true,
  "env": "production"
}
```

## 6. 관리자 로그인

```text
https://YOUR-ZEABUR-DOMAIN/admin
```

관리자 계정은 환경변수의 `ADMIN_EMAIL`, `ADMIN_PASSWORD` 값을 사용합니다.

같은 관리자 계정으로 여러 PC/브라우저에서 동시에 로그인할 수 있습니다.

## 7. 이미지 업로드 작동 방식

- 대표 이미지 최대 10장
- 상세 이미지 최대 20장
- 업로드 즉시 서버에 전송
- 서버에서 WebP 자동 최적화
- 상품 데이터에는 `/uploads/products/...webp` URL 저장
- 로컬/Zeabur 모두 동일하게 렌더링

## 8. 배포 전 로컬 점검

```bash
npm install
npm run check
npm start
```

브라우저에서 확인:

- http://localhost:3000
- http://localhost:3000/admin
- http://localhost:3000/api/health

