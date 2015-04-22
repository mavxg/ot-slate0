

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

//NOTE: end coming before a start assumes that the content has not changed
// ... if it has then the editor needs to do something different.

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
	var offset = (doc.type === 'document') ? 0 : 1;
	if (end >= offset && start <= 0)
		lin.push({_type:doc.type, id:doc.id, attr:doc.attr, _tags:doc._tags});
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

// return ops represening insert of tags in the given range.
function tags(doc, start, end, _lin) {
	var lin = _lin || [];
	var offset = (doc.type === 'document') ? 0 : 1;
	//TODO
}

function clone(obj) {
  var target = {};
  for (var i in obj) {
    if (obj.hasOwnProperty(i)) {
      target[i] = obj[i];
    }
  }
  return target;
}

// dictionary of tags at a point
function tagsAt(doc, offset) {
	var na = nodeAt(doc, offset);
	var node = na[0], rem = na[1];
	var tags = {};
	if (node._tags)
		node._tags.forEach(function(t) { tags[t.tag] = t; });
	if (node.type !== 'document')
		rem -= 1;
	for (var i = 0; rem > 0 && i < node.nodes.length; i++) {
		var child = node.nodes[i];
		var cl = child.length || 1;
		if (child.tag) {
			tags[child.tag] = child;
		} else if (child.end) {
			delete tags[child.end];
		}
		rem -= cl;
	}
	return tags;
}

function nodeAt(doc, _offset) {
	var offset = _offset;
	if (doc.type !== 'document')
		offset -= 1;
	for (var i = 0; i < doc.nodes.length; i++) {
		var child = doc.nodes[i];
		var cl = child.length || 1;
		if (cl > offset) {
			if (child.nodes !== undefined)
				return nodeAt(child, offset);
			break;
		}
		offset -= cl;

	}
	return [doc,_offset];
}

slate.tagsAt = tagsAt;
slate.nodeAt = nodeAt;
slate.prefix = prefix;

slate.apply = function(doc, ops) {
	var seed = doc.seed || 0;
	var offset = 0;
	var _level = 0;
	var lin;
	var stack = [];
	var stacks = [];
	var tags = {};
	var tags_count = 0;

	function startTag(tag) {
		if (tags[tag.tag] !== undefined) {
			if (tags[tag.tag].end !== undefined) {
				delete tags[tag.tag];
				tags_count -= 1;
			} else {
				throw "Nested start tags"
			}
		} else {
			tags[tag.tag] = tag;
			tags_count += 1;
		}
	}

	function endTag(tag) {
		if (tags[tag.end] !== undefined) {
			if (tags[tag.end].tag !== undefined) {
				delete tags[tag.end];
				tags_count -= 1;
			} else {
				throw "Nested end tags"
			}
		} else {
			tags[tag.end] = tag;
			tags_count += 1;
		}
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
			var l = (t._type === 'document') ? 0 : 1;
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

	function applyTagChanges(_tags) {
		var old_tags = _tags || [];
		var ret = [];
		var processed = {};
		old_tags.forEach(function(t) {
			if (tags[t.tag]) {
				if (tags[t.tag].end !== undefined) {
					//pass
				} else {
					throw "Nested Start Tags";
				}
			} else {
				ret.push(t);
			}
			processed[t.tag] = true;
		});
		for (var t in tags) {
			if (!processed[t]) {
				if (tags[t].end !== undefined)
					throw "Missing start tag";
				else
					ret.push(tags[t]);
			}
		}
		return (ret.length === 0) ? undefined : ret;
	}

	function process(obj) {
		var lvl;
		if (obj._type !== undefined) {
			//type spec NOTE: _type not type (type is an object not expanded)
			lvl = level(obj);
			if (lvl <= _level) unwind(lvl);
			var _tags = obj._tags;
			if (tags_count > 0)
				_tags = applyTagChanges(_tags);
			stacks.push({
				_type: obj._type,
				stack: stack,
				level: _level,
				id: obj.id || ++seed,
				attr: obj.attr,
				_tags: _tags
			});
			stack = [];
			_level = lvl;
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
			//delete of start tag behaves like an end
			endTag({end:obj.tag});
		} else if (obj.end) {
			//delete of end behaves like current start
			var curTags = tagsAt(doc, offset);
			startTag(curTags[obj.end]);
		}
	}

	for (var i = 0; i < ops.length; i++) {
		var op = ops[i];
		if (typeof op === 'number') {
			//retain
			var startTags = tagsAt(doc, offset);
			var endTags = tagsAt(doc, offset + op);
			//TODO: change the (tags.length > 0) to if tags != startTags
			lin = prefix(doc, offset, offset + op, (tags_count > 0), _level);
			lin.forEach(process);
			offset += op;
		} else if (op.d !== undefined) {
			//delete
			processDelete(op.d);
			offset += (typeof op.d === 'string') ? op.d.length : 1;
		} else {
			//insert
			if (op.tag) startTag(op);
			else if (op.end) endTag(op);
			process(op);
		}
	}

	if (offset !== doc.length)
		throw "Operations input length does not match document length(" + offset + ' vs ' +  doc.length + ')';

	if (tags_count !== 0)
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
