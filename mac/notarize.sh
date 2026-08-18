#!/bin/bash
# 서명 → 애플 공증 → 스테이플까지. 이걸 거쳐야 내려받은 앱이 더블클릭으로 열린다.
#
# build.sh 의 임시(ad-hoc) 서명으로는 안 된다. 임시 서명은 "누가 만들었는지"가 없어서
# Gatekeeper 가 막고, macOS 15 부터는 우클릭 → 열기 우회도 사라졌다.
#
# 처음 한 번만 (webswing 과 같은 프로필을 그대로 쓴다):
#   xcrun notarytool store-credentials webswing-notary \
#     --apple-id "..." --team-id "7A77FCP9H4" --password "앱 암호"
#
# 쓰기:  ./mac/notarize.sh
set -euo pipefail

cd "$(dirname "$0")/.."
IDENTITY="${1:-Developer ID Application: JooWon Koh (7A77FCP9H4)}"
PROFILE="${2:-webswing-notary}"
APP="dist/mac/Sneaky Baseball.app"
ZIP="dist/SneakyBaseball-mac.zip"

if ! security find-identity -v -p codesigning | grep -q "$IDENTITY"; then
    echo "인증서가 없습니다: $IDENTITY" >&2
    echo "쓸 수 있는 것:" >&2
    security find-identity -v -p codesigning | grep "Developer ID Application" >&2 || echo "  (없음)" >&2
    exit 1
fi

./mac/build.sh

echo "› Developer ID 로 서명"
# 공증에는 하ardened runtime 이 필요하고, 인증서가 만료돼도 서명이 살아 있으려면 timestamp 가 필요하다.
# --deep 은 쓰지 않는다 — 애플이 권하지 않고, 번들 안에 따로 서명할 코드가 없다(바이너리 하나 + web/).
codesign --force --options runtime --timestamp --sign "$IDENTITY" "$APP"
codesign --verify --strict --verbose=2 "$APP"

echo "› 서명한 걸로 다시 압축"
rm -f "$ZIP"
mkdir -p dist
ditto -c -k --keepParent "$APP" "$ZIP"

echo "› 애플에 제출 (보통 몇 분)"
xcrun notarytool submit "$ZIP" --keychain-profile "$PROFILE" --wait

# 스테이플은 공증 티켓을 번들 안에 박아 둔다 — 처음 여는 맥이 오프라인이어도 열린다.
echo "› 스테이플"
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"

echo "› 스테이플한 걸로 다시 압축"
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"

echo "› Gatekeeper 가 보는 대로 검증"
spctl --assess --type execute --verbose=4 "$APP"

du -h "$ZIP" | awk '{print "› " $1 "  " $2}'
echo "› 끝났습니다 — 더블클릭으로 열립니다"
