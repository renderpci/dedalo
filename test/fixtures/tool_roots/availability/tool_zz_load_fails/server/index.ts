// Fixture for tool_availability_native.test.ts: a server module that throws at
// import (stands in for a missing dependency), so the loader records a failed load.
throw new Error('tool_zz_load_fails: deliberate import failure (fixture)');
