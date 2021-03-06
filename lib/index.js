

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

// Acyclic graph support

// labels are unique per operation -- compose must ensure no collisions
// {c:n, a:label} => cut -- must be combined with a paste
// {p:n, r:label} => paste -- must be combined with a cut
// Note: label and ref need to be part of cut and paste for invert
// {r:label} => ref -- push location onto stack (or object -- apply specific)
// {a:label} => zero width label (sticks to the next character)

// Usage

// {a:1}{i:{type:'item' .. will be given id}},....,{r:1},{i:{attrib:'key'}}
// Apply would know that attrib 'key' pops 1 ref off the ref stack and uses
// it as the attribute value.
// We can also have a many dimensional version like
// {a:1}{i:{type:'dimension'}},...,{a:2},{i:{type:item}},..{r:1},{r:2},{i:{attrib:'key2'}}
// Which would pop 2 keys off the ref stack.
// It is then model specific what they do with those keys

// .... can be string or object
var RETAIN = 'retain';
var REMOVE = 'remove';
var INSERT = 'insert';
var CUT    = 'cut';
var PASTE  = 'paste';
var REF    = 'ref';
var LABEL  = 'label';

function optype(op) {
	if (typeof op === 'number') return RETAIN;
	if (op.i !== undefined) return INSERT;
	if (op.c !== undefined) return CUT;
	if (op.p !== undefined) return PASTE;
	if (op.r !== undefined) return REF;
	if (op.a !== undefined) return LABEL;
	if (op.d !== undefined) return REMOVE;
	throw "Unknown operation";
}

module.exports = function(model) {
	function create(data) {
		if (typeof data === 'string') data = JSON.parse(data);
		return data === undefined ? null : deserialize(data); //just in case we are given JSON
	}

	function apply(snapshot, op) {
		return model.apply(snapshot, op);
	}

	function _slice(op, s, e) {
		//TODO CUT/PASTE ETC
		if (typeof op === 'number') {
			//retain
			return (e === undefined ? op : e) - s;
		} else if (op.i !== undefined) {
			//insert
			if (typeof op.i === 'string')
				return {i:op.i.slice(s,e)};
			return op;
		} else if (op.d !== undefined) {
			//delete
			if (typeof op.d === 'string')
				return {d:op.d.slice(s,e)};
			return op;
		}
	}

	function _type(op) {
		if (typeof op === 'number') return 'retain';
		if (typeof op.i === 'string') return 'insert';
		if (typeof op.d === 'string') return 'remove';
		return 'object'; //Basically all non composable types
		//NOTE: cannot compose a pair of cuts because the
		//      pastes might not be together
	}

	function _push(ops, op) {
		if (ops.length > 0) {
			var nt = _type(op);
			var ot = _type(ops[ops.length - 1]);
			if (nt === ot && nt !== 'object') {
				var oop = ops.pop();
				switch(nt) {
					case 'retain':
						op = op + oop;
						break;
					case 'remove':
						op = {d:(oop.d + op.d)};
						break;
					case 'insert':
						op = {i:(oop.i + op.i)};
						break;
				}
			}
		}
		return ops.push(op);
	}

	function _n(op) {
		if (typeof op === 'number') return op;
		if (op.c !== undefined) return op.c;
		if (op.p !== undefined) return op.p;
		if (op.r !== undefined) return 0;
		if (op.a !== undefined) return 0;
		var str_or_obj = (op.i !== undefined) ? op.i : op.d;
		return (typeof str_or_obj === 'string') ? str_or_obj.length : 1;
	}

	function _makeTake(ops) {
		//TODO: CUT PASTE ETC
		var offset = 0;
		var ia = 0;
	
		function take(n, indivisableField) {
			if (ia === ops.length)
				return n === -1 ? null : n;
	
			var part;
			var c = ops[ia];
			if (n === -1 || _n(c) - offset <= n ||
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
		//TODO CUT PASTE ETC
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
					_push(newOps, chunk); //append(chunk);
					if (typeof chunk === 'number') {
						length -= chunk;
					} else if (chunk.d !== undefined) {
						length -= (typeof chunk.d === 'string') ? chunk.d.length : 1;
					}
				}
			} else if (opo.i !== undefined) {
				if (left && (peek()).i !== undefined) {
					_push(newOps, take(-1)); //left insert goes first;
				}
				_push(newOps, (typeof opo.i === 'string') ? opo.i.length : 1); //skip the inserted text/obj
			} else if (opo.d !== undefined) {
				length = (typeof opo.d === 'string') ? opo.d.length : 1;
				while (length > 0) {
					chunk = take(length, 'i'); // don't split insert
					if (typeof chunk === 'number') {
						length -= chunk;
					} else if (chunk.i !== undefined) {
						_push(newOps, chunk);
					} else if (chunk.d !== undefined) {
						length -= (typeof chunk.d === 'string') ? chunk.d.length : 1;
					}
				}
			}
		}

		while ((chunk = take(-1)))
			_push(newOps, chunk);

		return newOps;
	}

	function compose(op1, op2) {
		//TODO CUT PASTE REF ETC
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
				length = opo;
				while (length > 0) {
					chunk = take(length, 'd'); // don't split delete
					_push(newOps, chunk); //append(chunk);
					//length -= targetLength
					if (typeof chunk === 'number') {
						length -= chunk;
					} else if (chunk.i !== undefined) {
						length -= (typeof chunk.i === 'string') ? chunk.i.length : 1;
					}
				}
			} else if (opo.i !== undefined) {
				_push(newOps, opo)
			} else if (opo.d !== undefined) {
				length = (typeof opo.d === 'string') ? opo.d.length : 1;
				var s = 0;
				while (length > 0) {
					chunk = take(length, 'd'); // don't split insert
					if (typeof chunk === 'number') {
						//append part of the delete...
						_push(newOps, _slice(opo, s, s + chunk));
						length -= chunk;
						s += chunk;
					} else if (chunk.i !== undefined) {
						var n = (typeof chunk.i === 'string') ? chunk.i.length : 1;
						length -= n;
						s += n;
					} else if (chunk.d !== undefined) {
						_push(newOps, chunk);
					}
				}
			}
		}
	
		while ((chunk = take(-1)))
			_push(newOps, chunk);
	
		return newOps;
	}

	function invert(ops) {
		return ops.map(_invert);
	}

	function _invert(op) {
		//return op^(-1) TODO
		if (typeof op === 'number') return op;
		if (op.i !== undefined) return {d:op.i};
		if (op.c !== undefined) return {p:op.c, r:op.a};
		if (op.p !== undefined) return {c:op.p, a:op.r};
		if (op.d !== undefined) return {i:op.d};
		return op; //LABEL or REF are own invert
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
		transformCursor: transformCursor,
		optype: optype,
		optypes: {
			RETAIN: RETAIN,
			REMOVE: REMOVE,
			INSERT: INSERT,
			CUT:    CUT,
			PASTE:  PASTE,
			REF:    REF,
			LABEL:  LABEL
		}
	};
};