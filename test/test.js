var chai = require('chai');
var expect = chai.expect;
var assert = chai.assert;

var ot = require('../lib');

describe('Compose', function() {
	var opA = [6," really",18-6];
	var opB = [6+7," actually",18-6];

	it('Can compose inverse', function() {
		var inv = ot.invert(opA);
		var comp = ot.compose(opA, inv);
		var compb = ot.compose(inv, opA);
		assert.equal("[18]", JSON.stringify(comp));
	});

	it('Can compose inserts', function() {
		var comp = ot.compose(opA, opB);
		assert.equal('[6," really actually",12]', JSON.stringify(comp));
	});

	it('Can compose of inverse is inverse of compose', function() {
		var comp = ot.compose(opA, opB);
		var ia = ot.invert(opA);
		var ib = ot.invert(opB);
		var icomp = ot.invert(comp);
		var compi = ot.compose(ib, ia);
		assert.equal(JSON.stringify(compi),JSON.stringify(icomp));
	});
});

describe('Transform', function() {
	var opA = [6," really",18-6];
	var opB = [6," actually",18-6];
	var opC = [18," That I can add to the end of."];
	var opD = [8,{d:" some"},5];

	it('Can transform left', function(){
		var opAt = ot.transform(opA, opB, 'left');
		var opBt = ot.transform(opB, opA, 'right');
		assert.equal('[6," really",21]',JSON.stringify(opAt));
		assert.equal('[13," actually",12]',JSON.stringify(opBt));
	});

	it('Can transform right', function(){
		var opAt = ot.transform(opA, opB, 'right');
		var opBt = ot.transform(opB, opA, 'left');
		assert.equal('[15," really",12]',JSON.stringify(opAt));
		assert.equal('[6," actually",19]',JSON.stringify(opBt));
	});

	it('Can transform delete', function(){
		var opDleft = ot.transform(opD, opA, 'left');
		var opDright = ot.transform(opD, opA, 'right');
		assert.equal('[15,{"d":" some"},5]',JSON.stringify(opDleft));
		assert.equal('[15,{"d":" some"},5]',JSON.stringify(opDright));
	});

	it('Can transform end', function(){
		var opCleft = ot.transform(opC, opA, 'left');
		var opCright = ot.transform(opC, opA, 'right');
		assert.equal('[25," That I can add to the end of."]',JSON.stringify(opCleft));
		assert.equal('[25," That I can add to the end of."]',JSON.stringify(opCright));
	});
});

describe('Apply', function() {
	var doc = {type:"document", id: 1, seed:1, nodes:[], length:0}
	var opA = [0,"This is some text"];
	var opB = [0,"This is ",{tag:"strong"},"some",{end:"strong"}," text"];
	var opD = [0,"This is ",{tag:"strong"},"some"," text"];

	it('Can insert text', function() {
		var docp = ot.apply(doc, opA);
		assert.equal('["This is some text"]', JSON.stringify(docp.nodes));
	});

	it('Can insert tags', function() {
		var docp = ot.apply(doc, opB);
		assert.equal('["This is ",{"tag":"strong"},"some",{"end":"strong"}," text"]', JSON.stringify(docp.nodes));
	});

	it('Throws unbalanced tags', function() {
		assert.throws(function() {
			ot.apply(doc, opD);
		}, "Unbalanced tags");
	});
});


describe('Tag cache', function() {
    var doc = {type:"document", id: 1, seed:4, nodes:[
        {type:"p", id:2, nodes:["First paragraph."], length:17},
        {type:"p", id:3, nodes:["Second paragraph."], length:18},
        {type:"p", id:4, nodes:["Third paragraph."], length:17},
    ], length:52}
	var doca = {type:"document", id: 1, seed:4, nodes:[
        {type:"p", id:2,
            nodes:["First ",{tag:"strong"},"paragraph."], 
            length:18},
        {type:"p", id:3, 
            nodes:["Second ",{end:"strong"},"paragraph."], 
            length:19,
            _tags:[{"tag":"strong"}]},
        {type:"p", id:4,
            nodes:["Third paragraph."], 
            length:17},
    ], length:54}
	var opA = [7,{tag:"strong"},18,{end:"strong"},27];
	var opB = [12,{end:"strong"},9,{tag:"strong"},33];
	var opC = [31,{tag:"strong"},4,{end:"strong"},19];
	var opD = [26,{d:{end:"strong"}},17,{end:"strong"},10];

	it('Build tag cache', function() {
		var docp = ot.apply(doc, opA);
		assert.equal('[{"tag":"strong"}]', JSON.stringify(docp.nodes[1]._tags));
	});

	it('Alter tag cache', function() {
		var docp = ot.apply(doca, opB);
		assert.equal(undefined, docp.nodes[1]._tags);
	});

	it('Preserves tag cache', function() {
		var docp = ot.apply(doca, opC);
		assert.equal('[{"tag":"strong"}]', JSON.stringify(docp.nodes[1]._tags));
		assert.equal(undefined, docp.nodes[2]._tags);
	});

	it('Can delete tag', function() {
		var docp = ot.apply(doca, opD);
		assert.equal('[{"tag":"strong"}]', JSON.stringify(docp.nodes[1]._tags));
		assert.equal('[{"tag":"strong"}]', JSON.stringify(docp.nodes[2]._tags));
	});
});


describe('Nesting', function() {
    var doc = {type:"document", id: 1, seed:4, nodes:[
        {type:"p", id:2, nodes:["First paragraph."], length:17},
        {type:"ol", id:3, nodes:["Second list item."], length:18},
        {type:"p", id:4, nodes:["Third paragraph."], length:17},
    ], length:52}
    var opA = [35,{_type:"p", indent:1},"Nested paragraph",17];
    var opB = [35,{_type:"p", indent:1},"Nested paragraph",{_type:"p", indent:1},"Second Nested",17];
    var opC = [35,{_type:"p", indent:1},"Nested paragraph",{_type:"p", indent:2},"Double Nested",17];

	it('Can nest a paragraph in a list item', function() {
		var docp = ot.apply(doc, opA);
		assert.equal('["Second list item.",{"type":"p","id":5,"nodes":["Nested paragraph"],"length":17,"indent":1}]', JSON.stringify(docp.nodes[1].nodes));
	});

	it('Can nest multiple paragraphs', function() {
		var docp = ot.apply(doc, opB);
		assert.equal(3, docp.nodes[1].nodes.length);
	});

	it('Can double nest a paragraph', function() {
		var docp = ot.apply(doc, opC);
		assert.equal('{"type":"p","id":6,"nodes":["Double Nested"],"length":14,"indent":2}', JSON.stringify(docp.nodes[1].nodes[1].nodes[1]));
	});
});