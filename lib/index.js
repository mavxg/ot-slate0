

//model must expose
//  .apply(doc, op) -> doc (where doc can be null)
//  .fromJSON(json) -> doc
//  .transformCursor(cursor, op, isOwnOp)
//  
//  the doc must expose
//  .toJSON

// usage (client side)
// var sharejs = require('share').client;
// var slate_type = require('ot-slate0');
// sharejs.registerType(slate_type);

// usage (server side)
// livedb.ot.registerType(slate_type);

//Operations

// number => retain
// {d:....} => remove
// str or obj => insert



//NOTE: type spec has _type not type which is a model element. 
//They must be different

// Model
// {type:"typename", attr:{...}, nodes:[...]}
// {tag:"tagname", ... attibutes ...}
// {end:"tagname"}

var RETAIN = 'retain';
var REMOVE = 'remove';
var INSERT = 'insert';

var slate = {
	name: 'slate0',
	uri: 'http://qubic.io/types/slatev0',
};

function optype(op) {
	if (typeof op === 'number') return RETAIN;
	if (op.d !== undefined) return REMOVE;
	return INSERT;
}

slate.create = function(data) {
	return data === undefined ?
	{type:"document", id: 1, seed:1, nodes:[], length:1} : data;
}

//Inverted levels from earlier version
var levels = {
	'document': 0,
	'row': 2,
	'cell': 3
};
//everything else is level 1

function level(obj) {
	if (obj._type)
		return (levels[obj._type] !== undefined) ? levels[obj._type] : 1;
	if (obj.type)
		return (levels[obj.type] !== undefined) ? levels[obj.type] : 1;
	return 1000000; //text, widgets, and tags
}

function prefix(doc, start, end, expandAll, _lvl, _lin) {
	var lin = _lin || [];
	var lvl = _lvl;
	var ourLvl = level(doc);

	//return whole object if we can
	if (!expandAll && lvl <= ourLvl && start <= 0 && end > doc.length) {
		lin.push(doc);
		return doc;
	}
	if (end > 0 && start <= 0)
		lin.push({_type:doc.type, id:doc.id, attr:doc.attr});
	var offset = 1;
	var cl;
	var s;
	for (var i = 0; i < doc.nodes.length; i++) {
		var child = doc.nodes[i];
		cl = child.length || 1;
		if (start < offset + cl && end > offset) {
			s = (start > offset) ? start - offset : 0;
			if (child.type !== undefined) {
				prefix(child, s, end - offset, expandAll, lvl, lin);
				lvl = ourLvl; //set the level so future children
				              //don't get flattened
			} else if (typeof child === 'string') {
				//string
				lin.push(child.slice(s, end - offset));
			} else {
				lin.push(child); //probably a tag or widget
			}
		}
		offset += cl;
	};
	return lin;
}

slate.prefix = prefix;

slate.apply = function(doc, ops) {
	var seed = doc.seed || 0;
	var offset = 0;
	var _level = 0;
	var lin;
	var stack = [];
	var stacks = [];
	var tags = [];

	function startTag(tag) {
		var st = tag.tag;
		var old_tags = tags;
		tags = [tag];
		for (var i = old_tags.length - 1; i >= 0; i--) {
			var t = old_tags[i];
			if (t.tag === st)
				throw "Nested tag: " + st;
			else
				tags.push(t);
		};
	}

	function endTag(tag) {
		var et = tag.end;
		var old_tags = tags;
		tags = [];
		for (var i = old_tags.length - 1; i >= 0; i--) {
			var t = old_tags[i];
			if (t.tag !== et)
				tags.push(t);
		};
		if (tags.length === old_tags.length)
			throw "Missing start tag";
	}

	function length(obj) {
		return (obj.length !== undefined) ? obj.length : 1;
	}

	function unwind(toLevel) {
		var t;
		while (_level >= toLevel && (t = stacks.pop())) {
			_level = t.level;
			var c =  stack;
			stack = t.stack;
			var l = 1;
			for (var i = c.length - 1; i >= 0; i--) {
				l += length(c[i]);
			};
			var n = {
				type: t._type,
				id: t.id,
				nodes: c,
				length: l,
				attr: t.attr,
				_tags: t._tags
			};
			stack.push(n);
		}
	}

	function process(obj) {
		var lvl;
		if (obj._type !== undefined) {
			//type spec NOTE: _type not type (type is an object not expanded)
			lvl = level(obj);
			if (lvl <= _level) unwind(lvl);
			//TODO: need to maintain _tags:[] here.
			// or should it be _tags:{}
			stacks.push({
				_type: obj._type,
				stack: stack,
				level: _level,
				id: obj.id || ++seed,
				attr: obj.attr,
				_tags: (tags.length > 0) ? tags : undefined
			});
			stack = [];
			_level = lvl;
		} else if (obj.tag) {
			startTag(obj);
			stack.push(obj);
		} else if (obj.end) {
			endTag(obj);
			stack.push(obj);
		} else if (typeof obj === 'string') {
			if (typeof stack[stack.length - 1] === 'string') {
				stack[stack.length - 1] = stack[stack.length - 1] + obj;
			} else {
				stack.push(obj);
			}
		} else {
			lvl = level(obj);
			if (lvl <= _level) unwind(lvl);
			stack.push(obj)
		}
	}

	function processDelete(obj) {
		//TODO: check that obj matches expected
		if (obj.tag) {
			//TODO: delete start tag
		} else if (obj.end) {
			//TODO: delete end tag
		}
	}

	for (var i = 0; i < ops.length; i++) {
		var op = ops[i];
		if (typeof op === 'number') {
			//retain
			lin = prefix(doc, offset, offset + op, (tags.length > 0), _level);
			lin.forEach(process);
			offset += op;
		} else if (op.d !== undefined) {
			//delete
			processDelete(op.d);
			offset += (typeof op.d === 'string') ? op.d.length : 1;
		} else {
			//insert
			process(op)
		}
	}

	if (offset !== doc.length)
		throw "Operations input length does not match document length(" + offset + ' vs ' +  doc.length + ')';

	if (tags.length !== 0)
		throw "Unbalanced tags";

	unwind(0);
	var newdoc = stack.pop();
	newdoc.seed = seed;
	return newdoc;
}

