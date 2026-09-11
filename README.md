# unbg studio

디자이너를 위한 브라우저 배경 제거 작업 공간. [unbg](https://github.com/privatenumber/unbg)의 difference matting으로 같은 피사체의 서로 다른 단색 배경 이미지 두 장에서 투명 PNG를 복원합니다.

## 사용하기

1. 같은 크기·위치의 피사체를 흰색/검정 등 서로 다른 단색 배경 위에 준비합니다.
2. 이미지들을 한 번에 선택하거나 미리보기 영역에 드롭합니다.
3. `flower-white.png` / `flower-black.png`는 자동으로 연결합니다. `light/dark`, `bg1/bg2`, `a/b`, `흰색/검정` 접미사도 지원합니다. 나머지는 파일명 자연 정렬 후 2장씩 연결하므로 A/B 원본을 확인합니다.
4. 잘못 연결되거나 빠진 이미지는 A/B 슬롯을 눌러 교체합니다.
5. 선택한 쌍을 변환하고 PNG 개별 저장, 선택 ZIP, 완료 전체 ZIP으로 가져갑니다.

`예제로 시작하기`로 설치나 파일 준비 없이 테스트할 수 있습니다. 파일 한 장만으로 배경을 추측하는 AI 누끼 도구는 아닙니다.

## 모든 unbg 옵션

| 원본 옵션 | 화면 | 기본값 |
| --- | --- | --- |
| `background1` | 배경 A 자동 감지 / HEX·RGB 직접 입력 / 컬러피커 | 네 모서리 자동 감지 |
| `background2` | 배경 B 자동 감지 / HEX·RGB 직접 입력 / 컬러피커 | 네 모서리 자동 감지 |
| `channelThreshold` | 채널 임계값, 숫자·슬라이더 | 10 (0–255) |
| `floor` | 투명도 하한 | 0 (0–1) |
| `ceiling` | 투명도 상한 | 1 (0–1) |
| `crop` 없음 | 원본 크기 유지 | 기본 |
| `crop: true` | 자동으로 여백 자르기 (`cropContent`) | 경계 가시 픽셀 밀도 1% |
| `crop: number` | 투명도 기준으로 자르기 (`cropTransparent`) | 선택 시 0.02 (0–1) |
| CLI `--output` | 선택한 쌍 저장 이름 + 공통 접미사 | `이름-transparent.png` |

변환 옵션은 전체 쌍에 적용되며 수정하면 기존 결과를 무효화합니다. 저장 이름과 접미사 변경은 이미 만든 결과를 유지합니다. 중복 이름은 번호를 붙여 ZIP에서도 덮어쓰지 않습니다. 감지된 배경색, 색 거리, 잘림 시작 임계값, 출력 크기와 용량을 표시합니다.

## 데이터와 비용

- 서버 함수, 이미지 업로드, 데이터베이스, AI API, 외부 폰트, 분석 SDK를 사용하지 않습니다.
- `unbg/core@1.1.0`를 번들에 포함하고 Web Worker 안에서 디코딩·배경 제거·PNG 인코딩을 수행합니다.
- 한 번에 한 쌍만 처리하며 완료·실패·중지 후 worker를 종료합니다. ZIP도 로컬에서 만듭니다.
- 원본·결과는 탭의 메모리에만 있습니다. 새로고침·탭 닫기 전에 저장하세요. 삭제 시 Blob URL을 해제합니다.
- 개인 GitHub 비공개 저장소. 저장소 비공개와 사이트 접근 권한은 별개이며, 배포 URL은 접속 가능합니다.
- Vercel 개인 **Hobby**에 정적 배포합니다. 사용자가 개인·비상업 용도를 확인했습니다. 무료 플랜 한도에 종속되며 트래픽·배포 한도 초과 시 제한될 수 있습니다. 유료 플랜·부가 기능·도메인은 활성화하지 않습니다.
- 호스팅 제공자는 사이트 파일을 전달하기 위한 일반적인 접속 메타데이터를 처리할 수 있지만, 이미지 콘텐츠는 앱에서 전송하지 않습니다.

## 로컬 개발

Node 24 LTS, pnpm 10.33.4 사용.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm build
pnpm preview
```

React + TypeScript + Vite. 한국어 단일 언어 UI이며 PO 카탈로그를 사용하는 앱이 아닙니다. [구현 계약](docs/spec.md)을 참고하세요.

## 제한

- 작업 공간당 50쌍 / 100파일, 원본 합계 300 MB, 파일당 20 MB, 이미지당 1,600만 픽셀.
- PNG, JPG/JPEG, 정적 WebP 입력. 투명한 원본과 애니메이션 WebP는 거부합니다. PNG가 가장 적합합니다.
- 브라우저의 Canvas·createImageBitmap·Web Worker·OffscreenCanvas 지원이 필요합니다. 최신 데스크톱 브라우저를 권장합니다. 큰 배치는 기기 메모리에 따라 나누어 처리하세요.
- 원본 크기를 유지하지만, 8-bit RGBA Canvas 경로이므로 원본 EXIF/ICC 프로파일·16-bit 정밀도를 보존하지 않습니다.
- 자동 자르기는 가시 픽셀이 드문 경계를 잘라낼 수 있습니다. 미리보기를 확인하거나 원본 크기를 유지하세요.

## 배포

개인 Vercel scope `frontleejonghuns-projects`에 연결합니다. `vercel.json`에 Vite 정적 빌드, 캐시·보안 헤더가 정의되어 있습니다. `.env`와 비밀키는 필요하지 않습니다. GitHub 연동 후 main push가 배포를 트리거합니다.

라이브러리 저작권 고지는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 포함되어 있습니다.
