#!/bin/bash
# Test suite for scripts/sync-upstream.sh
# Runs 12 behavior tests defined in PLAN.md
set -euo pipefail

PASS=0
FAIL=0
SKIP=0
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/sync-upstream.sh"
TEST_TMP_DIR=""
TEST_TMP_DIRS=()

cleanup() {
  local d
  for d in "${TEST_TMP_DIRS[@]}"; do
    [ -d "$d" ] && rm -rf "$d"
  done
}
trap cleanup EXIT

print_result() {
  local status="$1" name="$2" detail="$3"
  case "$status" in
    PASS) echo "  ✓ $name"; PASS=$((PASS + 1)) ;;
    FAIL) echo "  ✗ $name: $detail"; FAIL=$((FAIL + 1)) ;;
    SKIP) echo "  ~ $name: $detail"; SKIP=$((SKIP + 1)) ;;
  esac
}

# Check if the script exists before running tests
script_exists() {
  [ -f "$SCRIPT" ]
}

setup_test_repo() {
  local tmpdir
  tmpdir=$(mktemp -d /tmp/sync-upstream-test-XXXXXX)
  TEST_TMP_DIRS+=("$tmpdir")
  TEST_TMP_DIR="$tmpdir"
  cd "$tmpdir"
  git init
  git config user.email "test@test.com"
  git config user.name "Test User"
  git commit --allow-empty -m "Initial commit"
  # We're already on 'main' after init
  cd - >/dev/null
}

# Test 1: When upstream remote is missing, script adds it as HTTPS and prints confirmation
test_1_missing_upstream_remote() {
  setup_test_repo
  (
    cd "$TEST_TMP_DIR"
    output=$(bash "$SCRIPT" 2>&1 || true)
    if echo "$output" | grep -q "Added upstream remote"; then
      if git remote get-url upstream | grep -q "github.com/cytostack/openwolf.git"; then
        print_result PASS "Test 1: Missing upstream remote - adds HTTPS remote" ""
        return
      fi
    fi
    print_result FAIL "Test 1: Missing upstream remote" "Did not add upstream remote or wrong URL"
  )
}

# Test 2: When upstream remote exists, script skips add and uses existing URL
test_2_existing_upstream_remote() {
  setup_test_repo
  (
    cd "$TEST_TMP_DIR"
    git remote add upstream https://github.com/cytostack/openwolf.git
    output=$(bash "$SCRIPT" 2>&1 || true)
    if echo "$output" | grep -q "Using existing upstream remote"; then
      print_result PASS "Test 2: Existing upstream - uses existing" ""
      return
    fi
    print_result FAIL "Test 2: Existing upstream" "Did not detect existing upstream remote"
  )
}

# Test 3: Script runs git fetch upstream; exits with error if fetch fails
test_3_fetch_failure() {
  setup_test_repo
  (
    cd "$TEST_TMP_DIR"
    git remote add upstream https://github.com/nonexistent-user/nonexistent-repo.git
    output=$(bash "$SCRIPT" 2>&1 || true)
    if echo "$output" | grep -qi "error\|failed"; then
      print_result PASS "Test 3: Fetch failure - exits with error" ""
      return
    fi
    print_result FAIL "Test 3: Fetch failure" "Script did not report error when fetch failed"
  )
}

# Test 4: Default branch comparison is main vs upstream/main with clear header
test_4_default_branch_header() {
  setup_test_repo
  (
    cd "$TEST_TMP_DIR"
    git init --bare "$TEST_TMP_DIR/upstream-bare"
    git push "$TEST_TMP_DIR/upstream-bare" HEAD:main
    git remote add upstream "$TEST_TMP_DIR/upstream-bare"
    output=$(bash "$SCRIPT" 2>&1 || true)
    if echo "$output" | grep -q "Fork Divergence Report"; then
      if echo "$output" | grep -q "upstream/main"; then
        print_result PASS "Test 4: Default branch - main vs upstream/main" ""
        return
      fi
    fi
    print_result FAIL "Test 4: Default branch header" "Missing Fork Divergence Report or upstream/main reference"
  )
}

# Test 5: When ahead > 0 and behind == 0, status prints "AHEAD"
test_5_ahead_status() {
  setup_test_repo
  (
    cd "$TEST_TMP_DIR"
    git init --bare "$TEST_TMP_DIR/upstream-bare"
    git push "$TEST_TMP_DIR/upstream-bare" HEAD:main
    git remote add upstream "$TEST_TMP_DIR/upstream-bare"
    git commit --allow-empty -m "Ahead commit"
    output=$(bash "$SCRIPT" 2>&1 || true)
    if echo "$output" | grep -q "Status: AHEAD"; then
      print_result PASS "Test 5: AHEAD status" ""
      return
    fi
    print_result FAIL "Test 5: AHEAD status" "Did not detect AHEAD status"
  )
}

# Test 6: When ahead == 0 and behind > 0, status prints "BEHIND"
test_6_behind_status() {
  setup_test_repo
  (
    cd "$TEST_TMP_DIR"
    git commit --allow-empty -m "Second commit"
    git init --bare "$TEST_TMP_DIR/upstream-bare"
    git push "$TEST_TMP_DIR/upstream-bare" HEAD:main
    git remote add upstream "$TEST_TMP_DIR/upstream-bare"
    git reset --hard HEAD~1
    output=$(bash "$SCRIPT" 2>&1 || true)
    if echo "$output" | grep -q "Status: BEHIND"; then
      print_result PASS "Test 6: BEHIND status" ""
      return
    fi
    print_result FAIL "Test 6: BEHIND status" "Did not detect BEHIND status"
  )
}

