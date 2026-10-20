# Blogauto Naver - Web Demo

네이버 블로그 자동화 도구 (Blogauto Naver)의 웹 데모 버전입니다.

> **중요**: 이 웹 버전은 데모/시뮬레이션 모드입니다. 실제 네이버/티스토리 발행, 세션 확인, 이미지 생성 등은 Electron 데스크톱 앱([boksajang/blogauto-naver](https://github.com/boksajang/blogauto-naver))에서 사용하세요. 이 웹 버전은 UI와 워크플로를 미리 확인하고 테스트할 수 있도록 만들어졌습니다.

## 주요 기능 (데모)

- **계정 관리**: 여러 네이버 계정과 Blog ID 등록 및 선택
- **카테고리 관리**: 계정별 카테고리, 검색 키워드, 제외 주제, 발행 목적, 톤, 최신성 수준 설정
- **작업 입력**: 수동/자동 발행 방식 선택, 주제, 공개설정, 예약 발행 설정
- **Agent 모델 설정**: Codex, Main, Research/Title, Writer, Image Worker 모델 선택
- **본문 생성 시뮬레이션**: 더미 제목과 본문 생성, 미리보기
- **이미지 미리보기 시뮬레이션**: 타이틀 이미지 및 본문 섹션 이미지 가상 생성
- **로그 스트림**: Main / Research / Writer 에이전트별 로그 확인
- **작업 이력**: 최근 작업 상태, 토큰 사용량, 실패 사유 확인
- **티스토리 테스트 발행 시뮬레이션**

## 사용 방법

1. 이 저장소를 클론하거나 ZIP으로 다운로드합니다.
2. `index.html` 파일을 브라우저에서 엽니다.
3. 계정을 추가하고 카테고리를 등록한 후 "작업 시작" 버튼을 클릭하면 데모가 실행됩니다.

## 원본 프로젝트

이 웹 데모는 다음 저장소를 기반으로 제작되었습니다:

- [boksajang/blogauto-naver](https://github.com/boksajang/blogauto-naver) — Electron 기반 네이버/티스토리 블로그 자동화 데스크톱 앱

실제 발행 기능을 사용하려면 원본 저장소의 Electron 앱을 설치하세요:

```bash
git clone https://github.com/boksajang/blogauto-naver.git
cd blogauto-naver
npm install
npm start
```

## 라이선스

MIT