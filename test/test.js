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
	//TODO test transforms
});