var dgram=require('dgram');
var events=require('events');

var fs=require ("fs");

with(global) {
  eval (fs.readFileSync('knx/dpt_coding.js') + '');
  eval (fs.readFileSync('knx/knx.js') + '');
}

var KNX = function() {
  events.EventEmitter.call(this);
  
  this.send = function ( bytes ) {
      telegramBuffer = new Buffer ( bytes );

      this.s.send(telegramBuffer, 0, telegramBuffer.length, 3671, '224.0.23.12', function(err, bytes) {
      });
  }
}

KNX.prototype.__proto__ = events.EventEmitter.prototype;

exports.openKNX = function () {
  var knx = new KNX();
  
  if (
    (process.version.indexOf("v0.12.") == 0) ||
    (process.version.indexOf("v4.") == 0) 
    ) {
    knx.s=dgram.createSocket({type:'udp4', reuseAddr: true});
  } else {
    knx.s=dgram.createSocket('udp4');
  }

  knx.s.on('message', function (msg, rinfo) {
    var decodedFrame = decodeFrame (msg);

    if (process.version.indexOf("v0.10.") == 0) {  
      console.log ("msg received " + msg.toJSON());
      console.log ("decoded: " + JSON.stringify(decodedFrame) );
    }
    
    knx.emit('recv', decodedFrame.cemi);
    knx.emit('recv-raw', msg);
  });
  
  if (process.version.indexOf("v0.6.") == 0) {
    console.log("NodeJS 0.6.x");
    
    knx.s.bind (3671);
    knx.s.addMembership('224.0.23.12');
  } else {
    console.log("NodeJS other than 0.6.x");  

    knx.s.bind (3671, function () {
      knx.s.addMembership('224.0.23.12');
    });
  };
    
  return knx;
}

function DPE(knx) {
  var self = this;
  self.knx = knx;
  self.dpTable = new Object();
  
  knx.on('recv', function (cemi) {
    //we only listen to group telegrams
    if (cemi.dst.type === 'group') {
      dst = cemi.dst.main_line + '/' + cemi.dst.line + '/' + cemi.dst.addr;

      //check if destination is in dpTable
      if (self.dpTable[dst] != undefined) {
        dpInfo = self.dpTable[dst];
        
        value = decodeWithDPT(dpInfo.dpt, cemi.payload);
        
        self.emit('updateDP', dpInfo.dpID, value);
      }
    }
  });
  
  this.registerDP = function(dpID, dpt, groupAddress) {
    this.dpTable[groupAddress] = {'dpID':dpID, 'dpt':dpt };
  }  
}

DPE.prototype.__proto__ = events.EventEmitter.prototype;

exports.createDPEngine = function(knx) {
  return new DPE(knx);
}

exports.encodeWithDPT = encodeWithDPT;
exports.decodeWithDPT = decodeWithDPT;

exports.encodecEMIFrame = encodecEMIFrame;
exports.decodecEMIFrame = decodecEMIFrame;

exports.encodeFrame = encodeFrame;
exports.decodeFrame = decodeFrame;

exports.L_Data = L_Data;
exports.ctrl1 = ctrl1;
exports.ctrl2 = ctrl2;

exports.APCI = APCI;
