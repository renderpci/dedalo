// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

const MODEL_ID			= 'onnx-community/translategemma-text-4b-it-ONNX';
const MAX_NEW_TOKENS	= 1024;


self.onmessage = async (e) => {

	const options = e.data.options

	pipeline('text-generation', MODEL_ID, {
		device	: options.device || 'webgpu',
		dtype	: 'q4',

		progress_callback: ({ progress, status, file }) => {
			self.postMessage({
				status	: 'init',
				data	: { progress, status, device: options.device, file }
			});
		}
	})
	.then(async function(translator) {

		const blocks		= options.blocks;
		let accumulated	= '';

		for (let i = 0; i < blocks.length; i++) {

			try {

				const translated = await translateText(
					translator,
					blocks[i],
					options.sourceLangCode || 'en',
					options.targetLangCode || 'es'
				);
				console.log('translated:', translated);
				accumulated += translated;

				self.postMessage({
					status	: 'on_chunk',
					data	: accumulated
				});

			} catch (err) {

				self.postMessage({
					status	: 'error',
					data	: JSON.stringify({
						message	: err?.message || '',
						block	: i + 1,
						total	: blocks.length
					})
				});
				return;
			}
		}

		self.postMessage({ status: 'end', data: accumulated });
	})
	.catch(function(error) {

		self.postMessage({
			status	: 'error',
			data	: JSON.stringify({
				message	: error?.message || '',
				name	: error?.name || error?.constructor?.name || '',
				stack	: error?.stack || '',
				raw		: String(error)
			})
		});
	});
}


async function translateText(translator, text, sourceLangCode, targetLangCode) {

	const messages = [
		{
			role	: 'user',
			content	: [
				{
					type				: 'text',
					source_lang_code	: sourceLangCode,
					target_lang_code	: targetLangCode,
					text				: `
					CRITICAL RULE — PRESERVE PLACEHOLDERS EXACTLY:
					The text contains placeholders like {P1}, {P2}, {P3}, etc.
					- DO NOT modify, translate, move, add, or remove any character inside them.
					- DO NOT change { } to < > or any other symbols.
					- Output them **verbatim** (exactly as they appear in the input).
					- Treat them as opaque tokens — as if they were a single invisible character.
					- They ALWAYS start with { followed by a letter P, followed by digits, followed by }.
					- Treat them as invisible anchors — they are not text, do not touch them.
					Examples:
					Input:  "<p>Hola{P5} ¿como estás{P2}{P3}?</p>"
					Output: "<p>Hello{P5} how are you{P2}{P3}?</p>"

					Input:  "<p>{P1}{P2}Gracias por tu{P3} \"tiempo{p18}\"{P4}.{P68}{p108}</p>{P10}<p>Saludos</p>"
					Output: "<p>{P1}{P2}Thank for your{P3} \"time{p18}\"{P4}.{P68}{p108}</p>{P10}<p>Regards</p>"

					Input: "<p>.{P424}{P102}{P749}Buenos días, Carme. Muchas gracias...{P750}&nbsp;</p>"
					Output: "<p>.{P424}{P102}{P749}Good morning, Carme. Thank you very much...{P750}&nbsp;</p>"

					TASK: Translate the text from ${sourceLangCode} to ${targetLangCode}.
					- Only translate text, never placeholders or HTML tags.
					- Don't use markdown syntax.
					- Test your output: Before returning your answer, verify that every {PN} from the input appears  **identically** in the output.
					
					\n\nText to translate:${text}`
				}
			]
		}
	];

	const output			= await translator(messages, {
		max_new_tokens	: MAX_NEW_TOKENS,
		do_sample		: false
	});
	console.log('output:----------->>', output);
	const generated_text	= output[0].generated_text;
	const last_message		= generated_text[generated_text.length - 1];

	return last_message.content;
}


// @license-end