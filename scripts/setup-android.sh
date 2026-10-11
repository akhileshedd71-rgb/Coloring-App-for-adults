#!/usr/bin/env bash
# Linux x64 Android build prerequisites. TLS and downloaded checksums stay enabled.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/android-env.sh"
mkdir -p "$MUSEMALLOW_TOOLS_DIR/downloads" "$ANDROID_HOME/cmdline-tools" "$ANDROID_USER_HOME" "$GRADLE_USER_HOME"
if ! command -v javac >/dev/null 2>&1 || ! javac -version 2>&1 | rg -q '^javac 21\.'; then
  curl -fL --retry 3 https://download.oracle.com/java/21/latest/jdk-21_linux-x64_bin.tar.gz -o "$MUSEMALLOW_TOOLS_DIR/downloads/jdk.tar.gz"
  curl -fL --retry 3 https://download.oracle.com/java/21/latest/jdk-21_linux-x64_bin.tar.gz.sha256 -o "$MUSEMALLOW_TOOLS_DIR/downloads/jdk.sha256"
  python3 - "$MUSEMALLOW_TOOLS_DIR" <<'PY'
import hashlib, pathlib, sys, tarfile
root = pathlib.Path(sys.argv[1]); archive = root / 'downloads/jdk.tar.gz'
expected = (root / 'downloads/jdk.sha256').read_text().strip().split()[0]
assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected, 'JDK checksum mismatch'
with tarfile.open(archive) as tar:
    folder = tar.getnames()[0].split('/')[0]
    tar.extractall(root, filter='data')
link = root / 'jdk'
if link.is_symlink(): link.unlink()
if not link.exists(): link.symlink_to(folder)
PY
  export JAVA_HOME="$MUSEMALLOW_TOOLS_DIR/jdk"
  export PATH="$JAVA_HOME/bin:$PATH"
fi
if [ ! -x "$ANDROID_HOME/cmdline-tools/19.0/bin/sdkmanager" ]; then
  curl -fL --retry 3 https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip -o "$MUSEMALLOW_TOOLS_DIR/downloads/cmdline-tools-19.zip"
  python3 - "$MUSEMALLOW_TOOLS_DIR/downloads/cmdline-tools-19.zip" "$ANDROID_HOME/cmdline-tools" <<'PY'
import hashlib, pathlib, sys, zipfile
archive, target = map(pathlib.Path, sys.argv[1:])
# Google's repository2-3.xml checksum for command-line tools 19.0.
assert hashlib.sha1(archive.read_bytes()).hexdigest() == '5fdcc763663eefb86a5b8879697aa6088b041e70', 'Android CLI checksum mismatch'
with zipfile.ZipFile(archive) as zip: zip.extractall(target)
(target / 'cmdline-tools').rename(target / '19.0')
for executable in (target / '19.0/bin').iterdir(): executable.chmod(0o755)
PY
fi
# Java does not automatically use HTTPS_PROXY or the Linux system CA store.
# Record only non-secret host/port and trust-store paths in local Gradle settings.
python3 - "$GRADLE_USER_HOME" <<'PY'
import os, pathlib, sys, urllib.parse
target = pathlib.Path(sys.argv[1]) / 'gradle.properties'
lines = target.read_text().splitlines() if target.exists() else []
properties = {'org.gradle.daemon': 'false', 'org.gradle.workers.max': '4'}
if pathlib.Path('/etc/ssl/certs/java/cacerts').exists():
    properties['systemProp.javax.net.ssl.trustStore'] = '/etc/ssl/certs/java/cacerts'
proxy = urllib.parse.urlsplit(os.environ.get('HTTPS_PROXY', os.environ.get('https_proxy', '')))
if proxy.hostname:
    for protocol in ['http', 'https']:
        properties[f'systemProp.{protocol}.proxyHost'] = proxy.hostname
        properties[f'systemProp.{protocol}.proxyPort'] = str(proxy.port or 80)
lines = [line for line in lines if line.split('=', 1)[0] not in properties]
target.write_text('\n'.join(lines + [f'{key}={value}' for key, value in properties.items()]) + '\n')
PY
SDK_OPTIONS=()
if [ -n "${HTTPS_PROXY:-${https_proxy:-}}" ]; then
  read -r PROXY_HOST PROXY_PORT < <(python3 - <<'PY'
import os, urllib.parse
p = urllib.parse.urlsplit(os.environ.get('HTTPS_PROXY', os.environ.get('https_proxy', '')))
print(p.hostname, p.port or 80)
PY
  )
  SDK_OPTIONS=(--proxy=http "--proxy_host=$PROXY_HOST" "--proxy_port=$PROXY_PORT")
fi
if [ -f /etc/ssl/certs/java/cacerts ]; then
  export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts"
fi
# Finite input accepts SDK licenses noninteractively without masking sdkmanager's status.
python3 -c 'print("y\n" * 200)' | sdkmanager --sdk_root="$ANDROID_HOME" "${SDK_OPTIONS[@]}" --licenses
sdkmanager --sdk_root="$ANDROID_HOME" "${SDK_OPTIONS[@]}" 'platform-tools' 'platforms;android-35' 'build-tools;34.0.0' 'build-tools;35.0.0'
javac -version
printf 'Android build tools are installed. Source scripts/android-env.sh for direct native commands.\n'
