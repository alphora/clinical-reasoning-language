// REFACTOR:grounded: this entry point runs the current pin/mode/draft contract in owned browser fixtures.
// No CDP-enabled user window is required. Set CRL_TEST_STORAGE_ROOT to override workspace scratch storage.
require('./runDecisionTableControlTests.cjs')();
