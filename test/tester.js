var ethTests = require('ethereum-tests');
var test = require('tape');
var cp = require('child_process');

test('executble test', function(t) {
  var stateTest = ethTests.stateTests.stRefundTest.refund500;

  var ejt = cp.spawn(__dirname + '/../bin/tester', ['-r', JSON.stringify(stateTest)]);
  ejt.stderr.on('data', function(d){
    t.fail(d.toString());
  });

  ejt.stdout.on('data', function(data){
    t.equal(data.toString(), '0', 'should not error' );
  });

  ejt.on('close', function(){
    t.end();
  });
});
