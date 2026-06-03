// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


// imports
import { pipeline, TextStreamer } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

const MODEL_ID = 'onnx-community/translategemma-text-4b-it-ONNX';
const MAX_NEW_TOKENS = 1024;


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
	.then(function(translator) {

		const messages = [
			{
				role	: 'user',
				content	: [
					{
						type				: 'text',
						source_lang_code	: options.sourceLangCode || 'en',
						target_lang_code	: options.targetLangCode || 'es',
						text				: options.sourceText
					}
				]
			}
		];

		const streamer = new TextStreamer(translator.tokenizer, {
			skip_prompt: true,
			skip_special_tokens: true,
			callback_function: (text) => {
				self.postMessage({
					status	: 'on_chunk',
					data	: text
				});
			}
		});

		return translator(messages, {
			max_new_tokens	: MAX_NEW_TOKENS,
			do_sample		: false,
			streamer		: streamer
		});
	})
	.then(function(output) {

		const generated_text = output[0].generated_text;
		const last_message = generated_text[generated_text.length - 1];
		const translated_text = last_message.content;

		self.postMessage({ status: 'end', data: translated_text });
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


// @license-end
