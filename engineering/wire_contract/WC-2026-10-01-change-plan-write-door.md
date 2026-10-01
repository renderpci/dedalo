# WC-2026-10-01-change-plan-write-door — the assistant's change-plan validator asks the write door

- **Date:** 2026-10-01 (closure Step 3, integrator request 7).
- **Decision:** closure Step 3 (WRITE-DOOR, WC-2026-09-30-write-door). Code:
  `src/ai/agent/change_plan.ts` (`validateChangePlan` → `authorizeOp`).
- **Doors:** `dd_mcp_api` `agent_chat` / `agent_chat_stream` (a write-mode proposal is
  validated before the human sees it) and `agent_apply` (the plan is re-validated before
  it runs).
- **Shape before:** the validator kept a private, weaker copy of the door: a `section_id`
  that was not a number skipped the scope check; a fractional id was floored; an op
  without `field` (`dedalo_save_component`'s `tipo`, delete, duplicate, create,
  find_or_create's match fields) was judged on the raw section level only — no component
  pair, no consultation cap; scope was asked as a read. Such a plan was shown to the human
  as valid and then failed at apply (or, where a tool's own gate was weaker, ran).
- **Shape after:** every op is authorized by THE WRITE DOOR its tool asks at apply, at
  write level 2 — a component op through `authorizeRecordAccess` (grammar, section floor
  1, the dd128-aware pair, the write scope with the non-positive-id refusal ahead of the
  admin bypass), a whole-record op through `authorizeSectionRecord`, a create (and every
  find_or_create match/set field) through `authorizeSectionTarget` (consultation-capped);
  an op on a record the plan itself creates (`{ref}`) is asked its section / pair now and
  the full door at apply. Refusals carry the door's codes (`perm.denied`,
  `perm.out_of_scope`, `request.invalid`) with the op as the `op_id` extension key. A
  write tool with no target rule is refused (`request.invalid`), never validated.
- **Reason:** the human confirms what will run; a preview weaker than the door confirms
  plans the door refuses, and a plan validator is a door.
- **Gate reconciliation:** no parity fixture covers the change-plan protocol; no
  re-harvest. Gate: `test/unit/change_plan_write_door_native.test.ts` (5 of its legs red at
  d724c8851d; each refusal has a served CONTROL twin).
