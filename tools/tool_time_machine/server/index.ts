/**
 * tool_time_machine server module — restore earlier component values.
 *
 * apply_value: WRITE. Requires level >= 2 on the target (section_tipo + tipo).
 * bulk_revert_process: WRITE (section/level 2). Undo a whole bulk_process_id
 *   batch (per-row re-gated); each matched component is reverted to its pre-batch
 *   value under a fresh bulk id (so the revert is revertible).
 * isAvailable: hidden on component_relation_children callers (PHP is_available),
 * relocated here from the core registry fallback.
 */

import type { ToolServerModule } from '../../../src/core/tools/module.ts';
import { toolTimeMachineBulkRevert } from './bulk_revert.ts';
import { toolTimeMachineApplyValue } from './tool_time_machine.ts';

export const tool: ToolServerModule = {
	name: 'tool_time_machine',
	apiActions: {
		apply_value: { permission: 'tipo', minLevel: 2, handler: toolTimeMachineApplyValue },
		bulk_revert_process: { permission: 'section', minLevel: 2, handler: toolTimeMachineBulkRevert },
	},
	isAvailable: (context) => context.callerModel !== 'component_relation_children',
};
