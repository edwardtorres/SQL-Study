#!/usr/bin/env bash
set -euo pipefail

# Run from the repository root after npm ci. This prepares Debian trixie's
# unprivileged cloud host; CI instead uses playwright install --with-deps.
if [[ ! -f package.json || ! -d node_modules/playwright-core ]]; then
  echo 'Run this from the repository root after npm ci.' >&2
  exit 1
fi

# System paths are standard OS inputs, not machine-specific checkout paths.
source /etc/os-release
if [[ "${ID:-}" != debian || "${VERSION_CODENAME:-}" != trixie || "$(dpkg --print-architecture)" != amd64 ]]; then
  echo 'This user-space library setup supports Debian trixie amd64 only.' >&2
  echo 'On other systems, use Playwright install-deps with administrator access.' >&2
  exit 1
fi

PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install webkit

mkdir -p .cache/apt/lists/partial .cache/apt/cache/archives/partial \
  .cache/apt/config.d .cache/webkit-libs/downloads
cat > .cache/apt/sources.list <<'EOF'
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie main
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie-updates main
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://security.debian.org/debian-security trixie-security main
EOF

# APT_CONFIG is read first. Isolate sources, indexes, cache and config fragments
# so no system configuration, package state or root-only cleanup hook is changed.
cat > .cache/apt/apt.conf <<EOF
Dir::Etc::Parts "$PWD/.cache/apt/config.d";
Dir::Etc::Main "/dev/null";
Dir::Etc::sourcelist "$PWD/.cache/apt/sources.list";
Dir::Etc::sourceparts "-";
Dir::State::lists "$PWD/.cache/apt/lists";
Dir::Cache "$PWD/.cache/apt/cache";
Acquire::Retries "1";
EOF

export APT_CONFIG="$PWD/.cache/apt/apt.conf"
apt-get update
packages=(
  libgtk-4-1 libgraphene-1.0-0 libharfbuzz-icu0 libmanette-0.2-0 libhyphen0
  libgles2 libcairo-script-interpreter2 libhidapi-hidraw0 liblzo2-2
)
checkout="$PWD"
for package in "${packages[@]}"; do
  version=$(LC_ALL=C apt-cache policy "$package" | awk '/Candidate:/ {print $2}')
  if [[ -z "$version" || "$version" == '(none)' ]]; then
    echo "No signed repository candidate for $package" >&2
    exit 1
  fi
  mkdir -p ".cache/webkit-libs/downloads/$package"
  (
    cd ".cache/webkit-libs/downloads/$package"
    apt-get download "$package=$version"
    found=false
    for archive in *.deb; do
      if [[ "$(dpkg-deb -f "$archive" Package)" == "$package" && \
            "$(dpkg-deb -f "$archive" Version)" == "$version" ]]; then
        dpkg-deb -x "$archive" "$checkout/.cache/webkit-libs/root"
        found=true
        break
      fi
    done
    if [[ "$found" != true ]]; then
      echo "Downloaded archive not found for $package=$version" >&2
      exit 1
    fi
  )
done

browser_root=$(PLAYWRIGHT_BROWSERS_PATH=0 node --input-type=module - <<'JS'
import { dirname } from 'node:path';
import { webkit } from 'playwright';
console.log(dirname(webkit.executablePath()));
JS
)

# The downloaded MiniBrowser wrapper resets LD_LIBRARY_PATH. Add dependency
# links to its supported sys/lib directory; never overwrite browser artifacts.
python3 - "$browser_root" <<'PY'
from pathlib import Path
import os
import subprocess
import sys

root = Path(sys.argv[1])
libraries = Path('.cache/webkit-libs/root/usr/lib/x86_64-linux-gnu').resolve()
missing = []
added = 0
for variant in ('minibrowser-gtk', 'minibrowser-wpe'):
    base = root / variant
    target = base / 'sys/lib'
    if not target.is_dir():
        raise SystemExit(f'Unsupported Playwright browser layout: {variant}')
    for library in libraries.glob('*.so*'):
        link = target / library.name
        if not link.exists() and not link.is_symlink():
            link.symlink_to(library)
            added += 1
    for binary in [base / 'bin/MiniBrowser', *list((base / 'lib').glob('*.so*'))]:
        result = subprocess.run(
            ['ldd', str(binary)], text=True, capture_output=True,
            env={**os.environ, 'LD_LIBRARY_PATH': f'{base}/lib:{target}'},
        )
        if result.returncode != 0:
            raise SystemExit(f'Linker inspection failed for {binary.name}')
        missing.extend(line.strip() for line in result.stdout.splitlines() if 'not found' in line)
if missing:
    raise SystemExit('Missing runtime libraries: ' + '; '.join(sorted(set(missing))))
print(f'Added {added} dependency links; actual linker checks have zero unresolved dependencies.')
PY

# The system-cache preflight uses ldconfig, which does not see user-space libs.
# Skip only that preflight AFTER actual linker verification, then prove that the
# real browser launches and renders. TLS/signatures/checksums remain enabled.
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 PLAYWRIGHT_BROWSERS_PATH=0 \
  node --input-type=module - <<'JS'
import { webkit } from 'playwright';
const browser = await webkit.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<title>WebKit dependency smoke</title><h1>Ready</h1>');
  if (await page.title() !== 'WebKit dependency smoke') throw new Error('WebKit did not render the smoke page');
  console.log(`WebKit ${browser.version()} launched and rendered successfully.`);
} finally {
  await browser.close();
}
JS

echo 'Local WebKit ready. For browser checks on this host, use:'
echo 'PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npm run spike:webkit'
echo 'PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npm run test:e2e'
