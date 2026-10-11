#!/usr/bin/env bash
# Source this file before direct Gradle/adb commands. Existing tool locations win.
export MUSEMALLOW_TOOLS_DIR="${MUSEMALLOW_TOOLS_DIR:-/workspace/tools}"
if [ -z "${JAVA_HOME:-}" ] && [ -d "$MUSEMALLOW_TOOLS_DIR/jdk" ]; then
  export JAVA_HOME="$MUSEMALLOW_TOOLS_DIR/jdk"
fi
export ANDROID_HOME="${ANDROID_HOME:-$MUSEMALLOW_TOOLS_DIR/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-$MUSEMALLOW_TOOLS_DIR/android-user}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$MUSEMALLOW_TOOLS_DIR/gradle-home}"
export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/19.0/bin:$PATH"
