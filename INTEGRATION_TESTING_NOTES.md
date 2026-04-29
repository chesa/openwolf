# Integration Testing Notes

## Decision: Unit Tests Over Integration Tests

### Context

During the worktree fixes implementation, we considered adding integration tests that would:
1. Test the full hook lifecycle (session-start → file operations → stop)
2. Verify worktree isolation behavior end-to-end
3. Validate error recovery across multiple hooks

### Why We Chose Unit Tests

**1. Module Initialization Side Effects**
- OpenWolf hooks call `process.exit()` in their `main()` functions
- Importing hook modules in tests triggers this initialization
- This causes unhandled error warnings in Vitest even when the exit is mocked
- Makes integration tests noisy and hard to maintain

**2. Complex Setup Requirements**
- Integration tests need to mock git commands extensively
- Require careful environment variable management
- Need to manage temporary directory lifecycles
- Add significant complexity without proportional value

**3. Excellent Unit Test Coverage Already Exists**

The implementation includes 15 focused unit tests that cover:

| File | Tests | Coverage |
|------|-------|----------|
| `session-start.test.ts` | 2 | Ledger initialization with all Lifetime fields |
| `status.test.ts` | 2 | Missing field handling with ?? 0 fallbacks |
| `stop.test.ts` | 2 | Error recovery with try/finally |
| `shared.test.ts` | 9 | Worktree detection, path resolution, session dir creation |

These tests verify:
- ✅ Complete ledger schema initialization
- ✅ Defensive fallbacks for missing fields
- ✅ Error handling and recovery
- ✅ Worktree-local .wolf directory resolution
- ✅ Session directory creation
- ✅ OPENWOLF_WRITE_MAIN environment variable behavior
- ✅ Main repo vs worktree routing

### Manual/End-to-End Testing Recommendations

For integration-level validation, we recommend:

1. **Manual Testing Script**
```bash
# Test worktree workflow
git worktree add ../my-feature feat/branch
cd ../my-feature
# Verify .wolf/ is created locally, not in main repo
ls -la .wolf/
# Run some Claude Code operations
# Verify token-ledger.json exists in worktree .wolf/
```

2. **End-to-End Test Suite**
For a proper E2E test suite, consider:
- Spawning Claude Code as a subprocess
- Using real git worktrees
- Testing actual hook execution via Claude's hook system
- Validating file system state after operations

3. **Smoke Test Command**
```bash
# Quick verification
node dist/hooks/session-start.js && \
node dist/hooks/stop.js && \
echo "Hook lifecycle completed successfully"
```

### Conclusion

**Unit tests provide better:**
- Isolation and clarity
- Faster execution
- Easier debugging
- More precise failure messages

**Integration scenarios are better tested via:**
- Manual workflow validation
- End-to-end tests with real processes
- Production monitoring and error reporting

The current test suite provides comprehensive coverage of all critical paths without the maintenance burden of complex integration tests.
