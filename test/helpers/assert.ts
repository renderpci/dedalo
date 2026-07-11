/**
 * Narrowing assert for optional lookups in tests.
 *
 * With `noUncheckedIndexedAccess`, indexing a Record (e.g. a tool module's
 * `apiActions`) yields `T | undefined`. Tests that go on to call the handler
 * or read spec fields need a real runtime guard, not a non-null cast — a
 * missing action is itself a test failure and must fail loud.
 */
export function mustGet<T>(value: T | null | undefined, label: string): T {
	if (value === null || value === undefined) {
		throw new Error(`expected ${label} to be defined`);
	}
	return value;
}