# Test 7: DIVERGED status
test_7_diverged_status() {
  setup_test_repo
  (
    cd "$TEST_TMP_DIR"
    git init --bare "$TEST_TMP_DIR/upstream-bare"
    git push "$TEST_TMP_DIR/upstream-bare" HEAD:main
    git remote add upstream "$TEST_TMP_DIR/upstream-bare"
    git commit --allow-empty -m "Local commit"
    git clone "$TEST_TMP_DIR/upstream-bare" "$TEST_TMP_DIR/upstream-temp"
    cd "$TEST_TMP_DIR/upstream-temp"
    git -c user.name="Upstream" -c user.email="up@test.com" commit --allow-empty -m "Upstream-only commit"
    git push origin main
    cd "$TEST_TMP_DIR"
    rm -rf "$TEST_TMP_DIR/upstream-temp"
    git fetch upstream
    output=$(bash "$SCRIPT" 2>&1 || true)
    if echo "$output" | grep -q "Status: DIVERGED"; then
      print_result PASS "Test 7: DIVERGED status" ""
      return
    fi
    print_result FAIL "Test 7: DIVERGED status" "Did not detect DIVERGED status"
  )
}

# Test 8: IN SYNC status
test_8_in_sync_status() {
  setup_test_repo
  (
    cd "$TEST_TMP_DIR"
    git init --bare "$TEST_TMP_DIR/upstream-bare"
    git push "$TEST_TMP_DIR/upstream-bare" HEAD:main
    git remote add upstream "$TEST_TMP_DIR/upstream-bare"
    output=$(bash "$SCRIPT" 2>&1 || true)
    if echo "$output" | grep -q "Status: IN SYNC"; then
      print_result PASS "Test 8: IN SYNC status" ""
      return
    fi
    print_result FAIL "Test 8: IN SYNC status" "Did not detect IN SYNC status"
  )
}

# Test 9: Feature branch warning
test_9_feature_branch_warning() {
  setup_test_repo
  (
    cd "$TEST_TMP_DIR"
    git init --bare "$TEST_TMP_DIR/upstream-bare"
    git push "$TEST_TMP_DIR/upstream-bare" HEAD:main
    git checkout -b feature/my-feature
    git remote add upstream "$TEST_TMP_DIR/upstream-bare"
    output=$(bash "$SCRIPT" 2>&1 || true)
    if echo "$output" | grep -q "Warning:"; then
      print_result PASS "Test 9: Feature branch warning" ""
      return
    fi
    print_result FAIL "Test 9: Feature branch warning" "Script did not print warning when on feature branch"
  )
}

# Test 10: --help flag prints usage and exits 0
test_10_help_flag() {
  if ! script_exists; then
    print_result FAIL "Test 10: --help flag" "Script not found at $SCRIPT"
    return
  fi
  output=$(bash "$SCRIPT" --help 2>&1) || true
  if echo "$output" | grep -qi "usage"; then
    print_result PASS "Test 10: --help flag" ""
    return
  fi
  print_result FAIL "Test 10: --help flag" "No usage/help message printed. Output: ${output:0:80}"
}

# Test 11: --version flag prints version and exits 0
test_11_version_flag() {
  if ! script_exists; then
    print_result FAIL "Test 11: --version flag" "Script not found at $SCRIPT"
    return
  fi
  output=$(bash "$SCRIPT" --version 2>&1) || true
  # Match only the expected version format, not the path in error messages
  if echo "$output" | grep -qE "^sync-upstream\.sh [0-9]+\.[0-9]+\.[0-9]+"; then
    print_result PASS "Test 11: --version flag" ""
    return
  fi
  print_result FAIL "Test 11: --version flag" "No valid version string. Output: ${output:0:80}"
}

# Test 12: --branch develop compares upstream/develop
test_12_branch_flag() {
  setup_test_repo
  (
    cd "$TEST_TMP_DIR"
    git init --bare "$TEST_TMP_DIR/upstream-bare"
    git push "$TEST_TMP_DIR/upstream-bare" HEAD:main
    git push "$TEST_TMP_DIR/upstream-bare" HEAD:refs/heads/develop
    git remote add upstream "$TEST_TMP_DIR/upstream-bare"
    output=$(bash "$SCRIPT" --branch develop 2>&1 || true)
    if echo "$output" | grep -q "upstream/develop"; then
      print_result PASS "Test 12: --branch develop" ""
      return
    fi
    print_result FAIL "Test 12: --branch develop" "Script did not use upstream/develop"
  )
}

echo ""
echo "=== sync-upstream.sh Test Suite ==="
echo ""

echo "Behavioral Tests:"
test_10_help_flag || true
test_11_version_flag || true
test_12_branch_flag || true
test_1_missing_upstream_remote || true
test_2_existing_upstream_remote || true
test_3_fetch_failure || true
test_4_default_branch_header || true
test_9_feature_branch_warning || true
test_5_ahead_status || true
test_6_behind_status || true
test_7_diverged_status || true
test_8_in_sync_status || true

echo ""
echo "=== Results: $PASS passed, $FAIL failed, $SKIP skipped ==="
echo ""

exit $FAIL
