// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/

/**
 * ORT SMOKE MODEL — the in-memory model behind the client suite `test_ort_smoke`.
 *
 * The smallest model transformers.js will load through `AutoModel`: a
 * `wespeaker-resnet` config (a plain single-session model — its forward is just
 * "run model.onnx with the inputs it names") over a one-node ONNX graph,
 * `last_hidden_state = Add(input_features, input_features)`, float32 [1, 4].
 *
 * Built in memory, never committed: the repo holds this encoder (first-party
 * source), not model bytes, so there is nothing for the third-party census to
 * flag and nothing to keep in sync. Hand-encoded in protobuf wire format
 * (onnx.proto field numbers) — no onnx toolchain anywhere.
 */

/** The model id the suite asks transformers.js for. */
export const ORT_SMOKE_MODEL_ID = 'ort_smoke';

/** The model card: names an architecture so the library takes its plain single-session path. */
export const ORT_SMOKE_CONFIG = { model_type: 'wespeaker-resnet' };

// --- protobuf wire format (varint = 0, length-delimited = 2) ---------------------
const varint = (n) => {
	const out = [];
	let v = n;
	while (v > 0x7f) {
		out.push((v & 0x7f) | 0x80);
		v = Math.floor(v / 128);
	}
	out.push(v);
	return out;
};
const key = (field, wire) => varint((field << 3) | wire);
const int = (field, value) => [...key(field, 0), ...varint(value)];
const bytes = (field, body) => [...key(field, 2), ...varint(body.length), ...body];
const str = (field, s) => bytes(field, [...new TextEncoder().encode(s)]);

// --- onnx.proto messages (field numbers from onnx/onnx.proto) ---------------------
const FLOAT = 1; // TensorProto.DataType.FLOAT

/** ValueInfoProto{ name=1, type=2: TypeProto{ tensor_type=1: { elem_type=1, shape=2 } } } */
const value_info = (name, dims) => {
	const shape = dims.flatMap((d) => bytes(1, int(1, d))); // TensorShapeProto.dim{ dim_value=1 }
	const tensor_type = [...int(1, FLOAT), ...bytes(2, shape)];
	return [...str(1, name), ...bytes(2, bytes(1, tensor_type))];
};

/**
 * BUILD_ORT_SMOKE_MODEL
 * @returns {Uint8Array} the ONNX ModelProto bytes (179 bytes)
 */
export const build_ort_smoke_model = () => {
	const input = 'input_features';
	const output = 'last_hidden_state';
	const dims = [1, 4];
	// NodeProto{ input=1, output=2, name=3, op_type=4 }
	const node = [
		...str(1, input),
		...str(1, input),
		...str(2, output),
		...str(3, 'add'),
		...str(4, 'Add'),
	];
	// GraphProto{ node=1, name=2, input=11, output=12 }
	const graph = [
		...bytes(1, node),
		...str(2, 'ort_smoke'),
		...bytes(11, value_info(input, dims)),
		...bytes(12, value_info(output, dims)),
	];
	// ModelProto{ ir_version=1, producer_name=2, graph=7, opset_import=8: { domain=1, version=2 } }
	return new Uint8Array([
		...int(1, 8),
		...str(2, 'dedalo test_ort_smoke'),
		...bytes(7, graph),
		...bytes(8, [...str(1, ''), ...int(2, 13)]),
	]);
};
