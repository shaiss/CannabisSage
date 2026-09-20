#!/usr/bin/env bash
# Pack the CannabisSage MV3 extension for Chrome Web Store upload.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="${ROOT}/extension"
DIST_DIR="${ROOT}/dist"
MANIFEST="${EXT_DIR}/manifest.json"

if [[ ! -f "${MANIFEST}" ]]; then
  echo "error: missing ${MANIFEST}" >&2
  exit 1
fi

VERSION="$(python3 -c "import json; print(json.load(open('${MANIFEST}'))['version'])")"
NAME="cannabis-sage-${VERSION}"
OUT_ZIP="${DIST_DIR}/${NAME}.zip"

mkdir -p "${DIST_DIR}"
rm -f "${OUT_ZIP}"

# Validate required files exist before zipping.
required=(
  "${EXT_DIR}/manifest.json"
  "${EXT_DIR}/background.js"
  "${EXT_DIR}/content.js"
  "${EXT_DIR}/content.css"
  "${EXT_DIR}/icons/icon16.png"
  "${EXT_DIR}/icons/icon48.png"
  "${EXT_DIR}/icons/icon128.png"
)
for f in "${required[@]}"; do
  if [[ ! -f "${f}" ]]; then
    echo "error: required file missing: ${f}" >&2
    exit 1
  fi
done

# Zip contents at the archive root (not nested under extension/).
(
  cd "${EXT_DIR}"
  zip -r "${OUT_ZIP}" . \
    -x '.*' \
    -x '**/__MACOSX/**' \
    -x '**/.DS_Store'
)

echo "Packed ${OUT_ZIP}"
unzip -l "${OUT_ZIP}"