function _slice(op, s, e) {
	if (typeof op === 'number') {
		//retain
		return (e === undefined ? op : e) - s;
	} else if (op.d !== undefined) {
		//delete
		if (typeof op.d === 'string')
			return {d:op.d.slice(s,e)};
		return op;
	} else {
		//insert
		if (typeof op === 'string')
			return op.slice(s,e);
		return op;
	}
}

function _type(op) {
	if (typeof op === 'number') return 'retain';
	if (typeof op.d === 'string') return 'remove';
	if (typeof op === 'string') return 'insert';
	return 'object'; //Basically all non composable types
}

function _push(ops, op) {
	if (ops.length > 0) {
		var nt = _type(op);
		var ot = _type(ops[ops.length - 1]);
		if (nt === ot && nt !== 'object') {
			var oop = ops.pop();
			switch(nt) {
				case 'retain':
				case 'insert':
					op = oop + op;
					break;
				case 'remove':
					op = {d:(oop.d + op.d)};
					break;
			}
		}
	}
	return ops.push(op);
}

function _n(op) {
	if (typeof op === 'number') return op;
	if (op.d !== undefined) 
		return (typeof op.d === 'string') ? op.d.length : 1;
	return (typeof op === 'string') ? op.length : 1;
}

function _makeTake(ops) {
	var offset = 0;
	var ia = 0;

	function take(n, indivisableField) {
		if (ia === ops.length)
			return n === -1 ? null : n;

		var part;
		var c = ops[ia];
		if (n === -1 || _n(c) - offset <= n ||
		   (indivisableField === 'i' && optype(c) === INSERT) ||
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

slate.transform = function(op1, op2, side) {
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
		} else if (opo.d !== undefined) {
			length = (typeof opo.d === 'string') ? opo.d.length : 1;
			while (length > 0) {
				chunk = take(length, 'i'); // don't split insert
				if (typeof chunk === 'number') {
					length -= chunk;
				} else if (chunk.d !== undefined) {
					length -= (typeof chunk.d === 'string') ? chunk.d.length : 1;
				} else { //insert
					_push(newOps, chunk);
				}
			}
		} else {
			if (left && optype(peek()) === INSERT) {
				_push(newOps, take(-1)); //left insert goes first;
			}
			_push(newOps, (typeof opo === 'string') ? opo.length : 1); //skip the inserted text/obj
		} 
	}

	while ((chunk = take(-1)))
		_push(newOps, chunk);

	return newOps;
}

slate.compose = function(op1, op2) {
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
				} else if (chunk.d === undefined) { //insert
					length -= (typeof chunk === 'string') ? chunk.length : 1;
				}
			}
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
				} else if (chunk.d !== undefined) {
					_push(newOps, chunk);
				} else { //insert
					var n = (typeof chunk === 'string') ? chunk.length : 1;
					length -= n;
					s += n;
				}
			}
		} else { //insert
			_push(newOps, opo)
		}
	}

	while ((chunk = take(-1)))
		_push(newOps, chunk);

	return newOps;
}

slate.invert = function(ops) {
	return ops.map(_invert);
}

function _invert(op) {
	//return op^(-1) TODO
	if (typeof op === 'number') return op;
	if (op.d !== undefined) return op.d;
	return {d:op};
}

slate.transformCursor = function(cursor, op, isOwnOp)
{
	//TODO
	return cursor;
}

module.exports = slate;
