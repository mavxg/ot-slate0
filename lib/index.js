

//model must expose
//  .apply(doc, op) -> doc (where doc can be null)
//  .fromJSON(json) -> doc
//  .transformCursor(cursor, op, isOwnOp)
//  
//  the doc must expose
//  .toJSON

// usage (client side)
// var sharejs = require('share').client;
// var slate_type = require('ot-slate0')(model);
// sharejs.registerType(slate_type);

// usage (server side)
// livedb.ot.registerType(slate_type);

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

	function _slice(op, s, e) {
		if (typeof op === 'number') {
			//retain
			return (e === undefined ? op : e) - s;
		} else if (op.i !== undefined) {
			//insert
			if (typeof op.i === 'string')
				return {i:op.i.slice(s,e)};
			return op;
		} else {
			//delete
			if (typeof op.d === 'string')
				return {d:op.d.slice(s,e)};
			return op;
		}
	}

	function _makeTake(ops) {
		var offset = 0;
		var ia = 0;
	
		function take(n, indivisableField) {
			if (ia === ops.length)
				return n === -1 ? null : n;
	
			var part;
			var c = ops[ia];
			if (n === -1 || c.n - offset <= n ||
			   ((c.i !== undefined) && indivisableField === 'i') ||
			   ((c.d !== undefined) && indivisableField === 'd')) {
				part = _slice(c, offset);
				++ia;
				offset = 0;
				return part;
			} else {
				part = _slice(c, offset, offset + n);
				offset += n;
				return part;
			}
		}
	
		function peek() {
			return ops[ia];
		}
	
		return {
			take: take,
			peek: peek,
		};
	}

	function transform(op1, op2, side) {
		var left = side === 'left';
		var newOps = [];

		var chunk;
		var length;
		var opo;

		var tp = _makeTake(op1);
		var take = tp.take;
		var peek = tp.peek;

		for (var i = 0; i < op2.length; i++) {
			opo = op2[i];
			if (typeof opo === 'number') {
				length = opo;
				while (length > 0) {
					chunk = take(length, 'i'); // don't split insert
					newOps.push(chunk); //append(chunk);
					if (typeof chunk === 'number') {
						length -= chunk;
					} else if (chunk.d !== undefined) {
						length -= (typeof chunk.d === 'string') ? chunk.d.length : 1;
					}
				}
			} else if (opo.i !== undefined) {
				if (left && (peek()).i !== undefined) {
					newOps.push(take(-1)); //left insert goes first;
				}
				newOps.push((typeof opo.i === 'string') ? opo.i.length : 1); //skip the inserted text/obj
			} else if (opo.d !== undefined) {
				length = (typeof opo.d === 'string') ? opo.d.length : 1;
				while (length > 0) {
					chunk = take(length, 'i'); // don't split insert
					if (typeof chunk === 'number') {
						length -= chunk;
					} else if (chunk.i !== undefined) {
						newOps.push(chunk);
					} else if (chunk.d !== undefined) {
						length -= (typeof chunk.d === 'string') ? chunk.d.length : 1;
					}
				}
			}
		}

		while ((chunk = take(-1)))
			newOps.push(chunk);

		return newOps;
	}

	function compose(op1, op2) {
		//return ops
		var newOps = [];

		var chunk;
		var length;
		var opo;
	
		var tp = _makeTake(op1);
		var take = tp.take;
		var peek = tp.peek;
		
		for (var i = 0; i < op2.length; i++) {
			opo = op2[i];
			if (typeof opo === 'number') {
				length = opo.n;
				while (length > 0) {
					chunk = take(length, 'd'); // don't split delete
					newOps.push(chunk); //append(chunk);
					//length -= targetLength
					if (typeof chunk === 'number') {
						length -= chunk;
					} else if (chunk.i !== undefined) {
						length -= (typeof chunk.i === 'string') ? chunk.i.length : 1;
					}
				}
			} else if (opo.i !== undefined) {
				newOps.push(opo)
			} else if (opo.d !== undefined) {
				length = (typeof opo.d === 'string') ? opo.d.length : 1;
				var s = 0;
				while (length > 0) {
					chunk = take(length, 'd'); // don't split insert
					if (typeof chunk === 'number') {
						//append part of the delete...
						newOps.push(_slice(opo, s, s + chunk));
						length -= chunk;
						s += chunk;
					} else if (chunk.i !== undefined) {
						var n = (typeof chunk.i === 'string') ? chunk.i.length : 1;
						length -= n;
						s += n;
					} else if (chunk.d !== undefined) {
						newOps.push(chunk);
					}
				}
			}
		}
	
		while ((chunk = take(-1)))
			newOps.push(chunk);
	
		return newOps;
	}

	function invert(ops) {
		return ops.map(_invert);
	}

	function _invert(op) {
		//return op^(-1) TODO
		if (typeof op === 'number') return op;
		if (op.i !== undefined) return {d:op.i};
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
		name: 'slate0',
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