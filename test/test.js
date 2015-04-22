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
	var doc = {type:"document", id: 0, seed:0, nodes:[], length:1}
	var opA = [1,"This is some text"];
	var opB = [1,"This is ",{tag:"strong"},"some",{end:"strong"}," text"];
	var opC = [1,"This is some",{end:"strong"}," text"];
	var opD = [1,"This is ",{tag:"strong"},"some"," text"];

	it('Can insert text', function() {
		var docp = ot.apply(doc, opA);
		assert.equal('{"type":"document","id":1,"nodes":["This is some text"],"length":18,"seed":1}', JSON.stringify(docp));
	});

	it('Can insert tags', function() {
		var docp = ot.apply(doc, opB);
		assert.equal('{"type":"document","id":1,"nodes":["This is ",{"tag":"strong"},"some",{"end":"strong"}," text"],"length":20,"seed":1}', JSON.stringify(docp));
	});

	it('Throws missing start tag', function() {
		assert.throws(function() {
			ot.apply(doc, opC);
		}, "Missing start tag");
	});

	it('Throws unbalanced tags', function() {
		assert.throws(function() {
			ot.apply(doc, opD);
		}, "Unbalanced tags");
	});
});