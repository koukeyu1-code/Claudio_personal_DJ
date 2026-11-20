#!/bin/bash
# 从 mac/ 源码构建 Claudio.app（默认输出到仓库上级目录的 live 位置）
# 用法: bash mac/build.sh [目标App路径]
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
TARGET_APP="${1:-$(dirname "$(dirname "$HERE")")/Claudio.app}"
OUT="$TARGET_APP/Contents"
mkdir -p "$OUT/MacOS" "$OUT/Resources"
cp "$HERE/Info.plist" "$OUT/Info.plist"
cp "$HERE/AppIcon.icns" "$OUT/Resources/"
swiftc -O -swift-version 5 -import-objc-header "$HERE/AutoplayShim.h" \
  -module-cache-path /tmp/swift-modulecache \
  "$HERE/AutoplayShim.m" "$HERE/ClaudioRadio.swift" -o "$OUT/MacOS/radio-window"
echo "已构建: $TARGET_APP"
