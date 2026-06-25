/**
 * Back-compat shim. The component value-save path (formerly input_text-only) was
 * generalized to component_number / component_date / component_text_area and to the
 * insert / remove changed_data actions — see ./save_component.ts. This module
 * re-exports the (renamed) entry point + types under their original names so existing
 * importers (read_handler, index, tests) keep working unchanged.
 */

export {
  saveComponent,
  saveInputText,
  UnsupportedSave,
  type SaveComponentRequest,
  type SaveComponentOptions,
  type SaveInputTextRequest,
  type SaveInputTextOptions,
  type SaveResult,
  type SaveSource,
  type SaveSessionInfo,
  type ChangedDataItem,
  type ChangedDataUpdate,
} from './save_component.ts';
