#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
flutter create --platforms=android --org id.ac.unira --project-name ruangku .
dart run tool/patch_manifest.dart
flutter pub get
