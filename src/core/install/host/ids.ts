/**
 * THE HOST STEP IDS (terminal installer phase 4, 2026-10-12) — re-exported from
 * install_plan.ts, which OWNS them: the plan derives the step list, and it is
 * on the server's import closure, where host/** must never be (the privilege
 * gate). The ids are data; the steps (this directory) are not.
 */

export {
	ALL_STEP_IDS,
	type HostStepId,
	isInstallStepId,
	PRODUCTION_HOST_STEP_IDS,
	type ProductionHostStepId,
	STACK_HOST_STEP_IDS,
	type StackHostStepId,
	type StepId,
} from '../install_plan.ts';
