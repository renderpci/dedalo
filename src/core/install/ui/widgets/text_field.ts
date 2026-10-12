/**
 * A TEXT QUESTION (terminal installer phase 3, 2026-10-12) — one editable
 * line, pre-filled with what plain mode's Enter would take (the shared
 * `suggested` rule), submitted by Enter or Tab through the SAME answer rule as
 * plain mode (`-` empties an optional field, an emptied field takes the
 * suggestion). Shift-Tab is the previous question, Esc the previous screen.
 *
 * `typedYes` (the Review's "Install now"): the word `yes` must be typed, as in
 * plain mode — anything else declines.
 */

import { BACK, FIELD_BACK, type Nav, suggested, textAnswerOf } from '../../prompter_contract.ts';
import type { Question } from '../../screen_model.ts';
import { seg } from '../styled.ts';
import { editKey, editOf, editText, type FieldEdit, pasteInto } from '../view_state.ts';
import type { DrawContext, Widget } from '../widget.ts';
import {
	boxWidth,
	descriptionLines,
	errorLines,
	FIELD_KEYS,
	labelSeg,
	valueBox,
} from './field_parts.ts';

export interface TextFieldOptions {
	/** Answer `true` only for a typed `yes` (the install itself). */
	typedYes?: boolean;
}

/** The answer a submitted field gives. */
function submitted(question: Question, text: string, typedYes: boolean): string | boolean {
	if (typedYes) return text.trim() === 'yes';
	return textAnswerOf(text.trim(), question, suggested(question));
}

export function textField(
	question: Question,
	done: (answer: string | boolean | Nav) => void,
	options: TextFieldOptions = {},
): Widget {
	const typedYes = options.typedYes === true;
	let edit: FieldEdit = editOf(typedYes ? '' : suggested(question));
	const submit = (): void => done(submitted(question, editText(edit), typedYes));
	const NAV: Readonly<Record<string, () => void>> = {
		enter: submit,
		tab: submit,
		'shift-tab': () => done(FIELD_BACK),
		esc: () => done(BACK),
	};
	return {
		id: question.id,
		kind: 'text',
		editing: true,
		placement: 'field',
		title: question.label,
		label: question.label,
		description: question.description,
		lines: (ctx: DrawContext) => {
			const description = descriptionLines(question, ctx.width, ctx.layout.descLines);
			const row = [
				labelSeg(question.label, 'accent'),
				...valueBox(editText(edit), edit.caret, boxWidth(ctx.width)),
			];
			const hint = typedYes ? [[seg('type yes and press enter to start the install', 'warn')]] : [];
			return {
				lines: [...description, row, ...errorLines(question, ctx.width), ...hint],
				focus: description.length,
			};
		},
		keys: () => FIELD_KEYS,
		onKey: (name: string) => {
			const nav = NAV[name];
			if (nav !== undefined) return nav();
			edit = editKey(edit, name) ?? edit;
		},
		onPaste: (text: string) => {
			edit = pasteInto(edit, text);
		},
		pending: () => ({ id: question.id, kind: 'text', value: editText(edit) }),
	};
}
