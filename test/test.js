var chai = require('chai');
var expect = chai.expect;
var assert = chai.assert;

//Note: dummy functions don't need to do anything
//  as we would only test the dummy methods in the
//  model module.
var dummy = {};
dummy.apply = function(doc, op) {
	return doc;
};
dummy.fromJSON = function(json) { 
	return json; 
};
dummy.transformCursor = function(cursor, op, isOwnOp) {
	return cursor;
};

var ot = require('../lib')(dummy);

describe('Compose', function() {
	var doc = ["This is some text."];
	var opA = [6,{i:" really"},18-6];
	var opB = [6+7,{i:" actually"},18-6];

	it('Can compose inverse', function() {
		var inv = ot.invert(opA);
		var comp = ot.compose(opA, inv);
		var compb = ot.compose(inv, opA);
		assert.equal("[18]", JSON.stringify(comp));
	});

	it('Can compose inserts', function() {
		var comp = ot.compose(opA, opB);
		assert.equal('[6,{"i":" really actually"},12]', JSON.stringify(comp));
	});

	it('Compose of inverse is inverse of compose', function() {
		var comp = ot.compose(opA, opB);
		var ia = ot.invert(opA);
		var ib = ot.invert(opB);
		var icomp = ot.invert(comp);
		var compi = ot.compose(ib, ia);
		assert.equal(JSON.stringify(compi),JSON.stringify(icomp));
	});
});

describe('Transform', function() {
	var doc = ["This is some text."];
	var opA = [6,{i:" really"},18-6];
	var opB = [6,{i:" actually"},18-6];
	var opC = [18,{i:" That I can add to the end of."}];
	var opD = [8,{d:" some"},5];

	it('Transform left', function(){
		var opAt = ot.transform(opA, opB, 'left');
		var opBt = ot.transform(opB, opA, 'right');
		assert.equal('[6,{"i":" really"},21]',JSON.stringify(opAt));
		assert.equal('[13,{"i":" actually"},12]',JSON.stringify(opBt));
	});

	it('Transform right', function(){
		var opAt = ot.transform(opA, opB, 'right');
		var opBt = ot.transform(opB, opA, 'left');
		assert.equal('[15,{"i":" really"},12]',JSON.stringify(opAt));
		assert.equal('[6,{"i":" actually"},19]',JSON.stringify(opBt));
	});

	it('Transform delete', function(){
		var opDleft = ot.transform(opD, opA, 'left');
		var opDright = ot.transform(opD, opA, 'right');
		assert.equal('[15,{"d":" some"},5]',JSON.stringify(opDleft));
		assert.equal('[15,{"d":" some"},5]',JSON.stringify(opDright));
	});

	it('Transform end', function(){
		var opCleft = ot.transform(opC, opA, 'left');
		var opCright = ot.transform(opC, opA, 'right');
		assert.equal('[25,{"i":" That I can add to the end of."}]',JSON.stringify(opCleft));
		assert.equal('[25,{"i":" That I can add to the end of."}]',JSON.stringify(opCright));
	});
});