

//model must expose
//  .apply(doc, op) -> doc (where doc can be null)
//  .fromJSON(json) -> doc
//  .transformCursor(cursor, op, isOwnOp)
//  
//  the doc must expose
//  .toJSON

//Operations

// number => retain
// {d:....} => remove
// {i:....} => insert

// .... can be string or object


module.export = function(model) {
	function create(data) {
		return data === undefined ? null : data;
	}

	function apply(snapshot, op) {
		return model.apply(snapshot, op);
	}

	function transform(op1, op2, side) {
		//return op1' TODO
	}

	function compose(op1, op2) {
		//return op TODO
	}

	function invert(ops) {
		return ops.map(_invert);
	}

	function _invert(op) {
		//return op^(-1) TODO
		if (typeof op === 'number') return op;
		if (op.i) return {d:op.i};
		return {i:op.d}; //assuming delete
	}

	function serialize(snapshot) 
	{
		return snapshot === null ? null : snapshot.toJSON();
	}

	function deserialize(data) 
	{
		if (data === 'null') return null;
		return model.fromJSON(data);
	}

	function transformCursor(cursor, op, isOwnOp)
	{
		return model.transformCursor(cursor, op, isOwnOp);
	}

	return {
		name: 'slate',
		uri: 'http://clay3.com/types/slatev0',
		create: create,
		apply: apply,
		transform: transform,
		compose: compose,
		invert: invert,
		serialize: serialize,
		deserialize: deserialize,
		transformCursor: transformCursor
	};
};