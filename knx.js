var decodecEMIFrame = function (buffer) {
  var cEMIFrame = {};
  
  cEMIFrame.mc = buffer[0];
  
  cEMIFrame.addil = buffer[1];
  
  cEMIFrame.ctrl1 = buffer[2];
  
  cEMIFrame.ctrl2 = buffer[3];
  
  cEMIFrame.src = {
    'main_line': ( buffer[4] >> 4 ),
    'line': ( buffer[4] & 0x0f ),
    'addr': ( buffer[5] ),
  };

  if (cEMIFrame.ctrl2 & ctrl2.group) {
    //group address
    cEMIFrame.dst = {
      'type': 'group',
      'main_line': ( buffer[6] >> 3 ),
      'line': ( buffer[6] & 0x07 ),
      'addr': ( buffer[7] ),
    };
  } else {
    //individual address
    cEMIFrame.dst = {
      'type': 'individual',
      'main_line': ( buffer[6] >> 4 ),
      'line': ( buffer[6] & 0x0f ),
      'addr': ( buffer[7] ),
    };
  }

  cEMIFrame.length = buffer[8];
  
  cEMIFrame.TPCI = buffer[9] & 0xFC;
  
  cEMIFrame.APCI = ((buffer[9] << 8) | buffer[10]) & 0x03FF;
  
  cEMIFrame.payload = [];
  
  for (var i = 0; i < cEMIFrame.length; i++) {
    cEMIFrame.payload[i] = buffer[10+i];
  }
  
  return cEMIFrame;
}

var encodecEMIFrame = function (cEMIFrame) {
  var buffer = [];
  
  buffer[0] = cEMIFrame.mc;
  
  buffer[1] = cEMIFrame.addil;
  
  buffer[2] = cEMIFrame.ctrl1;
  
  buffer[3] = cEMIFrame.ctrl2;
  
  buffer[4] = ((cEMIFrame.src.main_line & 0x0f) << 4) | (cEMIFrame.src.line & 0x0f);
  buffer[5] = cEMIFrame.src.addr;

  if (cEMIFrame.ctrl2 & ctrl2.group) {
    //address is group
    buffer[6] = ((cEMIFrame.dst.main_line & 0x1f) << 3) | (cEMIFrame.dst.line & 0x07);
  } else {
    //address is individual
    buffer[6] = ((cEMIFrame.dst.main_line & 0x0f) << 4) | (cEMIFrame.dst.line & 0x0f);
  }
  buffer[7] = cEMIFrame.dst.addr;
  
  buffer[8] = cEMIFrame.length;

  buffer[9] = (cEMIFrame.TPCI & 0xFC) | ((cEMIFrame.APCI >> 8) & 0x03);
  
  for (var i = 0; i < cEMIFrame.length; i++) {
    buffer[10+i] = cEMIFrame.payload[i];
  }
  
  buffer[10] |= cEMIFrame.APCI & 0xff;
  
  return buffer;
}

var decodeFrame = function (buffer) {
  var KNXnetIPFrame = {};

  KNXnetIPFrame.hdr = {
    'size': buffer[0],
    'version': buffer[1],
    'routing_indication': ((buffer[2] << 8) + buffer[3]),
  };
  
  KNXnetIPFrame.size = (buffer[4] << 8) + buffer[5];

  KNXnetIPFrame.cemi = decodecEMIFrame(buffer.slice (6));
  
  KNXnetIPFrame.cemi.direction = 'in';

  return KNXnetIPFrame;
}

var encodeFrame = function (KNXnetIPFrame) {
  var cEMIBuffer = encodecEMIFrame(KNXnetIPFrame.cemi);

  var buffer = [];
  
  buffer[0] = KNXnetIPFrame.hdr.size;
  buffer[1] = KNXnetIPFrame.hdr.version;
  buffer[2] = (KNXnetIPFrame.hdr.routing_indication >> 8) & 0xFF;
  buffer[3] = KNXnetIPFrame.hdr.routing_indication & 0xFF;
  buffer[4] = ((KNXnetIPFrame.size + 6) >> 8) & 0xFF;
  buffer[5] = (KNXnetIPFrame.size + 6) & 0xFF;
  
  return buffer.concat(cEMIBuffer);
}

L_Data = { 'req':0x11, 'con':0x2E, 'ind':0x29 };
ctrl1 = { 'extFrame': 0x00, 'stdFrame': 0x80, 'dontRepeat': 0x20, 'broadcast': 0x10, 'priority3': 0x0C };
ctrl2 = { 'group': 0x80, 'individual': 0x00, 'hop5': 0x50 };

APCI = { 
  'A_GroupValue_Read': 			{ 'code': 0x0000, 'mask': 0x03FF }, 
  'A_GroupValue_Response': 		{ 'code': 0x0040, 'mask': 0x03C0 },
  'A_GroupValue_Write':			{ 'code': 0x0080, 'mask': 0x03C0 },
  'A_IndividualAddress_Write':		{ 'code': 0x00C0, 'mask': 0x03FF },
  'A_IndividualAddress_Read':		{ 'code': 0x0100, 'mask': 0x03FF },
  'A_IndividualAddress_Response':	{ 'code': 0x0140, 'mask': 0x03FF },
  'A_Memory_Read':			{ 'code': 0x0200, 'mask': 0x03C0 },
  'A_Memory_Response':			{ 'code': 0x0240, 'mask': 0x03C0 },
  'A_Memory_Write':			{ 'code': 0x0280, 'mask': 0x03C0 },
  'A_UserMemory_Read':			{ 'code': 0x02C0, 'mask': 0x03FF },
  'A_UserMemory_Response':		{ 'code': 0x02C1, 'mask': 0x03FF },
  'A_UserMemory_Write':			{ 'code': 0x02C2, 'mask': 0x03FF },
  'A_UserMemoryBit_Write':		{ 'code': 0x02C4, 'mask': 0x03FF },
  'A_UserManufacturerInfo_Read':	{ 'code': 0x02C5, 'mask': 0x03FF },
  'A_UserManufacturerInfo_Response':	{ 'code': 0x02C6, 'mask': 0x03FF },
  'A_FunctionPropertyCommand':		{ 'code': 0x02C7, 'mask': 0x03FF },
  'A_FunctionPropertyState_Read':	{ 'code': 0x02C8, 'mask': 0x03FF },
  'A_FunctionPropertyState_Response':	{ 'code': 0x02C9, 'mask': 0x03FF },
  'A_DeviceDescriptor_Read':		{ 'code': 0x0300, 'mask': 0x03C0 },
  'A_DeviceDescriptor_Response':	{ 'code': 0x0340, 'mask': 0x03C0 },
  'A_Restart':				{ 'code': 0x0380, 'mask': 0x03FF },
  'A_Authorize_Request':		{ 'code': 0x03D1, 'mask': 0x03FF },
  'A_Authorize_Response':		{ 'code': 0x03D2, 'mask': 0x03FF },
  'A_PropertyValue_Read':		{ 'code': 0x03D5, 'mask': 0x03FF },
  'A_PropertyValue_Response':		{ 'code': 0x03D6, 'mask': 0x03FF },
  'A_PropertyValue_Write':		{ 'code': 0x03D7, 'mask': 0x03FF }
  };
  
var decodeAPCI = function (APCICode) {
  for ( var key in APCI ) {
    if ( APCI.hasOwnProperty(key) ) {
      var mask = APCI[key].mask;
      var code = APCI[key].code;

      if ((APCICode & mask) == code) {
        return key;
      }
    }
  }

  return "";
}
